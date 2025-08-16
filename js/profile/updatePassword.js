'use strict';
document.addEventListener('DOMContentLoaded', async ()=>{
  await window.AuthGuard?.requireAuth({ requireVerified: true });
  const { getClient } = window.AppAPI;
  const supa = getClient();

  const form = document.getElementById('password-form');
  const newPassEl = document.getElementById('new_password');
  const fb = document.getElementById('password-feedback');

  form?.addEventListener('submit', async (e)=>{
    e.preventDefault();
    fb.textContent = '';
    const pwd = newPassEl.value;
    if (!pwd || pwd.length < 8) { fb.textContent = 'Mot de passe ≥ 8 caractères'; return; }
    try {
      const { error } = await supa.auth.updateUser({ password: pwd });
      if (error) throw error;
      fb.textContent = 'Mot de passe mis à jour.';
      form.reset();
    } catch (err) {
      fb.textContent = err.message || 'Impossible de mettre à jour le mot de passe';
    }
  });
});
