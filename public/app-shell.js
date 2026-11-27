'use strict';
window.soniReady=(async()=>{
 const shell=document.getElementById('app-shell'),isShop=['tienda','carrito'].includes(document.body.dataset.shop);
 function setupLogin(){
  window.openSoniLogin=()=>{const dialog=document.getElementById('login-dialog'),frame=document.getElementById('login-frame');if(!frame.src)frame.src='/login.html?modal=1';dialog.showModal();};
  const dialog=document.getElementById('login-dialog');if(!dialog)return;document.getElementById('close-login').onclick=()=>dialog.close();
  dialog.addEventListener('click',e=>{if(e.target===dialog)dialog.close();});
  window.addEventListener('message',e=>{if(e.origin!==location.origin||e.data?.type!=='soni-auth')return;dialog.close();if(e.data.destino==='/tienda.html')location.reload();else location.assign(e.data.destino);});
 }
 const response=await fetch('/api/sesion');
 if(!response.ok){
  if(isShop){shell.innerHTML='<header class="shop-guest-header"><a class="app-brand" href="/tienda.html">Soni<span>Clothes</span><i></i></a><span class="shop-motto">CASUAL, A TU MANERA.</span><nav aria-label="Navegación de tienda"><a href="/tienda.html#collection">Colección</a><a href="/carrito.html">Mi carrito <span class="nav-count" data-cart-count>0</span></a></nav><button type="button" class="button" data-open-login>Iniciar sesión ↗</button></header>';setupLogin();shell.querySelector('[data-open-login]').addEventListener('click',window.openSoniLogin);return {rol:'visitante',destino:'/login.html'};}
  location.assign('/login.html');return;
 }
 const me=await response.json();
 if(isShop&&me.rol==='cliente'){
  shell.innerHTML=`<header class="shop-guest-header shop-member-header"><a class="app-brand" href="/tienda.html">Soni<span>Clothes</span><i></i></a><span class="shop-motto">CASUAL, A TU MANERA.</span><nav aria-label="Navegación de tienda"><a href="/tienda.html#collection">Colección</a><a href="/carrito.html">Mi carrito <span class="nav-count" data-cart-count>0</span></a><a href="/cliente.html">Mis compras</a></nav><div class="shop-user"><span>${me.nombre.split(' ').map(w=>w[0]).slice(0,2).join('').toUpperCase()}</span>${me.nombre.split(' ')[0]}<button class="shop-logout" data-logout aria-label="Cerrar sesión" title="Cerrar sesión">↗</button></div></header>`;
  document.querySelector('[data-logout]').onclick=async e=>{e.currentTarget.disabled=true;try{const r=await fetch('/api/logout',{method:'POST'});if(!r.ok)throw Error();location.reload();}catch{e.currentTarget.disabled=false;alert('No se pudo cerrar sesión. Intenta de nuevo.');}};
  try{const r=await fetch('/api/portal/cliente/carrito');if(r.ok){const c=await r.json();document.querySelectorAll('[data-cart-count]').forEach(e=>e.textContent=c.unidades);}}catch{}
  return me;
 }
 const paths={administrador:[['ventas.html','Punto de venta','sales'],['revision.html','Revisar prendas','box'],['ingresos.html','Ingresos','sales'],['solicitudes.html','Solicitudes','users']],cliente:[['tienda.html','Explorar prendas','bag'],['carrito.html','Mi carrito','cart'],['cliente.html','Mis compras','sales']],proveedor:[['proveedor.html','Mi negocio','box'],['proveedores.html','Agregar prendas','truck']]};
 const icons={sales:'M4 3h16v18l-4-2-4 2-4-2-4 2V3Zm4 5h8M8 12h8',box:'m12 3 9 5v9l-9 5-9-5V8l9-5Zm0 9 9-4M3 8l9 4v10',truck:'M3 5h11v12H3V5Zm11 5h4l3 4v3h-7M7 17a2 2 0 1 0 0 4 2 2 0 0 0 0-4m11 0a2 2 0 1 0 0 4 2 2 0 0 0 0-4',users:'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8m8 0a4 4 0 0 1 0 8m5 10v-2a4 4 0 0 0-3-3.87',bag:'M5 8h14l1 13H4L5 8Zm4 0V6a3 3 0 0 1 6 0v2',cart:'M2 3h3l3 12h11l3-9H6m3 13h.01M18 19h.01'};
 const nav=paths[me.rol]||[],current=location.pathname.split('/').pop();
 function icon(key){return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${icons[key]}"/></svg>`;}
 if(shell){shell.innerHTML=`<aside class="app-sidebar"><a class="app-brand" href="/${nav[0][0]}">Soni<span>Clothes</span><i></i></a><div class="app-brand-note">CASUAL, A TU MANERA.</div><div class="nav-label">${me.rol==='administrador'?'MI TIENDA':me.rol==='cliente'?'MI ESPACIO':'COLABORAMOS CONTIGO'}</div><nav class="app-nav" aria-label="Navegación principal">${nav.map(([url,label,key])=>`<a href="/${url}" ${url===current||(current==='pago.html'&&url==='carrito.html')?'aria-current="page"':''}>${icon(key)}<span>${label}</span>${key==='cart'?'<span class="nav-count" data-cart-count>0</span>':''}</a>`).join('')}</nav><div class="sidebar-bottom"><p>Ropa casual para<br>hombre y mujer.</p><button class="logout-button" data-logout><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 4H4v16h5m6-12 4 4-4 4M8 12h11"/></svg>Cerrar sesión</button></div></aside><header class="app-topbar"><div class="app-breadcrumb">SoniClothes <span aria-hidden="true">/</span> <strong>${nav.find(n=>n[0]===current)?.[1]||(current==='pago.html'?'Pago simulado':'Mi espacio')}</strong></div><div class="account-pill"><span id="shell-initials"></span><div><span id="shell-name"></span><small>${me.rol==='administrador'?'Administración':me.rol==='cliente'?'Cuenta cliente':'Cuenta proveedor'}</small></div></div><button class="mobile-nav-button" data-logout>Salir</button></header>`;document.getElementById('shell-name').textContent=me.nombre;document.getElementById('shell-initials').textContent=me.nombre.split(' ').map(w=>w[0]).slice(0,2).join('').toUpperCase();}
 document.querySelectorAll('[data-logout]').forEach(b=>b.onclick=async()=>{b.disabled=true;try{const r=await fetch('/api/logout',{method:'POST'});if(!r.ok)throw Error();location.assign('/login.html');}catch{b.disabled=false;alert('No se pudo cerrar sesión. Intenta de nuevo.');}});
 if(me.rol==='cliente'){try{const r=await fetch('/api/portal/cliente/carrito');if(r.ok){const c=await r.json();document.querySelectorAll('[data-cart-count]').forEach(e=>e.textContent=c.unidades);}}catch{}}
 return me;
})();
