'use strict';

(function(){
  // State
  let currentEvent = null; // données de l'événement chargé
  let pendingPayload = null; // payload en attente de confirmation
  let modalOpen = false; // évite doubles ouvertures
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

  function mapErrorCode(code, fallback){
    switch(String(code||'').toLowerCase()){
      case 'env_missing': return "Configuration interne manquante. Réessayez plus tard.";
      case 'invalid_json': return "Requête invalide. Merci de recharger la page et réessayer.";
      case 'slug_required': return "Lien d'inscription invalide (slug manquant).";
      case 'full_name_required': return "Le nom complet est requis.";
      case 'email_required': return "L'email est requis.";
      case 'event_not_found': return "Événement introuvable.";
      case 'event_not_published': return "Événement non publié.";
      case 'registrations_closed': return "Inscriptions fermées.";
      case 'registrations_not_open_yet': return "Inscriptions pas encore ouvertes.";
      case 'registrations_closed_period': return "Inscriptions clôturées.";
      case 'user_quota_reached': return "Quota atteint pour cet email.";
      case 'sold_out': return "Complet.";
      case 'already_registered': return "Vous êtes déjà inscrit pour cet événement.";
      case 'participant_create_failed': return "Impossible d'enregistrer votre inscription. Réessayez plus tard.";
      case 'qr_upload_failed': return "Inscription enregistrée mais échec de génération du billet. Support informé.";
      case 'qr_sign_failed': return "Échec de génération du billet. Réessayez plus tard.";
      default: return fallback || "Inscription impossible";
    }
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
      currentEvent = data;
      console.debug('[register] event loaded, ticket_type=', data.ticket_type);

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

      const isPaid = String(data.ticket_type || '').toLowerCase() === 'paid';
      const price = typeof data.price_cents === 'number' ? (data.price_cents/100).toFixed(2).replace('.', ',')+ ' €' : '—';
      byId('event-ticket').textContent = isPaid ? `Payant (${price})` : 'Gratuit';
      // Autoriser l'inscription même si payant, avec message informatif
      if (isPaid){
        setState('Billet payant: la réservation est enregistrée sans paiement. Vous recevrez les instructions par email.', 'info');
        const btn = byId('pr-submit');
        const spanText = btn?.querySelector('.btn-text');
        if (spanText) spanText.textContent = 'Réserver un billet';
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

  function openConfirmModal(payload){
    const modal = byId('confirm-modal');
    if (!modal) return submitRegistration(payload); // fallback si pas de modal
    pendingPayload = payload;
    modalOpen = true;
    byId('cm-event-title').textContent = currentEvent?.title || '—';
    byId('cm-fullname').textContent = payload.full_name || '—';
    byId('cm-email').textContent = payload.email || '—';
    const priceLine = byId('cm-price-line');
    const price = (typeof currentEvent?.price_cents === 'number')
      ? (currentEvent.price_cents/100).toFixed(2).replace('.', ',') + ' €' : '—';
    byId('cm-price').textContent = price;
    priceLine.hidden = !(currentEvent && String(currentEvent.ticket_type||'').toLowerCase() === 'paid');
    // Affichage inratable
    modal.hidden = false;
    modal.classList.add('is-open');
    modal.style.display = 'block';
    console.debug('[register] confirm modal shown', modal);
    // Fallback de visibilité si le contenu a une taille nulle
    const rect = modal.querySelector('.modal__content')?.getBoundingClientRect();
    if (!rect || (rect.width === 0 && rect.height === 0)){
      console.warn('[register] modal content has zero size, forcing inline styles');
      const contentEl = modal.querySelector('.modal__content');
      if (contentEl){
        Object.assign(contentEl.style, {
          position: 'fixed',
          left: '50%',
          top: '50%',
          transform: 'translate(-50%, -50%)',
          maxWidth: '560px',
          width: 'calc(100% - 32px)',
          background: 'white',
          border: '1px solid rgba(0,0,0,.12)',
          borderRadius: '16px',
          padding: '20px',
          zIndex: '10000',
          display: 'block',
          opacity: '1',
          visibility: 'visible',
        });
      }
      const overlayEl = modal.querySelector('.modal__overlay');
      if (overlayEl){
        Object.assign(overlayEl.style, {
          position: 'fixed', inset: '0', background: 'rgba(0,0,0,.45)', zIndex: '9999', display: 'block'
        });
      }
    }
    setFeedback('Veuillez confirmer votre réservation dans la fenêtre.', 'info');
    // Mise en avant
    const content = modal.querySelector('.modal__content');
    content?.setAttribute('tabindex', '-1');
    content?.focus();
    content?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  function closeConfirmModal(){
    const modal = byId('confirm-modal');
    if (modal) modal.hidden = true;
    pendingPayload = null;
    modalOpen = false;
  }

  function openThankModal(){
    const m = byId('thank-modal');
    if (m) m.hidden = false;
  }

  function tryClosePage(){
    // Tente de fermer l'onglet. Si le navigateur refuse (onglet non ouvert par script), fallback.
    window.close();
    // Fallback: retour arrière ou page blanche
    setTimeout(()=>{
      if (!document.hidden) {
        if (window.history.length > 1) {
          history.back();
        } else {
          location.replace('about:blank');
        }
      }
    }, 500);
  }

  async function submitRegistration(payload){
    setLoading(true);
    setFeedback('', 'info');
    try{
      const supa = window.AppAPI.getClient();
      const { data, error } = await supa.functions.invoke('public_register', { body: payload });
      if (error) throw error;
      setFeedback('Inscription enregistrée. Vérifiez votre boîte mail si un billet/confirmation est envoyé.', 'info');
      const form = byId('public-register-form');
      form?.querySelectorAll('input,button').forEach(el=>el.disabled = true);
      closeConfirmModal();
      openThankModal();
      // Fermeture automatique après un court délai
      setTimeout(tryClosePage, 2500);
    }catch(err){
      console.error('[public_register] invoke error', err);
      let msg = err?.message || 'Inscription impossible';
      let errCode = undefined;
      try{
        // Supabase JS place la réponse dans err.context.response (Edge Functions)
        const resp = err?.context?.response;
        if (resp) {
          const ct = resp.headers?.get?.('content-type') || '';
          if (ct.includes('application/json')){
            const j = await resp.json();
            if (j && (j.error || j.message)) msg = j.error || j.message;
            if (j && j.code) errCode = j.code;
          } else {
            const t = await resp.text();
            if (t) msg = t.slice(0, 500);
          }
        }
      }catch(parseErr){ console.warn('Failed to parse error body', parseErr); }
      const uiMsg = mapErrorCode(errCode, msg);
      console.log(`%c${uiMsg} (${errCode||'no-code'})`, 'background: #f0f0f0; border-radius: 5px; padding: 2px; color: #666');
      setFeedback(uiMsg, 'error');
      setLoading(false);
    }
  }

  async function onSubmit(e){
    e.preventDefault();
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

    // Si billet payant, ouvrir le modal AVANT validation (Option B)
    if (currentEvent && String(currentEvent.ticket_type||'').toLowerCase() === 'paid'){
      if (!modalOpen){
        console.debug('[register] paid flow: opening confirm modal');
        openConfirmModal(payload);
      }
      return;
    }
    // Fallback: si currentEvent pas encore prêt mais bouton indique "Réserver un billet", ouvrir quand même le modal
    const btn = byId('pr-submit');
    const label = btn?.querySelector('.btn-text')?.textContent?.trim().toLowerCase();
    if (!currentEvent && label && label.includes('réserver un billet')){
      console.debug('[register] fallback paid flow via button label');
      openConfirmModal(payload);
      return;
    }
    // Gratuit → valider puis soumettre
    if (!validate()) return;
    await submitRegistration(payload);
  }

  document.addEventListener('DOMContentLoaded', ()=>{
    loadEvent();
    const form = byId('public-register-form');
    form?.addEventListener('submit', onSubmit);
    // S'assurer que les modals sont attachés au body (évite des soucis de stacking context)
    ['confirm-modal','thank-modal'].forEach(id=>{
      const el = byId(id);
      if (el && el.parentElement !== document.body){
        document.body.appendChild(el);
      }
    });
    // Modal events
    const modal = byId('confirm-modal');
    const overlay = modal?.querySelector('.modal__overlay');
    const btnCancel = byId('cm-cancel');
    const btnConfirm = byId('cm-confirm');
    overlay?.addEventListener('click', closeConfirmModal);
    btnCancel?.addEventListener('click', closeConfirmModal);
    btnConfirm?.addEventListener('click', ()=>{
      // Valider à la confirmation
      if (!validate()) return;
      // Reconstruire payload avec valeurs éventuellement modifiées
      const form = byId('public-register-form');
      const slug = form?.dataset?.slug || new URLSearchParams(location.search).get('e');
      const firstname = byId('pr-firstname').value.trim();
      const lastname = byId('pr-lastname').value.trim();
      const payload = {
        slug,
        full_name: `${firstname} ${lastname}`.trim(),
        email: byId('pr-email').value.trim(),
        phone: byId('pr-phone').value.trim() || null,
        client_ip: null,
      };
      submitRegistration(payload);
    });
    // Extra safety: handle direct click on submit for paid to ensure modal shows
    const submitBtn = byId('pr-submit');
    submitBtn?.addEventListener('click', (ev)=>{
      if (currentEvent && String(currentEvent.ticket_type||'').toLowerCase() === 'paid'){
        // Ouvrir explicitement le modal et empêcher la soumission native si nécessaire
        ev.preventDefault();
        if (!modalOpen){
          const form = byId('public-register-form');
          const slug = form?.dataset?.slug || new URLSearchParams(location.search).get('e');
          const firstname = byId('pr-firstname').value.trim();
          const lastname = byId('pr-lastname').value.trim();
          const payload = {
            slug,
            full_name: `${firstname} ${lastname}`.trim(),
            email: byId('pr-email').value.trim(),
            phone: byId('pr-phone').value.trim() || null,
            client_ip: null,
          };
          openConfirmModal(payload);
        }
      }
    });
    // ESC pour fermer le modal de confirmation
    document.addEventListener('keydown', (e)=>{ if (e.key === 'Escape') closeConfirmModal(); });

    // Thank modal events
    const tModal = byId('thank-modal');
    const tOverlay = tModal?.querySelector('.modal__overlay');
    const tClose = byId('tm-close');
    tOverlay?.addEventListener('click', tryClosePage);
    tClose?.addEventListener('click', tryClosePage);
  });
})();
