const { agruparPrendas } = require('./public/catalogo-prendas');
const { crearCatalogoWord } = require('./catalogo-word');

const fail=(message,status=400)=>Object.assign(Error(message),{status});
const idValido=id=>(typeof id==='string'||Number.isSafeInteger(id))&&/^\d{1,19}$/.test(String(id))&&BigInt(id)<=9223372036854775807n;
async function tienePagoPendiente(db,user){
 return (await db.query("SELECT 1 FROM solicitud_pago WHERE id_usuario=$1 AND estado='pendiente'",[user])).rows.length>0;
}
async function cart(db,user){
 const items=(await db.query('SELECT c.id_variante,c.cantidad,p.id_producto,p.nombre,p.precio_venta,p.marca,v.talla,v.color,COALESCE(i.existencia,0) AS existencia FROM carrito_item c JOIN variante_producto v USING(id_variante) JOIN producto p USING(id_producto) LEFT JOIN inventario i USING(id_variante) WHERE c.id_usuario=$1 ORDER BY p.nombre,v.id_variante',[user])).rows;
 const totalCentavos=items.reduce((s,p)=>s+Math.round(Number(p.precio_venta)*100)*p.cantidad,0);
 return {items,total:totalCentavos/100,unidades:items.reduce((s,p)=>s+p.cantidad,0),pendiente:await tienePagoPendiente(db,user)};
}
async function guardarCantidad(db,user,id,cantidad){
 await db.query('INSERT INTO carrito_item(id_usuario,id_variante,cantidad) VALUES($1,$2,$3) ON CONFLICT(id_usuario,id_variante) DO UPDATE SET cantidad=EXCLUDED.cantidad',[user,id,cantidad]);
}
function cambioCarrito(body){
 const {id_variante,cantidad}=body||{};
 if(!idValido(id_variante)||!Number.isSafeInteger(cantidad)||cantidad<0||cantidad>100)throw fail('Revisa la variante y la cantidad (de 0 a 100).');
 return {id_variante:String(BigInt(id_variante)),cantidad};
}
async function catalogo(db){
 return (await db.query(`SELECT id_producto,id_variante,producto,marca,descripcion,precio_venta,categoria,talla,color,COALESCE(existencia,0) AS existencia,
 (SELECT string_agg(DISTINCT pr.nombre, ', ' ORDER BY pr.nombre) FROM proveedor_producto pp JOIN proveedor pr USING(id_proveedor) WHERE pp.id_producto=v.id_producto) AS proveedores,
 (SELECT '/fotos/'||f.id_proveedor||'/'||f.id_producto FROM foto_prenda f WHERE f.id_producto=v.id_producto ORDER BY f.id_proveedor LIMIT 1) AS foto
 FROM vista_catalogo_prendas v ORDER BY id_producto,id_variante`)).rows;
}
function instalar(app,db,ruta){
 ruta('get','/api/portal/cliente/catalogo',async(req,res)=>res.json(await catalogo(db)));
 app.get('/api/portal/cliente/catalogo/word', async (req, res, next) => {
  const { categoria = '', q = '' } = req.query;
  if (typeof categoria !== 'string' || typeof q !== 'string') {
   return res.status(400).json({ error: 'Revisa los filtros del catálogo.' });
  }
  try {
   const { prendas, fotos } = await db.exclusive(async () => {
    const prendas = agruparPrendas(await catalogo(db), { categoria, q });
    if (!prendas.length) return { prendas, fotos: [] };
    const ids = prendas.filter(([prenda]) => prenda.foto).map(([prenda]) => prenda.id_producto);
    const fotos = ids.length ? (await db.query(
     `SELECT DISTINCT ON (id_producto) id_producto, contenido, mime
      FROM foto_prenda WHERE id_producto=ANY($1::bigint[])
      ORDER BY id_producto, id_proveedor`, [ids]
    )).rows : [];
    return { prendas, fotos };
   });
   if (!prendas.length) return res.status(404).json({ error: 'No hay prendas que coincidan con estos filtros.' });

   const archivo = await crearCatalogoWord(prendas, fotos);
   res.attachment('Catalogo-SoniClothes.docx').send(archivo);
  } catch (error) { next(error); }
 });
 ruta('get','/api/portal/cliente/carrito',async(req,res)=>{
  const user=req.usuario.id_usuario;
  res.json({...await cart(db,user),cuenta:String(user)});
 });
 ruta('post','/api/portal/cliente/carrito/transferir',async(req,res)=>{
  const user=req.usuario.id_usuario;
  const {cuenta,items}=req.body||{};
  if(cuenta!==String(user))throw fail('Cambió la cuenta activa. Vuelve a entrar para continuar con tu selección.',409);
  if(!Array.isArray(items)||!items.length||items.length>100)throw fail('Revisa las prendas de tu selección.');
  const objetivos=new Map();
  for(const item of items){
   const {id_variante,cantidad}=item||{};
   if(!idValido(id_variante)||!Number.isSafeInteger(cantidad)||cantidad<1||cantidad>200)throw fail('Revisa las cantidades de tu selección.');
   const id=String(BigInt(id_variante));
   if(objetivos.has(id))throw fail('La selección contiene variantes repetidas.');
   objetivos.set(id,cantidad);
  }
  await db.query('BEGIN');
  try{
   await db.query('SELECT id_usuario FROM usuario WHERE id_usuario=$1 FOR UPDATE',[user]);
   const anterior=await cart(db,user);
   if(anterior.pendiente)throw fail('Tu carrito está pendiente de revisión. Consulta Mis compras para poder agregar tu selección.',409);
   const cantidades=new Map(anterior.items.map(item=>[String(item.id_variante),item.cantidad]));
   const {rows}=await db.query('SELECT id_variante,existencia FROM vista_catalogo_prendas WHERE id_variante=ANY($1::bigint[])',[[...objetivos.keys()]]);
   const existencias=new Map(rows.map(item=>[String(item.id_variante),Number(item.existencia)]));
   let ajustado=false;
   for(const [id,objetivo] of objetivos){
    const actual=cantidades.get(id)||0;
    const cantidad=Math.min(objetivo,100,existencias.get(id)||0);
    if(cantidad<objetivo)ajustado=true;
    if(cantidad>actual)await guardarCantidad(db,user,id,cantidad);
   }
   const result=await cart(db,user);
   await db.query('COMMIT');
   res.json({...result,ajustado});
  }catch(error){await db.query('ROLLBACK');throw error;}
 });
 ruta('post','/api/portal/cliente/carrito',async(req,res)=>{
  const {id_variante,cantidad}=cambioCarrito(req.body);
  await db.query('BEGIN');
  try {
  await db.query('SELECT id_usuario FROM usuario WHERE id_usuario=$1 FOR UPDATE',[req.usuario.id_usuario]);
  if(await tienePagoPendiente(db,req.usuario.id_usuario))
   throw fail('Tu carrito está pendiente de revisión. Consulta Mis compras.',409);
  if(cantidad===0){await db.query('DELETE FROM carrito_item WHERE id_usuario=$1 AND id_variante=$2',[req.usuario.id_usuario,id_variante]);}
  else {
   const p=(await db.query('SELECT existencia FROM vista_catalogo_prendas WHERE id_variante=$1',[id_variante])).rows[0];
   if(!p)throw fail('Esta prenda ya no está disponible.',404);
   if(Number(p.existencia)<cantidad)throw fail('No quedan suficientes unidades de esta talla y color.',409);
   await guardarCantidad(db,req.usuario.id_usuario,id_variante,cantidad);
  }
  const result=await cart(db,req.usuario.id_usuario);
  await db.query('COMMIT');res.json(result);
  }catch(e){await db.query('ROLLBACK');throw e;}
 });
 const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
 ruta('get','/api/portal/cliente/pagos',async(req,res)=>{
  const result=await db.query('SELECT id_solicitud,estado,total,fecha FROM solicitud_pago WHERE id_usuario=$1 ORDER BY fecha DESC',[req.usuario.id_usuario]);
  res.json(result.rows);
 });
 ruta('post','/api/portal/cliente/checkout',async(req,res)=>{
  const b=req.body||{};
  if(typeof b.id_solicitud!=='string'||!uuid.test(b.id_solicitud)||Object.keys(b).length!==1)
   throw fail('Solicitud de pago inválida.');
  const user=req.usuario.id_usuario;
  await db.query('BEGIN');
  try {
   await db.query('SELECT id_usuario FROM usuario WHERE id_usuario=$1 FOR UPDATE',[user]);
   const anterior=(await db.query('SELECT id_solicitud,estado,total FROM solicitud_pago WHERE id_usuario=$1 AND id_solicitud=$2',[user,b.id_solicitud])).rows[0];
   if(anterior){await db.query('COMMIT');return res.json(anterior);}
   if(await tienePagoPendiente(db,user))
    throw fail('Ya tienes una solicitud pendiente. Consulta Mis compras.',409);
   const c=await cart(db,user);
   if(!c.items.length||c.items.length>100||c.total<=0)throw fail('Revisa las prendas y el total de tu carrito.');
   if(c.items.some(item=>item.cantidad>item.existencia))throw fail('Cambió la disponibilidad. Revisa tu carrito.',409);
   const solicitud=(await db.query(
    'INSERT INTO solicitud_pago(id_solicitud,id_usuario,id_cliente,items,total) VALUES($1,$2,$3,$4::jsonb,$5) RETURNING id_solicitud,estado,total',
    [b.id_solicitud,user,req.usuario.id_cliente,JSON.stringify(c.items),c.total]
   )).rows[0];
   await db.query('COMMIT');
   res.status(202).json(solicitud);
  }catch(e){await db.query('ROLLBACK');throw e;}
 });
 ruta('get','/api/pagos-pendientes',async(req,res)=>{
  res.json((await db.query(`SELECT p.id_solicitud,p.estado,p.total,p.fecha,p.items,c.nombre AS cliente
   FROM solicitud_pago p JOIN cliente c USING(id_cliente)
   ORDER BY (p.estado='pendiente') DESC,p.fecha DESC`)).rows);
 });
 ruta('post','/api/pagos-pendientes/:id',async(req,res)=>{
  const {id}=req.params;
  const estado=req.body?.estado;
  if(!uuid.test(id)||!['aprobada','rechazada'].includes(estado))throw fail('Decisión inválida.');
  await db.query('BEGIN');
  try {
   const solicitud=(await db.query('SELECT * FROM solicitud_pago WHERE id_solicitud=$1 FOR UPDATE',[id])).rows[0];
   if(!solicitud||solicitud.estado!=='pendiente')throw fail('La solicitud ya fue revisada o no existe.',409);
   if(estado==='rechazada'){
    await db.query("UPDATE solicitud_pago SET estado='rechazada',revisada_por=$2,revisada_en=CURRENT_TIMESTAMP WHERE id_solicitud=$1",[id,req.usuario.id_usuario]);
    await db.query('COMMIT');
    return res.json({estado});
   }
   const venta=(await db.query('INSERT INTO venta(id_cliente,id_usuario) VALUES($1,$2) RETURNING id_venta',[solicitud.id_cliente,solicitud.id_usuario])).rows[0];
   for(const item of [...solicitud.items].sort((a,b)=>Number(a.id_variante)-Number(b.id_variante))){
    const updated=await db.query('UPDATE inventario SET existencia=existencia-$1 WHERE id_variante=$2 AND existencia>=$1 RETURNING existencia',[item.cantidad,item.id_variante]);
    if(!updated.rows.length)throw fail('Cambió la disponibilidad. Puedes rechazar la solicitud para que el cliente ajuste su carrito.',409);
    await db.query('INSERT INTO detalle_venta(id_venta,id_variante,cantidad,precio_unitario,proveedor_atribuido) VALUES($1,$2,$3,$4,(SELECT CASE WHEN COUNT(*)=1 THEN MIN(id_proveedor) END FROM proveedor_producto WHERE id_producto=$5))',[venta.id_venta,item.id_variante,item.cantidad,item.precio_venta,item.id_producto]);
   }
   const metodo=(await db.query("SELECT id_metodo_pago FROM metodo_pago WHERE nombre='Tarjeta simulada'")).rows[0];
   await db.query('INSERT INTO pago(id_venta,id_metodo_pago,monto) VALUES($1,$2,$3)',[venta.id_venta,metodo.id_metodo_pago,solicitud.total]);
   const folio='SIM-'+String(venta.id_venta).padStart(6,'0');
   await db.query('INSERT INTO factura(id_venta,folio) VALUES($1,$2)',[venta.id_venta,folio]);
   await db.query('INSERT INTO venta_simulada(id_venta,id_usuario,id_solicitud) VALUES($1,$2,$3)',[venta.id_venta,solicitud.id_usuario,id]);
   await db.query('DELETE FROM carrito_item WHERE id_usuario=$1',[solicitud.id_usuario]);
   await db.query("UPDATE solicitud_pago SET estado='aprobada',id_venta=$2,revisada_por=$3,revisada_en=CURRENT_TIMESTAMP WHERE id_solicitud=$1",[id,venta.id_venta,req.usuario.id_usuario]);
   await db.query('COMMIT');
   res.json({estado,folio,id_venta:venta.id_venta,total:Number(solicitud.total)});
  }catch(e){await db.query('ROLLBACK');throw e;}
 });
}
module.exports={instalar};
