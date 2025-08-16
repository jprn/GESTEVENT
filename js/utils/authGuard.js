'use strict';
// Call this on private pages
async function requireAuth({ requireVerified = true, requireProfile = true } = {}){
  const { getClient, getUser, redirect } = window.AppAPI;
  const supa = getClient();
  const user = await getUser();
  if (!user) {
    redirect(`./login.html`);
    return false;
  }
  if (requireVerified) {
    const verified = !!user.email_confirmed_at;
    if (!verified) {
      try { await supa.auth.signOut(); } catch(e){}
      redirect(`./login.html`);
      return false;
    }
  }
  // Enforce profile completion (full_name required)
  if (requireProfile) {
    try{
      const current = location.pathname.split('/').pop();
      if (current !== 'profile.html'){
        const { data, error } = await supa.from('profiles').select('full_name').eq('id', user.id).maybeSingle();
        if (error) throw error;
        const fullName = data?.full_name && String(data.full_name).trim();
        if (!fullName){
          redirect(`./profile.html?onboard=1`);
          return false;
        }
      }
    }catch(err){ /* silent: do not block */ }
  }
  return true;
}

window.AuthGuard = { requireAuth };
