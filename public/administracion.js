'use strict';
const panel = document.body.dataset.panel;
const contenido = document.getElementById('panel-content');
const statusPanel = document.getElementById('panel-status');
const moneda = new Intl.NumberFormat('es-MX',{style:'currency',currency:'MXN'});

function elemento(tipo, texto, clase) {
 const el = document.createElement(tipo);
 if (texto !== undefined) el.textContent = texto;
 if (clase) el.className = clase;
 return el;
}

async function solicitar(ruta, body) {
 const response = await fetch('/api/' + ruta, body === undefined ? {} : {
  method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body)
 });
 if (response.status === 401) location.assign('/login.html');
 const datos = await response.json();
 if (!response.ok) throw Error(datos.error || 'No se pudo completar la operación.');
 return datos;
}

function tabla(titulo, columnas, filas) {
 const section = elemento('section',undefined,'panel');
 section.append(elemento('h2',titulo));
 if (!filas.length) { section.append(elemento('p','Todavía no hay registros.')); return section; }
 const scroll = elemento('div',undefined,'scroll');
 const table = elemento('table');
 const head = table.createTHead().insertRow();
 for (const label of columnas) {
  const th = elemento('th',label);th.scope='col';head.append(th);
 }
 const body = table.createTBody();
 for (const fila of filas) {
  const row = body.insertRow();
  for (const value of fila) row.insertCell().textContent=value ?? '—';
 }
 scroll.append(table);section.append(scroll);return section;
}

function mostrarPrenda(p) {
 const card=elemento('article',undefined,'panel');
 card.append(elemento('h2',p.nombre),elemento('p',p.proveedor+' · '+p.categoria),
  elemento('p',p.descripcion||'Sin descripción'),
  elemento('p',moneda.format(p.precio_venta)+' · '+p.estado),
  elemento('p',p.variantes||'Sin variantes'));
 if (p.foto) {
  const img=elemento('img');img.src=p.foto;img.alt='Foto de '+p.nombre;img.className='revision-foto';
  card.prepend(img);
 }
 if (p.estado==='pendiente') {
  const actions=elemento('div',undefined,'revision-actions');
  const aprobar=elemento('button','Aprobar y publicar','button');
  const rechazar=elemento('button','Rechazar','button secondary');
  for (const [btn,estado] of [[aprobar,'aprobada'],[rechazar,'rechazada']]) {
   btn.onclick=async()=>{
    aprobar.disabled=rechazar.disabled=true;
    try {
     await solicitar('revision/'+p.id_producto,{estado});
     await cargar();
    } catch(e) {
     statusPanel.hidden=false;statusPanel.textContent=e.message;
     aprobar.disabled=rechazar.disabled=false;
    }
   };
   actions.append(btn);
  }
  card.append(actions);
 }
 return card;
}

async function cargar() {
 try {
  const datos=await solicitar(panel);
  contenido.replaceChildren();
  if(panel==='directorio') {
   contenido.append(
    tabla('Proveedores',['Nombre','Correo','Teléfono'],datos.proveedores.map(x=>[x.nombre,x.correo,x.telefono])),
    tabla('Clientes',['Nombre','Correo','Teléfono'],datos.clientes.map(x=>[x.nombre,x.correo,x.telefono])),
    tabla('Administradores',['Nombre','Correo','Usuario'],datos.administradores.map(x=>[x.nombre,x.correo,x.nombre_usuario]))
   );
  } else if(panel==='revision') {
   if(datos.length) contenido.append(...datos.map(mostrarPrenda));
   else contenido.append(elemento('p','Aún no hay prendas enviadas a revisión.','panel'));
  } else {
   contenido.append(tabla('Importe por compra',['Folio','Fecha','Proveedor','Importe bruto','Tipo'],
    datos.map(x=>[x.folio,new Date(x.fecha).toLocaleString('es-MX'),x.proveedor,moneda.format(x.importe),x.simulada?'Simulada':'Registrada'])));
  }
  statusPanel.hidden=true;
 } catch(e) { statusPanel.textContent=e.message;statusPanel.hidden=false; }
}
cargar();
