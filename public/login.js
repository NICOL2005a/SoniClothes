'use strict';
const $=s=>document.querySelector(s);
const descriptions={cliente:'Consulta tus compras y encuentra todo en un solo lugar.',proveedor:'Un espacio para tu negocio y nuestra colaboración.',administrador:'Organiza la operación diaria de SoniClothes.'};
let mode='login',role='cliente',busy=false;
const form=$('#auth-form'),message=$('#message');
function notice(text,error=false){message.textContent=text;message.classList.toggle('error',error);message.hidden=false;message.setAttribute('role',error?'alert':'status');}
function stored(key){try{return localStorage.getItem(key)||'';}catch{return '';}}
function update(){
 document.body.classList.toggle('signup',mode==='signup');
 $('#rol').value=role;
 document.querySelectorAll('[data-role]').forEach(b=>{const active=b.dataset.role===role;b.classList.toggle('active',active);b.setAttribute('aria-pressed',String(active));});
 $('#role-description').textContent=descriptions[role];
 $('#access-title').textContent=mode==='signup'?'Empieza a ser parte.':'Este es tu espacio.';
 $('#form-description').textContent=mode==='signup'?'Crea tu cuenta y conecta con SoniClothes.':'Elige cómo quieres entrar y continúa con tu cuenta.';
 document.querySelectorAll('.signup-field').forEach(el=>{el.hidden=mode!=='signup';el.querySelectorAll('input').forEach(i=>{i.required=mode==='signup';i.disabled=mode!=='signup';});});
 $('#business-field').hidden=!(mode==='signup'&&role==='proveedor');$('#nombre-comercial').required=mode==='signup'&&role==='proveedor';$('#nombre-comercial').disabled=!$('#nombre-comercial').required;
 $('#login-options').hidden=mode!=='login';
 $('#user-label').textContent=mode==='signup'?'Elige tu nombre de usuario':'Usuario o correo electrónico';
 $('#usuario').placeholder=mode==='signup'?'Ejemplo: ana.martinez':'Ingresa tu usuario o correo';
 $('#usuario').maxLength=mode==='signup'?60:190;
 if(mode==='signup'){$('#usuario').pattern='[a-zA-Z0-9._-]{3,60}';$('#usuario').title='De 3 a 60 letras, números, puntos, guiones o guiones bajos.';}else{$('#usuario').removeAttribute('pattern');$('#usuario').removeAttribute('title');}
 $('#contrasena').autocomplete=mode==='signup'?'new-password':'current-password';$('#contrasena').minLength=mode==='signup'?12:1;$('#contrasena').maxLength=mode==='signup'?128:255;
 const pending=mode==='signup'&&role!=='cliente';
 $('#approval-note').hidden=!pending;
 $('#approval-note').textContent=role==='proveedor'?'Tu solicitud llegará al panel de administración. Podrás entrar cuando SoniClothes la apruebe.':'El acceso administrativo requiere aprobación de un administrador existente.';
 $('#submit-button span').textContent=mode==='login'?'Entrar a mi cuenta':pending?'Enviar solicitud':'Crear cuenta y entrar';
 $('#mode-prompt').textContent=mode==='login'?'¿Aún no tienes cuenta?':'¿Ya tienes una cuenta?';$('#mode-button').textContent=mode==='login'?'Crear cuenta':'Iniciar sesión';
 $('#confirmacion').setCustomValidity('');
 form.action=mode==='login'?'/api/login':'/api/registro';
}
function rememberRole(){if(mode!=='login')return;const saved=stored('soni_usuario_'+role);$('#usuario').value=saved;$('#recordar').checked=!!saved;}
function clearPassword(){ $('#contrasena').value='';$('#confirmacion').value='';$('#contrasena').type='password';$('.show-password').setAttribute('aria-label','Mostrar contraseña');$('.show-password').setAttribute('aria-pressed','false');}
document.querySelectorAll('[data-role]').forEach(b=>b.addEventListener('click',()=>{if(busy)return;role=b.dataset.role;clearPassword();message.hidden=true;update();rememberRole();}));
$('#mode-button').addEventListener('click',()=>{if(busy)return;mode=mode==='login'?'signup':'login';clearPassword();message.hidden=true;update();if(mode==='login')rememberRole();else $('#usuario').value='';$('#access-title').tabIndex=-1;$('#access-title').focus();});
$('.show-password').addEventListener('click',()=>{const show=$('#contrasena').type==='password';$('#contrasena').type=show?'text':'password';$('.show-password').setAttribute('aria-label',show?'Ocultar contraseña':'Mostrar contraseña');$('.show-password').setAttribute('aria-pressed',String(show));});
$('#help-button').addEventListener('click',()=>notice('Si olvidaste tu contraseña o tu solicitud sigue pendiente, solicita ayuda a la administración de SoniClothes.'));
$('#confirmacion').addEventListener('input',()=>$('#confirmacion').setCustomValidity(''));
$('#contrasena').addEventListener('input',()=>$('#confirmacion').setCustomValidity(''));
form.addEventListener('submit',async e=>{
 e.preventDefault();if(busy)return;
 if(mode==='signup'&&$('#contrasena').value!==$('#confirmacion').value){$('#confirmacion').setCustomValidity('Las contraseñas no coinciden.');$('#confirmacion').reportValidity();return;}
 if(!form.reportValidity())return;
 const payload=Object.fromEntries(new FormData(form));payload.usuario=payload.usuario.trim();
 busy=true;$('#submit-button').disabled=true;$('#submit-button span').textContent=mode==='login'?'Entrando…':'Creando tu acceso…';form.setAttribute('aria-busy','true');message.hidden=true;
 try{
  const r=await fetch(form.action,{method:'POST',headers:{'Content-Type':'application/json'},credentials:'same-origin',body:JSON.stringify(payload)});
  const data=await r.json();if(!r.ok)throw Error(data.error||'No pudimos completar la solicitud.');
  if(data.destino){
   if(!['/tienda.html','/cliente.html','/proveedor.html','/ventas.html'].includes(data.destino))throw Error('Destino no válido.');
   try{if($('#recordar').checked&&mode==='login')localStorage.setItem('soni_usuario_'+role,payload.usuario);else localStorage.removeItem('soni_usuario_'+role);}catch{}
   location.assign(data.destino);return;
  }
  if(data.estado==='pendiente'){
   mode='login';clearPassword();update();notice('Solicitud enviada. La administración revisará tu acceso. Después de su aprobación podrás entrar con el usuario y la contraseña que elegiste.');
  }
 }catch(e){notice(e instanceof TypeError?'No pudimos conectar. Revisa tu conexión e inténtalo de nuevo.':e.message,true);}
 finally{busy=false;$('#submit-button').disabled=false;form.removeAttribute('aria-busy');update();}
});
$('#year').textContent=new Date().getFullYear();update();rememberRole();
fetch('/api/publico/config').then(r=>r.json()).then(d=>{$('#demo-note').hidden=!d.demo;}).catch(()=>{});
