const fail=(message,status=400)=>Object.assign(Error(message),{status});
const idValido=id=>/^\d+$/.test(String(id));
async function cart(db,user){
 const items=(await db.query('SELECT c.id_variante,c.cantidad,p.id_producto,p.nombre,p.precio_venta,p.marca,v.talla,v.color,COALESCE(i.existencia,0) AS existencia FROM carrito_item c JOIN variante_producto v USING(id_variante) JOIN producto p USING(id_producto) LEFT JOIN inventario i USING(id_variante) WHERE c.id_usuario=$1 ORDER BY p.nombre,v.id_variante',[user])).rows;
 const totalCentavos=items.reduce((s,p)=>s+Math.round(Number(p.precio_venta)*100)*p.cantidad,0);
 return {items,total:totalCentavos/100,unidades:items.reduce((s,p)=>s+p.cantidad,0)};
}
function instalar(app,db,ruta){
 ruta('get','/api/portal/cliente/catalogo',async(req,res)=>res.json((await db.query('SELECT id_producto,id_variante,producto,marca,descripcion,precio_venta,categoria,talla,color,COALESCE(existencia,0) AS existencia FROM vista_catalogo_prendas ORDER BY id_producto,id_variante')).rows));
 ruta('get','/api/portal/cliente/carrito',async(req,res)=>res.json(await cart(db,req.usuario.id_usuario)));
 ruta('post','/api/portal/cliente/carrito',async(req,res)=>{
  const {id_variante,cantidad}=req.body||{};
  if(!idValido(id_variante)||!Number.isSafeInteger(cantidad)||cantidad<0||cantidad>100)throw fail('Revisa la variante y la cantidad (de 0 a 100).');
  await db.query('BEGIN');
  try {
  await db.query('SELECT id_usuario FROM usuario WHERE id_usuario=$1 FOR UPDATE',[req.usuario.id_usuario]);
  if(cantidad===0){await db.query('DELETE FROM carrito_item WHERE id_usuario=$1 AND id_variante=$2',[req.usuario.id_usuario,id_variante]);}
  else {
   const p=(await db.query('SELECT existencia FROM vista_catalogo_prendas WHERE id_variante=$1',[id_variante])).rows[0];
   if(!p)throw fail('Esta prenda ya no está disponible.',404);
   if(Number(p.existencia)<cantidad)throw fail('No quedan suficientes unidades de esta talla y color.',409);
   await db.query('INSERT INTO carrito_item(id_usuario,id_variante,cantidad) VALUES($1,$2,$3) ON CONFLICT(id_usuario,id_variante) DO UPDATE SET cantidad=EXCLUDED.cantidad',[req.usuario.id_usuario,id_variante,cantidad]);
  }
  const result=await cart(db,req.usuario.id_usuario);
  await db.query('COMMIT');res.json(result);
  }catch(e){await db.query('ROLLBACK');throw e;}
 });
 ruta('post','/api/portal/cliente/checkout',async(req,res)=>{
  const b=req.body||{};
  if(!['aprobado','rechazado'].includes(b.escenario)||!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(b.id_solicitud||''))throw fail('Solicitud de pago simulado inválida.');
  // Nunca se reciben, registran ni procesan datos de una tarjeta real.
  if(Object.keys(b).some(k=>!['escenario','id_solicitud'].includes(k)))throw fail('Esta demostración solo acepta un escenario de prueba, sin datos de tarjeta.');
  const user=req.usuario.id_usuario;
  await db.query('BEGIN');
  try {
   // Serializa cobros de una misma cuenta también en PostgreSQL externo.
   await db.query('SELECT id_usuario FROM usuario WHERE id_usuario=$1 FOR UPDATE',[user]);
   const anterior=(await db.query('SELECT s.id_venta,f.folio,v.total FROM venta_simulada s JOIN vista_venta_total v USING(id_venta) JOIN factura f USING(id_venta) WHERE s.id_usuario=$1 AND s.id_solicitud=$2',[user,b.id_solicitud])).rows[0];
   if(anterior){await db.query('COMMIT');return res.json({...anterior,simulada:true,repetida:true});}
   const c=await cart(db,user);
   if(!c.items.length)throw fail('Tu carrito está vacío. Agrega una prenda antes de continuar.');
   if(c.items.length>100)throw fail('Tu carrito supera el límite de prendas por compra.');
   if(b.escenario==='rechazado'){await db.query('ROLLBACK');return res.status(402).json({error:'Tarjeta de prueba rechazada. El carrito se conserva y no se registró ninguna compra.',simulada:true});}
   if(c.total<=0)throw fail('El total debe ser mayor a cero.');
   const venta=(await db.query('INSERT INTO venta(id_cliente,id_usuario) VALUES($1,$2) RETURNING id_venta',[req.usuario.id_cliente,user])).rows[0];
   for(const item of [...c.items].sort((a,b)=>Number(a.id_variante)-Number(b.id_variante))){
    const updated=await db.query('UPDATE inventario SET existencia=existencia-$1 WHERE id_variante=$2 AND existencia>=$1 RETURNING existencia',[item.cantidad,item.id_variante]);
    if(!updated.rows.length)throw fail('Cambió la disponibilidad. Revisa las tallas y cantidades de tu carrito.',409);
    await db.query('INSERT INTO detalle_venta(id_venta,id_variante,cantidad,precio_unitario) VALUES($1,$2,$3,$4)',[venta.id_venta,item.id_variante,item.cantidad,item.precio_venta]);
   }
   const metodo=(await db.query("SELECT id_metodo_pago FROM metodo_pago WHERE nombre='Tarjeta simulada'")).rows[0];
   await db.query('INSERT INTO pago(id_venta,id_metodo_pago,monto) VALUES($1,$2,$3)',[venta.id_venta,metodo.id_metodo_pago,c.total]);
   const folio='SIM-'+String(venta.id_venta).padStart(6,'0');
   await db.query('INSERT INTO factura(id_venta,folio) VALUES($1,$2)',[venta.id_venta,folio]);
   await db.query('INSERT INTO venta_simulada(id_venta,id_usuario,id_solicitud) VALUES($1,$2,$3)',[venta.id_venta,user,b.id_solicitud]);
   await db.query('DELETE FROM carrito_item WHERE id_usuario=$1',[user]);
   await db.query('COMMIT');res.status(201).json({id_venta:venta.id_venta,folio,total:c.total,simulada:true});
  }catch(e){await db.query('ROLLBACK');throw e;}
 });
}
module.exports={instalar};
