const { randomBytes, scrypt, timingSafeEqual } = require('node:crypto');
const { promisify } = require('node:util');
const derive = promisify(scrypt);
const roles = ['cliente', 'proveedor', 'administrador'];
const destinos = {cliente:'/cliente.html',proveedor:'/proveedor.html',administrador:'/ventas.html'};
async function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  return `scrypt:${salt}:${(await derive(password,salt,32)).toString('hex')}`;
}
async function verifyPassword(password,hash) {
  const [kind,salt,hex] = String(hash || '').split(':');
  const valid = kind === 'scrypt' && /^[a-f0-9]{32}$/i.test(salt||'') && /^[a-f0-9]{64}$/i.test(hex||'');
  const actual = await derive(password, valid ? salt : '00000000000000000000000000000000',32);
  return valid && timingSafeEqual(actual,Buffer.from(hex,'hex'));
}
module.exports={roles,destinos,hashPassword,verifyPassword};
