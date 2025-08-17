'use strict';

// Config
const PAGE_SIZE = 6;

// UI helpers
function qs(sel){ return document.querySelector(sel); }
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

function renderCards(events, plan){
  const grid = qs('#events-grid');
  if (!grid) return;
  grid.innerHTML = '';
  for (const e of events){
    const p = percent(e.registered_count||0, e.capacity||0);
    const card = document.createElement('article');
    const statusClass = e.status === 'draft' ? 'card--draft' : (e.status === 'published' ? 'card--published' : '');
    card.className = `card card--compact ${statusClass}`.trim();
    let statusBadge = '';
    if (e.status === 'draft') statusBadge = '<span class="badge badge--draft">Brouillon</span>';
    else if (e.status === 'published') statusBadge = '<span class="badge badge--published">Publié</span>';

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
  const status = e.status ? `<span class="badge ${e.status==='draft'?'badge--draft':'badge--published'}">${e.status==='draft'?'Brouillon':'Publié'}</span>` : '';
  body.innerHTML = `
    <h3>${e.title || 'Sans titre'} ${status}</h3>
    <div class="meta">${fmtDate(e.starts_at)} → ${fmtDate(e.ends_at)}</div>
    ${e.description_html ? `<div class="modal__desc">${e.description_html}</div>` : ''}
    <div class="modal__grid">
      <div><strong>Inscrits</strong><div>${e.registered_count ?? 0}${e.capacity?` / ${e.capacity}`:''}</div></div>
      <div><strong>Revenu</strong><div>${eur(e.revenue_cents)}</div></div>
      <div><strong>Check‑ins</strong><div>${e.checkin_count ?? 0}</div></div>
    </div>
    <div class="modal__actions">
      <a class="btn" href="./create-event.html?e=${encodeURIComponent(e.id)}">Modifier</a>
      <a class="btn btn--ghost" href="./participants.html?e=${encodeURIComponent(e.id)}">Participants</a>
      <a class="btn btn--ghost" href="./checkin.html?e=${encodeURIComponent(e.id)}">Check‑in</a>
    </div>
  `;
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
  // 1) Tentative complète (incluant agrégats, status et description)
  try{
    const { data, error, count } = await supa
      .from('events')
      .select('id,title,slug,status,description_html,starts_at,ends_at,capacity,registered_count,checkin_count,revenue_cents', { count: 'exact' })
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
        .select('id,title,slug,description_html,starts_at,ends_at,capacity,registered_count,checkin_count,revenue_cents', { count: 'exact' })
        .eq('owner_id', user.id)
        .order('starts_at', { ascending: false })
        .range(from, to);
      if (error) throw error;
      return { rows: data || [], total: count || 0 };
    }catch(err2){
      // 3) Repli minimal (aucune colonne d'agrégat non standard)
      const { data, error, count } = await supa
        .from('events')
        .select('id,title,slug,description_html,starts_at,ends_at,capacity', { count: 'exact' })
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
  await loadPage(1);
  // Show success toast if coming from wizard
  try{
    const msg = localStorage.getItem('dashboard_toast');
    if (msg){ toast(msg, 'info'); localStorage.removeItem('dashboard_toast'); }
  }catch{}
});
