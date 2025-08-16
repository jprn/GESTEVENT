'use strict';
document.addEventListener('DOMContentLoaded', async ()=>{
  // Guard page
  await window.AuthGuard?.requireAuth({ requireVerified: true });

  const { getClient, getUser } = window.AppAPI;
  const supa = getClient();
  const user = await getUser();
  if (!user) return;

  const fullNameEl = document.getElementById('full_name');
  const phoneEl = document.getElementById('phone');
  const profileFb = document.getElementById('profile-feedback');
  const form = document.getElementById('profile-form');

  // Load current profile
  try {
    const { data, error } = await supa
      .from('profiles')
      .select('full_name, phone')
      .eq('id', user.id)
      .single();
    if (error) throw error;
    if (data) {
      if (data.full_name) fullNameEl.value = data.full_name;
      if (data.phone) phoneEl.value = data.phone;
    }
  } catch(err) {
    profileFb.textContent = 'Impossible de charger le profil';
  }

  form?.addEventListener('submit', async (e)=>{
    e.preventDefault();
    profileFb.textContent = '';
    let avatar_url = null;
    // Handle avatar upload if file chosen
    const fileInput = document.getElementById('avatar');
    const file = fileInput?.files?.[0];
    if (file) {
      if (file.size > 2 * 1024 * 1024) {
        profileFb.textContent = 'Fichier trop volumineux (>2 Mo)';
        return;
      }
      try {
        const path = `${user.id}/avatar.png`;
        const { error: upErr } = await supa.storage.from('user-avatars').upload(path, file, { upsert: true, contentType: file.type || 'image/png' });
        if (upErr) throw upErr;
        const { data: pub } = supa.storage.from('user-avatars').getPublicUrl(path);
        avatar_url = pub?.publicUrl || null;
      } catch (err) {
        profileFb.textContent = err.message || 'Upload avatar échoué';
        return;
      }
    }

    const updates = {
      id: user.id,
      full_name: fullNameEl.value.trim() || null,
      phone: phoneEl.value.trim() || null,
      ...(avatar_url ? { avatar_url } : {}),
    };
    try {
      const { error } = await supa.from('profiles').upsert(updates, { onConflict: 'id' });
      if (error) throw error;
      profileFb.textContent = 'Profil mis à jour';
      try{
        const onboard = new URLSearchParams(location.search).get('onboard');
        const hasName = (updates.full_name && updates.full_name.trim().length > 0);
        if (onboard && hasName){
          localStorage.setItem('dashboard_toast', 'Bienvenue ! Votre profil est prêt.');
          window.location.href = './dashboard.html';
          return;
        }
      }catch{}
    } catch (err) {
      profileFb.textContent = err.message || 'Mise à jour impossible';
    }
  });
});
