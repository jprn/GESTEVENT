'use strict';

// Config
const PAGE_SIZE = 6;

// UI helpers
function qs(sel){ return document.querySelector(sel); }

function getStatus(event){
  // 1) Chaîne explicite
  const s = (event.status ?? '').toString().toLowerCase();
  if (s === 'published' || s === 'public') return 'published';
  if (s === 'draft' || s === 'private') return 'draft';
  // 2) Booléen is_published
  if (event.is_published === true) return 'published';
  if (event.is_published === false) return 'draft';
  // 3) Timestamp published_at
  if (event.published_at) return 'published';
  // 4) Par défaut: brouillon (ne pas inférer via slug)
  return 'draft';
}
function show(el){ el?.removeAttribute('hidden'); }
function hide(el){ el?.setAttribute('hidden',''); }
function setText(sel, value){ const el = qs(sel); if (el) el.textContent = value; }

function toast(message, type='info'){
  const t = qs('#toast');
  if (!t) return;
  t.textContent = message;
  t.dataset.type = type;
  t.hidden = false;
  clearTimeout(t._timer);
  t._timer = setTimeout(()=>{ t.hidden = true; }, 3500);
}

function renderSkeletons(count=PAGE_SIZE){
  const wrap = qs('#events-skeleton');
  if (!wrap) return;
  wrap.innerHTML = '';
  for (let i=0;i<count;i++){
    const card = document.createElement('div');
    card.className = 'card';
    card.innerHTML = `
      <span class="skeleton title"></span>
      <span class="skeleton rect"></span>
      <div class="grid">
        <span class="skeleton line"></span>
        <span class="skeleton line"></span>
        <span class="skeleton line"></span>
      </div>
      <span class="skeleton block"></span>
      <div class="card__actions">
        <span class="skeleton rect" style="width:80px"></span>
        <span class="skeleton rect" style="width:80px"></span>
        <span class="skeleton rect" style="width:80px"></span>
      </div>`;
    wrap.appendChild(card);
  }
}

function percent(n, d){ if (!d) return 0; return Math.max(0, Math.min(100, Math.round((n/d)*100))); }
function eur(cents){ if (typeof cents !== 'number') return '—'; return (cents/100).toLocaleString('fr-FR',{style:'currency',currency:'EUR'}); }
function fmtDate(iso){ if (!iso) return '—'; try { return new Date(iso).toLocaleString('fr-FR'); } catch { return iso; } }
function stripHtml(html){ const tmp = document.createElement('div'); tmp.innerHTML = html || ''; return tmp.textContent || tmp.innerText || ''; }
function clip(text, n=140){ if (!text) return ''; const t = text.trim(); return t.length>n ? (t.slice(0,n-1)+'…') : t; }
function slugify(str){
  return (str||'')
    .normalize('NFD').replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g,'-')
    .replace(/^-+|-+$/g,'')
    .slice(0,80);
}

async function ensureUniqueSlug(base){
  const supa = window.AppAPI.getClient();
  let candidate = base || 'evenement';
  for (let i=1;i<50;i++){
    const { data, error } = await supa.from('events').select('slug').eq('slug', candidate).maybeSingle();
    if (error) throw error;
    if (!data) return candidate;
    candidate = `${base}-${i+1}`;
  }
  return `${base}-${Date.now()}`;
}

async function publishEvent(id, title){
  const supa = window.AppAPI.getClient();
  const base = slugify(title);
  const slug = await ensureUniqueSlug(base);
  const { data, error } = await supa.from('events').update({ status:'published', slug }).eq('id', id).select('id, slug').single();
  if (error) throw error;
  return data;
}

function renderCards(events, plan){
  const grid = qs('#events-grid');
  if (!grid) return;
  grid.innerHTML = '';
  for (const e of events){
    const s = getStatus(e);
    const p = percent(e.registered_count||0, e.capacity||0);
    const card = document.createElement('article');
    const statusClass = s === 'draft' ? 'card--draft' : (s === 'published' ? 'card--published' : '');
    card.className = `card card--compact ${statusClass}`.trim();
    let statusBadge = '';
    if (s === 'draft') statusBadge = '<span class="badge badge--draft">Brouillon</span>';
    else if (s === 'published') statusBadge = '<span class="badge badge--published">Publié</span>';

    const desc = clip(stripHtml(e.description_html || ''));
    card.innerHTML = `
      <header class="card__header">
        <h3 class="card__title">${e.title || 'Sans titre'} ${statusBadge}</h3>
        <div class="meta">${fmtDate(e.starts_at)} → ${fmtDate(e.ends_at)}</div>
      </header>
      ${desc ? `<p class="card__desc">${desc}</p>` : ''}
      <div class="card__metrics">
        <div class="metric"><span class="label">Inscrits</span><span class="value">${e.registered_count ?? 0}${e.capacity?` / ${e.capacity}`:''}</span></div>
        <div class="metric"><span class="label">Revenu</span><span class="value">${eur(e.revenue_cents)}</span></div>
      </div>
    `;
    // Carte cliquable -> modal d'aperçu
    card.tabIndex = 0;
    card.addEventListener('click', ()=> openEventModal(e));
    card.addEventListener('keypress', (ev)=>{ if (ev.key==='Enter' || ev.key===' ') { ev.preventDefault(); openEventModal(e); }});
    grid.appendChild(card);
  }
}

// La suppression n'est plus exposée directement sur la carte. On pourra la proposer dans la modal si nécessaire.
function bindDeleteHandlers(){}

// Modal d'aperçu d'événement
function openEventModal(e){
  const m = qs('#event-modal');
  const body = qs('#event-modal .modal__body');
  if (!m || !body) return;
  const s = getStatus(e);
  const status = `<span class="badge ${s==='draft'?'badge--draft':'badge--published'}">${s==='draft'?'Brouillon':'Publié'}</span>`;
  const isPaid = e.ticket_type === 'paid';
  const price = typeof e.price_cents === 'number' ? eur(e.price_cents) : '—';
  const sales = `${fmtDate(e.sales_from)} → ${fmtDate(e.sales_until)}`;
  const salesOpen = e.is_open === true ? 'Ouvert' : (e.is_open === false ? 'Fermé' : '—');
  const remaining = (typeof e.capacity === 'number' && typeof e.registered_count === 'number') ? Math.max(0, e.capacity - e.registered_count) : null;
  body.innerHTML = `
    <h3>${e.title || 'Sans titre'} ${status}</h3>
    <div class="meta">${fmtDate(e.starts_at)} → ${fmtDate(e.ends_at)}</div>
    ${e.description_html ? `<div class="modal__desc">${e.description_html}</div>` : ''}
    <div class="modal__grid">
      <div><strong>Inscrits</strong><div>${e.registered_count ?? 0}${e.capacity?` / ${e.capacity}`:''}</div></div>
      <div><strong>Revenu</strong><div>${eur(e.revenue_cents)}</div></div>
      <div><strong>Check‑ins</strong><div>${e.checkin_count ?? 0}</div></div>
    </div>
    <div class="modal__desc">
      <strong>Billetterie</strong>
      <div class="meta">Type: ${isPaid ? 'Payant' : 'Gratuit'}${isPaid ? ` · Prix: ${price}` : ''}</div>
      <div class="meta">Quota par utilisateur: ${e.max_per_user ?? '—'}${e.show_remaining && remaining !== null ? ` · Restants: ${remaining}` : ''}</div>
      <div class="meta">Période de vente: ${sales} · Statut: ${s==='draft'?'Brouillon':'Publié'}</div>
    </div>
    <div class="modal__actions">
      <a class="btn" href="./create-event.html?e=${encodeURIComponent(e.id)}">Modifier</a>
      <a class="btn btn--ghost" href="./participants.html?e=${encodeURIComponent(e.id)}">Participants</a>
      ${s !== 'published' ? `<button type="button" class="btn" id="dashPublishBtn">Publier</button>` : ''}
  `;
  // Bouton publier (dashboard) -> ouvrir modal de confirmation
  const dashBtn = qs('#dashPublishBtn');
  if (dashBtn){
    dashBtn.addEventListener('click', ()=>{
      const pm = qs('#publish-modal');
      const recap = qs('#dash-pub-recap');
      if (!pm || !recap) return;
      const baseSlug = slugify(e.title || 'evenement');
      const previewUrl = `${location.origin}/event/${baseSlug}`;
      recap.innerHTML = `
        <div><strong>Titre:</strong> ${e.title || '—'}</div>
        <div><strong>Dates:</strong> ${fmtDate(e.starts_at)} → ${fmtDate(e.ends_at)}</div>
        <div><strong>Lieu:</strong> ${e.location_text || '—'}</div>
        <div><strong>Billetterie:</strong> ${isPaid ? `Payant · ${price}` : 'Gratuit'}</div>
        <div><strong>Quantité totale:</strong> ${e.capacity ?? '—'}</div>
        <div><strong>Inscrits:</strong> ${e.registered_count ?? 0}</div>
        <a class="pub-link" href="${previewUrl}" target="_blank" rel="noopener">Lien public (prévisionnel): ${previewUrl}</a>
      `;
      pm.removeAttribute('hidden');
      document.body.style.overflow = 'hidden';
      pm.dataset.eventId = e.id;
      pm.dataset.eventTitle = e.title || '';
    });
  }
  m.removeAttribute('hidden');
  document.body.style.overflow = 'hidden';
}
function closeEventModal(){
  const m = qs('#event-modal');
  if (!m) return;
  m.setAttribute('hidden','');
  document.body.style.overflow = '';
}

async function getPlan(){
  const supa = window.AppAPI.getClient();
  const user = await window.AppAPI.getUser();
  // Explicit columns; adjust table/column if needed
  const { data, error } = await supa
    .from('profiles')
    .select('plan')
    .eq('id', user.id)
    .single();
  if (error) throw error;
  return data?.plan || 'free';
}

async function fetchEvents(page){
  const supa = window.AppAPI.getClient();
  const user = await window.AppAPI.getUser();
  const from = (page-1)*PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;
  // Sélection explicite des colonnes
  // 1) Tentative complète (incluant agrégats, status, description et billetterie)
  try{
    const { data, error, count } = await supa
      .from('events')
      .select('id,title,slug,status,is_published,published_at,description_html,starts_at,ends_at,capacity,registered_count,checkin_count,revenue_cents,ticket_type,price_cents,max_per_user,sales_from,sales_until,is_open,show_remaining', { count: 'exact' })
      .eq('owner_id', user.id)
      .order('starts_at', { ascending: false })
      .range(from, to);
    if (error) throw error;
    return { rows: data || [], total: count || 0 };
  }catch(err1){
    // 2) Repli sans status (schéma ancien sans colonne status)
    try{
      const { data, error, count } = await supa
        .from('events')
        .select('id,title,slug,description_html,starts_at,ends_at,capacity,registered_count,checkin_count,revenue_cents,ticket_type,price_cents,max_per_user,sales_from,sales_until,is_open,show_remaining', { count: 'exact' })
        .eq('owner_id', user.id)
        .order('starts_at', { ascending: false })
        .range(from, to);
      if (error) throw error;
      return { rows: data || [], total: count || 0 };
    }catch(err2){
      // 3) Repli minimal (aucune colonne d'agrégat non standard)
      const { data, error, count } = await supa
        .from('events')
        .select('id,title,slug,description_html,starts_at,ends_at,capacity,ticket_type,price_cents,max_per_user,sales_from,sales_until,is_open,show_remaining', { count: 'exact' })
        .eq('owner_id', user.id)
        .order('starts_at', { ascending: false })
        .range(from, to);
      if (error) throw error;
      // Les champs agrégés et status seront indéfinis; l'UI gère des valeurs par défaut
      return { rows: data || [], total: count || 0 };
    }
  }
}

function updateStats(rows){
  const totals = rows.reduce((acc, e)=>{
    acc.events += 1;
    acc.attendees += (e.registered_count || 0);
    acc.checkins += (e.checkin_count || 0);
    acc.revenue += (e.revenue_cents || 0);
    return acc;
  }, { events:0, attendees:0, checkins:0, revenue:0 });
  setText('#stat-total-events', totals.events.toString());
  setText('#stat-total-attendees', totals.attendees.toString());
  setText('#stat-total-checkins', totals.checkins.toString());
  setText('#stat-total-revenue', eur(totals.revenue));
}

const state = { page: 1, total: 0, plan: 'free' };

async function loadPage(page){
  state.page = page;
  const sk = qs('#events-skeleton');
  const grid = qs('#events-grid');
  const empty = qs('#events-empty');
  const pag = qs('#pagination');
  hide(grid); hide(empty); show(sk);
  renderSkeletons();
  try{
    const { rows, total } = await fetchEvents(page);
    state.total = total;
    sk.innerHTML = '';
    hide(sk);
    if (!rows.length){ show(empty); hide(grid); }
    else { renderCards(rows, state.plan); show(grid); bindDeleteHandlers(); }
    const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
    setText('#pageInfo', `Page ${page} / ${totalPages}`);
    qs('#prevPage').disabled = page <= 1;
    qs('#nextPage').disabled = page >= totalPages;
    show(pag);
    updateStats(rows);
  }catch(err){
    console.error(err);
    hide(sk); show(empty);
    toast('Erreur de chargement des événements', 'error');
  }
}

document.addEventListener('DOMContentLoaded', async ()=>{
  await window.AuthGuard?.requireAuth({ requireVerified: true });
  try{
    state.plan = await getPlan();
  }catch(err){
    console.warn('Impossible de lire plan profil, défaut free', err);
    state.plan = 'free';
  }
  // pagination events
  qs('#prevPage')?.addEventListener('click', ()=>{ if (state.page>1) loadPage(state.page-1); });
  qs('#nextPage')?.addEventListener('click', ()=>{ loadPage(state.page+1); });
  // Modal events
  qs('#event-modal .modal__close')?.addEventListener('click', closeEventModal);
  qs('#event-modal')?.addEventListener('click', (e)=>{ if (e.target.id === 'event-modal') closeEventModal(); });
  document.addEventListener('keydown', (e)=>{ if (e.key === 'Escape') closeEventModal(); });
  // Sécurité: s'assurer que la modal est fermée au chargement
  try{ closeEventModal(); }catch{}
  // Dashboard publish modal handlers
  const pm = qs('#publish-modal');
  pm?.querySelector('#dash-cancel-publish')?.addEventListener('click', ()=>{ pm.setAttribute('hidden',''); document.body.style.overflow=''; });
  pm?.querySelector('.modal__close')?.addEventListener('click', ()=>{ pm.setAttribute('hidden',''); document.body.style.overflow=''; });
  pm?.addEventListener('click', (ev)=>{ if (ev.target.id==='publish-modal'){ pm.setAttribute('hidden',''); document.body.style.overflow=''; }});
  pm?.querySelector('#dash-confirm-publish')?.addEventListener('click', async (ev)=>{
    const btn = ev.currentTarget; btn.disabled = true;
    try{
      const id = pm.dataset.eventId; const title = pm.dataset.eventTitle;
      const row = await publishEvent(id, title);
      const publicUrl = row?.slug ? `${location.origin}/event/${row.slug}` : '';
      toast(publicUrl ? `Événement publié: ${publicUrl}` : 'Événement publié');
      pm.setAttribute('hidden',''); document.body.style.overflow='';
      closeEventModal();
      await loadPage(state.page);
    }catch(err){ console.error(err); toast('Erreur publication', 'error'); }
    finally{ btn.disabled = false; }
  });
  await loadPage(1);
  // Show success toast if coming from wizard
  try{
    const msg = localStorage.getItem('dashboard_toast');
    if (msg){ toast(msg, 'info'); localStorage.removeItem('dashboard_toast'); }
  }catch{}
});
