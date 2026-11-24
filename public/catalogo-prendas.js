'use strict';

function agruparPrendas(variantes, { categoria = '', q = '' } = {}) {
 const busqueda = q.toLocaleLowerCase('es');
 const grupos = new Map();
 for (const variante of variantes) {
  const { id_producto, producto, marca } = variante;
  if (categoria && variante.categoria !== categoria) continue;
  if (!`${producto} ${variante.categoria} ${marca || ''}`.toLocaleLowerCase('es').includes(busqueda)) continue;
  if (!grupos.has(id_producto)) grupos.set(id_producto, []);
  grupos.get(id_producto).push(variante);
 }
 return [...grupos.values()];
}

if (typeof module !== 'undefined') module.exports = { agruparPrendas };
