const {spawn}=require('node:child_process');
const {randomBytes,scryptSync}=require('node:crypto');
const {PGlite}=require('@electric-sql/pglite');
const fs=require('node:fs');const os=require('node:os');const path=require('node:path');const assert=require('node:assert/strict');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'soniclothes-test-'));
const port='3179',base='http://127.0.0.1:'+port;
Object.assign(process.env,{DB_MODE:'demo',SONICLOTHES_DEMO:'1',DEMO_DATA_DIR:dir});
const db=require('./base');
let child,errors='';
const accounts={admin:{cookie:''},client:{cookie:''},provider:{cookie:''},other:{cookie:''},newProvider:{cookie:''},newAdmin:{cookie:''}};
const adminPassword='SoniDemo!2026-Admin';
const providerPassword='SoniDemo!2026-Proveedor';
const inactivePassword='Cuenta-inactiva-para-pruebas';
let assertions=0;
function equal(a,b){assert.equal(a,b);assertions++;}
function legacyHash(password){
 const salt=randomBytes(16).toString('hex');
 return `scrypt:${salt}:${scryptSync(password,salt,32).toString('hex')}`;
}
async function stopServer(){
 if(!child||child.exitCode!==null||child.signalCode!==null)return;
 await new Promise(resolve=>{child.once('exit',resolve);child.kill('SIGTERM');});
}
async function req(url,actor=null,body,headers={}){
 const r=await fetch(base+url,{method:body===undefined?'GET':'POST',redirect:'manual',headers:{'Content-Type':'application/json',...(actor?{Cookie:actor.cookie}:{}),...headers},...(body===undefined?{}:{body:JSON.stringify(body)})});
 const c=r.headers.get('set-cookie');if(c&&actor)actor.cookie=c.split(';')[0];
 const text=await r.text();let data;try{data=JSON.parse(text);}catch{data=text;}
 return {status:r.status,data,headers:r.headers};
}
const login=(actor,usuario,contrasena,rol)=>req('/api/login',actor,{usuario,contrasena,rol});
const registration=(suffix,rol)=>({nombre:'Persona '+suffix,usuario:'cuenta.'+suffix,correo:suffix+'@example.com',rol,contrasena:'FraseSegura!2026-'+suffix,confirmacion:'FraseSegura!2026-'+suffix,...(rol==='proveedor'?{nombre_comercial:'Negocio '+suffix}:{})});
(async()=>{try{
 const inactiveHash=legacyHash(inactivePassword);
 try{
  await db.iniciar();
  await db.query("INSERT INTO usuario(nombre,nombre_usuario,hash_contrasena,rol) VALUES('Administración demo','admin.demo',$1,'administrador')",[legacyHash(adminPassword)]);
  await db.query(`WITH titular AS (INSERT INTO cliente(nombre) VALUES('Cuenta inactiva') RETURNING id_cliente)
   INSERT INTO usuario(nombre,nombre_usuario,hash_contrasena,rol,activo,id_cliente)
   SELECT 'Cuenta inactiva','inactivo.legacy',$1,'cliente',false,id_cliente FROM titular`,[inactiveHash]);
  await db.query(`WITH cuenta AS (
    INSERT INTO usuario(nombre,nombre_usuario,hash_contrasena,rol,id_proveedor)
    SELECT 'Textiles Norte','proveedor.demo',$1,'proveedor',id_proveedor
    FROM proveedor WHERE correo='norte@example.com' RETURNING id_usuario
   )
   INSERT INTO solicitud_acceso(nombre,nombre_usuario,correo,hash_contrasena,rol,estado,id_usuario_creado)
   SELECT 'Textiles Norte','proveedor.demo','norte@example.com',$1,'proveedor','aprobada',id_usuario FROM cuenta`,[legacyHash(providerPassword)]);
 }finally{await db.cerrar();}
 child=spawn(process.execPath,['servidor.js'],{cwd:__dirname,env:{...process.env,PORT:port},stdio:['ignore','pipe','pipe']});
 child.stderr.on('data',s=>errors+=s);
 await new Promise((resolve,reject)=>{const t=setTimeout(()=>reject(Error('No inició: '+errors)),60000);child.stdout.on('data',s=>{if(String(s).includes('SoniClothes listo')){clearTimeout(t);resolve();}});child.on('exit',c=>{clearTimeout(t);reject(Error('Terminó '+c+': '+errors));});});
 equal((await req('/login.html')).status,200);equal((await req('/login.css')).status,200);equal((await req('/login.js')).status,200);
 equal((await req('/api/catalogo')).status,401);equal((await req('/ventas.html')).status,302);
 equal((await req('/')).headers.get('location'),'/tienda.html');
 for(const url of ['/tienda.html','/carrito.html','/app.css','/app-shell.js','/tienda.js','/tienda.css','/catalogo-prendas.js'])equal((await req(url)).status,200);
 equal((await req('/pago.html')).headers.get('location'),'/login.html?continuar=pago');
 equal((await req('/cliente.html')).headers.get('location'),'/login.html?continuar=compras');
 equal((await req('/api/portal/cliente')).status,401);
 equal((await req('/api/portal/cliente/carrito')).status,401);
 equal((await req('/api/portal/cliente/carrito/transferir',null,{})).status,401);
 equal((await req('/api/portal/cliente/checkout',null,{})).status,401);
 equal((await login(accounts.admin,'admin.demo','incorrecta','administrador')).status,401);
 equal((await login(accounts.client,'admin.demo',adminPassword,'cliente')).status,401);
 equal((await login(accounts.admin,'x','x','administrador')).status,401);
 equal((await login(null,'inactivo.legacy',inactivePassword,'cliente')).status,401);
 const [firstLogin,secondLogin]=await Promise.all([
  login(accounts.admin,'admin.demo',adminPassword,'administrador'),
  login(null,'admin.demo',adminPassword,'administrador')
 ]);
 equal(firstLogin.status,200);equal(secondLogin.status,200);equal(firstLogin.data.destino,'/ventas.html');assert(firstLogin.headers.get('set-cookie').includes('HttpOnly'));assertions++;
 equal((await login(accounts.admin,'admin.demo',adminPassword,'administrador')).status,200);
 equal((await login(null,'admin.demo','incorrecta','administrador')).status,401);
 equal((await login(accounts.client,'cliente.demo','SoniDemo!2026-Cliente','cliente')).status,200);
 equal((await login(accounts.provider,'proveedor.demo',providerPassword,'proveedor')).status,200);
 equal((await req('/',accounts.admin)).headers.get('location'),'/ventas.html');
 equal((await req('/',accounts.provider)).headers.get('location'),'/proveedor.html');
 equal((await req('/api/solicitudes',accounts.client)).status,403);equal((await req('/api/proveedores',accounts.provider)).status,403);
 equal((await req('/api/ventas',accounts.client,{id_metodo_pago:1,items:[]})).status,403);
 equal((await req('/api/portal/proveedor',accounts.client)).status,403);equal((await req('/api/portal/cliente',accounts.provider)).status,403);
 equal((await req('/ventas.html',accounts.client)).headers.get('location'),'/tienda.html');
 equal((await req('/api/login',null,{usuario:'admin.demo',contrasena:'SoniDemo!2026-Admin',rol:'administrador'},{Origin:'https://ajeno.example'})).status,403);
 // Alta cliente: sin aprobación y sesión inmediata.
 const b=registration('cliente-nuevo','cliente');let r=await req('/api/registro',accounts.other,b);equal(r.status,201);equal(r.data.destino,'/tienda.html');
 equal((await req('/api/sesion',accounts.other)).data.rol,'cliente');equal((await req('/api/portal/cliente',accounts.other)).data.ventas.length,0);
 equal((await req('/api/registro',null,b)).status,409);
 equal((await req('/api/registro',null,{...registration('sin-validar','cliente'),rol:'superadmin'})).status,400);
 equal((await req('/api/registro',null,{...registration('corta','cliente'),contrasena:'123',confirmacion:'123'})).status,400);
 // Administración consulta el directorio y no registra ventas.
 const cat=(await req('/api/portal/cliente/catalogo',accounts.client)).data;
 equal((await req('/api/portal/cliente/catalogo')).data.length,cat.length);
 const catalogWord='/api/portal/cliente/catalogo/word';
 const downloadWord=(query='',actor=accounts.client)=>fetch(base+catalogWord+query,{headers:actor?{Cookie:actor.cookie}:{}});
 const guestCatalog=await downloadWord('',null);
 equal(guestCatalog.status,200);await guestCatalog.arrayBuffer();
 equal((await downloadWord('',accounts.provider)).status,403);
 equal((await downloadWord('',accounts.admin)).status,403);
 equal((await downloadWord('?q=uno&q=dos')).status,400);
 equal((await downloadWord('?q=sin-coincidencias-catalogo-word')).status,404);
 const completeCatalog=await downloadWord();
 equal(completeCatalog.status,200);
 equal(completeCatalog.headers.get('content-type'),'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
 equal(completeCatalog.headers.get('content-disposition'),'attachment; filename="Catalogo-SoniClothes.docx"');
 const catalogBytes=Buffer.from(await completeCatalog.arrayBuffer());
 equal(catalogBytes.subarray(0,4).toString('hex'),'504b0304');
 equal(catalogBytes.includes('word/document.xml'),true);
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
 equal((await req('/api/portal/cliente/checkout',accounts.admin,{id_solicitud:randomUUID()})).status,403);
 equal((await req('/api/portal/cliente/carrito',accounts.client,{id_variante:cat[0].id_variante,cantidad:-1})).status,400);
 equal((await req('/api/portal/cliente/carrito',accounts.client,{id_variante:999999,cantidad:1})).status,404);
 equal((await req('/api/portal/cliente/carrito',accounts.client,{id_variante:cat[0].id_variante,cantidad:100})).status,409);
 equal((await req('/api/portal/cliente/checkout',accounts.client,{id_solicitud:randomUUID()})).status,400);
 const c1=await req('/api/portal/cliente/carrito',accounts.client,{id_variante:cat[0].id_variante,cantidad:2,precio_venta:0.01,id_usuario:999});equal(c1.status,200);equal(c1.data.total,Number(cat[0].precio_venta)*2);
 equal((await req('/api/portal/cliente/carrito',accounts.other)).data.items.length,0);
 const stockBefore=(await req('/api/portal/cliente/catalogo',accounts.client)).data.find(p=>p.id_variante===cat[0].id_variante).existencia;
 const enviar=(account,id_solicitud)=>req('/api/portal/cliente/checkout',account,{id_solicitud});
 const decidir=(id,estado,actor=accounts.admin)=>req('/api/pagos-pendientes/'+id,actor,{estado});
 const rejectedKey=randomUUID();
 equal((await enviar(accounts.client,rejectedKey)).status,202);
 equal((await decidir(rejectedKey,'aprobada',accounts.client)).status,403);
 equal((await decidir(rejectedKey,'rechazada')).status,200);
 equal((await req('/api/portal/cliente/carrito',accounts.client)).data.unidades,2);
 equal((await req('/api/portal/cliente/catalogo',accounts.client)).data.find(p=>p.id_variante===cat[0].id_variante).existencia,stockBefore);
 const key=randomUUID();
 equal((await req('/api/portal/cliente/checkout',accounts.client,{id_solicitud:key,escenario:'aprobado'})).status,400);
 equal((await req('/api/portal/cliente/checkout',accounts.client,{id_solicitud:key,tarjeta:'4242424242424242'})).status,400);
 equal((await enviar(accounts.client,key)).status,202);
 equal((await req('/api/pagos-pendientes',accounts.admin)).data.find(p=>p.id_solicitud===key).estado,'pendiente');
 equal((await req('/api/portal/cliente/pagos',accounts.other)).data.length,0);
 equal((await req('/api/portal/cliente/ventas/999999',accounts.client)).status,404);
 equal((await req('/api/portal/cliente/catalogo',accounts.client)).data.find(p=>p.id_variante===cat[0].id_variante).existencia,stockBefore);
 equal((await req('/api/portal/cliente/carrito',accounts.client,{id_variante:cat[0].id_variante,cantidad:0})).status,409);
 const checkout=await decidir(key,'aprobada');equal(checkout.status,200);equal(checkout.data.total,Number(cat[0].precio_venta)*2);
 equal((await req('/api/portal/cliente/carrito',accounts.client)).data.items.length,0);
 equal((await req('/api/portal/cliente/catalogo',accounts.client)).data.find(p=>p.id_variante===cat[0].id_variante).existencia,stockBefore-2);
 equal((await enviar(accounts.client,key)).data.estado,'aprobada');
 equal((await decidir(key,'aprobada')).status,409);
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
 const stockKey=randomUUID(),otherKey=randomUUID();
 equal((await enviar(accounts.client,stockKey)).status,202);
 equal((await enviar(accounts.other,otherKey)).status,202);
 equal((await decidir(otherKey,'aprobada')).status,200);
 const intacto=(await req('/api/portal/cliente/catalogo',accounts.client)).data.find(p=>p.id_variante===cat[0].id_variante).existencia;
 equal((await decidir(stockKey,'aprobada')).status,409);
 equal((await decidir(stockKey,'rechazada')).status,200);
 equal((await req('/api/portal/cliente/catalogo',accounts.client)).data.find(p=>p.id_variante===cat[0].id_variante).existencia,intacto);
 equal((await req('/api/portal/cliente/carrito',accounts.client)).data.items.length,2);
 equal((await req('/api/portal/cliente/carrito',accounts.client,{id_variante:cat[2].id_variante,cantidad:0})).status,200);
 for(const html of ['/tienda.html','/carrito.html','/pago.html','/app.css','/app-shell.js','/tienda.css','/tienda.js'])equal((await req(html,accounts.client)).status,200);

 // Reintentos simultáneos con la misma clave solo generan una compra.
 const concurrentKey=randomUUID();
 const simultaneous=await Promise.all([req('/api/portal/cliente/checkout',accounts.client,{id_solicitud:concurrentKey}),req('/api/portal/cliente/checkout',accounts.client,{id_solicitud:concurrentKey})]);
 equal(simultaneous.map(r=>r.status).sort().join(','),'200,202');
 equal((await decidir(concurrentKey,'aprobada')).status,200);
 equal((await req('/api/portal/cliente/carrito',accounts.client)).data.items.length,0);
 equal((await req('/api/portal/cliente/checkout',accounts.client,{id_solicitud:'________-____-4___-8___-____________'})).status,400);

 // El navegador envía cantidades finales al transferir su selección, incluso si reintenta.
 const transfer='/api/portal/cliente/carrito/transferir';
 const variant=cat[0].id_variante;
 equal((await req('/api/portal/cliente/carrito',accounts.other,{id_variante:variant,cantidad:1})).status,200);
 const {cuenta}=(await req('/api/portal/cliente/carrito',accounts.other)).data;
 const items=[{id_variante:variant,cantidad:3,precio_venta:0.01}];
 const seleccion={cuenta,items};
 equal((await req(transfer,accounts.provider,seleccion)).status,403);
 equal((await req(transfer,accounts.client,seleccion)).status,409);
 equal((await req(transfer,accounts.other,{cuenta,items:[...items,...items]})).status,400);
 equal((await req(transfer,accounts.other,{cuenta,items:[{id_variante:variant,cantidad:201}]})).status,400);
 const transferred=await Promise.all([req(transfer,accounts.other,seleccion),req(transfer,accounts.other,seleccion)]);
 for(const result of transferred){
  equal(result.status,200);equal(result.data.unidades,3);equal(result.data.ajustado,false);
  equal(result.data.total,Number(cat[0].precio_venta)*3);
 }
 equal((await req('/api/portal/cliente/carrito',accounts.other)).data.unidades,3);
 equal((await req('/api/portal/cliente/carrito',accounts.client)).data.unidades,0);
 const disponibles=(await req('/api/portal/cliente/catalogo')).data.find(p=>p.id_variante===variant).existencia;
 const ajustable={cuenta,items:[{id_variante:variant,cantidad:disponibles+3},{id_variante:999999,cantidad:1}]};
 const guestPayment=randomUUID();
 equal((await req('/api/portal/cliente/checkout',accounts.other,{id_solicitud:guestPayment})).status,202);
 equal((await req(transfer,accounts.other,ajustable)).status,409);
 equal((await req('/api/portal/cliente/carrito',accounts.other)).data.unidades,3);
 equal((await decidir(guestPayment,'rechazada')).status,200);
 const adjusted=await req(transfer,accounts.other,ajustable);
 equal(adjusted.status,200);equal(adjusted.data.unidades,disponibles);equal(adjusted.data.ajustado,true);
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
 const guestPhoto=await fetch(base+foto);
 equal(guestPhoto.headers.get('content-type'),'image/png');
 equal(Buffer.from(await guestPhoto.arrayBuffer()).equals(png),true);
 const filter=new URLSearchParams({categoria:item.categoria,q:item.producto.toLocaleUpperCase('es')});
 const filteredCatalog=await downloadWord('?'+filter);
 equal(filteredCatalog.status,200);
 const filteredBytes=Buffer.from(await filteredCatalog.arrayBuffer());
 equal(filteredBytes.includes('word/media/'),true);
 filter.set('categoria','Sin coincidencias');
 equal((await downloadWord('?'+filter)).status,404);

 // Un proveedor vincula una propuesta a su propia cuenta. Solo Administración la publica.
 const propuesta={productos:[{nombre:'Prenda pendiente',categoria:'Playeras',precio_unitario:'200',existencias:'7',tallas:['M','L'],colores:['Oliva']}]};
 equal((await req('/api/cuestionarios',accounts.admin,propuesta)).status,403);
 equal((await req('/api/cuestionarios',accounts.newProvider,propuesta)).status,201);
 const revision=(await req('/api/revision',accounts.admin)).data;
 const nueva=revision.find(p=>p.nombre==='Prenda pendiente');
 equal(nueva.estado,'pendiente');
 const proposedPhoto=await fetch(base+'/api/portal/proveedor/foto/'+nueva.id_producto,{
  method:'PUT',headers:{Cookie:accounts.newProvider.cookie,'Content-Type':'image/png'},body:png
 });
 equal(proposedPhoto.status,200);
 const {foto:fotoPendiente}=await proposedPhoto.json();
 equal((await req(fotoPendiente)).status,404);
 equal((await req('/api/portal/cliente/catalogo')).data.some(p=>p.id_producto===nueva.id_producto),false);
 equal((await req('/api/portal/cliente/catalogo',accounts.client)).data.some(p=>p.id_producto===nueva.id_producto),false);
 const proposedProduct='?'+new URLSearchParams({q:nueva.nombre});
 equal((await downloadWord(proposedProduct)).status,404);
 equal((await req('/api/revision/'+nueva.id_producto,accounts.newProvider,{estado:'aprobada'})).status,403);
 equal((await req('/api/revision/'+nueva.id_producto,accounts.admin,{estado:'aprobada'})).status,200);
 equal((await req(fotoPendiente)).status,200);
 const publicadas=(await req('/api/portal/cliente/catalogo',accounts.client)).data.filter(p=>p.id_producto===nueva.id_producto);
 equal(publicadas.length,2);equal(publicadas.reduce((sum,p)=>sum+Number(p.existencia),0),7);
 const publishedCatalog=await downloadWord(proposedProduct);
 equal(publishedCatalog.status,200);
 await publishedCatalog.arrayBuffer();
 equal((await req('/api/registro',accounts.newAdmin,registration('admin-pendiente','administrador'))).status,403);
 const rejected=registration('rechazado','proveedor');equal((await req('/api/registro',null,rejected)).status,202);
 const denied=(await req('/api/solicitudes',accounts.admin)).data.find(x=>x.nombre_usuario===rejected.usuario);
 equal((await req('/api/solicitudes/'+denied.id_solicitud+'/decision',accounts.admin,{decision:'rechazar'})).status,200);
 equal((await login(accounts.newProvider,rejected.usuario,rejected.contrasena,'proveedor')).status,401);
 for(const html of ['/cliente.html','/portal.css','/portal.js'])equal((await req(html,accounts.client)).status,200);
 for(const html of ['/ventas.html','/revision.html','/ingresos.html','/solicitudes.html'])equal((await req(html,accounts.admin)).status,200);
 equal((await req('/api/logout',accounts.client,{})).status,200);equal((await req('/api/portal/cliente',accounts.client)).status,401);
 await stopServer();
 const persisted=new PGlite(dir);
 try{
  equal((await persisted.query("SELECT table_name FROM information_schema.tables WHERE table_name='carrito_visitante'")).rows.length,0);
  const {rows}=await persisted.query('SELECT nombre_usuario,hash_contrasena FROM usuario WHERE nombre_usuario IN ($1,$2,$3,$4,$5)',
   ['admin.demo','inactivo.legacy','proveedor.demo',b.usuario,supplier.usuario]);
  const hashes=new Map(rows.map(row=>[row.nombre_usuario,row.hash_contrasena]));
  for(const usuario of ['admin.demo','proveedor.demo',b.usuario,supplier.usuario]){
   equal(hashes.get(usuario)?.startsWith('$argon2id$v=19$m=19456,t=2,p=1$'),true);
  }
  equal(hashes.get('inactivo.legacy'),inactiveHash);
  const request=await persisted.query("SELECT hash_contrasena FROM solicitud_acceso WHERE nombre_usuario=$1 AND estado='aprobada'",['proveedor.demo']);
  equal(request.rows[0]?.hash_contrasena,hashes.get('proveedor.demo'));
 }finally{await persisted.close();}
 console.log(`OK: ${assertions} comprobaciones. Argon2id y migración de scrypt; registro de cliente inmediato; proveedores pendientes; aprobación/rechazo; bloqueo de escalada; aislamiento entre cuentas; carrito persistente; pago aprobado/rechazado; prevención de doble pago; totales de servidor; reversión por cambio de stock; publicación e ingresos por proveedor.`);
 }catch(e){console.error(e);console.error(errors);process.exitCode=1;}finally{await stopServer();fs.rmSync(dir,{recursive:true,force:true});}})();
