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
  const lectura=['/api/directorio','/api/ingresos','/api/revision','/api/solicitudes','/api/proveedores'];
  const permitido=req.method==='GET'&&lectura.includes(req.path) ||
    req.method==='POST'&&/^\/api\/(revision\/\d+|solicitudes\/\d+\/decision)$/.test(req.path);
  if(req.path.startsWith('/api/')&&!permitido)return res.status(403).json({error:'Esta operación no corresponde a Administración.'});
  if(['/proveedores.html','/catalogo.html','/tienda.html','/carrito.html','/pago.html','/cliente.html','/proveedor.html'].includes(req.path))return res.redirect('/ventas.html');
  return next();
 }
 if(rol==='proveedor' && ((req.method==='GET'&&['/proveedores.html','/supplier.css'].includes(req.path)) ||
  (req.method==='POST'&&req.path==='/api/cuestionarios')))return next();
 const assets=['/portal.css','/portal.js','/app.css','/app-shell.js','/tienda.css','/tienda.js'];
 const api=rol==='cliente'?/^\/api\/portal\/cliente(?:\/ventas\/\d+|\/catalogo|\/carrito|\/checkout)?$/:/^\/api\/portal\/proveedor$/;
 const paginasCliente=['/tienda.html','/carrito.html','/pago.html'];
 if((req.method==='GET' && /^\/fotos\/\d+\/\d+$/.test(req.path))||(rol==='proveedor' && req.method==='PUT' && /^\/api\/portal\/proveedor\/foto\/\d+$/.test(req.path)))return next();
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
  productos:(await db.query(`SELECT p.id_producto,p.nombre,p.marca,c.nombre AS categoria, COALESCE(r.estado,'publicada') AS estado, CASE WHEN f.id_producto IS NOT NULL THEN '/fotos/'||pp.id_proveedor||'/'||p.id_producto END AS foto FROM proveedor_producto pp JOIN producto p USING(id_producto) JOIN categoria c USING(id_categoria) LEFT JOIN propuesta_prenda r ON r.id_producto=p.id_producto LEFT JOIN foto_prenda f ON f.id_producto=p.id_producto AND f.id_proveedor=pp.id_proveedor WHERE pp.id_proveedor=$1 ORDER BY p.nombre`,[req.usuario.id_proveedor])).rows,
  cuestionarios:(await db.query('SELECT id_cuestionario,fecha FROM cuestionario_proveedor WHERE id_proveedor=$1 ORDER BY fecha DESC',[req.usuario.id_proveedor])).rows
 })));}catch(e){next(e);}
});
const ruta = (method,url,fn) => app[method](url,async(req,res,next)=>{
  try { await db.exclusive(()=>fn(req,res)); } catch(e) { next(e); }
});
require('./registro').instalarAdministracion(app,db,ruta);
require('./fotos').instalar(app,db,express);
require('./tienda').instalar(app,db,ruta);
require('./revision').instalar(db,ruta);
ruta('get','/api/proveedores',async(req,res)=>res.json((await db.query('SELECT p.*,q.id_cuestionario,q.fecha FROM proveedor p LEFT JOIN cuestionario_proveedor q USING(id_proveedor) ORDER BY p.id_proveedor DESC')).rows));
app.use((e,req,res,next)=>{ console.error(e.message);res.status(e.status||500).json({error:e.status?e.message:'No se pudo completar la operación.'}); });
db.iniciar().then(async()=>{
 if(process.env.SONICLOTHES_DEMO==='1')await require('./demo').preparar(db);
 const server=app.listen(process.env.PORT||3000,'127.0.0.1',()=>console.log(`SoniClothes listo: http://localhost:${process.env.PORT||3000}/login.html`));
 async function terminar(){server.close();try{await db.cerrar();}finally{process.exit(0);}}
 process.on('SIGTERM',terminar);process.on('SIGINT',terminar);
}).catch(e=>{console.error('No se pudo iniciar:',e.message);process.exit(1);});
