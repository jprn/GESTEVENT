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
    if (sCap) sCap.textContent = cap != null ? String(cap) : '—';
    if (sRem) sRem.textContent = (cap != null && registered != null) ? String(Math.max(0, cap - registered)) : '—';
    if (sPct){
      if (cap && typeof registered === 'number' && cap > 0){
        const pct = Math.max(0, Math.min(100, Math.round((registered / cap) * 100)));
        sPct.textContent = `${pct} %`;
        if (sBar) sBar.style.width = pct + '%';
      } else {
        sPct.textContent = '—';
        if (sBar) sBar.style.width = '0%';
      }
    }
  }

  async function loadEvents(){
    const sel = byId('ev-select');
    sel.innerHTML = '<option value="">Chargement…</option>';
    const supa = window.AppAPI.getClient();
    const { data, error } = await supa
      .from('events')
      .select('id, title, status')
      .order('created_at', { ascending: false });
    if (error){ sel.innerHTML = '<option value="">Erreur de chargement</option>'; return; }
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
      return;
    }
    const supa = window.AppAPI.getClient();
    // 1) Lire l'événement avec agrégats si dispos
    let ev = null; let error = null;
    try{
      const res = await supa
        .from('events')
        .select('id,capacity,registered_count,checkin_count,revenue_cents,ticket_type,price_cents')
        .eq('id', currentEventId)
        .maybeSingle();
      ev = res.data; error = res.error || null;
    }catch(err){ error = err; }
    // Ne pas retourner sur erreur: on peut calculer depuis participants
    let registered = typeof ev?.registered_count === 'number' ? ev.registered_count : null;
    let checkins = typeof ev?.checkin_count === 'number' ? ev.checkin_count : null;
    let revenue = typeof ev?.revenue_cents === 'number' ? ev.revenue_cents : null;
    const cap = typeof ev?.capacity === 'number' ? ev.capacity : null;
    lastEventMeta = { capacity: cap, ticket_type: ev?.ticket_type ?? null, price_cents: typeof ev?.price_cents === 'number' ? ev.price_cents : null };

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
      if (ev?.ticket_type === 'paid' && typeof ev?.price_cents === 'number' && registered != null){
        revenue = (registered * ev.price_cents) | 0;
      }else{
        revenue = 0;
      }
    }

    // 3) Mettre à jour l'UI
    applyStatsUI(registered, checkins, revenue, cap);
  }

  async function loadParticipants(){
    const tableBody = byId('tbl-body');
    const empty = byId('empty');
    tableBody.innerHTML = '';
    empty.hidden = true;

    if (!currentEventId){ empty.hidden = false; empty.textContent = 'Choisissez un événement.'; return; }

    const q = byId('search').value.trim();
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
    // Rendu tableau
    if (!currentRows.length){
      empty.hidden = false; empty.textContent = 'Aucun participant';
    } else {
      empty.hidden = true;
      const rowsHtml = currentRows.map((p)=>{
        return `<tr>
          <td>${p.full_name || '—'}</td>
          <td>${p.email || '—'}</td>
          <td>${p.phone || '—'}</td>
          <td>${p.status || '—'}</td>
          <td>${fmtDate(p.created_at)}</td>
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
