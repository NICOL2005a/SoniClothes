CREATE TABLE IF NOT EXISTS propuesta_prenda (
 id_producto BIGINT PRIMARY KEY REFERENCES producto(id_producto),
 id_proveedor BIGINT NOT NULL REFERENCES proveedor(id_proveedor),
 id_cuestionario BIGINT NOT NULL REFERENCES cuestionario_proveedor(id_cuestionario),
 estado TEXT NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente','aprobada','rechazada')),
 revisada_por BIGINT REFERENCES usuario(id_usuario),
 revisada_en TIMESTAMPTZ
);
ALTER TABLE detalle_venta ADD COLUMN IF NOT EXISTS proveedor_atribuido BIGINT REFERENCES proveedor(id_proveedor);
