'use strict';
document.addEventListener('DOMContentLoaded', async ()=>{
  await window.AuthGuard?.requireAuth({ requireVerified: true });
  console.log('createEvent.js guarded');
  // TODO: implement create event logic
});
