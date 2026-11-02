const express = require('express');
const path = require('path');
const db = require('./base');
const {randomBytes} = require('node:crypto');
const {roles,destinos,verifyPassword} = require('./acceso');
const app = express();
app.disable('x-powered-by');
if(process.env.TRUST_PROXY === '1') app.set('trust proxy',1);
const sesiones = new Map();
const intentos = new Map();
const duracion = 8*60*60*1000;
app.use(express.json({limit:'256kb'}));
app.use((req,res,next)=>{
  res.setHeader('Cache-Control','no-store');
  res.setHeader('X-Content-Type-Options','nosniff');
  res.setHeader('Referrer-Policy','same-origin');
  res.setHeader('X-Frame-Options','DENY');
  const origin=process.env.APP_ORIGIN || `${req.protocol}://${req.get('host')}`;
  if(['POST','PUT','PATCH','DELETE'].includes(req.method) && req.headers.origin && req.headers.origin!==origin)
    return res.status(403).json({error:'La solicitud no pertenece a esta aplicación.'});
  next();
});
app.use('/vendor/bootstrap',express.static(path.join(__dirname,'node_modules/bootstrap/dist')));
app.use('/vendor/bootstrap-icons',express.static(path.join(__dirname,'node_modules/bootstrap-icons/font')));
const token=req=>(req.headers.cookie||'').split(';').map(s=>s.trim()).find(s=>s.startsWith('pos_sesion='))?.slice(11);
const clearCookie=(req,res)=>res.setHeader('Set-Cookie',`pos_sesion=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0${req.secure?'; Secure':''}`);
const sanitize=u=>({nombre:u.nombre,rol:u.rol,destino:destinos[u.rol]});
app.get('/api/publico/config',(req,res)=>res.json({demo:process.env.SONICLOTHES_DEMO==='1'}));
const registros = new Map();
function limitarRegistro(req,res,next){
 const now=Date.now();for(const [k,v]of registros)if(v.vence<=now)registros.delete(k);
 const v=registros.get(req.ip)||{numero:0,vence:now+3600000};
 if(v.numero>=20)return res.status(429).json({error:'Demasiadas solicitudes. Inténtalo más tarde.'});
 v.numero++;registros.set(req.ip,v);next();
}
app.use((req,res,next)=>{
 req.crearSesion=u=>{
  const anterior=token(req);if(anterior)sesiones.delete(anterior);
  const id=randomBytes(32).toString('hex');sesiones.set(id,{id_usuario:u.id_usuario,vence:Date.now()+duracion});
  res.setHeader('Set-Cookie',`pos_sesion=${id}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${duracion/1000}${req.secure?'; Secure':''}`);
 };
 next();
});
require('./registro').instalar(app,db,limitarRegistro);
app.post('/api/login',async(req,res,next)=>{
 try {
  const b=req.body || {};
  const now=Date.now();
  for(const [key,v] of intentos)if(v.vence<now)intentos.delete(key);
  const ip=req.ip;
  const count=intentos.get(ip)||{numero:0,vence:now+15*60*1000};
  if(count.numero>=30){res.set('Retry-After',String(Math.max(1,Math.ceil((count.vence-now)/1000))));return res.status(429).json({error:'Demasiados intentos. Espera unos minutos e inténtalo de nuevo.'});}
  count.numero++;intentos.set(ip,count);
  const invalid=()=>res.status(401).json({error:'Revisa tu usuario, contraseña y tipo de acceso.'});
  if(typeof b.usuario!=='string'||!b.usuario.trim()||b.usuario.length>190||typeof b.contrasena!=='string'||!b.contrasena||b.contrasena.length>255||!roles.includes(b.rol))return invalid();
  const usuario=b.usuario.trim();
  // Los nombres no contienen @, por lo que usuario y correo no son ambiguos.
  const field=usuario.includes('@')?'correo':'nombre_usuario';
  const u=await db.exclusive(async()=> (await db.query(`SELECT id_usuario,nombre,hash_contrasena,rol,activo FROM usuario WHERE ${field}=$1`,[usuario])).rows[0]);
  if(!await verifyPassword(b.contrasena,u?.hash_contrasena)||!u?.activo||u.rol!==b.rol)return invalid();
  intentos.delete(ip);
  const anterior=token(req);if(anterior)sesiones.delete(anterior);
  for(const [key,v]of sesiones)if(v.vence<=now)sesiones.delete(key);
  const id=randomBytes(32).toString('hex');
  sesiones.set(id,{id_usuario:u.id_usuario,vence:now+duracion});
  res.setHeader('Set-Cookie',`pos_sesion=${id}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${duracion/1000}${req.secure?'; Secure':''}`);
  res.json({ok:true,...sanitize(u)});
 }catch(e){next(e);}
});
const publicos=new Set(['/login.html','/login.css','/login.js']);
app.use(async(req,res,next)=>{
 if(publicos.has(req.path))return next();
 try {
  const id=token(req),sesion=sesiones.get(id);
  if(sesion&&sesion.vence>Date.now()) {
   const u=await db.exclusive(async()=> (await db.query('SELECT id_usuario,nombre,rol,id_cliente,id_proveedor,activo FROM usuario WHERE id_usuario=$1',[sesion.id_usuario])).rows[0]);
   if(u?.activo&&roles.includes(u.rol)){req.usuario=u;return next();}
  }
  if(id){sesiones.delete(id);clearCookie(req,res);}
  if(req.path.startsWith('/api/'))return res.status(401).json({error:'Tu sesión terminó. Inicia sesión para continuar.'});
  res.redirect('/login.html');
 }catch(e){next(e);}
});
app.get('/api/sesion',(req,res)=>res.json(sanitize(req.usuario)));
app.post('/api/logout',(req,res)=>{sesiones.delete(token(req));clearCookie(req,res);res.json({ok:true});});
// Antes de servir HTML o API, se comprueba el acceso en el servidor.
app.use((req,res,next)=>{
 if(publicos.has(req.path))return next();
 const rol=req.usuario.rol;
 const portal=rol==='cliente'?'/cliente.html':'/proveedor.html';
 if(rol==='administrador') {
  if(req.path.startsWith('/api/portal/'))return res.status(403).json({error:'Esta sección corresponde a otra cuenta.'});
  return next();
 }
 const assets=['/portal.css','/portal.js','/app.css','/app-shell.js','/tienda.css','/tienda.js'];
 const api=rol==='cliente'?/^\/api\/portal\/cliente(?:\/ventas\/\d+|\/catalogo|\/carrito|\/checkout)?$/:/^\/api\/portal\/proveedor$/;
 const paginasCliente=['/tienda.html','/carrito.html','/pago.html'];
 if(req.path===portal||assets.includes(req.path)||(rol==='cliente'&&paginasCliente.includes(req.path))||api.test(req.path))return next();
 if(req.path.startsWith('/api/'))return res.status(403).json({error:'Tu cuenta no tiene acceso a esta sección.'});
 return res.redirect(destinos[rol]);
});
app.use(express.static(path.join(__dirname,'public')));
app.get('/api/portal/cliente',async(req,res,next)=>{
 try {res.json(await db.exclusive(async()=>({
  cliente:(await db.query('SELECT nombre,telefono,correo FROM cliente WHERE id_cliente=$1',[req.usuario.id_cliente])).rows[0],
  ventas:(await db.query('SELECT v.id_venta,v.fecha,v.total,f.folio,(s.id_venta IS NOT NULL) AS simulada FROM vista_venta_total v LEFT JOIN factura f USING(id_venta) LEFT JOIN venta_simulada s USING(id_venta) WHERE v.id_cliente=$1 ORDER BY v.fecha DESC LIMIT 100',[req.usuario.id_cliente])).rows
 })));}catch(e){next(e);}
});
app.get('/api/portal/cliente/ventas/:id',async(req,res,next)=>{
 try {await db.exclusive(async()=>{
  const venta=(await db.query('SELECT v.id_venta,v.fecha,v.total,f.folio,(s.id_venta IS NOT NULL) AS simulada FROM vista_venta_total v LEFT JOIN factura f USING(id_venta) LEFT JOIN venta_simulada s USING(id_venta) WHERE v.id_venta=$1 AND v.id_cliente=$2',[req.params.id,req.usuario.id_cliente])).rows[0];
  if(!venta)return res.status(404).json({error:'Compra no encontrada.'});
  venta.detalles=(await db.query('SELECT d.cantidad,d.precio_unitario,p.nombre,v.talla,v.color FROM detalle_venta d JOIN variante_producto v USING(id_variante) JOIN producto p USING(id_producto) WHERE d.id_venta=$1',[req.params.id])).rows;
  res.json(venta);
 });}catch(e){next(e);}
});
app.get('/api/portal/proveedor',async(req,res,next)=>{
 try {res.json(await db.exclusive(async()=>({
  proveedor:(await db.query('SELECT nombre,telefono,correo FROM proveedor WHERE id_proveedor=$1',[req.usuario.id_proveedor])).rows[0],
  productos:(await db.query('SELECT p.nombre,p.marca,c.nombre AS categoria FROM proveedor_producto pp JOIN producto p USING(id_producto) JOIN categoria c USING(id_categoria) WHERE pp.id_proveedor=$1 ORDER BY p.nombre',[req.usuario.id_proveedor])).rows,
  cuestionarios:(await db.query('SELECT id_cuestionario,fecha FROM cuestionario_proveedor WHERE id_proveedor=$1 ORDER BY fecha DESC',[req.usuario.id_proveedor])).rows
 })));}catch(e){next(e);}
});
const error400 = message => Object.assign(new Error(message),{status:400});
const ruta = (method,url,fn) => app[method](url,async(req,res,next)=>{
  try { await db.exclusive(()=>fn(req,res)); } catch(e) { next(e); }
});
require('./registro').instalarAdministracion(app,db,ruta);
require('./tienda').instalar(app,db,ruta);
ruta('get','/api/catalogo',async(req,res)=>res.json((await db.query('SELECT * FROM vista_catalogo_prendas ORDER BY id_variante')).rows));
ruta('get','/api/opciones',async(req,res)=>res.json({
  clientes:(await db.query('SELECT * FROM cliente ORDER BY nombre')).rows,
  metodos:(await db.query("SELECT * FROM metodo_pago WHERE nombre <> 'Tarjeta simulada' ORDER BY id_metodo_pago")).rows
}));
ruta('get','/api/ventas',async(req,res)=>res.json((await db.query(`SELECT v.*,c.nombre AS cliente,f.folio,(s.id_venta IS NOT NULL) AS simulada FROM vista_venta_total v LEFT JOIN cliente c USING(id_cliente) LEFT JOIN factura f USING(id_venta) LEFT JOIN venta_simulada s USING(id_venta) ORDER BY v.id_venta DESC LIMIT 50`)).rows));
ruta('get','/api/ventas/:id',async(req,res)=>{
  if (!/^\d+$/.test(req.params.id)) throw error400('Folio inválido.');
  const venta=(await db.query(`SELECT v.*,f.folio,c.nombre AS cliente,(s.id_venta IS NOT NULL) AS simulada FROM vista_venta_total v LEFT JOIN factura f USING(id_venta) LEFT JOIN cliente c USING(id_cliente) LEFT JOIN venta_simulada s USING(id_venta) WHERE v.id_venta=$1`,[req.params.id])).rows[0];
  if (!venta) return res.status(404).json({error:'Venta no encontrada.'});
  venta.detalles=(await db.query(`SELECT d.*,p.nombre,v.talla,v.color FROM detalle_venta d JOIN variante_producto v USING(id_variante) JOIN producto p USING(id_producto) WHERE id_venta=$1`,[req.params.id])).rows;
  res.json(venta);
});
ruta('post','/api/ventas',async(req,res)=>{
  const b=req.body;
  if (!b || !Array.isArray(b.items) || b.items.length===0 || b.items.length>100) throw error400('Agrega de 1 a 100 variantes.');
  if (!/^\d+$/.test(String(b.id_metodo_pago))) throw error400('Selecciona un método de pago.');
  const ids=new Set();
  for(const item of b.items) {
    if (!/^\d+$/.test(String(item.id_variante)) || !Number.isSafeInteger(item.cantidad) || item.cantidad<1 || item.cantidad>10000 || ids.has(String(item.id_variante))) throw error400('Revisa las cantidades y evita variantes repetidas.');
    ids.add(String(item.id_variante));
  }
  await db.query('BEGIN');
  try {
    if (!(await db.query("SELECT 1 FROM metodo_pago WHERE id_metodo_pago=$1 AND nombre <> 'Tarjeta simulada'",[b.id_metodo_pago])).rows.length) throw error400('Método de pago inválido.');
    if (b.id_cliente && (!/^\d+$/.test(String(b.id_cliente)) || !(await db.query('SELECT 1 FROM cliente WHERE id_cliente=$1',[b.id_cliente])).rows.length)) throw error400('Cliente inválido.');
    const usuario=req.usuario;
    const v=(await db.query('INSERT INTO venta(id_cliente,id_usuario) VALUES($1,$2) RETURNING id_venta',[b.id_cliente||null,usuario.id_usuario])).rows[0];
    let total=0;
    // Orden estable para evitar bloqueos cruzados al vender varias variantes.
    for(const item of [...b.items].sort((a,b)=>Number(a.id_variante)-Number(b.id_variante))) {
      const stock=await db.query('UPDATE inventario SET existencia=existencia-$1 WHERE id_variante=$2 AND existencia >= $1 RETURNING existencia',[item.cantidad,item.id_variante]);
      if (!stock.rows.length) throw error400('Una prenda no tiene existencias suficientes. Actualiza el catálogo.');
      const p=(await db.query('SELECT p.precio_venta FROM variante_producto v JOIN producto p USING(id_producto) WHERE id_variante=$1',[item.id_variante])).rows[0];
      await db.query('INSERT INTO detalle_venta(id_venta,id_variante,cantidad,precio_unitario) VALUES($1,$2,$3,$4)',[v.id_venta,item.id_variante,item.cantidad,p.precio_venta]);
      total+=Math.round(Number(p.precio_venta)*100)*item.cantidad;
    }
    await db.query('INSERT INTO pago(id_venta,id_metodo_pago,monto) VALUES($1,$2,$3)',[v.id_venta,b.id_metodo_pago,total/100]);
    const folio=`V-${String(v.id_venta).padStart(6,'0')}`;
    await db.query('INSERT INTO factura(id_venta,folio) VALUES($1,$2)',[v.id_venta,folio]);
    await db.query('COMMIT');
    res.status(201).json({id_venta:v.id_venta,folio,total:total/100});
  } catch(e) { await db.query('ROLLBACK'); throw e; }
});
ruta('post','/api/cuestionarios',async(req,res)=>{
  const b=req.body;
  if(!b || typeof b.nombre_comercial!=='string' || !b.nombre_comercial.trim() || b.nombre_comercial.length>120 || typeof b.telefono!=='string' || b.telefono.length>25 || typeof b.correo!=='string' || b.correo.length>190 || !Array.isArray(b.productos) || !b.productos.length || b.productos.length>100) throw error400('Revisa los datos del proveedor.');
  for(const p of b.productos) if(!p || typeof p.nombre!=='string' || !p.nombre.trim() || !Number.isFinite(Number(p.precio_unitario)) || Number(p.precio_unitario)<0) throw error400('Revisa los nombres y precios de los productos.');
  await db.query('BEGIN');
  try {
    const proveedor=(await db.query('INSERT INTO proveedor(nombre,telefono,correo) VALUES($1,$2,$3) RETURNING id_proveedor',[b.nombre_comercial.trim(),b.telefono,b.correo])).rows[0];
    const q=(await db.query('INSERT INTO cuestionario_proveedor(id_proveedor,respuestas) VALUES($1,$2::jsonb) RETURNING id_cuestionario',[proveedor.id_proveedor,JSON.stringify(b)])).rows[0];
    await db.query('COMMIT');res.status(201).json(q);
  }catch(e){await db.query('ROLLBACK');throw e;}
});
ruta('get','/api/proveedores',async(req,res)=>res.json((await db.query('SELECT p.*,q.id_cuestionario,q.fecha FROM proveedor p LEFT JOIN cuestionario_proveedor q USING(id_proveedor) ORDER BY p.id_proveedor DESC')).rows));
app.use((e,req,res,next)=>{ console.error(e.message);res.status(e.status||500).json({error:e.status?e.message:'No se pudo completar la operación.'}); });
db.iniciar().then(async()=>{
 if(process.env.SONICLOTHES_DEMO==='1')await require('./demo').preparar(db);
 const server=app.listen(process.env.PORT||3000,'127.0.0.1',()=>console.log(`SoniClothes listo: http://localhost:${process.env.PORT||3000}/login.html`));
 async function terminar(){server.close();try{await db.cerrar();}finally{process.exit(0);}}
 process.on('SIGTERM',terminar);process.on('SIGINT',terminar);
}).catch(e=>{console.error('No se pudo iniciar:',e.message);process.exit(1);});
