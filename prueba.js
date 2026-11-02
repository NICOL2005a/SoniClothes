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
 equal((await req('/ventas.html',accounts.client)).headers.get('location'),'/tienda.html');
 equal((await req('/api/login',null,{usuario:'admin.demo',contrasena:'SoniDemo!2026-Admin',rol:'administrador'},{Origin:'https://ajeno.example'})).status,403);
 // Alta cliente: sin aprobación y sesión inmediata.
 const b=registration('cliente-nuevo','cliente');r=await req('/api/registro',accounts.other,b);equal(r.status,201);equal(r.data.destino,'/tienda.html');
 equal((await req('/api/sesion',accounts.other)).data.rol,'cliente');equal((await req('/api/portal/cliente',accounts.other)).data.ventas.length,0);
 equal((await req('/api/registro',null,b)).status,409);
 equal((await req('/api/registro',null,{...registration('sin-validar','cliente'),rol:'superadmin'})).status,400);
 equal((await req('/api/registro',null,{...registration('corta','cliente'),contrasena:'123',confirmacion:'123'})).status,400);
 // Administración consulta el directorio y no registra ventas.
 const cat=(await req('/api/portal/cliente/catalogo',accounts.client)).data;
 const directory=await req('/api/directorio',accounts.admin);
 equal(directory.status,200);equal(directory.data.administradores.length,1);
 equal((await req('/api/directorio',accounts.client)).status,403);
 equal((await req('/api/ventas',accounts.admin,{items:[]})).status,403);
 equal((await req('/proveedores.html',accounts.admin)).status,302);
 equal((await req('/proveedores.html',accounts.provider)).status,200);
 // Tienda y pago: siempre con precios y propiedad comprobados en el servidor.
 const {randomUUID}=require('node:crypto');
 equal((await req('/api/portal/cliente/catalogo',accounts.client)).status,200);
 equal((await req('/api/portal/cliente/carrito',accounts.provider)).status,403);
 equal((await req('/api/portal/cliente/checkout',accounts.admin,{escenario:'aprobado',id_solicitud:randomUUID()})).status,403);
 equal((await req('/api/portal/cliente/carrito',accounts.client,{id_variante:cat[0].id_variante,cantidad:-1})).status,400);
 equal((await req('/api/portal/cliente/carrito',accounts.client,{id_variante:999999,cantidad:1})).status,404);
 equal((await req('/api/portal/cliente/carrito',accounts.client,{id_variante:cat[0].id_variante,cantidad:100})).status,409);
 equal((await req('/api/portal/cliente/checkout',accounts.client,{escenario:'aprobado',id_solicitud:randomUUID()})).status,400);
 const c1=await req('/api/portal/cliente/carrito',accounts.client,{id_variante:cat[0].id_variante,cantidad:2,precio_venta:0.01,id_usuario:999});equal(c1.status,200);equal(c1.data.total,Number(cat[0].precio_venta)*2);
 equal((await req('/api/portal/cliente/carrito',accounts.other)).data.items.length,0);
 const stockBefore=(await req('/api/portal/cliente/catalogo',accounts.client)).data.find(p=>p.id_variante===cat[0].id_variante).existencia;
 const declined=await req('/api/portal/cliente/checkout',accounts.client,{escenario:'rechazado',id_solicitud:randomUUID()});equal(declined.status,402);
 equal((await req('/api/portal/cliente/carrito',accounts.client)).data.unidades,2);
 equal((await req('/api/portal/cliente/catalogo',accounts.client)).data.find(p=>p.id_variante===cat[0].id_variante).existencia,stockBefore);
 const key=randomUUID();
 equal((await req('/api/portal/cliente/checkout',accounts.client,{escenario:'aprobado',id_solicitud:key,tarjeta:'4242424242424242'})).status,400);
 const checkout=await req('/api/portal/cliente/checkout',accounts.client,{escenario:'aprobado',id_solicitud:key});equal(checkout.status,201);equal(checkout.data.total,Number(cat[0].precio_venta)*2);equal(checkout.data.simulada,true);
 equal((await req('/api/portal/cliente/carrito',accounts.client)).data.items.length,0);
 equal((await req('/api/portal/cliente/catalogo',accounts.client)).data.find(p=>p.id_variante===cat[0].id_variante).existencia,stockBefore-2);
 const repeat=await req('/api/portal/cliente/checkout',accounts.client,{escenario:'aprobado',id_solicitud:key});equal(repeat.status,200);equal(repeat.data.id_venta,checkout.data.id_venta);
 equal((await req('/api/portal/cliente/ventas/'+checkout.data.id_venta,accounts.other)).status,404);
 equal((await req('/api/portal/cliente/ventas/'+checkout.data.id_venta,accounts.client)).data.simulada,true);
 const ingresos=(await req('/api/ingresos',accounts.admin)).data;
 const ingreso=ingresos.find(x=>x.folio===checkout.data.folio);
 equal(ingreso.proveedor.includes('Textiles Norte'),true);
 equal(Number(ingreso.importe),checkout.data.total);equal(ingreso.simulada,true);
 // Si cambia stock entre carrito y pago, no queda una venta parcial ni se vacía el carrito.
 await req('/api/portal/cliente/carrito',accounts.client,{id_variante:cat[0].id_variante,cantidad:1});
 await req('/api/portal/cliente/carrito',accounts.client,{id_variante:cat[2].id_variante,cantidad:11});
 await req('/api/portal/cliente/carrito',accounts.other,{id_variante:cat[2].id_variante,cantidad:2});
 const consume=await req('/api/portal/cliente/checkout',accounts.other,{escenario:'aprobado',id_solicitud:randomUUID()});equal(consume.status,201);
 const intacto=(await req('/api/portal/cliente/catalogo',accounts.client)).data.find(p=>p.id_variante===cat[0].id_variante).existencia;
 equal((await req('/api/portal/cliente/checkout',accounts.client,{escenario:'aprobado',id_solicitud:randomUUID()})).status,409);
 equal((await req('/api/portal/cliente/catalogo',accounts.client)).data.find(p=>p.id_variante===cat[0].id_variante).existencia,intacto);
 equal((await req('/api/portal/cliente/carrito',accounts.client)).data.items.length,2);
 equal((await req('/api/portal/cliente/carrito',accounts.client,{id_variante:cat[2].id_variante,cantidad:0})).status,200);
 for(const html of ['/tienda.html','/carrito.html','/pago.html','/app.css','/app-shell.js','/tienda.css','/tienda.js'])equal((await req(html,accounts.client)).status,200);

 // Reintentos simultáneos con la misma clave solo generan una compra.
 const concurrentKey=randomUUID();
 const simultaneous=await Promise.all([req('/api/portal/cliente/checkout',accounts.client,{escenario:'aprobado',id_solicitud:concurrentKey}),req('/api/portal/cliente/checkout',accounts.client,{escenario:'aprobado',id_solicitud:concurrentKey})]);
 equal(simultaneous.map(r=>r.status).sort().join(','),'200,201');equal(simultaneous[0].data.id_venta,simultaneous[1].data.id_venta);
 equal((await req('/api/portal/cliente/carrito',accounts.client)).data.items.length,0);
 equal((await req('/api/portal/cliente/checkout',accounts.client,{escenario:'aprobado',id_solicitud:'________-____-4___-8___-____________'})).status,400);
 // Proveedor pendiente: no sesión, ningún privilegio, aprobación exclusiva del admin.
 const supplier=registration('nuevo-proveedor','proveedor');r=await req('/api/registro',accounts.newProvider,supplier);equal(r.status,202);equal(accounts.newProvider.cookie,'');
 equal((await login(accounts.newProvider,supplier.usuario,supplier.contrasena,'proveedor')).status,401);
 let requests=(await req('/api/solicitudes',accounts.admin)).data;const pending=requests.find(x=>x.nombre_usuario===supplier.usuario);assert(pending);assertions++;assert(!('hash_contrasena'in pending));assertions++;
 equal((await req('/api/solicitudes/'+pending.id_solicitud+'/decision',accounts.client,{decision:'aprobar'})).status,403);
 equal((await req('/api/solicitudes/'+pending.id_solicitud+'/decision',accounts.admin,{decision:'aprobar'})).status,200);
 equal((await req('/api/solicitudes/'+pending.id_solicitud+'/decision',accounts.admin,{decision:'aprobar'})).status,409);
 equal((await login(accounts.newProvider,supplier.correo,supplier.contrasena,'proveedor')).status,200);
 const profile=(await req('/api/portal/proveedor',accounts.newProvider)).data;equal(profile.proveedor.nombre,supplier.nombre_comercial);equal(profile.productos.length,0);equal((await req('/api/portal/proveedor',accounts.provider)).data.productos.length,4);
 const garment = (await req('/api/portal/proveedor', accounts.provider)).data.productos[0];
 const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jf2cAAAAASUVORK5CYII=', 'base64');
 const upload = account => fetch(base + '/api/portal/proveedor/foto/' + garment.id_producto, {
  method: 'PUT', headers: { Cookie: account.cookie, 'Content-Type': 'image/png' }, body: png
 });
 equal((await upload(accounts.newProvider)).status, 404);
 equal((await upload(accounts.client)).status, 403);
 const uploaded = await upload(accounts.provider);
 equal(uploaded.status, 200);
 const { foto } = await uploaded.json();
 const item = (await req('/api/portal/cliente/catalogo', accounts.client)).data.find(p => p.id_producto === garment.id_producto);
 equal(item.foto, foto);
 equal(item.proveedores.includes('Textiles Norte'), true);
 const displayed = await fetch(base + foto, {headers:{Cookie:accounts.client.cookie}});
 equal(displayed.headers.get('content-type'), 'image/png');
 equal(Buffer.from(await displayed.arrayBuffer()).equals(png), true);

 // Un proveedor vincula una propuesta a su propia cuenta. Solo Administración la publica.
 const propuesta={productos:[{nombre:'Prenda pendiente',categoria:'Playeras',precio_unitario:'200',existencias:'7',tallas:['M','L'],colores:['Oliva']}]};
 equal((await req('/api/cuestionarios',accounts.admin,propuesta)).status,403);
 equal((await req('/api/cuestionarios',accounts.newProvider,propuesta)).status,201);
 const revision=(await req('/api/revision',accounts.admin)).data;
 const nueva=revision.find(p=>p.nombre==='Prenda pendiente');
 equal(nueva.estado,'pendiente');
 equal((await req('/api/portal/cliente/catalogo',accounts.client)).data.some(p=>p.id_producto===nueva.id_producto),false);
 equal((await req('/api/revision/'+nueva.id_producto,accounts.newProvider,{estado:'aprobada'})).status,403);
 equal((await req('/api/revision/'+nueva.id_producto,accounts.admin,{estado:'aprobada'})).status,200);
 const publicadas=(await req('/api/portal/cliente/catalogo',accounts.client)).data.filter(p=>p.id_producto===nueva.id_producto);
 equal(publicadas.length,2);equal(publicadas.reduce((sum,p)=>sum+Number(p.existencia),0),7);
 equal((await req('/api/registro',accounts.newAdmin,registration('admin-pendiente','administrador'))).status,403);
 const rejected=registration('rechazado','proveedor');equal((await req('/api/registro',null,rejected)).status,202);
 const denied=(await req('/api/solicitudes',accounts.admin)).data.find(x=>x.nombre_usuario===rejected.usuario);
 equal((await req('/api/solicitudes/'+denied.id_solicitud+'/decision',accounts.admin,{decision:'rechazar'})).status,200);
 equal((await login(accounts.newProvider,rejected.usuario,rejected.contrasena,'proveedor')).status,401);
 for(const html of ['/cliente.html','/portal.css','/portal.js'])equal((await req(html,accounts.client)).status,200);
 for(const html of ['/ventas.html','/revision.html','/ingresos.html','/solicitudes.html'])equal((await req(html,accounts.admin)).status,200);
 equal((await req('/api/logout',accounts.client,{})).status,200);equal((await req('/api/portal/cliente',accounts.client)).status,401);
 console.log(`OK: ${assertions} comprobaciones. Registro de cliente inmediato; proveedores pendientes; aprobación/rechazo; bloqueo de escalada; aislamiento entre cuentas; carrito persistente; pago aprobado/rechazado; prevención de doble pago; totales de servidor; reversión por cambio de stock; publicación e ingresos por proveedor.`);
 }catch(e){console.error(e);console.error(errors);process.exitCode=1;}finally{child.kill('SIGTERM');await new Promise(resolve=>{if(child.exitCode!==null)resolve();else child.once('exit',resolve);});fs.rmSync(dir,{recursive:true,force:true});}})();
