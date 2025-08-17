'use strict';

(function(){
  function byId(id){ return document.getElementById(id); }
  function fmtDateRange(startISO, endISO){
    if (!startISO && !endISO) return '—';
    try{
      const optsDate = { year:'numeric', month:'short', day:'2-digit' };
      const optsTime = { hour:'2-digit', minute:'2-digit' };
      const s = startISO ? new Date(startISO) : null;
      const e = endISO ? new Date(endISO) : null;
      if (s && e){
        const sameDay = s.toDateString() === e.toDateString();
        if (sameDay){
          return `${s.toLocaleDateString(undefined, optsDate)} · ${s.toLocaleTimeString(undefined, optsTime)} → ${e.toLocaleTimeString(undefined, optsTime)}`;
        }
        return `${s.toLocaleDateString(undefined, optsDate)} ${s.toLocaleTimeString(undefined, optsTime)} → ${e.toLocaleDateString(undefined, optsDate)} ${e.toLocaleTimeString(undefined, optsTime)}`;
      }
      if (s) return `${s.toLocaleDateString(undefined, optsDate)} · ${s.toLocaleTimeString(undefined, optsTime)}`;
      if (e) return `${e.toLocaleDateString(undefined, optsDate)} · ${e.toLocaleTimeString(undefined, optsTime)}`;
      return '—';
    }catch{ return '—'; }
  }

  function setState(msg, type){
    const box = byId('state-box');
    if (!box) return;
    box.textContent = msg || '';
    box.classList.remove('info','warn','error');
    box.classList.add(type || 'info');
    box.hidden = !msg;
  }

  function setFeedback(msg, type){
    const box = byId('pr-feedback');
    if (!box) return;
    box.textContent = msg || '';
    box.classList.remove('info','warn','error');
    box.classList.add(type || 'info');
    box.hidden = !msg;
  }

  function setLoading(loading){
    const btn = byId('pr-submit');
    if (!btn) return;
    btn.disabled = !!loading;
    btn.classList.toggle('loading', !!loading);
  }

  async function loadEvent(){
    const params = new URLSearchParams(location.search);
    const slug = params.get('e');
    byId('y').textContent = new Date().getFullYear();
    if (!slug){
      setState("Lien d'inscription invalide (slug manquant).", 'error');
      const form = byId('public-register-form');
      if (form) form.querySelectorAll('input,button').forEach(el=>el.disabled = true);
      return;
    }

    const supa = window.AppAPI.getClient();
    try{
      const { data, error } = await supa
        .from('events')
        .select('id, title, description_html, location_text, starts_at, ends_at, ticket_type, price_cents, is_open, show_remaining, capacity, sales_from, sales_until, status, slug')
        .eq('slug', slug)
        .eq('status', 'published')
        .maybeSingle();
      if (error) throw error;
      if (!data){ setState("Événement introuvable ou non publié.", 'error'); disableForm(); return; }

      // Fill basics
      byId('event-title').textContent = data.title || 'Événement';
      byId('event-location').textContent = data.location_text || '—';
      byId('event-dates').textContent = fmtDateRange(data.starts_at, data.ends_at);
      // Description
      const descBox = byId('event-description');
      if (data.description_html){
        descBox.innerHTML = data.description_html;
        descBox.hidden = false;
      } else { descBox.hidden = true; }

      const isPaid = data.ticket_type === 'paid';
      const price = typeof data.price_cents === 'number' ? (data.price_cents/100).toFixed(2).replace('.', ',')+ ' €' : '—';
      byId('event-ticket').textContent = isPaid ? `Payant (${price})` : 'Gratuit';
      if (isPaid){
        setState('Billets payants: les inscriptions en ligne ne sont pas encore disponibles.', 'warn');
        disableForm();
        return; // Stop here since Stripe n’est pas géré pour le moment
      }

      // Remaining (optionnel)
      const remainingBox = byId('remaining-box');
      const remainingEl = byId('event-remaining');
      const showRemaining = !!data.show_remaining;
      let remainingVal = null;
      if (showRemaining && typeof data.capacity === 'number' && data.capacity > 0){
        try{
          const { count } = await supa
            .from('participants')
            .select('id', { head: true, count: 'exact' })
            .eq('event_id', data.id)
            .eq('status', 'confirmed');
          if (typeof count === 'number'){
            const remaining = Math.max(0, data.capacity - count);
            remainingVal = remaining;
            remainingEl.textContent = String(remaining);
            remainingBox.hidden = false;
          } else {
            remainingBox.hidden = true;
          }
        }catch{ remainingBox.hidden = true; }
      } else {
        remainingBox.hidden = true;
      }

      // Determine open/closed/full
      const now = Date.now();
      const salesFromOk = !data.sales_from || new Date(data.sales_from).getTime() <= now;
      const salesUntilOk = !data.sales_until || new Date(data.sales_until).getTime() >= now;
      const capacity = typeof data.capacity === 'number' ? data.capacity : 0; // 0 => illimité
      const isOpenFlag = !!data.is_open;

      let closedMsg = '';
      if (data.status !== 'published') closedMsg = "Inscriptions fermées (non publié).";
      else if (!isOpenFlag) closedMsg = "Inscriptions fermées.";
      else if (!salesFromOk) closedMsg = "Inscriptions pas encore ouvertes.";
      else if (!salesUntilOk) closedMsg = "Inscriptions clôturées.";
      else if (typeof remainingVal === 'number' && remainingVal <= 0) closedMsg = "Complet.";

      const form = byId('public-register-form');
      if (closedMsg){
        setState(closedMsg, closedMsg === 'Complet.' ? 'warn' : 'error');
        if (form) form.querySelectorAll('input,button').forEach(el=>el.disabled = true);
      } else {
        setState('', 'info');
        if (form) form.querySelectorAll('input,button').forEach(el=>el.disabled = false);
      }

      // Keep slug on form dataset
      if (form) form.dataset.slug = data.slug;

    }catch(err){
      console.error(err);
      setState("Erreur de chargement de l'événement.", 'error');
      disableForm();
    }
  }

  function disableForm(){
    const form = byId('public-register-form');
    if (form) form.querySelectorAll('input,button').forEach(el=>el.disabled = true);
  }

  function validate(){
    let ok = true;
    const fn = byId('pr-firstname');
    const ln = byId('pr-lastname');
    const em = byId('pr-email');
    const rgpd = byId('pr-rgpd');
    byId('err-firstname').textContent = '';
    byId('err-lastname').textContent = '';
    byId('err-email').textContent = '';

    if (!fn.value.trim()){ byId('err-firstname').textContent = 'Prénom requis'; ok = false; }
    if (!ln.value.trim()){ byId('err-lastname').textContent = 'Nom requis'; ok = false; }
    if (!em.value.trim()){ byId('err-email').textContent = 'Email requis'; ok = false; }
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em.value.trim())){ byId('err-email').textContent = 'Email invalide'; ok = false; }
    if (!rgpd.checked){ setFeedback('Merci d\'accepter le traitement des données (RGPD).', 'warn'); ok = false; }
    else { setFeedback('', 'info'); }
    return ok;
  }

  async function onSubmit(e){
    e.preventDefault();
    if (!validate()) return;
    const form = e.currentTarget;
    const slug = form?.dataset?.slug || new URLSearchParams(location.search).get('e');
    if (!slug){ setFeedback('Slug manquant.', 'error'); return; }

    const firstname = byId('pr-firstname').value.trim();
    const lastname = byId('pr-lastname').value.trim();
    const payload = {
      slug,
      full_name: `${firstname} ${lastname}`.trim(),
      email: byId('pr-email').value.trim(),
      phone: byId('pr-phone').value.trim() || null,
      client_ip: null, // laissé à l’EF qui lira X-Forwarded-For
    };

    setLoading(true);
    setFeedback('', 'info');
    try{
      const supa = window.AppAPI.getClient();
      // Edge Function to be implemented in step 6
      const { data, error } = await supa.functions.invoke('public_register', { body: payload });
      if (error) throw error;
      setFeedback('Inscription enregistrée. Vérifiez votre boîte mail si un billet/confirmation est envoyé.', 'info');
      // Disable to avoid double registration
      form.querySelectorAll('input,button').forEach(el=>el.disabled = true);
    }catch(err){
      console.error(err);
      const msg = err?.message || 'Inscription impossible';
      setFeedback(msg, 'error');
      setLoading(false);
    }
  }

  document.addEventListener('DOMContentLoaded', ()=>{
    loadEvent();
    const form = byId('public-register-form');
    form?.addEventListener('submit', onSubmit);
  });
})();
