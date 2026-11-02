const error = (message, status = 400) => Object.assign(new Error(message), {status});
const clean = (value, max) => typeof value === 'string' ? value.trim().slice(0,max) : '';
const opciones = (values, max) => Array.isArray(values) ? [...new Set(values.map(v=>clean(v,max)).filter(Boolean))] : [];

function instalar(db, ruta) {
 ruta('post','/api/cuestionarios',async(req,res)=>{
  const data=req.body;
  if(!Array.isArray(data?.productos)||!data.productos.length||data.productos.length>100)
   throw error('Agrega entre 1 y 100 prendas.');
  const prendas=data.productos.map(p=>{
   const nombre=clean(p?.nombre,160), categoria=clean(p?.categoria,120);
   const tallas=opciones(p?.tallas,25), colores=opciones(p?.colores,60);
   const precio=Number(p?.precio_unitario), stock=Number(p?.existencias);
   if(!nombre||!categoria||!tallas.length||!colores.length||tallas.length*colores.length>200||
      !Number.isFinite(precio)||precio<0.01||precio>9999999999||
      p?.existencias===''||p?.existencias==null||!Number.isSafeInteger(stock)||stock<0||stock>1000000)
    throw error('Revisa categoría, tallas, colores, precio y existencias de cada prenda.');
   return {nombre,categoria,tallas,colores,precio,stock,descripcion:clean(p.descripcion,500)};
  });
  const proveedor=req.usuario.id_proveedor;
  await db.query('BEGIN');
  try{
   const cuestionario=(await db.query('INSERT INTO cuestionario_proveedor(id_proveedor,respuestas) VALUES($1,$2::jsonb) RETURNING id_cuestionario',[proveedor,JSON.stringify(data)])).rows[0];
   for(const prenda of prendas){
    const categoria=(await db.query('INSERT INTO categoria(nombre) VALUES($1) ON CONFLICT(nombre) DO UPDATE SET nombre=EXCLUDED.nombre RETURNING id_categoria',[prenda.categoria])).rows[0];
    const producto=(await db.query('INSERT INTO producto(id_categoria,nombre,descripcion,precio_venta) VALUES($1,$2,$3,$4) RETURNING id_producto',[categoria.id_categoria,prenda.nombre,prenda.descripcion,prenda.precio])).rows[0];
    const id=producto.id_producto;
    await db.query('INSERT INTO proveedor_producto VALUES($1,$2)',[proveedor,id]);
    await db.query('INSERT INTO propuesta_prenda(id_producto,id_proveedor,id_cuestionario) VALUES($1,$2,$3)',[id,proveedor,cuestionario.id_cuestionario]);
    const variantes=prenda.tallas.flatMap(talla=>prenda.colores.map(color=>({talla,color})));
    for(const [index,{talla,color}] of variantes.entries()){
     const variante=(await db.query('INSERT INTO variante_producto(id_producto,talla,color) VALUES($1,$2,$3) RETURNING id_variante',[id,talla,color])).rows[0];
     const existencia=Math.floor(prenda.stock/variantes.length)+(index<prenda.stock%variantes.length?1:0);
     await db.query('INSERT INTO inventario(id_variante,existencia) VALUES($1,$2)',[variante.id_variante,existencia]);
    }
   }
   await db.query('COMMIT');
   res.status(201).json(cuestionario);
  }catch(e){await db.query('ROLLBACK');throw e;}
 });

 ruta('get','/api/revision',async(req,res)=>res.json((await db.query(`
  SELECT p.id_producto,COALESCE(r.estado,CASE WHEN ca.id_producto IS NULL THEN 'sin publicar' ELSE 'publicada' END) AS estado,
    pr.nombre AS proveedor,p.nombre,p.precio_venta,p.descripcion,c.nombre AS categoria,
    (SELECT string_agg(v.talla||' / '||v.color||': '||i.existencia, ', ' ORDER BY v.id_variante)
     FROM variante_producto v JOIN inventario i USING(id_variante) WHERE v.id_producto=p.id_producto) AS variantes,
    CASE WHEN f.id_producto IS NOT NULL THEN '/fotos/'||pp.id_proveedor||'/'||p.id_producto END AS foto
  FROM proveedor_producto pp JOIN producto p USING(id_producto) JOIN categoria c USING(id_categoria)
  JOIN proveedor pr USING(id_proveedor)
  LEFT JOIN propuesta_prenda r ON r.id_producto=p.id_producto AND r.id_proveedor=pp.id_proveedor
  LEFT JOIN catalogo ca ON ca.id_producto=p.id_producto
  LEFT JOIN foto_prenda f ON f.id_proveedor=pp.id_proveedor AND f.id_producto=p.id_producto
  ORDER BY (r.estado='pendiente') DESC NULLS LAST,p.id_producto DESC
 `)).rows));

 ruta('post','/api/revision/:id',async(req,res)=>{
  if(!['aprobada','rechazada'].includes(req.body?.estado))throw error('Decisión inválida.');
  await db.query('BEGIN');
  try{
   const result=await db.query(`UPDATE propuesta_prenda SET estado=$2,revisada_por=$3,revisada_en=CURRENT_TIMESTAMP
      WHERE id_producto=$1 AND estado='pendiente' RETURNING id_producto`,[req.params.id,req.body.estado,req.usuario.id_usuario]);
   if(!result.rows.length)throw error('La prenda ya fue revisada o no existe.',409);
   if(req.body.estado==='aprobada')await db.query('INSERT INTO catalogo(id_producto) VALUES($1) ON CONFLICT(id_producto) DO NOTHING',[req.params.id]);
   await db.query('COMMIT');res.json({estado:req.body.estado});
  }catch(e){await db.query('ROLLBACK');throw e;}
 });

 ruta('get','/api/directorio',async(req,res)=>res.json({
  proveedores:(await db.query('SELECT nombre,correo,telefono FROM proveedor ORDER BY nombre')).rows,
  clientes:(await db.query('SELECT nombre,correo,telefono FROM cliente ORDER BY nombre')).rows,
  administradores:(await db.query("SELECT nombre,correo,nombre_usuario FROM usuario WHERE rol='administrador' ORDER BY nombre")).rows
 }));

 ruta('get','/api/ingresos',async(req,res)=>res.json((await db.query(`
  SELECT f.folio,v.fecha,COALESCE(pr.nombre,'Sin atribución') AS proveedor,
    SUM(d.cantidad*d.precio_unitario) AS importe,(s.id_venta IS NOT NULL) AS simulada
  FROM venta v JOIN detalle_venta d USING(id_venta) LEFT JOIN venta_simulada s USING(id_venta)
  LEFT JOIN proveedor pr ON pr.id_proveedor=d.proveedor_atribuido
  LEFT JOIN factura f USING(id_venta)
  GROUP BY v.id_venta,v.fecha,f.folio,pr.id_proveedor,pr.nombre,s.id_venta ORDER BY v.fecha DESC,pr.nombre
 `)).rows));
}
module.exports={instalar};
