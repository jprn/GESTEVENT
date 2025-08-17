'use strict';

const STORAGE_KEY = 'ce_draft_v1';
let editingPublished = false; // défini lors du chargement d'un événement existant

function qs(sel){ return document.querySelector(sel); }

// Convertit une date ISO/UTC ou locale vers le format attendu par input[type="datetime-local"]: YYYY-MM-DDTHH:MM
function toDatetimeLocal(value){
  try{
    if (!value) return '';
    const d = new Date(value);
    const pad = (n)=> String(n).padStart(2,'0');
    const yyyy = d.getFullYear();
    const mm = pad(d.getMonth()+1);
    const dd = pad(d.getDate());
    const hh = pad(d.getHours());
    const mi = pad(d.getMinutes());
    return `${yyyy}-${mm}-${dd}T${hh}:${mi}`;
  }catch{ return ''; }
}
function qsa(sel){ return Array.from(document.querySelectorAll(sel)); }
function toast(msg, type='info'){
  // reuse dashboard toast if present; fallback to alert
  const t = document.getElementById('toast');
  if (t){ t.textContent = msg; t.dataset.type = type; t.hidden = false; setTimeout(()=>t.hidden=true, 3000); }
  else { alert(msg); }
}

function slugify(str){
  return (str||'')
    .normalize('NFD').replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g,'-')
    .replace(/^-+|-+$/g,'')
    .slice(0,80);
}

function getFormData(){
  const title = qs('#title')?.value?.trim();
  const description_html = qs('#description_html')?.value || '';
  const location_text = qs('#location_text')?.value?.trim() || '';
  const starts_at = qs('#starts_at')?.value || '';
  const ends_at = qs('#ends_at')?.value || '';
  const ticket_type = qs('#ticket_type')?.value || 'free';
  const price_eur = parseFloat(qs('#price_cents')?.value || '0');
  const price_cents = isNaN(price_eur) ? null : Math.round(price_eur * 100);
  const qty_total = parseInt(qs('#qty_total')?.value || '0', 10) || 0;
  const max_per_user = parseInt(qs('#max_per_user')?.value || '1', 10) || 1;
  const is_open = !!qs('#is_open')?.checked;
  const show_remaining = !!qs('#show_remaining')?.checked;
  const sales_from = qs('#sales_from')?.value || null;
  const sales_until = qs('#sales_until')?.value || null;
  return { title, description_html, location_text, starts_at, ends_at,
           ticket_type, price_cents, qty_total, max_per_user, is_open, show_remaining, sales_from, sales_until };
}

function setFormData(data){
  if (!data) return;
  if (data.title) qs('#title').value = data.title;
  if (data.description_html){ qs('#description').innerHTML = data.description_html; qs('#description_html').value = data.description_html; }
  if (data.location_text) qs('#location_text').value = data.location_text;
  if (data.starts_at) qs('#starts_at').value = toDatetimeLocal(data.starts_at);
  if (data.ends_at) qs('#ends_at').value = toDatetimeLocal(data.ends_at);
  if (data.ticket_type) qs('#ticket_type').value = data.ticket_type;
  if (typeof data.price_cents === 'number') qs('#price_cents').value = (data.price_cents/100).toFixed(2);
  if (typeof data.qty_total === 'number') qs('#qty_total').value = data.qty_total;
  if (typeof data.max_per_user === 'number') qs('#max_per_user').value = data.max_per_user;
  if (typeof data.is_open === 'boolean') qs('#is_open').checked = data.is_open;
  if (typeof data.show_remaining === 'boolean') qs('#show_remaining').checked = data.show_remaining;
  if (data.sales_from) qs('#sales_from').value = toDatetimeLocal(data.sales_from);
  if (data.sales_until) qs('#sales_until').value = toDatetimeLocal(data.sales_until);
}

function autosave(){
  const data = getFormData();
  try{ localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); }catch{}
}

function loadAutosave(){
  try{
    // Ne pas charger l'autosave si on est en mode édition (évite d'écraser les valeurs Supabase)
    const params = new URLSearchParams(location.search);
    if (params.get('e')) return;
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw){ setFormData(JSON.parse(raw)); }
  }catch{}
}

function validateStep(step){
  const data = getFormData();
  if (step === 1){
    if (!data.title || data.title.length < 5) return { ok:false, msg:'Le titre doit faire au moins 5 caractères.' };
    if (!data.starts_at || !data.ends_at) return { ok:false, msg:'Renseignez les dates de début et de fin.' };
    const start = new Date(data.starts_at).getTime();
    const end = new Date(data.ends_at).getTime();
    if (!(end > start)) return { ok:false, msg:'La fin doit être postérieure au début.' };
  }
  if (step === 2){
    if (data.ticket_type === 'paid' && (typeof data.price_cents !== 'number' || data.price_cents <= 0)){
      return { ok:false, msg:'Prix requis pour un billet payant.' };
    }
    if (data.qty_total < 0 || data.qty_total > 10000) return { ok:false, msg:'Quantité totale doit être entre 0 et 10000.' };
    if (data.max_per_user < 1) return { ok:false, msg:'Max par utilisateur doit être ≥ 1.' };
    if (data.sales_from && data.sales_until){
      const a = new Date(data.sales_from).getTime();
      const b = new Date(data.sales_until).getTime();
      if (!(b >= a)) return { ok:false, msg:'La fin des ventes doit être après le début.' };
    }
  }
  return { ok:true };
}

function setStep(step){
  qsa('.step').forEach(li=>li.classList.toggle('is-active', li.dataset.step === String(step)));
  qsa('.panel').forEach(p=>{
    if (p.dataset.step === String(step)) p.removeAttribute('hidden');
    else p.setAttribute('hidden','');
  });
  qs('#prevStep').disabled = step === 1;
  qs('#nextStep').hidden = (step === 2);
  qs('#publish').hidden = (step !== 2);
  updatePublishVisibility();
}

function clearFormAndState(){
  // reset champs visibles
  const form = qs('#eventForm');
  if (form) form.reset();
  // reset éditeur riche + champ caché
  const editor = qs('#description');
  const hidden = qs('#description_html');
  if (editor) editor.innerHTML = '';
  if (hidden) hidden.value = '';
  // champs spécifiques
  ['#title','#location_text','#starts_at','#ends_at','#price_cents','#qty_total','#max_per_user','#sales_from','#sales_until']
    .forEach(sel=>{ const el = qs(sel); if (el) el.value = ''; });
  const ticket = qs('#ticket_type'); if (ticket) ticket.value = 'free';
  const price = qs('#price_cents'); if (price) price.disabled = true;
  const isOpen = qs('#is_open'); if (isOpen) isOpen.checked = false;
  const showRem = qs('#show_remaining'); if (showRem) showRem.checked = false;
  // autosave local
  try{ localStorage.removeItem(STORAGE_KEY); }catch{}
  // retirer le paramètre ?e pour repartir sur une nouvelle création
  try{
    const url = new URL(location.href);
    url.searchParams.delete('e');
    history.replaceState({}, '', url);
  }catch{}
}

async function ensureUniqueSlug(base){
  const supa = window.AppAPI.getClient();
  let candidate = base;
  let i = 1;
  // Try up to 50 variants to avoid infinite loop
  while (i < 50){
    const { data, error } = await supa.from('events').select('slug').eq('slug', candidate).maybeSingle();
    if (error) throw error;
    if (!data) return candidate;
    i += 1; candidate = `${base}-${i}`;
  }
  return `${base}-${Date.now()}`;
}

async function upsertEvent(status){
  const data = getFormData();
  const supa = window.AppAPI.getClient();
  const user = await window.AppAPI.getUser();
  // detect edit mode via query param e
  const params = new URLSearchParams(location.search);
  const editingId = params.get('e');

  // Si on édite un événement déjà publié, on limite les colonnes mises à jour
  let payload;
  if (editingId && editingPublished){
    payload = {
      // owner_id inchangé
      status: 'published',
      capacity: data.qty_total,
      sales_from: data.sales_from,
      sales_until: data.sales_until,
    };
  } else {
    payload = {
      owner_id: user.id,
      title: data.title,
      description_html: data.description_html,
      location_text: data.location_text,
      starts_at: data.starts_at || null,
      ends_at: data.ends_at || null,
      status: status,
      ticket_type: data.ticket_type,
      price_cents: data.ticket_type === 'paid' ? data.price_cents : 0,
      capacity: data.qty_total,
      max_per_user: data.max_per_user,
      sales_from: data.sales_from,
      sales_until: data.sales_until,
      is_open: data.is_open,
      show_remaining: data.show_remaining,
    };
  }

  if (!editingPublished && status === 'published'){
    const base = slugify(data.title);
    const finalSlug = await ensureUniqueSlug(base);
    payload.slug = finalSlug;
  }

  if (editingId){
    const { data:row, error } = await supa.from('events').update(payload).eq('id', editingId).select('id,slug').single();
    if (error) throw error;
    return row;
  } else {
    const { data:rows, error } = await supa.from('events').insert(payload).select('id,slug');
    if (error) throw error;
    return rows?.[0];
  }
}

function bindWysiwyg(){
  const editor = qs('#description');
  const hidden = qs('#description_html');
  qsa('.wys-toolbar [data-cmd]').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const cmd = btn.dataset.cmd;
      const val = btn.dataset.value || undefined;
      document.execCommand(cmd, false, val);
      hidden.value = editor.innerHTML;
      autosave();
    });
  });
  ['input','blur','keyup','paste'].forEach(ev=>{
    editor.addEventListener(ev, ()=>{ hidden.value = editor.innerHTML; autosave(); });
  });
}

function bindAutosave(){
  ['change','input'].forEach(ev=>{
    qsa('#eventForm input, #eventForm select').forEach(el=>{
      el.addEventListener(ev, ()=>{
        if (el.id === 'ticket_type'){
          const paid = el.value === 'paid';
          qs('#price_cents').disabled = !paid;
        }
        autosave();
        updatePublishVisibility();
      });
    });
  });
}

function updatePublishVisibility(){
  const pub = qs('#publish');
  const step2Visible = !pub.hidden;
  if (!step2Visible) return;
  const v1 = validateStep(1);
  const v2 = validateStep(2);
  // Le bouton Publier n'apparaît qu'en étape 2 (géré par setStep) et est désactivé tant que non valide
  pub.disabled = !(v1.ok && v2.ok);
}

document.addEventListener('DOMContentLoaded', async ()=>{
  await window.AuthGuard?.requireAuth({ requireVerified: true });
  bindWysiwyg();
  bindAutosave();
  loadAutosave();
  // init price input disabled state
  qs('#price_cents').disabled = (qs('#ticket_type').value !== 'paid');

  let currentStep = 1;
  setStep(currentStep);

  qs('#nextStep').addEventListener('click', ()=>{
    // Validation de l'étape courante
    const v = validateStep(currentStep);
    if (!v.ok){ toast(v.msg, 'error'); return; }

    // Comportement attendu: lorsqu'on passe à la billetterie, on crée/actualise un brouillon côté Supabase
    // Ceci garantit l'existence de l'événement (status = 'draft') avant la publication
    (async ()=>{
      const btn = qs('#nextStep');
      const prevDisabled = btn.disabled;
      btn.disabled = true; // éviter les doubles clics pendant la sauvegarde
      try{
        // Sauvegarde à chaque passage par "Suivant"
        const row = await upsertEvent(editingPublished ? 'published' : 'draft');
        // Si un nouvel ID est retourné (création), on le fixe dans l'URL pour passer en mode édition
        if (row?.id){
          const url = new URL(location.href);
          url.searchParams.set('e', row.id);
          history.replaceState({}, '', url);
        }
        if (currentStep === 1){
          toast('Brouillon enregistré');
        } else {
          // Déjà sur la billetterie (dernière étape)
          toast('Brouillon mis à jour.');
          // Comportement demandé: clic sur Suivant depuis la billetterie -> vider champs
          clearFormAndState();
        }
      }catch(err){
        console.error('Erreur sauvegarde brouillon via "Suivant"', err);
        toast('Erreur enregistrement brouillon', 'error');
        // On peut décider d’arrêter ici si la sauvegarde échoue; on choisit de ne pas bloquer la navigation
      }

      // Passage à l'étape suivante (1 -> 2). Si déjà en étape 2, on reste mais on a au moins sauvegardé.
      currentStep = Math.min(2, currentStep+1);
      setStep(currentStep);
      btn.disabled = prevDisabled; // rétablir l'état initial du bouton
    })();
  });

  qs('#prevStep').addEventListener('click', ()=>{
    currentStep = Math.max(1, currentStep-1);
    setStep(currentStep);
  });

  qs('#saveDraft').addEventListener('click', async ()=>{
    const v1 = validateStep(1); // au moins step1 valide pour brouillon propre
    if (!v1.ok){ toast(v1.msg, 'error'); return; }
    try{
      const row = await upsertEvent(editingPublished ? 'published' : 'draft');
      toast(editingPublished ? 'Modifications enregistrées' : 'Brouillon enregistré');
      if (row?.id){
        const url = new URL(location.href);
        url.searchParams.set('e', row.id);
        history.replaceState({}, '', url);
      }
      if (!editingPublished){
        // Comportement demandé: vider les champs après enregistrement brouillon
        clearFormAndState();
        // revenir au step 1 visuellement
        currentStep = 1; setStep(currentStep);
      }
    }catch(err){ console.error(err); toast('Erreur enregistrement brouillon', 'error'); }
  });

  // Publication: ouvrir modal de confirmation avec récapitulatif
  qs('#publish').addEventListener('click', async ()=>{
    const v1 = validateStep(1); if (!v1.ok){ toast(v1.msg, 'error'); return; }
    const v2 = validateStep(2); if (!v2.ok){ toast(v2.msg, 'error'); return; }
    const data = getFormData();
    const baseSlug = slugify(data.title);
    const previewUrl = `${location.origin}/event/${baseSlug || 'nouvel-evenement'}`;
    const recap = [
      `<div><strong>Titre:</strong> ${data.title || '—'}</div>`,
      `<div><strong>Dates:</strong> ${data.starts_at || '—'} → ${data.ends_at || '—'}</div>`,
      `<div><strong>Lieu:</strong> ${data.location_text || '—'}</div>`,
      `<div><strong>Billetterie:</strong> ${data.ticket_type==='paid' ? `Payant · ${(data.price_cents/100).toFixed(2)} €` : 'Gratuit'}</div>`,
      `<div><strong>Quantité totale:</strong> ${data.qty_total ?? '—'} · <strong>Max/utilisateur:</strong> ${data.max_per_user ?? '—'}</div>`,
      `<div><strong>Période de vente:</strong> ${data.sales_from || '—'} → ${data.sales_until || '—'} · <strong>Statut ventes:</strong> ${data.is_open ? 'Ouvertes' : 'Fermées'}</div>`,
      `<a class="pub-link" href="${previewUrl}" target="_blank" rel="noopener">Lien public (prévisionnel): ${previewUrl}</a>`
    ].join('');
    const modal = qs('#publish-modal');
    const box = qs('#pub-recap');
    if (modal && box){
      box.innerHTML = recap;
      modal.removeAttribute('hidden');
      document.body.style.overflow = 'hidden';
    }
  });

  // Gestion boutons de la modal de publication
  const pubModal = qs('#publish-modal');
  pubModal?.querySelector('#cancelPublish')?.addEventListener('click', ()=>{ pubModal.setAttribute('hidden',''); document.body.style.overflow=''; });
  pubModal?.querySelector('.ce-modal__close')?.addEventListener('click', ()=>{ pubModal.setAttribute('hidden',''); document.body.style.overflow=''; });
  pubModal?.addEventListener('click', (e)=>{ if (e.target.id==='publish-modal'){ pubModal.setAttribute('hidden',''); document.body.style.overflow=''; }});
  document.addEventListener('keydown', (e)=>{ if (e.key==='Escape' && !pubModal?.hasAttribute('hidden')){ pubModal.setAttribute('hidden',''); document.body.style.overflow=''; } });

  // Confirmation de publication: appel réel à Supabase
  pubModal?.querySelector('#confirmPublish')?.addEventListener('click', async (ev)=>{
    const btn = ev.currentTarget;
    btn.disabled = true;
    try{
      const row = await upsertEvent('published');
      const publicUrl = row?.slug ? `${location.origin}/event/${row.slug}` : '';
      try{ localStorage.setItem('dashboard_toast', publicUrl ? `Événement publié: ${publicUrl}` : 'Événement publié avec succès'); }catch{}
      clearFormAndState();
      window.location.href = './dashboard.html';
    }catch(err){ console.error(err); toast('Erreur publication', 'error'); }
    finally{ btn.disabled = false; }
  });

  // If editing, load existing event
  try{
    const params = new URLSearchParams(location.search);
    const editingId = params.get('e');
    if (editingId){
      const supa = window.AppAPI.getClient();
      const { data, error } = await supa
        .from('events')
        .select('status, title, description_html, location_text, starts_at, ends_at, ticket_type, price_cents, capacity, max_per_user, sales_from, sales_until, is_open, show_remaining')
        .eq('id', editingId)
        .single();
      if (error) throw error;
      editingPublished = (data?.status || '').toLowerCase() === 'published';
      const mapped = {
        title: data?.title || '',
        description_html: data?.description_html || '',
        location_text: data?.location_text || '',
        starts_at: data?.starts_at || '',
        ends_at: data?.ends_at || '',
        ticket_type: data?.ticket_type || 'free',
        price_cents: typeof data?.price_cents === 'number' ? data.price_cents : 0,
        qty_total: typeof data?.capacity === 'number' ? data.capacity : 0,
        max_per_user: typeof data?.max_per_user === 'number' ? data.max_per_user : 1,
        sales_from: data?.sales_from || '',
        sales_until: data?.sales_until || '',
        is_open: !!data?.is_open,
        show_remaining: !!data?.show_remaining,
      };
      setFormData(mapped);
      // reflect ticket_type -> price enable/disable
      qs('#price_cents').disabled = (qs('#ticket_type').value !== 'paid');

      // Si publié: verrouiller les champs non autorisés et adapter l'UI
      if (editingPublished){
        // Désactiver tous les champs sauf qty_total, sales_from, sales_until
        ['#title','#location_text','#starts_at','#ends_at','#ticket_type','#price_cents','#max_per_user','#is_open','#show_remaining']
          .forEach(sel=>{ const el = qs(sel); if (el) el.disabled = true; });
        const editor = qs('#description'); if (editor) editor.setAttribute('contenteditable','false');
        // Boutons: pas de publication ni de "suivant"; garder un bouton d'enregistrement
        const publishBtn = qs('#publish'); if (publishBtn) publishBtn.hidden = true;
        const nextBtn = qs('#nextStep'); if (nextBtn) nextBtn.hidden = true;
        const saveBtn = qs('#saveDraft'); if (saveBtn) saveBtn.textContent = 'Enregistrer';
        // Rester en étape 2 pour clarté (billetterie)
        currentStep = 2; setStep(currentStep);
      }
    }
  }catch(err){ console.warn('Chargement de l\'événement existant échoué', err); }
});
