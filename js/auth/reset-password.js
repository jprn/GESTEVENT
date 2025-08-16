'use strict';
document.addEventListener('DOMContentLoaded',()=>{
  const form = document.getElementById('reset-form');
  const emailEl = document.getElementById('email');
  const fb = document.getElementById('feedback');

  form?.addEventListener('submit', async (e)=>{
    e.preventDefault();
    fb.textContent = '';
    document.getElementById('email-error').textContent = '';

    const email = emailEl.value.trim();
    if (!email) { document.getElementById('email-error').textContent = 'Email requis'; return; }

    const { getClient } = window.AppAPI;
    const supa = getClient();
    try {
      const redirectTo = `${location.origin}/html/login.html`;
      const { error } = await supa.auth.resetPasswordForEmail(email, { redirectTo });
      if (error) throw error;
      fb.textContent = 'Si un compte existe, un email de réinitialisation a été envoyé.';
      form.reset();
    } catch (err) {
      fb.textContent = err.message || 'Erreur lors de l’envoi du lien';
    }
  });
});
