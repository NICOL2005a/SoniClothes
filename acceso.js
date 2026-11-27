const { randomBytes, scrypt, timingSafeEqual } = require('node:crypto');
const { promisify } = require('node:util');
const { Algorithm, Version, hash: hashArgon2, verify: verifyArgon2 } = require('@node-rs/argon2');

const deriveScrypt = promisify(scrypt);
const scryptFormat = /^scrypt:([0-9a-fA-F]{32}):([0-9a-fA-F]{64})$/;
const argon2Options = {
  algorithm: Algorithm.Argon2id,
  version: Version.V0x13,
  memoryCost: 19 * 1024,
  timeCost: 2,
  parallelism: 1,
  outputLen: 32
};

const roles = ['cliente', 'proveedor', 'administrador'];
const destinos = {cliente:'/tienda.html',proveedor:'/proveedor.html',administrador:'/ventas.html'};

function hashPassword(password) {
  return hashArgon2(password, { ...argon2Options, salt: randomBytes(16) });
}

async function verifyPassword(password, hash) {
  const stored = hash || '';
  if (stored.startsWith('$argon2id$')) {
    try {
      return await verifyArgon2(stored, password);
    } catch (error) {
      if (error.code !== 'InvalidArg') throw error;
    }
  }

  const legacy = scryptFormat.exec(stored);
  if (legacy) {
    const [, salt, digest] = legacy;
    // La implementación anterior pasaba la sal hexadecimal como texto a scrypt.
    const actual = await deriveScrypt(password, salt, 32);
    return timingSafeEqual(actual, Buffer.from(digest, 'hex'));
  }

  // Una cuenta inexistente o sin un hash válido también requiere trabajo criptográfico.
  await hashPassword(password);
  return false;
}

module.exports={roles,destinos,hashPassword,verifyPassword};
