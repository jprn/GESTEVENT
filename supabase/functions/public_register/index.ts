// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import QRCode from "npm:qrcode@1.5.3";

// Helpers
function corsHeaders() {
  return {
    "content-type": "application/json",
    "access-control-allow-origin": "*",
    "access-control-allow-headers": "authorization, x-client-info, apikey, content-type",
    "access-control-allow-methods": "POST, OPTIONS",
  } as Record<string, string>;
}

function json(res: any, status = 200) {
  return new Response(JSON.stringify(res), { status, headers: corsHeaders() });
}

function badRequest(msg: string) { return json({ error: msg }, 400); }
function forbidden(msg: string) { return json({ error: msg }, 403); }
function tooMany(msg: string) { return json({ error: msg }, 429); }
function serverError(msg: string) { return json({ error: msg }, 500); }

function getIP(req: Request, fallback?: string) {
  const h = req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip");
  if (h) return h.split(",")[0].trim();
  return fallback || "";
}

async function sha256Hex(input: string): Promise<string> {
  const enc = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", enc);
  const arr = new Uint8Array(digest);
  return Array.from(arr).map((b)=>b.toString(16).padStart(2,'0')).join("");
}

serve(async (req) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders() });
  }
  if (req.method !== 'POST') return badRequest('POST only');

  // Env
  const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return serverError('Supabase env not set');

  // Parse body
  let body: any = {};
  try { body = await req.json(); } catch { return badRequest('Invalid JSON'); }
  const slug = (body.slug || '').toString().trim();
  const full_name = (body.full_name || `${body.firstname||''} ${body.lastname||''}`).toString().trim();
  const email = (body.email || '').toString().trim().toLowerCase();
  const phone = (body.phone || null) ? String(body.phone) : null;
  const client_ip = (body.client_ip || getIP(req)).toString();
  if (!slug) return badRequest('slug required');
  if (!full_name) return badRequest('full_name required');
  if (!email) return badRequest('email required');

  const supa = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

  // Rate-limit: 5/min per IP (best effort). Requires table rate_limits_public_register(ip text, created_at timestamptz default now()).
  try {
    if (client_ip) {
      await supa.from('rate_limits_public_register').insert({ ip: client_ip });
      const { count: rlCount, error: rlErr } = await supa
        .from('rate_limits_public_register')
        .select('id', { count: 'exact', head: true })
        .gte('created_at', new Date(Date.now()-60_000).toISOString())
        .eq('ip', client_ip);
      if (rlErr) throw rlErr;
      if (typeof rlCount === 'number' && rlCount > 5) return tooMany('Trop de tentatives, réessayez plus tard');
    }
  } catch { /* ignore RL if table missing */ }

  // Load event and checks
  const { data: evt, error: evtErr } = await supa
    .from('events')
    .select('id, title, status, is_open, sales_from, sales_until, capacity, max_per_user, slug')
    .eq('slug', slug)
    .single();
  if (evtErr || !evt) return badRequest('Événement introuvable');
  if (String(evt.status).toLowerCase() !== 'published') return forbidden('Événement non publié');
  if (evt.is_open === false) return forbidden('Inscriptions fermées');
  const now = Date.now();
  if (evt.sales_from && new Date(evt.sales_from).getTime() > now) return forbidden('Inscriptions pas encore ouvertes');
  if (evt.sales_until && new Date(evt.sales_until).getTime() < now) return forbidden('Inscriptions clôturées');

  // Duplicate per email/event and max_per_user
  const { data: existing, error: exErr } = await supa
    .from('participants')
    .select('id', { count: 'exact' })
    .eq('event_id', evt.id)
    .eq('email_lower', email)
    .eq('status', 'confirmed');
  if (exErr) return serverError('Erreur vérification existants');
  const countExisting = (existing?.length ?? 0);
  if (evt.max_per_user && countExisting >= evt.max_per_user) return forbidden('Quota atteint pour cet email');

  // Remaining capacity check (if capacity set)
  if (evt.capacity && evt.capacity > 0) {
    const { count: partCount, error: aggErr } = await supa
      .from('participants')
      .select('id', { count: 'exact', head: true })
      .eq('event_id', evt.id)
      .eq('status', 'confirmed');
    if (aggErr) return serverError('Erreur comptage');
    if (typeof partCount === 'number' && partCount >= evt.capacity) return forbidden('Complet');
  }

  // Create participant: rely on a unique constraint (event_id, email_lower) to avoid duplicates under race
  const insertPayload: Record<string, any> = {
    event_id: evt.id,
    full_name,
    email,
    email_lower: email,
    phone,
    status: 'confirmed',
  };
  const { data: inserted, error: insErr } = await supa
    .from('participants')
    .insert(insertPayload)
    .select('id')
    .single();
  if (insErr) {
    // Handle conflict (unique violation)
    const code = (insErr as any)?.code;
    const msg = String((insErr as any)?.message || '').toLowerCase();
    if (code === '23505' || msg.includes('duplicate') || msg.includes('unique')) {
      return forbidden('Déjà inscrit pour cet événement');
    }
    return serverError('Impossible de créer le participant');
  }
  const participantId = inserted.id;

  // Generate QR PNG
  const qrContent = `${evt.id}.${participantId}`;
  const pngBuffer: Uint8Array = await QRCode.toUint8Array(qrContent, { type: 'png', scale: 6, margin: 1 });

  // Upload to storage (bucket 'tickets')
  const path = `tickets/${evt.id}/${participantId}.png`;
  const pngBlob = new Blob([pngBuffer], { type: 'image/png' });
  const { error: upErr } = await supa.storage.from('tickets').upload(path, pngBlob, { contentType: 'image/png', upsert: true });
  if (upErr) {
    // Cleanup participant if needed
    await supa.from('participants').delete().eq('id', participantId);
    return serverError('Échec upload QR');
  }
  const { data: signed, error: signErr } = await supa.storage.from('tickets').createSignedUrl(path, 60*60*24);
  if (signErr) return serverError('Échec signature URL');
  const qrUrl = signed?.signedUrl || '';

  // Update participant with QR URL
  await supa.from('participants').update({ qr_png_url: qrUrl }).eq('id', participantId);

  // Consent logging (best effort)
  try {
    const email_hash = await sha256Hex(email);
    await supa.from('consents').insert({ email_hash, ip: client_ip, event_id: evt.id, participant_id: participantId });
  } catch {/* ignore */}

  // Email via Resend (best effort)
  try {
    if (!RESEND_API_KEY) throw new Error('RESEND_API_KEY missing');
    const html = `<!doctype html><html><body>
      <p>Bonjour ${full_name},</p>
      <p>Votre inscription à <strong>${evt.title}</strong> est confirmée.</p>
      <p>Vous trouverez votre QR ci-dessous ainsi qu'un lien si nécessaire.</p>
      <p><img src="${qrUrl}" alt="QR Code" style="max-width:240px"/></p>
      <p><a href="${qrUrl}">Télécharger le QR</a></p>
      <p>À bientôt,</p>
      <p>L'équipe GESTEVENT</p>
    </body></html>`;
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'GESTEVENT <no-reply@gestevent.com>',
        to: [email],
        subject: `Confirmation d\'inscription – ${evt.title}`,
        html,
      }),
    });
  } catch {/* ignore email errors */}

  return json({ participant_id: participantId });
});
