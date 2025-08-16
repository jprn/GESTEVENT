'use strict';
document.addEventListener('DOMContentLoaded',()=>{
  const form = document.getElementById('login-form');
  const emailEl = document.getElementById('email');
  const passEl = document.getElementById('password');
  const fb = document.getElementById('feedback');

  form?.addEventListener('submit', async (e)=>{
    e.preventDefault();
    fb.textContent = '';
    document.getElementById('email-error').textContent='';
    document.getElementById('password-error').textContent='';

    const email = emailEl.value.trim();
    const password = passEl.value;
    if (!email) { document.getElementById('email-error').textContent='Email requis'; return; }
    if (!password) { document.getElementById('password-error').textContent='Mot de passe requis'; return; }

    const { getClient, redirect } = window.AppAPI;
    const supa = getClient();
    try {
      const { error } = await supa.auth.signInWithPassword({ email, password });
      if (error) throw error;
      const { data: { user } } = await supa.auth.getUser();
      if (!user?.email_confirmed_at) {
        await supa.auth.signOut();
        fb.textContent = 'Email non vérifié. Merci de valider votre email avant de vous connecter.';
        return;
      }
      redirect('./dashboard.html');
    } catch (err) {
      fb.textContent = err.message || 'Connexion impossible';
    }
  });
});
