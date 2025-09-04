'use strict';

(function(){
  const byId = (id)=>document.getElementById(id);
  let cache = { rows: [], eventId: null, eventTitle: '' };

  function toCSV(rows){
    const header = ['Nom','Email','Téléphone','Statut','Inscrit le'];
    const esc = (v)=>{
      if (v == null) return '';
      const s = String(v).replace(/"/g, '""');
      return /[",\n;]/.test(s) ? `"${s}"` : s;
    };
    const lines = [header.join(';')];
    for (const r of rows){
      const d = r.created_at ? new Date(r.created_at).toLocaleString() : '';
      lines.push([esc(r.full_name), esc(r.email), esc(r.phone||''), esc(r.status||''), esc(d)].join(';'));
    }
    return lines.join('\n');
  }

  function download(filename, text){
    const blob = new Blob([text], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(()=>{
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 0);
  }

  function onExport(){
    const titleSlug = (cache.eventTitle||'participants').toLowerCase().replace(/\s+/g,'-').replace(/[^a-z0-9\-]/g,'');
    const filename = `${titleSlug||'participants'}-${new Date().toISOString().slice(0,10)}.csv`;
    const csv = toCSV(cache.rows || []);
    download(filename, csv);
  }

  document.addEventListener('participants:update', (ev)=>{
    cache = ev.detail || cache;
    const btn = byId('btn-export');
    if (btn){ btn.disabled = !(cache.rows && cache.rows.length); }
  });

  document.addEventListener('DOMContentLoaded', ()=>{
    const btn = byId('btn-export');
    btn?.addEventListener('click', onExport);
  });
})();

