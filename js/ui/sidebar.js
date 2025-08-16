'use strict';

(function(){
  function h(tag, attrs={}, children=[]) {
    const el = document.createElement(tag);
    Object.entries(attrs).forEach(([k,v])=>{
      if (k === 'class') el.className = v;
      else if (k === 'href') el.setAttribute('href', v);
      else if (k === 'src') el.setAttribute('src', v);
      else if (k === 'alt') el.setAttribute('alt', v);
      else if (k.startsWith('data-')) el.setAttribute(k, v);
      else el[k] = v;
    });
    (Array.isArray(children) ? children : [children]).forEach(c=>{
      if (c==null) return;
      if (typeof c === 'string') el.appendChild(document.createTextNode(c));
      else el.appendChild(c);
    });
    return el;
  }

  async function buildSidebar(){
    const { getClient, getUser } = window.AppAPI || {};
    if (!getClient || !getUser) return;
    const supa = getClient();
    const user = await getUser();
    if (!user) return; // only for authenticated pages

    // Fetch profile basics
    let profile = {};
    try{
      const { data } = await supa.from('profiles').select('full_name, avatar_url').eq('id', user.id).maybeSingle();
      profile = data || {};
    }catch {}

    // Body layout
    document.body.classList.add('with-sidebar');

    // Wrap existing content in .app-main
    const mainWrap = h('div', { class: 'app-main' });
    while (document.body.firstChild) {
      const n = document.body.firstChild;
      if (n.classList && (n.classList.contains('app-sidebar'))) break; // already injected
      mainWrap.appendChild(n);
    }
    document.body.insertBefore(mainWrap, document.body.firstChild);

    // Sidebar
    if (document.querySelector('.app-sidebar')) return;
    const sidebar = h('aside', { class:'app-sidebar', role:'navigation', 'aria-label':'Menu' }, [
      h('div', { class:'app-sidebar__brand' }, [
        h('img', { src:'../assets/logo.svg', width:24, height:24, alt:'Logo' }),
        h('span', {}, 'GESTEVENT')
      ]),
      h('nav', { class:'app-sidebar__nav' }, [
        h('a', { href:'./dashboard.html' }, 'Tableau de bord'),
        h('a', { href:'./create-event.html' }, 'Créer un événement'),
        h('a', { href:'./controllers.html' }, 'Contrôleurs'),
        h('a', { href:'./participants.html' }, 'Participants'),
        h('a', { href:'./profile.html' }, 'Profil'),
      ]),
      h('div', { class:'app-sidebar__user' }, [
        h('img', { class:'avatar', src: profile.avatar_url || 'https://placehold.co/64x64?text=%20', alt:'Avatar' }),
        h('div', { class:'u-meta' }, [
          h('div', { class:'u-name' }, profile.full_name || 'Utilisateur'),
          h('div', { class:'u-email' }, user.email || '')
        ]),
        h('div', { class:'u-actions' }, [
          h('button', { class:'btn', onclick:()=>{ window.location.href = './profile.html'; } }, 'Modifier'),
          h('button', { class:'btn', onclick: async ()=>{ try{ await supa.auth.signOut(); }catch{} window.location.href = './login.html'; } }, 'Quitter')
        ])
      ])
    ]);

    document.body.insertBefore(sidebar, document.body.firstChild);
  }

  document.addEventListener('DOMContentLoaded', buildSidebar);
})();
