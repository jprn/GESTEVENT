'use strict';
// Call this on private pages
async function requireAuth({ requireVerified = true } = {}){
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
  return true;
}

window.AuthGuard = { requireAuth };
