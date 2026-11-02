const {hashPassword,roles}=require('./acceso');
function instalar(app,db,limited){
 app.post('/api/registro',limited,async(req,res,next)=>{
  const b=req.body||{};
  const nombre=String(b.nombre||'').trim(),usuario=String(b.usuario||'').trim(),correo=String(b.correo||'').trim().toLowerCase();
  if(!roles.includes(b.rol)||!nombre||nombre.length>120||!(/^[a-zA-Z0-9._-]{3,60}$/).test(usuario)||!(/^[^\s@]+@[^\s@]+\.[^\s@]+$/).test(correo)||correo.length>190||typeof b.contrasena!=='string'||b.contrasena.length<12||b.contrasena.length>128||typeof b.confirmacion!=='string'||b.confirmacion!==b.contrasena)
   return res.status(400).json({error:'Revisa los datos. La contraseña debe tener de 12 a 128 caracteres y coincidir con su confirmación.'});
  const telefono=typeof b.telefono==='string'?b.telefono.trim():'';
  const comercial=typeof b.nombre_comercial==='string'?b.nombre_comercial.trim():'';
  if(telefono.length>25||comercial.length>120||(b.rol==='proveedor'&&!comercial))return res.status(400).json({error:'Agrega el nombre comercial del proveedor y revisa sus datos.'});
  try {
   const hash=await hashPassword(b.contrasena);
   const result=await db.exclusive(async()=>{
    await db.query('BEGIN');
    try {
     const repetido=await db.query("SELECT 1 FROM usuario WHERE nombre_usuario=$1 OR lower(correo)=$2 UNION ALL SELECT 1 FROM solicitud_acceso WHERE estado='pendiente' AND (nombre_usuario=$1 OR lower(correo)=$2)",[usuario,correo]);
     if(repetido.rows.length){await db.query('ROLLBACK');return null;}
     if(b.rol==='cliente'){
      // Un registro nuevo evita atribuir compras antiguas por coincidencia de correo.
      const c=(await db.query('INSERT INTO cliente(nombre,telefono,correo) VALUES($1,$2,$3) RETURNING id_cliente',[nombre,telefono||null,correo])).rows[0];
      const u=(await db.query("INSERT INTO usuario(nombre,nombre_usuario,correo,hash_contrasena,rol,id_cliente) VALUES($1,$2,$3,$4,'cliente',$5) RETURNING id_usuario,nombre,rol",[nombre,usuario,correo,hash,c.id_cliente])).rows[0];
      await db.query('COMMIT');return {usuario:u};
     }
     await db.query('INSERT INTO solicitud_acceso(nombre,nombre_usuario,correo,telefono,nombre_comercial,hash_contrasena,rol) VALUES($1,$2,$3,$4,$5,$6,$7)',[nombre,usuario,correo,telefono||null,comercial||null,hash,b.rol]);
     await db.query('COMMIT');return {pendiente:true};
    }catch(e){await db.query('ROLLBACK');throw e;}
   });
   if(!result)return res.status(409).json({error:'El usuario o correo ya tiene una cuenta o solicitud pendiente.'});
   if(result.usuario){req.crearSesion(result.usuario);return res.status(201).json({ok:true,estado:'activa',destino:'/cliente.html'});}
   res.status(202).json({ok:true,estado:'pendiente',mensaje:'Recibimos tu solicitud. La administración de SoniClothes debe aprobarla antes de que puedas entrar.'});
  }catch(e){if(e.code==='23505')return res.status(409).json({error:'El usuario o correo ya está registrado.'});next(e);}
 });
}
function instalarAdministracion(app,db,ruta){
 ruta('get','/api/solicitudes',async(req,res)=>res.json((await db.query("SELECT id_solicitud,nombre,nombre_usuario,correo,telefono,nombre_comercial,rol,estado,fecha,revisada_en FROM solicitud_acceso ORDER BY CASE WHEN estado='pendiente' THEN 0 ELSE 1 END,fecha DESC LIMIT 200")).rows));
 ruta('post','/api/solicitudes/:id/decision',async(req,res)=>{
  if(!/^\d+$/.test(req.params.id)||!['aprobar','rechazar'].includes(req.body?.decision))return res.status(400).json({error:'Solicitud inválida.'});
  await db.query('BEGIN');
  try{
   const s=(await db.query('SELECT * FROM solicitud_acceso WHERE id_solicitud=$1 FOR UPDATE',[req.params.id])).rows[0];
   if(!s){await db.query('ROLLBACK');return res.status(404).json({error:'Solicitud no encontrada.'});}
   if(s.estado!=='pendiente'){await db.query('ROLLBACK');return res.status(409).json({error:'Esta solicitud ya fue revisada.'});}
   let idUsuario=null;
   if(req.body.decision==='aprobar'){
    let idProveedor=null;
    if(s.rol==='proveedor'){
     if(req.body.id_proveedor){
      if(!/^\d+$/.test(String(req.body.id_proveedor)))throw Object.assign(Error('Proveedor inválido.'),{status:400});
      const p=await db.query('SELECT id_proveedor FROM proveedor WHERE id_proveedor=$1',[req.body.id_proveedor]);
      if(!p.rows.length)throw Object.assign(Error('Proveedor no encontrado.'),{status:400});
      idProveedor=p.rows[0].id_proveedor;
     }else{
      idProveedor=(await db.query('INSERT INTO proveedor(nombre,telefono,correo) VALUES($1,$2,$3) RETURNING id_proveedor',[s.nombre_comercial||s.nombre,s.telefono,s.correo])).rows[0].id_proveedor;
     }
    }
    idUsuario=(await db.query('INSERT INTO usuario(nombre,nombre_usuario,correo,hash_contrasena,rol,id_proveedor) VALUES($1,$2,$3,$4,$5,$6) RETURNING id_usuario',[s.nombre,s.nombre_usuario,s.correo,s.hash_contrasena,s.rol,idProveedor])).rows[0].id_usuario;
   }
   await db.query('UPDATE solicitud_acceso SET estado=$1,revisada_en=CURRENT_TIMESTAMP,revisada_por=$2,id_usuario_creado=$3 WHERE id_solicitud=$4',[req.body.decision==='aprobar'?'aprobada':'rechazada',req.usuario.id_usuario,idUsuario,s.id_solicitud]);
   await db.query('COMMIT');res.json({ok:true,estado:req.body.decision==='aprobar'?'aprobada':'rechazada'});
  }catch(e){await db.query('ROLLBACK');if(e.code==='23505')return res.status(409).json({error:'La cuenta o proveedor ya tiene un acceso asignado. Revisa los registros antes de aprobar.'});throw e;}
 });
}
module.exports={instalar,instalarAdministracion};
