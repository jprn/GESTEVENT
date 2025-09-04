'use strict';

(function(){
  const byId = (id)=>document.getElementById(id);
  const fmtDate = (iso)=>{
    if (!iso) return '—';
    try { const d = new Date(iso); return d.toLocaleString(); } catch { return '—'; }
  };

  let currentEventId = null;
  let currentEventTitle = '';
  let currentRows = [];

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
  }

  function mount(){
    const root = byId('app');
    root.innerHTML = `
      <div class="participants">
        <div class="toolbar">
          <select id="ev-select" class="select"></select>
          <input id="search" class="input" placeholder="Rechercher nom, email, téléphone"/>
          <button id="btn-refresh" class="btn">Rafraîchir</button>
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

    byId('ev-select').addEventListener('change', (e)=>{
      currentEventId = e.target.value || null;
      currentEventTitle = e.target.options && e.target.selectedIndex >= 0 ? (e.target.options[e.target.selectedIndex].textContent || '') : '';
      loadParticipants();
    });
    byId('search').addEventListener('input', ()=>{
      // Debounce simple
      clearTimeout(byId('search')._t);
      byId('search')._t = setTimeout(loadParticipants, 250);
    });
    byId('btn-refresh').addEventListener('click', loadParticipants);
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
    await loadParticipants();
  });
})();
