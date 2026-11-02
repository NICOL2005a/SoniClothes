'use strict';
const $=id=>document.getElementById(id),page=document.body.dataset.shop;
const money=n=>new Intl.NumberFormat('es-MX',{style:'currency',currency:'MXN'}).format(Number(n));
let catalog=[],cart={items:[],unidades:0,total:0},selectedCategory='Todas',busy=false,paymentId=null;
const node=(tag,text,cls)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=text;if(cls)e.className=cls;return e;};
async function api(url,body){const r=await fetch('/api/portal/cliente/'+url,{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})});const d=await r.json();if(r.status===401){location.assign('/login.html');throw Error('Inicia sesión para continuar.');}if(!r.ok)throw Error(d.error||'No pudimos completar la operación.');return d;}
function notice(text,error=false){const e=$('shop-status');e.textContent=text;e.className='notice'+(error?' error':'');e.hidden=false;e.setAttribute('role',error?'alert':'status');}
function count(){document.querySelectorAll('[data-cart-count]').forEach(e=>e.textContent=cart.unidades);}
const colors={'Negro':'#42463f','Azul marino':'#424f5c','Blanco':'#eeeae0','Oliva':'#737a5b','Arena':'#d6c7a9'};
function garment(name,color='Oliva'){
 const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 240 270');svg.setAttribute('aria-hidden','true');
 const pants=/pantal|jean|chino/i.test(name),shirt=/camisa|oxford/i.test(name),hood=/sudadera|chamarra/i.test(name);
 const paths=pants?['M68 25h104l11 222-48 3-15-150-15 150-48-3Z','M68 39h104M120 39v60M77 47l-3 32m89-32 3 32M109 25v22h22V25']:['M81 45 47 58 16 114l35 22 17-27v137h104V109l17 27 35-22-31-56-34-13c-7 20-71 20-78 0Z',shirt?'M81 45l21 25 18-15 18 15 21-25M120 56v190M136 84h21v28h-21M125 94h1m-1 29h1m-1 29h1m-1 29h1':hood?'M82 45c-1-31 77-31 76 0l-38 39-38-39M106 75v37m28-37v37M89 188h62v33H89Z':'M81 45c6 31 72 31 78 0M70 229h100'];
 paths.forEach((d,i)=>{const p=document.createElementNS('http://www.w3.org/2000/svg','path');p.setAttribute('d',d);p.setAttribute('fill',i===0?(colors[color]||'#939982'):'none');p.setAttribute('stroke',i===0?'#3e48382d':'#ffffff60');p.setAttribute('stroke-width',i===0?'1.5':'2');svg.append(p);});return svg;
}
async function changeVariant(id,qty){if(busy)return;busy=true;try{cart=await api('carrito',{id_variante:id,cantidad:qty});count();if(page==='carrito')renderCart();return true;}catch(e){notice(e.message,true);return false;}finally{busy=false;}}
function renderProducts(){
 const q=$('search').value.toLocaleLowerCase('es'),group=new Map();catalog.forEach(v=>{if(!group.has(v.id_producto))group.set(v.id_producto,[]);group.get(v.id_producto).push(v);});
 const groups=[...group.values()].filter(v=>(selectedCategory==='Todas'||v[0].categoria===selectedCategory)&&`${v[0].producto} ${v[0].categoria} ${v[0].marca||''}`.toLocaleLowerCase('es').includes(q));
 $('products').replaceChildren();$('product-count').textContent=`${groups.length} prendas`;
 if(!groups.length){$('products').append(node('div','No encontramos prendas con estos filtros. Prueba otra búsqueda.','shop-empty'));return;}
 groups.forEach(variants=>{
  const first=variants[0],card=node('article',undefined,'product-card-shop'),image=node('div',undefined,'product-image'),art=garment(first.producto,first.color);image.append(art,node('span',first.categoria,'status-chip'));
  const heading=node('div',undefined,'product-heading');heading.append(node('h3',first.producto),node('strong',money(first.precio_venta)));
  const fields=node('div',undefined,'variant-fields'),sizes=node('select'),tones=node('select');sizes.setAttribute('aria-label','Talla de '+first.producto);tones.setAttribute('aria-label','Color de '+first.producto);
  for(const size of [...new Set(variants.map(v=>v.talla))]){const o=node('option',size);o.value=size;sizes.append(o);}
  for(const color of [...new Set(variants.map(v=>v.color))]){const o=node('option',color);o.value=color;tones.append(o);}
  const a=node('label','Talla'),b=node('label','Color');a.append(sizes);b.append(tones);fields.append(a,b);
  const add=node('button','Agregar al carrito +','product-add'),stock=node('p',undefined,'availability');add.type='button';
  function current(){return variants.find(v=>v.talla===sizes.value&&v.color===tones.value);}
  function update(){const v=current();add.disabled=!v||Number(v.existencia)<=0;add.textContent=add.disabled?'Sin stock':'Agregar al carrito +';stock.textContent=v&&v.existencia>0?(v.existencia<=3?'Últimas unidades':'Disponible en esta talla y color'):'Esta combinación no está disponible';image.querySelector('svg').replaceWith(garment(first.producto,tones.value));}
  sizes.onchange=tones.onchange=update;
  add.onclick=async()=>{const v=current();if(!v||busy)return;const item=cart.items.find(i=>String(i.id_variante)===String(v.id_variante));add.disabled=true;const ok=await changeVariant(v.id_variante,(item?.cantidad||0)+1);if(ok)notice(`${first.producto} · ${v.talla} · ${v.color} se agregó a tu carrito.`);update();};
  card.append(image,heading,node('p',first.marca||'SoniClothes','product-category'),fields,add,stock);$('products').append(card);update();
 });
}
function renderCart(){
 $('cart-items').replaceChildren();count();$('cart-units').textContent=`${cart.unidades} ${cart.unidades===1?'prenda':'prendas'}`;
 $('subtotal').textContent=$('cart-total').textContent=money(cart.total);
 const invalid=!cart.items.length||cart.items.some(i=>i.cantidad>i.existencia);$('checkout-link').classList.toggle('disabled-link',invalid);$('checkout-link').setAttribute('aria-disabled',String(invalid));$('checkout-link').tabIndex=invalid?-1:0;
 if(!cart.items.length){const empty=node('div',undefined,'shop-empty');empty.append(node('h2','Tu carrito espera un buen look.'),node('p','Descubre los esenciales de SoniClothes.'));const link=node('a','Explorar prendas ↗','button');link.href='tienda.html';empty.append(link);$('cart-items').append(empty);return;}
 cart.items.forEach(i=>{const row=node('article',undefined,'cart-row'),thumb=node('div',undefined,'cart-thumb'),info=node('div'),controls=node('div'),qty=node('div',undefined,'qty-control');thumb.append(garment(i.nombre,i.color));info.append(node('h3',i.nombre),node('p',`Talla ${i.talla} · ${i.color}`));
  const minus=node('button','−'),plus=node('button','+'),remove=node('button','Eliminar','remove-item');minus.setAttribute('aria-label','Quitar una unidad de '+i.nombre);plus.setAttribute('aria-label','Agregar una unidad de '+i.nombre);plus.disabled=i.cantidad>=i.existencia||i.cantidad>=100;
  minus.onclick=()=>changeVariant(i.id_variante,i.cantidad-1);plus.onclick=()=>changeVariant(i.id_variante,i.cantidad+1);remove.onclick=()=>changeVariant(i.id_variante,0);qty.append(minus,node('span',String(i.cantidad)),plus);controls.append(qty,remove);info.append(controls);
  if(i.cantidad>i.existencia)info.append(node('p',`Solo quedan ${i.existencia} unidades. Reduce la cantidad para continuar.`,'unavailable'));
  row.append(thumb,info,node('strong',money(Number(i.precio_venta)*i.cantidad)));$('cart-items').append(row);
 });
}
function renderPayment(){
 if(!cart.items.length){$('payment-layout').hidden=true;notice('Tu carrito está vacío. Vuelve a la tienda para elegir tus prendas.');return;}
 $('payment-items').replaceChildren();cart.items.forEach(i=>{const row=node('div',undefined,'payment-item'),text=node('div');text.append(node('strong',`${i.cantidad} × ${i.nombre}`),node('p',`${i.talla} · ${i.color}`));row.append(text,node('strong',money(i.cantidad*Number(i.precio_venta))));$('payment-items').append(row);});$('payment-total').textContent=money(cart.total);$('pay-button').textContent='Simular pago de '+money(cart.total);
 $('pay-button').disabled=cart.items.some(i=>i.cantidad>i.existencia);if($('pay-button').disabled)notice('La disponibilidad cambió. Ajusta las cantidades en tu carrito.',true);
}
(async()=>{try{
 const me=await window.soniReady;if(!me)return;if(me.rol!=='cliente'){location.assign(me.destino);return;}
 cart=await api('carrito');count();
 if(page==='tienda'){
  catalog=await api('catalogo');$('hero-garment').append(garment('Camisa Oxford','Oliva'));
  ['Todas',...new Set(catalog.map(v=>v.categoria))].forEach(category=>{const b=node('button',category);b.type='button';b.setAttribute('aria-pressed',String(category==='Todas'));b.onclick=()=>{selectedCategory=category;document.querySelectorAll('#categories button').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));renderProducts();};$('categories').append(b);});$('search').oninput=renderProducts;renderProducts();
 }else if(page==='carrito')renderCart();
 else{
  renderPayment();paymentId=crypto.randomUUID();
  $('payment-form').onsubmit=async e=>{e.preventDefault();if(busy)return;busy=true;$('pay-button').disabled=true;$('pay-button').textContent='Procesando simulación…';$('shop-status').hidden=true;
   try{const result=await api('checkout',{escenario:$('scenario').value,id_solicitud:paymentId});$('payment-layout').hidden=true;$('payment-success').hidden=false;$('success-copy').textContent=`Folio ${result.folio} · Total ${money(result.total)}`;cart={items:[],unidades:0,total:0};count();$('payment-success').tabIndex=-1;$('payment-success').focus();}
   catch(e){notice(e.message,true);$('pay-button').disabled=false;$('pay-button').textContent='Reintentar pago simulado';}finally{busy=false;}
  };
 }
}catch(e){notice(e.message,true);}})();
