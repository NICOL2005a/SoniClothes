function instalar(app, db, express) {
  app.put('/api/portal/proveedor/foto/:producto', express.raw({
    type: ['image/jpeg', 'image/png'],
    limit: '3mb'
  }), async (req, res, next) => {
    if (req.usuario.rol !== 'proveedor') return res.sendStatus(403);
    const { producto } = req.params;
    if (!/^\d{1,18}$/.test(producto)) return res.status(400).json({error:'Producto inválido.'});
    const bytes = req.body;
    const jpeg = Buffer.isBuffer(bytes) && bytes.length > 4 &&
      bytes.subarray(0, 3).equals(Buffer.from([255, 216, 255])) &&
      bytes.subarray(-2).equals(Buffer.from([255, 217]));
    const png = Buffer.isBuffer(bytes) && bytes.length > 24 &&
      bytes.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'));
    const mime = jpeg ? 'image/jpeg' : png ? 'image/png' : null;
    if (!mime || !req.is(mime)) return res.status(400).json({error:'Selecciona una foto JPEG o PNG válida.'});
    try {
      const result = await db.exclusive(() => db.query(`
        INSERT INTO foto_prenda (id_proveedor,id_producto,contenido,mime)
        SELECT id_proveedor,id_producto,$3,$4 FROM proveedor_producto
        WHERE id_proveedor=$1 AND id_producto=$2
        ON CONFLICT (id_proveedor,id_producto) DO UPDATE
        SET contenido=EXCLUDED.contenido,mime=EXCLUDED.mime
        RETURNING id_producto
      `, [req.usuario.id_proveedor, producto, bytes, mime]));
      if (!result.rows.length) return res.status(404).json({error:'La prenda no está vinculada a tu negocio.'});
      res.json({foto:`/fotos/${req.usuario.id_proveedor}/${producto}`});
    } catch (error) { next(error); }
  });

  app.get('/fotos/:proveedor/:producto', async (req, res, next) => {
    const { proveedor, producto } = req.params;
    if (![proveedor, producto].every(id => /^\d{1,18}$/.test(id))) return res.sendStatus(404);
    if (req.usuario.rol === 'proveedor' && String(req.usuario.id_proveedor) !== proveedor) return res.sendStatus(404);
    try {
      const result = await db.exclusive(() => db.query(
        'SELECT contenido,mime FROM foto_prenda WHERE id_proveedor=$1 AND id_producto=$2 AND ($3 OR EXISTS(SELECT 1 FROM catalogo WHERE id_producto=$2))',
        [proveedor, producto, req.usuario.rol !== 'cliente']
      ));
      const foto = result.rows[0];
      if (!foto) return res.sendStatus(404);
      res.type(foto.mime).send(Buffer.from(foto.contenido));
    } catch (error) { next(error); }
  });
}
module.exports = { instalar };
