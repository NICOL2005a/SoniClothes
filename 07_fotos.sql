CREATE TABLE IF NOT EXISTS foto_prenda (
 id_proveedor BIGINT NOT NULL,
 id_producto BIGINT NOT NULL,
 contenido BYTEA NOT NULL,
 mime TEXT NOT NULL CHECK (mime IN ('image/jpeg','image/png')),
 PRIMARY KEY (id_proveedor,id_producto),
 FOREIGN KEY (id_proveedor,id_producto) REFERENCES proveedor_producto(id_proveedor,id_producto) ON DELETE CASCADE
);
