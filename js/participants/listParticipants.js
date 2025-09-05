'use strict';

(function(){
  const byId = (id)=>document.getElementById(id);
  const fmtDate = (iso)=>{
    if (!iso) return '—';
    try { const d = new Date(iso); return d.toLocaleString(); } catch { return '—'; }
  };
  const eur = (cents)=>{
    if (typeof cents !== 'number') return '—';
    return (cents/100).toLocaleString('fr-FR',{ style:'currency', currency:'EUR' });
  };

  let currentEventId = null;
  let currentEventTitle = '';
  let currentRows = [];
  let lastEventMeta = { capacity: null, ticket_type: null, price_cents: null };
  const eventMetaMap = new Map(); // id -> {capacity, ticket_type, price_cents, title}

  function applyStatsUI(registered, checkins, revenueCents, cap){
    const sIns = byId('stat-inscrits');
    const sCk = byId('stat-checkins');
    const sRev = byId('stat-revenue');
    const sCap = byId('stat-cap');
    const sRem = byId('stat-remaining');
    const sPct = byId('stat-fillpct');
    const sBar = byId('stat-fillbar');
    if (sIns) sIns.textContent = `${registered}${cap ? (' / ' + cap) : ''}`;
    if (sCk) sCk.textContent = String(checkins);
    if (sRev) sRev.textContent = eur(revenueCents);
    if (sCap) sCap.textContent = cap == null ? '—' : String(cap);
    let remaining = cap == null ? null : Math.max(0, cap - (Number(registered)||0));
    if (sRem) sRem.textContent = remaining == null ? '—' : String(remaining);
    const p = cap ? Math.min(100, Math.round((registered / cap) * 100)) : 0;
    if (sPct) sPct.textContent = `${p} %`;
    if (sBar){
      sBar.style.width = p + '%';
      sBar.classList.remove('progress__bar--ok','progress__bar--warn','progress__bar--danger');
      sBar.classList.add(p < 60 ? 'progress__bar--ok' : (p < 90 ? 'progress__bar--warn' : 'progress__bar--danger'));
    }
  }

  async function loadEvents(){
    const sel = byId('ev-select');
    sel.innerHTML = '<option value="">Chargement…</option>';
    const supa = window.AppAPI.getClient();
    const { data, error } = await supa
      .from('events')
      .select('id, title, status, capacity, ticket_type, price_cents')
      .order('created_at', { ascending: false });
    if (error){ sel.innerHTML = '<option value="">Erreur de chargement</option>'; return; }
    eventMetaMap.clear();
    (data||[]).forEach(e=>{ eventMetaMap.set(String(e.id), { capacity: e.capacity ?? null, ticket_type: e.ticket_type ?? null, price_cents: typeof e.price_cents==='number'?e.price_cents:null, title: e.title||'' }); });
    sel.innerHTML = '<option value="">— Sélectionner un événement —</option>' +
      (data||[]).map(e=>`<option value="${e.id}">${e.title || 'Sans titre'}${e.status && e.status!=='published' ? ' · ('+e.status+')' : ''}</option>`).join('');
  }

  async function loadEventStats(){
    const sIns = byId('stat-inscrits');
    const sCk = byId('stat-checkins');
    const sRev = byId('stat-revenue');
    const sCap = byId('stat-cap');
    const sRem = byId('stat-remaining');
    const sPct = byId('stat-fillpct');
    const sBar = byId('stat-fillbar');
    if (!currentEventId){
      if (sIns) sIns.textContent = '—';
      if (sCk) sCk.textContent = '—';
      if (sRev) sRev.textContent = '—';
      if (sCap) sCap.textContent = '—';
      if (sRem) sRem.textContent = '—';
      if (sPct) sPct.textContent = '—';
      if (sBar) sBar.style.width = '0%';
      const note = byId('stats-note'); if (note) note.hidden = true;
      return;
    }
    const supa = window.AppAPI.getClient();
    // 1) Métadonnées depuis la map
    let meta = eventMetaMap.get(String(currentEventId)) || {};
    lastEventMeta = { capacity: typeof meta.capacity==='number'?meta.capacity:null, ticket_type: meta.ticket_type ?? null, price_cents: typeof meta.price_cents==='number'?meta.price_cents:null };
    let registered = null;
    let checkins = null;
    let revenue = null;
    let cap = lastEventMeta.capacity;

    // 1.b) Fallback ciblé: tenter de lire capacity/pricing si absent de la map
    if (cap == null || lastEventMeta.ticket_type == null || typeof lastEventMeta.price_cents !== 'number'){
      try{
        const { data: evRow } = await supa
          .from('events')
          .select('capacity,ticket_type,price_cents')
          .eq('id', currentEventId)
          .maybeSingle();
        if (evRow){
          cap = typeof evRow.capacity === 'number' ? evRow.capacity : cap;
          lastEventMeta.capacity = cap;
          if (evRow.ticket_type) lastEventMeta.ticket_type = evRow.ticket_type;
          if (typeof evRow.price_cents === 'number') lastEventMeta.price_cents = evRow.price_cents;
          // Mémoriser dans la map pour prochains rafraîchissements
          meta = { ...(meta||{}), capacity: lastEventMeta.capacity, ticket_type: lastEventMeta.ticket_type, price_cents: lastEventMeta.price_cents };
          eventMetaMap.set(String(currentEventId), meta);
        }
      }catch{ /* ignore, RLS possible */ }
    }

    // 2) Fallbacks si les agrégats manquent
    if (registered == null){
      try{
        const { count } = await supa
          .from('participants')
          .select('id', { head: true, count: 'exact' })
          .eq('event_id', currentEventId)
          .eq('status', 'confirmed');
        registered = typeof count === 'number' ? count : 0;
      }catch{ registered = 0; }
    }
    if (checkins == null){
      // Tentative: compter les statuts check-in si implémentés ainsi
      try{
        const { count } = await supa
          .from('participants')
          .select('id', { head: true, count: 'exact' })
          .eq('event_id', currentEventId)
          .eq('status', 'checked_in');
        checkins = typeof count === 'number' ? count : 0;
      }catch{ checkins = 0; }
    }
    if (revenue == null){
      if (lastEventMeta.ticket_type === 'paid' && typeof lastEventMeta.price_cents === 'number' && registered != null){
        revenue = (registered * lastEventMeta.price_cents) | 0;
      }else{
        revenue = 0;
      }
    }

    // 3) Mettre à jour l'UI
    applyStatsUI(registered, checkins, revenue, cap);
    const note = byId('stats-note'); if (note) note.hidden = true;
  }

  async function loadParticipants(){
    const tableBody = byId('tbl-body');
    const empty = byId('empty');
    tableBody.innerHTML = '';
    empty.hidden = true;

    if (!currentEventId){
      empty.hidden = false;
      empty.textContent = 'Choisissez un événement.';
      const resultsEl = byId('results-count'); if (resultsEl) resultsEl.textContent = '0';
      const evm = byId('ev-meta'); if (evm) evm.textContent = '';
      return;
    }

    const q = byId('search').value.trim();
    const note = byId('stats-note'); if (note) note.hidden = !q;
    const supa = window.AppAPI.getClient();
    let query = supa
      .from('participants')
      .select('id, full_name, email, phone, status, created_at')
      .eq('event_id', currentEventId)
      .order('created_at', { ascending: false })
      .limit(500);
    if (q){
      // Recherche simple sur full_name/email/phone
      query = query.or(`full_name.ilike.%${q}%,email.ilike.%${q}%,phone.ilike.%${q}%`);
    }
    const { data, error } = await query;
    if (error){
      empty.hidden = false;
      empty.textContent = 'Erreur de chargement des participants';
      return;
    }
    currentRows = data || [];
    const resultsEl = byId('results-count'); if (resultsEl) resultsEl.textContent = String(currentRows.length);
    const evm = byId('ev-meta'); if (evm) {
      const capTxt = (lastEventMeta && typeof lastEventMeta.capacity === 'number') ? ` · Capacité ${lastEventMeta.capacity}` : '';
      evm.textContent = (currentEventTitle || '') + capTxt;
    }
    // Rendu tableau
    if (!currentRows.length){
      empty.hidden = false; empty.textContent = 'Aucun participant';
    } else {
      empty.hidden = true;
      const rowsHtml = currentRows.map((r)=>{
        const status = (r.status || '—').toLowerCase();
        let badgeClass = 'badge';
        if (status === 'checked_in') badgeClass += ' badge--info';
        else if (status === 'confirmed') badgeClass += ' badge--ok';
        else if (status === 'pending') badgeClass += ' badge--warn';
        else if (status === 'canceled' || status === 'cancelled') badgeClass += ' badge--err';
        return `<tr>
          <td>${r.full_name || '—'}</td>
          <td>${r.email || '—'}</td>
          <td>${r.phone || '—'}</td>
          <td><span class="${badgeClass}">${r.status || '—'}</span></td>
          <td>${fmtDate(r.created_at)}</td>
        </tr>`;
      }).join('');
      tableBody.innerHTML = rowsHtml;
    }

    // Mettre à jour le bouton export
    const btn = byId('btn-export');
    if (btn){
      btn.disabled = !currentRows.length;
      btn.dataset.eventId = currentEventId;
      btn.dataset.eventTitle = currentEventTitle || '';
    }

    // Notifier exportCSV.js de la nouvelle data
    document.dispatchEvent(new CustomEvent('participants:update', {
      detail: { rows: currentRows, eventId: currentEventId, eventTitle: currentEventTitle }
    }));

    // Stats selon filtrage: si une recherche est active, refléter les résultats filtrés
    if (q){
      const cap = lastEventMeta.capacity;
      const regs = currentRows.filter(r=> (r.status||'').toLowerCase()==='confirmed').length;
      const cks = currentRows.filter(r=> (r.status||'').toLowerCase()==='checked_in').length;
      let rev = 0;
      if (lastEventMeta.ticket_type === 'paid' && typeof lastEventMeta.price_cents === 'number'){
        rev = regs * lastEventMeta.price_cents;
      }
      applyStatsUI(regs, cks, rev, cap);
    } else {
      // Sinon, stats globales de l'événement
      await loadEventStats();
    }
  }

  function mount(){
    const root = byId('app');
    root.innerHTML = `
      <div class="participants">
        <section class="stats" id="p-stats">
          <div class="stats__note" id="stats-note" hidden>Stats filtrées</div>
          <div class="stat"><span class="stat__value" id="stat-inscrits">—</span><span class="stat__label">Inscrits</span></div>
          <div class="stat"><span class="stat__value" id="stat-checkins">—</span><span class="stat__label">Check‑ins</span></div>
          <div class="stat"><span class="stat__value" id="stat-revenue">—</span><span class="stat__label">Revenu</span></div>
          <div class="stat"><span class="stat__value" id="stat-cap">—</span><span class="stat__label">Capacité</span></div>
          <div class="stat"><span class="stat__value" id="stat-remaining">—</span><span class="stat__label">Restants</span></div>
          <div class="stat">
            <span class="stat__value" id="stat-fillpct">—</span>
            <span class="stat__label">Remplissage</span>
            <div class="progress" style="margin-top:8px">
              <div class="progress__bar" id="stat-fillbar" style="width:0%"></div>
            </div>
          </div>
        </section>
        <div class="toolbar">
          <select id="ev-select" class="form-control"></select>
          <input id="search" class="form-control" placeholder="Rechercher nom, email, téléphone"/>
          <button id="btn-refresh" class="btn btn-secondary">Rafraîchir</button>
          <button id="btn-export" class="btn" disabled>Exporter CSV</button>
        </div>
        <div class="table-meta">
          <div><strong id="results-count">0</strong> résultat(s)</div>
          <div id="ev-meta"></div>
        </div>
        <div id="empty" class="empty">Chargement…</div>
        <div class="table-wrap">
          <table class="table">
            <thead>
              <tr>
                <th>Nom</th>
                <th>Email</th>
                <th>Téléphone</th>
                <th>Statut</th>
                <th>Inscrit le</th>
              </tr>
            </thead>
            <tbody id="tbl-body"></tbody>
          </table>
        </div>
      </div>
    `;

    byId('ev-select').addEventListener('change', async (e)=>{
      currentEventId = e.target.value || null;
      currentEventTitle = e.target.options && e.target.selectedIndex >= 0 ? (e.target.options[e.target.selectedIndex].textContent || '') : '';
      // Mettre à jour lastEventMeta depuis la map si dispo
      const meta = eventMetaMap.get(String(currentEventId)) || {};
      lastEventMeta = { capacity: typeof meta.capacity==='number'?meta.capacity:null, ticket_type: meta.ticket_type ?? null, price_cents: typeof meta.price_cents==='number'?meta.price_cents:null };
      // Mettre à jour les métadonnées d'événement d'abord (capacity/pricing), puis la liste (qui peut surcharger avec filtre)
      await loadEventStats();
      await loadParticipants();
    });
    byId('search').addEventListener('input', ()=>{
      // Debounce simple
      clearTimeout(byId('search')._t);
      byId('search')._t = setTimeout(loadParticipants, 250);
    });
    byId('btn-refresh').addEventListener('click', async ()=>{
      // Rafraîchir les métadonnées (capacity/pricing) puis la liste
      await loadEventStats();
      await loadParticipants();
    });
  }

  document.addEventListener('DOMContentLoaded', async ()=>{
    mount();
    await loadEvents();
    // si une valeur d'événement est passée via query ?e=ID
    const params = new URLSearchParams(location.search);
    const eid = params.get('e');
    if (eid){
      const sel = byId('ev-select');
      sel.value = eid;
      currentEventId = eid;
      currentEventTitle = sel.options && sel.selectedIndex >=0 ? (sel.options[sel.selectedIndex].textContent || '') : '';
      const meta = eventMetaMap.get(String(currentEventId)) || {};
      lastEventMeta = { capacity: typeof meta.capacity==='number'?meta.capacity:null, ticket_type: meta.ticket_type ?? null, price_cents: typeof meta.price_cents==='number'?meta.price_cents:null };
    }
    // Charger d'abord les métadonnées d'événement, puis la liste (pour permettre stats filtrées précises)
    await loadEventStats();
    await loadParticipants();

    // Realtime: mettre à jour les stats (et éventuellement la liste) si des participants changent pour l'événement sélectionné
    try{
      const supa = window.AppAPI.getClient();
      const onChange = (payload)=>{
        const changedEventId = String((payload?.new?.event_id ?? payload?.old?.event_id) || '');
        if (currentEventId && changedEventId === String(currentEventId)){
          // Si une recherche est active, recharger la liste (qui recalcule les stats filtrées)
          const q = (byId('search').value || '').trim();
          if (q){
            loadParticipants();
          } else {
            // Sinon, mettre à jour stats globales et éventuellement la liste si souhaité
            loadEventStats();
          }
        }
      };
      const channel = supa
        .channel('participants-page')
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'participants' }, onChange)
        .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'participants' }, onChange)
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'participants' }, onChange)
        .subscribe();
      window.addEventListener('beforeunload', ()=>{ try{ supa.removeChannel(channel); }catch{} });
    }catch(err){ try{ console.warn('Realtime non initialisé sur Participants', err); }catch{} }
  });
})();
