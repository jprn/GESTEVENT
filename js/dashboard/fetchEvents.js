'use strict';
document.addEventListener('DOMContentLoaded', async ()=>{
  await window.AuthGuard?.requireAuth({ requireVerified: true });
  console.log('fetchEvents.js guarded');
  // TODO: implement fetching events for the logged-in owner
});
