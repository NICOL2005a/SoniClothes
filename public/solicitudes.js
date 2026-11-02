'use strict';
const $=id=>document.getElementById(id);
function node(tag,text,cls){const e=document.createElement(tag);if(text!==undefined)e.textContent=text;if(cls)e.className=cls;return e;}
async function api(url,options={}){const r=await fetch(url,{...options,headers:{'Content-Type':'application/json'}});const d=await r.json();if(r.status===401){location.assign('/login.html');throw Error('Inicia sesión para continuar.');}if(!r.ok)throw Error(d.error||'No pudimos completar la operación.');return d;}
function notice(text,error=false){$('status').hidden=false;$('status').className='notice'+(error?' error':'');$('status').textContent=text;}
async function load(){try{
 const [requests,raw]=await Promise.all([api('/api/solicitudes'),api('/api/proveedores')]);
 const suppliers=[...new Map(raw.map(p=>[String(p.id_proveedor),p])).values()];
 $('requests').replaceChildren();$('count').textContent=`(${requests.filter(s=>s.estado==='pendiente').length} pendientes)`;
 if(!requests.length){$('requests').append(node('p','No hay solicitudes por revisar.','panel'));return;}
 requests.forEach(s=>{
  const card=node('article',undefined,'panel request'),info=node('div'),actions=node('div',undefined,'actions');
  info.append(node('span',`${s.rol} · ${s.estado}`,'badge'),node('h2',s.nombre_comercial||s.nombre),node('p',`${s.nombre} · ${s.nombre_usuario}`),node('p',s.correo),node('p',new Date(s.fecha).toLocaleString('es-MX'),'muted'));
  if(s.estado==='pendiente'){
   let select;
   if(s.rol==='proveedor'){
    const label=node('label','Vincular con proveedor','muted');select=node('select');select.setAttribute('aria-label','Proveedor para '+(s.nombre_comercial||s.nombre));
    const blank=node('option','Crear un registro nuevo');blank.value='';select.append(blank);
    suppliers.forEach(p=>{const option=node('option',p.nombre);option.value=p.id_proveedor;select.append(option);});label.append(select);actions.append(label);
   }
   const approve=node('button','Aprobar acceso','button'),reject=node('button','Rechazar','button danger');
   approve.type=reject.type='button';
   async function decide(decision){
    const name=s.nombre_comercial||s.nombre;
    if(!window.confirm(decision==='aprobar'?`¿Aprobar el acceso de ${name} como ${s.rol}?`:`¿Rechazar la solicitud de ${name}?`))return;
    approve.disabled=reject.disabled=true;
    try{await api('/api/solicitudes/'+s.id_solicitud+'/decision',{method:'POST',body:JSON.stringify({decision,...(select?.value?{id_proveedor:select.value}:{})})});notice(decision==='aprobar'?'Acceso aprobado. La persona ya puede iniciar sesión.':'Solicitud rechazada.');await load();}catch(e){notice(e.message,true);approve.disabled=reject.disabled=false;}
   }
   approve.onclick=()=>decide('aprobar');reject.onclick=()=>decide('rechazar');actions.append(approve,reject);
  }else actions.append(node('p',s.revisada_en?'Revisada: '+new Date(s.revisada_en).toLocaleString('es-MX'):'Solicitud revisada','muted'));
  card.append(info,actions);$('requests').append(card);
 });
}catch(e){notice(e.message,true);}}
$('refresh').onclick=load;
$('logout').onclick=async()=>{try{await api('/api/logout',{method:'POST'});location.assign('/login.html');}catch(e){notice(e.message,true);}};
load();
