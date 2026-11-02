const {spawn}=require('node:child_process');
const fs=require('node:fs');const os=require('node:os');const path=require('node:path');const assert=require('node:assert/strict');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'soniclothes-test-'));
const port='3179',base='http://127.0.0.1:'+port;
const child=spawn(process.execPath,['servidor.js'],{cwd:__dirname,env:{...process.env,DB_MODE:'demo',SONICLOTHES_DEMO:'1',PORT:port,DEMO_DATA_DIR:dir},stdio:['ignore','pipe','pipe']});
let errors='';child.stderr.on('data',s=>errors+=s);
const accounts={admin:{cookie:''},client:{cookie:''},provider:{cookie:''},other:{cookie:''},newProvider:{cookie:''},newAdmin:{cookie:''}};
let assertions=0;
function equal(a,b){assert.equal(a,b);assertions++;}
async function req(url,actor=null,body,headers={}){
 const r=await fetch(base+url,{method:body===undefined?'GET':'POST',redirect:'manual',headers:{'Content-Type':'application/json',...(actor?{Cookie:actor.cookie}:{}),...headers},...(body===undefined?{}:{body:JSON.stringify(body)})});
 const c=r.headers.get('set-cookie');if(c&&actor)actor.cookie=c.split(';')[0];
 const text=await r.text();let data;try{data=JSON.parse(text);}catch{data=text;}
 return {status:r.status,data,headers:r.headers};
}
const login=(actor,usuario,contrasena,rol)=>req('/api/login',actor,{usuario,contrasena,rol});
const registration=(suffix,rol)=>({nombre:'Persona '+suffix,usuario:'cuenta.'+suffix,correo:suffix+'@example.com',rol,contrasena:'FraseSegura!2026-'+suffix,confirmacion:'FraseSegura!2026-'+suffix,...(rol==='proveedor'?{nombre_comercial:'Negocio '+suffix}:{})});
(async()=>{try{
 await new Promise((resolve,reject)=>{const t=setTimeout(()=>reject(Error('No inició: '+errors)),60000);child.stdout.on('data',s=>{if(String(s).includes('SoniClothes listo')){clearTimeout(t);resolve();}});child.on('exit',c=>{clearTimeout(t);reject(Error('Terminó '+c+': '+errors));});});
 equal((await req('/login.html')).status,200);equal((await req('/login.css')).status,200);equal((await req('/login.js')).status,200);
 equal((await req('/api/catalogo')).status,401);equal((await req('/ventas.html')).status,302);
 equal((await login(accounts.admin,'admin.demo','incorrecta','administrador')).status,401);
 equal((await login(accounts.client,'admin.demo','SoniDemo!2026-Admin','cliente')).status,401);
 equal((await login(accounts.admin,'x','x','administrador')).status,401);
 let r=await login(accounts.admin,'admin.demo','SoniDemo!2026-Admin','administrador');equal(r.status,200);equal(r.data.destino,'/ventas.html');assert(r.headers.get('set-cookie').includes('HttpOnly'));assertions++;
 equal((await login(accounts.client,'cliente.demo','SoniDemo!2026-Cliente','cliente')).status,200);
 equal((await login(accounts.provider,'proveedor.demo','SoniDemo!2026-Proveedor','proveedor')).status,200);
 equal((await req('/api/solicitudes',accounts.client)).status,403);equal((await req('/api/proveedores',accounts.provider)).status,403);
 equal((await req('/api/ventas',accounts.client,{id_metodo_pago:1,items:[]})).status,403);
 equal((await req('/api/portal/proveedor',accounts.client)).status,403);equal((await req('/api/portal/cliente',accounts.provider)).status,403);
 equal((await req('/ventas.html',accounts.client)).headers.get('location'),'/cliente.html');
 equal((await req('/api/login',null,{usuario:'admin.demo',contrasena:'SoniDemo!2026-Admin',rol:'administrador'},{Origin:'https://ajeno.example'})).status,403);
 // Alta cliente: sin aprobación y sesión inmediata.
 const b=registration('cliente-nuevo','cliente');r=await req('/api/registro',accounts.other,b);equal(r.status,201);equal(r.data.destino,'/cliente.html');
 equal((await req('/api/sesion',accounts.other)).data.rol,'cliente');equal((await req('/api/portal/cliente',accounts.other)).data.ventas.length,0);
 equal((await req('/api/registro',null,b)).status,409);
 equal((await req('/api/registro',null,{...registration('sin-validar','cliente'),rol:'superadmin'})).status,400);
 equal((await req('/api/registro',null,{...registration('corta','cliente'),contrasena:'123',confirmacion:'123'})).status,400);
 // Venta del admin y aislamiento entre compradores, aun con ID conocido.
 const cat=(await req('/api/catalogo',accounts.admin)).data,options=(await req('/api/opciones',accounts.admin)).data;
 const own=options.clientes.find(c=>c.correo==='daniel@example.com');
 const sale=await req('/api/ventas',accounts.admin,{id_cliente:own.id_cliente,id_metodo_pago:options.metodos[0].id_metodo_pago,items:[{id_variante:cat[0].id_variante,cantidad:2}]});equal(sale.status,201);
 equal((await req('/api/portal/cliente',accounts.client)).data.ventas.length,1);
 equal((await req('/api/portal/cliente/ventas/'+sale.data.id_venta,accounts.client)).status,200);
 equal((await req('/api/portal/cliente/ventas/'+sale.data.id_venta,accounts.other)).status,404);
 equal((await req('/api/portal/cliente/ventas/999999',accounts.client)).status,404);
 const before=(await req('/api/catalogo',accounts.admin)).data[0].existencia;
 equal((await req('/api/ventas',accounts.admin,{id_metodo_pago:1,items:[{id_variante:cat[0].id_variante,cantidad:1},{id_variante:cat[1].id_variante,cantidad:999}]})).status,400);
 equal((await req('/api/catalogo',accounts.admin)).data[0].existencia,before);
 // Proveedor pendiente: no sesión, ningún privilegio, aprobación exclusiva del admin.
 const supplier=registration('nuevo-proveedor','proveedor');r=await req('/api/registro',accounts.newProvider,supplier);equal(r.status,202);equal(accounts.newProvider.cookie,'');
 equal((await login(accounts.newProvider,supplier.usuario,supplier.contrasena,'proveedor')).status,401);
 let requests=(await req('/api/solicitudes',accounts.admin)).data;const pending=requests.find(x=>x.nombre_usuario===supplier.usuario);assert(pending);assertions++;assert(!('hash_contrasena'in pending));assertions++;
 equal((await req('/api/solicitudes/'+pending.id_solicitud+'/decision',accounts.client,{decision:'aprobar'})).status,403);
 equal((await req('/api/solicitudes/'+pending.id_solicitud+'/decision',accounts.admin,{decision:'aprobar'})).status,200);
 equal((await req('/api/solicitudes/'+pending.id_solicitud+'/decision',accounts.admin,{decision:'aprobar'})).status,409);
 equal((await login(accounts.newProvider,supplier.correo,supplier.contrasena,'proveedor')).status,200);
 const profile=(await req('/api/portal/proveedor',accounts.newProvider)).data;equal(profile.proveedor.nombre,supplier.nombre_comercial);equal(profile.productos.length,0);equal((await req('/api/portal/proveedor',accounts.provider)).data.productos.length,4);
 // Nadie obtiene administración por elegir ese rol al registrarse.
 const admin=registration('admin-pendiente','administrador');equal((await req('/api/registro',accounts.newAdmin,admin)).status,202);
 equal((await login(accounts.newAdmin,admin.usuario,admin.contrasena,'administrador')).status,401);
 requests=(await req('/api/solicitudes',accounts.admin)).data;const a=requests.find(x=>x.nombre_usuario===admin.usuario);
 equal((await req('/api/solicitudes/'+a.id_solicitud+'/decision',accounts.admin,{decision:'aprobar'})).status,200);
 equal((await login(accounts.newAdmin,admin.usuario,admin.contrasena,'administrador')).status,200);
 equal((await req('/api/solicitudes',accounts.newAdmin)).status,200);
 const rejected=registration('rechazado','proveedor');equal((await req('/api/registro',null,rejected)).status,202);
 const denied=(await req('/api/solicitudes',accounts.admin)).data.find(x=>x.nombre_usuario===rejected.usuario);
 equal((await req('/api/solicitudes/'+denied.id_solicitud+'/decision',accounts.admin,{decision:'rechazar'})).status,200);
 equal((await login(accounts.newProvider,rejected.usuario,rejected.contrasena,'proveedor')).status,401);
 for(const html of ['/cliente.html','/portal.css','/portal.js'])equal((await req(html,accounts.client)).status,200);
 for(const html of ['/ventas.html','/catalogo.html','/proveedores.html','/solicitudes.html'])equal((await req(html,accounts.admin)).status,200);
 equal((await req('/api/logout',accounts.client,{})).status,200);equal((await req('/api/portal/cliente',accounts.client)).status,401);
 console.log(`OK: ${assertions} comprobaciones. Registro de cliente inmediato; proveedor y administrador pendientes; aprobación/rechazo; bloqueo de escalada; aislamiento entre cuentas; venta, ticket y reversión de stock.`);
 }catch(e){console.error(e);console.error(errors);process.exitCode=1;}finally{child.kill('SIGTERM');await new Promise(resolve=>{if(child.exitCode!==null)resolve();else child.once('exit',resolve);});fs.rmSync(dir,{recursive:true,force:true});}})();
