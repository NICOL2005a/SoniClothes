'use strict';
const pagosPanel = document.getElementById('payment-requests');
const pesos = new Intl.NumberFormat('es-MX', {style:'currency', currency:'MXN'});

function textoPago(tag, texto) {
 const element = document.createElement(tag);
 element.textContent = texto;
 return element;
}

async function cargarPagos() {
 try {
  const response = await fetch('/api/pagos-pendientes');
  if (!response.ok) throw Error('No se pudieron consultar los pagos.');
  const pagos = await response.json();
  pagosPanel.replaceChildren();
  if (!pagos.length) pagosPanel.append(textoPago('p','Aún no hay solicitudes de pago.'));
  for (const pago of pagos) {
   const article = document.createElement('article');
   article.className = 'panel';
   article.append(textoPago('h3',pago.cliente), textoPago('p',
    pesos.format(pago.total)+' · '+pago.estado+' · '+new Date(pago.fecha).toLocaleString('es-MX')));
   for (const item of pago.items) {
    article.append(textoPago('p',item.cantidad+' × '+item.nombre+' · '+item.talla+' / '+item.color));
   }
   if (pago.estado === 'pendiente') {
    const actions = document.createElement('div');
    actions.className = 'revision-actions';
    const feedback = textoPago('p','');
    feedback.setAttribute('role','status');
    for (const [estado,label] of [['aprobada','Aprobar pago'],['rechazada','Rechazar pago']]) {
     const btn = textoPago('button',label);
     btn.className = estado === 'aprobada' ? 'button' : 'button secondary';
     btn.onclick = async () => {
      for (const button of actions.children) button.disabled = true;
      try {
       const result = await fetch('/api/pagos-pendientes/'+pago.id_solicitud,{
        method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({estado})
       });
       const data = await result.json();
       if (!result.ok) throw Error(data.error || 'No se pudo guardar la decisión.');
       await cargarPagos();
      } catch (error) {
       feedback.textContent = error.message;
       for (const button of actions.children) button.disabled = false;
      }
     };
     actions.append(btn);
    }
    article.append(actions,feedback);
   }
   pagosPanel.append(article);
  }
 } catch (error) { pagosPanel.textContent = error.message; }
}
document.getElementById('refresh-payments').onclick = cargarPagos;
cargarPagos();
