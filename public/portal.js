'use strict';
const $=id=>document.getElementById(id),role=document.body.dataset.role;
const money=n=>new Intl.NumberFormat('es-MX',{style:'currency',currency:'MXN'}).format(Number(n));
const date=s=>new Date(s).toLocaleString('es-MX');
function node(tag,text,cls){const e=document.createElement(tag);if(text!==undefined)e.textContent=text;if(cls)e.className=cls;return e;}
async function api(url,options={}){const r=await fetch(url,options);const d=await r.json();if(r.status===401){location.assign('/login.html');throw Error('Inicia sesión para continuar.');}if(!r.ok)throw Error(d.error||'No pudimos cargar la información.');return d;}
function error(e){$('status').hidden=false;$('status').className='notice error';$('status').textContent=e.message;}
function table(headers,rows){const wrap=node('div',undefined,'scroll'),t=node('table'),head=node('thead'),hr=node('tr'),body=node('tbody');headers.forEach(h=>hr.append(node('th',h)));head.append(hr);rows.forEach(cells=>{const tr=node('tr');cells.forEach(value=>{const td=node('td');if(value instanceof Node)td.append(value);else td.textContent=value;tr.append(td);});body.append(tr);});t.append(head,body);wrap.append(t);return wrap;}
$('logout').onclick=async()=>{try{await api('/api/logout',{method:'POST'});location.assign('/login.html');}catch(e){error(e);}};
$('close-ticket').onclick=()=>$('ticket').close();
(async()=>{try{
 const me=await api('/api/sesion');if(me.rol!==role){location.assign(me.destino);return;}
 $('session-name').textContent=me.nombre;
 const d=await api('/api/portal/'+role),person=d.cliente||d.proveedor;
 $('welcome').textContent=role==='cliente'?`Hola, ${person.nombre.split(' ')[0]}.`:'Tu negocio en SoniClothes.';
 for(const [label,key]of [['Nombre','nombre'],['Correo','correo'],['Teléfono','telefono']]){$('profile').append(node('p',label,'muted'),node('p',person[key]||'No registrado'));}
 if(role==='cliente'){
  if(!d.ventas.length)$('content').append(node('p','Aún no tienes compras asociadas a esta cuenta. Cuando registres una compra en la tienda con tu cuenta vinculada, aparecerá aquí.','empty'));
  else $('content').append(table(['Folio','Fecha','Total','Detalle'],d.ventas.map(v=>{
   const b=node('button','Ver compra','button secondary');b.type='button';b.onclick=async()=>{try{const x=await api('/api/portal/cliente/ventas/'+v.id_venta);$('ticket-content').replaceChildren(node('p',`${x.folio} · ${date(x.fecha)}`));x.detalles.forEach(i=>$('ticket-content').append(node('p',`${i.cantidad} × ${i.nombre} · ${i.talla} / ${i.color} · ${money(i.cantidad*i.precio_unitario)}`)));$('ticket-content').append(node('strong','Total: '+money(x.total)));$('ticket').showModal();}catch(e){error(e);}};
   return [v.folio||'Sin folio',date(v.fecha),money(v.total),b];
  })));
 }else{
  if(!d.productos.length)$('content').append(node('p','Todavía no hay productos vinculados a tu negocio.','empty'));else $('content').append(table(['Prenda','Marca','Categoría'],d.productos.map(p=>[p.nombre,p.marca||'—',p.categoria])));
  if(!d.cuestionarios.length)$('questionnaires').append(node('p','Aún no hay cuestionarios registrados para tu negocio.','muted'));else d.cuestionarios.forEach(q=>$('questionnaires').append(node('p',`Cuestionario #${q.id_cuestionario} · ${date(q.fecha)}`)));
 }
 $('status').hidden=true;
}catch(e){error(e);}})();
