'use strict';
const $=id=>document.getElementById(id),page=document.body.dataset.shop;
const money=n=>new Intl.NumberFormat('es-MX',{style:'currency',currency:'MXN'}).format(Number(n));
let catalog=[],cart={items:[],unidades:0,total:0},selectedCategory='Todas',busy=false,paymentId=null;
let guest=false;
let guestTransferPending=false;
let downloadingCatalog = false;
const guestCartKey='soni_carrito_visitante';
const guestCartDuration=7*24*60*60*1000;
const node=(tag,text,cls)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=text;if(cls)e.className=cls;return e;};
async function api(url,body){
 const r=await fetch('/api/portal/cliente/'+url,{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})});
 const d=await r.json();
 if(r.status===401&&page==='pago')location.assign('/login.html?continuar=pago');
 if(!r.ok)throw Error(d.error||'No pudimos completar la operación.');
 return d;
}
function notice(text,error=false){const e=$('shop-status');e.textContent=text;e.className='notice'+(error?' error':'');e.hidden=false;e.setAttribute('role',error?'alert':'status');}
function count(){document.querySelectorAll('[data-cart-count]').forEach(e=>e.textContent=cart.unidades);}
function readGuestCart(){
 try{
  const saved=JSON.parse(localStorage.getItem(guestCartKey));
  if(saved?.expiresAt>Date.now()&&Array.isArray(saved.items))return saved;
 }catch{}
 return {items:[]};
}
function saveGuestCart(selection){
 try{
  if(selection.items.length)localStorage.setItem(guestCartKey,JSON.stringify(selection));
  else localStorage.removeItem(guestCartKey);
 }catch{throw Error('No pudimos guardar el carrito en este navegador. Revisa si permite el almacenamiento del sitio.');}
}
function withGuestCartLock(action){
 return navigator.locks ? navigator.locks.request(guestCartKey,action) : action();
}
function guestCartFromCatalog(selection){
 const variants=new Map(catalog.map(item=>[String(item.id_variante),item]));
 const items=selection.items.map(({id_variante,cantidad})=>{
  const variant=variants.get(id_variante);
  return {id_variante,cantidad,nombre:variant?.producto||'Prenda fuera del catálogo',talla:variant?.talla||'—',
   color:variant?.color||'—',precio_venta:variant?.precio_venta||0,existencia:variant?.existencia||0};
 });
 const centavos=items.reduce((total,item)=>total+Math.round(Number(item.precio_venta)*100)*item.cantidad,0);
 return {items,total:centavos/100,unidades:items.reduce((sum,item)=>sum+item.cantidad,0)};
}
function changeGuestVariant(id,delta){
 return withGuestCartLock(()=>{
  const selection=readGuestCart();
  if(selection.transfer)throw Error('Inicia sesión con la misma cuenta para terminar de guardar tu selección.');
  const id_variante=String(id);
  const previous=selection.items.find(item=>item.id_variante===id_variante)?.cantidad||0;
  const cantidad=delta===null?0:Math.max(0,previous+delta);
  if(cantidad>previous){
   const variant=catalog.find(item=>String(item.id_variante)===id_variante);
   if(!variant||cantidad>Math.min(100,Number(variant.existencia)))throw Error('No quedan suficientes unidades de esta talla y color.');
   if(!previous&&selection.items.length>=100)throw Error('El carrito admite hasta 100 variantes. Retira una para agregar otra.');
  }
  const items=selection.items.filter(item=>item.id_variante!==id_variante);
  if(cantidad)items.push({id_variante,cantidad});
  const updated={items,expiresAt:Date.now()+guestCartDuration};
  saveGuestCart(updated);
  return guestCartFromCatalog(updated);
 });
}
function transferGuestCart(){
 return withGuestCartLock(async()=>{
  cart=await api('carrito');
  const selection=readGuestCart();
  guestTransferPending=selection.items.length>0;
  if(!guestTransferPending||cart.pendiente)return;
  let transfer=selection.transfer;
  if(transfer&&transfer.cuenta!==cart.cuenta)throw Error('Inicia sesión con la misma cuenta para terminar de guardar tu selección.');
  if(!transfer){
   const cantidades=new Map(cart.items.map(item=>[String(item.id_variante),item.cantidad]));
   // Guardar las cantidades finales permite repetir la solicitud sin sumar las prendas otra vez.
   transfer={cuenta:cart.cuenta,items:selection.items.map(({id_variante,cantidad})=>({
    id_variante,cantidad:cantidad+(cantidades.get(id_variante)||0)
   }))};
   saveGuestCart({...selection,transfer});
  }
  cart=await api('carrito/transferir',transfer);
  saveGuestCart({items:[]});
  guestTransferPending=false;
 });
}
const colors={'Negro':'#42463f','Azul marino':'#424f5c','Blanco':'#eeeae0','Oliva':'#737a5b','Arena':'#d6c7a9','Terracota':'#b65e45'};
function garment(name,color='Oliva'){
 const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 240 270');svg.setAttribute('aria-hidden','true');
 const pants=/pantal|jean|chino/i.test(name),shirt=/camisa|oxford/i.test(name),hood=/sudadera|chamarra/i.test(name);
 const paths=pants?['M68 25h104l11 222-48 3-15-150-15 150-48-3Z','M68 39h104M120 39v60M77 47l-3 32m89-32 3 32M109 25v22h22V25']:['M81 45 47 58 16 114l35 22 17-27v137h104V109l17 27 35-22-31-56-34-13c-7 20-71 20-78 0Z',shirt?'M81 45l21 25 18-15 18 15 21-25M120 56v190M136 84h21v28h-21M125 94h1m-1 29h1m-1 29h1m-1 29h1':hood?'M82 45c-1-31 77-31 76 0l-38 39-38-39M106 75v37m28-37v37M89 188h62v33H89Z':'M81 45c6 31 72 31 78 0M70 229h100'];
 paths.forEach((d,i)=>{const p=document.createElementNS('http://www.w3.org/2000/svg','path');p.setAttribute('d',d);p.setAttribute('fill',i===0?(colors[color]||'#939982'):'none');p.setAttribute('stroke',i===0?'#3e48382d':'#ffffff60');p.setAttribute('stroke-width',i===0?'1.5':'2');svg.append(p);});return svg;
}
async function changeVariant(id,delta){
 if(busy)return;
 if(guestTransferPending){notice('Recarga la página para volver a intentar agregar tu selección.',true);return;}
 busy=true;
 try{
  if(guest)cart=await changeGuestVariant(id,delta);
  else{
   const item=cart.items.find(item=>String(item.id_variante)===String(id));
   const cantidad=delta===null?0:Math.max(0,(item?.cantidad||0)+delta);
   cart=await api('carrito',{id_variante:id,cantidad});
  }
  count();if(page==='carrito')renderCart();return true;
 }
 catch(e){notice(e.message,true);return false;}
 finally{busy=false;}
}
function catalogFilters(){
 return { categoria: selectedCategory === 'Todas' ? '' : selectedCategory, q: $('search').value };
}
async function downloadCatalog(){
 if(downloadingCatalog)return;
 const button=$('download-catalog'), status=$('catalog-download-status');
 const query=new URLSearchParams(catalogFilters());
 downloadingCatalog=true;
 button.disabled=true;
 button.textContent='Generando Word…';
 status.textContent='';
 try{
  const response=await fetch(`/api/portal/cliente/catalogo/word?${query}`);
  if(response.status===404)throw Error('No hay prendas que coincidan con estos filtros.');
  if(!response.ok)throw Error('No se pudo descargar el catálogo. Inténtalo de nuevo.');
  const url=URL.createObjectURL(await response.blob());
  const link=node('a');
  link.href=url;
  link.download='Catalogo-SoniClothes.docx';
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(()=>URL.revokeObjectURL(url),30000);
 }catch(error){
  status.textContent=error instanceof TypeError ? 'No se pudo descargar el catálogo. Inténtalo de nuevo.' : error.message;
 }finally{
  downloadingCatalog=false;
  button.textContent='Descargar en Word';
  button.disabled=!agruparPrendas(catalog,catalogFilters()).length;
 }
}
function renderProducts(){
 const groups=agruparPrendas(catalog,catalogFilters());
 $('download-catalog').disabled=downloadingCatalog||!groups.length;
 $('products').replaceChildren();$('product-count').textContent=`${groups.length} prendas`;
 if(!groups.length){$('products').append(node('div','No encontramos prendas con estos filtros. Prueba otra búsqueda.','shop-empty'));return;}
 groups.forEach(variants=>{
  const first=variants[0],card=node('article',undefined,'product-card-shop'),image=node('div',undefined,'product-image'),art=first.foto?node('img'):garment(first.producto,first.color);
  if(first.foto){art.alt='Foto de '+first.producto;art.loading='lazy';art.src=first.foto;art.onerror=()=>art.replaceWith(garment(first.producto,tones.value));}
  image.append(art,node('span',first.categoria,'status-chip'));
  const heading=node('div',undefined,'product-heading');heading.append(node('h3',first.producto),node('strong',money(first.precio_venta)));
  const fields=node('div',undefined,'variant-fields'),sizes=node('select'),tones=node('select');sizes.setAttribute('aria-label','Talla de '+first.producto);tones.setAttribute('aria-label','Color de '+first.producto);
  for(const size of [...new Set(variants.map(v=>v.talla))]){const o=node('option',size);o.value=size;sizes.append(o);}
  for(const color of [...new Set(variants.map(v=>v.color))]){const o=node('option',color);o.value=color;tones.append(o);}
  const a=node('label','Talla'),b=node('label','Color');a.append(sizes);b.append(tones);fields.append(a,b);
  const add=node('button','Agregar al carrito +','product-add'),stock=node('p',undefined,'availability');add.type='button';
  function current(){return variants.find(v=>v.talla===sizes.value&&v.color===tones.value);}
  function update(){const v=current();add.disabled=!v||Number(v.existencia)<=0;add.textContent=add.disabled?'Sin stock':'Agregar al carrito +';stock.textContent=v&&v.existencia>0?(v.existencia<=3?'Últimas unidades':'Disponible en esta talla y color'):'Esta combinación no está disponible';image.querySelector('svg')?.replaceWith(garment(first.producto,tones.value));}
  sizes.onchange=tones.onchange=update;
  add.onclick=async()=>{const v=current();if(!v||busy)return;add.disabled=true;const ok=await changeVariant(v.id_variante,1);if(ok)notice(`${first.producto} · ${v.talla} · ${v.color} se agregó a tu carrito.`);update();};
  card.append(image,heading,node('p',first.marca||'SoniClothes','product-category'),node('p','Proveedor: '+(first.proveedores||'Sin proveedor registrado'),'product-category'),fields,add,stock);$('products').append(card);update();
 });
}
function canCheckout(){
 return !cart.pendiente&&!guestTransferPending&&cart.items.length>0&&cart.items.length<=100&&cart.items.every(i=>i.cantidad<=i.existencia);
}
function renderCart(){
 $('cart-items').replaceChildren();count();$('cart-units').textContent=`${cart.unidades} ${cart.unidades===1?'prenda':'prendas'}`;
 $('subtotal').textContent=$('cart-total').textContent=money(cart.total);
 const invalid=!canCheckout();$('checkout-link').classList.toggle('disabled-link',invalid);$('checkout-link').setAttribute('aria-disabled',String(invalid));$('checkout-link').tabIndex=invalid?-1:0;
 if(cart.pendiente)notice('Tu carrito está pendiente de revisión. Consulta Mis compras para ver el estado.');
 else if(cart.items.length>100)notice('Retira algunas prendas para continuar con un máximo de 100 variantes.',true);
 if(!cart.items.length){const empty=node('div',undefined,'shop-empty');empty.append(node('h2','Tu carrito espera un buen look.'),node('p','Descubre los esenciales de SoniClothes.'));const link=node('a','Explorar prendas ↗','button');link.href='tienda.html';empty.append(link);$('cart-items').append(empty);return;}
 cart.items.forEach(i=>{const row=node('article',undefined,'cart-row'),thumb=node('div',undefined,'cart-thumb'),info=node('div'),controls=node('div'),qty=node('div',undefined,'qty-control');thumb.append(garment(i.nombre,i.color));info.append(node('h3',i.nombre),node('p',`Talla ${i.talla} · ${i.color}`));
  const minus=node('button','−'),plus=node('button','+'),remove=node('button','Eliminar','remove-item');minus.setAttribute('aria-label','Quitar una unidad de '+i.nombre);plus.setAttribute('aria-label','Agregar una unidad de '+i.nombre);plus.disabled=cart.pendiente||i.cantidad>=i.existencia||i.cantidad>=100;minus.disabled=remove.disabled=cart.pendiente;
  minus.onclick=()=>changeVariant(i.id_variante,-1);plus.onclick=()=>changeVariant(i.id_variante,1);remove.onclick=()=>changeVariant(i.id_variante,null);qty.append(minus,node('span',String(i.cantidad)),plus);controls.append(qty,remove);info.append(controls);
  if(i.cantidad>i.existencia)info.append(node('p',`Solo quedan ${i.existencia} unidades. Reduce la cantidad para continuar.`,'unavailable'));
  row.append(thumb,info,node('strong',money(Number(i.precio_venta)*i.cantidad)));$('cart-items').append(row);
 });
}
function renderPayment(){
 if(!cart.items.length){$('payment-layout').hidden=true;notice('Tu carrito está vacío. Vuelve a la tienda para elegir tus prendas.');return;}
 $('payment-items').replaceChildren();cart.items.forEach(i=>{const row=node('div',undefined,'payment-item'),text=node('div');text.append(node('strong',`${i.cantidad} × ${i.nombre}`),node('p',`${i.talla} · ${i.color}`));row.append(text,node('strong',money(i.cantidad*Number(i.precio_venta))));$('payment-items').append(row);});$('payment-total').textContent=money(cart.total);$('pay-button').textContent='Enviar a revisión · '+money(cart.total);
 $('pay-button').disabled=!canCheckout();
 if(cart.pendiente)notice('Tu pago está pendiente. Consulta su estado en Mis compras.');
 else if($('pay-button').disabled)notice('La disponibilidad cambió. Ajusta las cantidades en tu carrito.',true);
}
(async()=>{try{
 if(page==='carrito')$('checkout-link').onclick=e=>{if(!canCheckout())e.preventDefault();};
 const me=await window.soniReady;if(!me)return;
 guest=me.rol==='visitante';
 if(!guest&&me.rol!=='cliente'){location.assign(me.destino);return;}
 if(guest){
  catalog=await api('catalogo');
  cart=guestCartFromCatalog(readGuestCart());
  window.addEventListener('storage',event=>{
   if(event.key!==guestCartKey&&event.key!==null)return;
   cart=guestCartFromCatalog(readGuestCart());count();
   if(page==='carrito')renderCart();
  });
 }else if(readGuestCart().items.length){
  if(page==='pago'){location.replace('/carrito.html?continuar=pago');return;}
  guestTransferPending=true;
  try{await transferGuestCart();}
  catch(error){notice(error.message,true);}
  if(cart.ajustado)notice('Ajustamos tu selección a las existencias actuales. Revisa tu carrito antes de pagar.');
 }else{
  cart=await api('carrito');
 }
 count();
 if(page==='tienda'){
  if(!guest)catalog=await api('catalogo');
  $('hero-garment').append(garment('Camisa Oxford','Terracota'));
  $('download-catalog').onclick=downloadCatalog;
  ['Todas',...new Set(catalog.map(v=>v.categoria))].forEach(category=>{const b=node('button',category);b.type='button';b.setAttribute('aria-pressed',String(category==='Todas'));b.onclick=()=>{selectedCategory=category;document.querySelectorAll('#categories button').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));renderProducts();};$('categories').append(b);});$('search').oninput=renderProducts;renderProducts();
 }else if(page==='carrito'){
  if(!guest&&!cart.ajustado&&canCheckout()&&new URLSearchParams(location.search).get('continuar')==='pago'){
   location.replace('/pago.html');return;
  }
  renderCart();
 }
 else{
  renderPayment();paymentId=crypto.randomUUID();
  $('payment-form').onsubmit=async e=>{e.preventDefault();if(busy||cart.pendiente||$('pay-button').disabled)return;busy=true;$('pay-button').disabled=true;$('pay-button').textContent='Enviando solicitud…';$('shop-status').hidden=true;
   try{const result=await api('checkout',{id_solicitud:paymentId});$('payment-layout').hidden=true;$('payment-success').hidden=false;$('success-copy').textContent=`Estado: ${result.estado} · Total ${money(result.total)}`;$('payment-success').tabIndex=-1;$('payment-success').focus();}
   catch(e){notice(e.message,true);$('pay-button').disabled=false;$('pay-button').textContent='Reintentar envío';}finally{busy=false;}
  };
 }
}catch(e){notice(e.message,true);}})();
