'use strict';
document.addEventListener('DOMContentLoaded',()=>{
  const form = document.getElementById('signup-form');
  const emailEl = document.getElementById('email');
  const passEl = document.getElementById('password');
  const fb = document.getElementById('feedback');

  form?.addEventListener('submit', async (e)=>{
    e.preventDefault();
    fb.textContent = '';
    document.getElementById('email-error').textContent = '';
    document.getElementById('password-error').textContent = '';

    const email = emailEl.value.trim();
    const password = passEl.value;
    if (!email) { document.getElementById('email-error').textContent = 'Email requis'; return; }
    if (!password || password.length < 8) { document.getElementById('password-error').textContent = 'Mot de passe ≥ 8 caractères'; return; }

    const { getClient } = window.AppAPI;
    const supa = getClient();
    try {
      const redirectTo = `${location.origin}/html/login.html`;
      const { error } = await supa.auth.signUp({ email, password, options: { emailRedirectTo: redirectTo } });
      if (error) throw error;
      fb.textContent = 'Inscription réussie. Vérifiez votre boîte mail pour confirmer votre adresse.';
      form.reset();
    } catch (err) {
      fb.textContent = err.message || 'Erreur lors de l’inscription';
    }
  });
});
