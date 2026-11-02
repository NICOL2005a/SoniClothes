const fs = require('fs');
const path = require('path');
require('dotenv').config();
let driver;
let pool;
let cola = Promise.resolve();
function exclusive(fn) {
  const result = cola.then(fn);
  cola = result.catch(() => {});
  return result;
}
async function iniciar() {
  if (process.env.DB_MODE === 'postgres') {
    const { Pool } = require('pg');
    pool = new Pool();
    driver = await pool.connect();
  } else {
    const { PGlite } = require('@electric-sql/pglite');
    driver = new PGlite(process.env.DEMO_DATA_DIR || path.join(__dirname,'datos'));
    await driver.waitReady;
  }
  const archivos = ['01_esquema.sql','02_cuestionario.sql','04_accesos.sql','05_solicitudes.sql','06_tienda.sql','07_fotos.sql','08_revision.sql','09_solicitud_pago.sql'];
  if (process.env.SONICLOTHES_DEMO === '1') {
    if (process.env.DB_MODE === 'postgres') throw new Error('Las cuentas demo solo se permiten en la base integrada.');
    archivos.push('03_datos_demo.sql');
  }
  for (const archivo of archivos) {
    const sql = fs.readFileSync(path.join(__dirname,archivo),'utf8');
    if (driver.exec) await driver.exec(sql); else await driver.query(sql);
  }
}
module.exports = { iniciar, exclusive, query: (sql,params=[]) => driver.query(sql,params), cerrar: async () => {
  if (!driver) return;
  if (driver.close) await driver.close();
  else { driver.release(); await pool.end(); }
  driver = null;
} };
