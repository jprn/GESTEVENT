'use strict';
document.addEventListener('DOMContentLoaded', ()=>{
  const input = document.getElementById('avatar');
  const img = document.getElementById('avatar-preview');
  if (!input || !img) return;
  input.addEventListener('change', ()=>{
    const file = input.files?.[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    img.src = url;
    img.onload = ()=> URL.revokeObjectURL(url);
  });
});
