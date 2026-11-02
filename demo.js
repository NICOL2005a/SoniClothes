const {hashPassword}=require('./acceso');
async function preparar(db){
 if(process.env.DB_MODE==='postgres'||process.env.SONICLOTHES_DEMO!=='1')throw Error('Demostración no autorizada.');
 const cliente=(await db.query("SELECT id_cliente FROM cliente WHERE correo='daniel@example.com'")).rows[0];
 const proveedor=(await db.query("SELECT id_proveedor FROM proveedor WHERE correo='norte@example.com'")).rows[0];
 const cuentas=[
  ['Administración demo','admin.demo','administrador',null,null,'SoniDemo!2026-Admin'],
  ['Daniel Ejemplo','cliente.demo','cliente',cliente.id_cliente,null,'SoniDemo!2026-Cliente'],
  ['Textiles Norte','proveedor.demo','proveedor',null,proveedor.id_proveedor,'SoniDemo!2026-Proveedor']
 ];
 for(const [nombre,usuario,rol,idc,idp,password]of cuentas){
  await db.query('INSERT INTO usuario(nombre,nombre_usuario,hash_contrasena,rol,id_cliente,id_proveedor) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING',[nombre,usuario,await hashPassword(password),rol,idc,idp]);
 }
}
module.exports={preparar};
