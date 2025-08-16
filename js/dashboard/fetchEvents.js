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

function renderCards(events, plan){
  const grid = qs('#events-grid');
  if (!grid) return;
  grid.innerHTML = '';
  for (const e of events){
    const p = percent(e.registered_count||0, e.capacity||0);
    const card = document.createElement('article');
    card.className = 'card';
    card.innerHTML = `
      <header>
        <h3>${e.title || 'Sans titre'}</h3>
        <div class="meta">${fmtDate(e.starts_at)} → ${fmtDate(e.ends_at)}</div>
      </header>
      <div class="grid">
        <div class="metric"><span class="label">Inscrits / Max</span><span class="value">${e.registered_count ?? 0} / ${e.capacity ?? '—'}</span></div>
        <div class="metric"><span class="label">Remplissage</span><span class="value">${p}%</span></div>
        <div class="metric"><span class="label">Encaissé</span><span class="value">${eur(e.revenue_cents)}</span></div>
      </div>
      <div class="progress" aria-label="Taux de remplissage"><div class="progress__bar" style="width:${p}%"></div></div>
      <div class="meta">Check‑ins: ${e.checkin_count ?? 0}</div>
      <div class="card__actions">
        <a class="btn" href="./create-event.html">Créer</a>
        <a class="btn btn--ghost" href="./create-event.html?e=${encodeURIComponent(e.id)}">Modifier</a>
        <a class="btn btn--ghost" href="./register.html?e=${encodeURIComponent(e.slug || e.id)}">Public</a>
        <a class="btn btn--ghost" href="./checkin.html?e=${encodeURIComponent(e.id)}">Check‑in</a>
        <a class="btn btn--ghost" href="./participants.html?e=${encodeURIComponent(e.id)}">Participants</a>
        ${plan === 'pro' ?
          `<a class="btn btn--ghost" href="./controllers.html?e=${encodeURIComponent(e.id)}">Contrôleurs</a>` :
          `<a class="btn btn--ghost" href="./pricing.html">Upgrade Pro</a>`
        }
        <button class="btn btn--danger" data-action="delete" data-id="${e.id}">Supprimer</button>
      </div>
    `;
    grid.appendChild(card);
  }
}

function bindDeleteHandlers(){
  document.querySelectorAll('[data-action="delete"]').forEach(btn=>{
    btn.addEventListener('click', async ()=>{
      const id = btn.getAttribute('data-id');
      if (!id) return;
      if (!confirm('Supprimer cet événement ?')) return;
      try{
        const supa = window.AppAPI.getClient();
        const { error } = await supa.from('events').delete().eq('id', id);
        if (error) throw error;
        toast('Événement supprimé');
        await loadPage(state.page);
      }catch(err){
        console.error(err);
        toast('Erreur lors de la suppression', 'error');
      }
    });
  });
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
  // Select explicit columns; consider creating a view with these aggregates
  const q = supa
    .from('events')
    .select('id,title,slug,starts_at,ends_at,capacity,registered_count,checkin_count,revenue_cents', { count: 'exact' })
    .eq('owner_id', user.id)
    .order('starts_at', { ascending: false })
    .range(from, to);

  const { data, error, count } = await q;
  if (error) throw error;
  return { rows: data || [], total: count || 0 };
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
  await loadPage(1);
  // Show success toast if coming from wizard
  try{
    const msg = localStorage.getItem('dashboard_toast');
    if (msg){ toast(msg, 'info'); localStorage.removeItem('dashboard_toast'); }
  }catch{}
});
