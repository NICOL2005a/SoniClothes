CREATE TABLE IF NOT EXISTS carrito_item (
 id_usuario BIGINT NOT NULL REFERENCES usuario(id_usuario) ON DELETE CASCADE,
 id_variante BIGINT NOT NULL REFERENCES variante_producto(id_variante) ON DELETE RESTRICT,
 cantidad INTEGER NOT NULL CHECK(cantidad BETWEEN 1 AND 100),
 PRIMARY KEY(id_usuario,id_variante)
);
CREATE TABLE IF NOT EXISTS venta_simulada (
 id_venta BIGINT PRIMARY KEY REFERENCES venta(id_venta) ON DELETE RESTRICT,
 id_usuario BIGINT NOT NULL REFERENCES usuario(id_usuario) ON DELETE RESTRICT,
 id_solicitud UUID NOT NULL,
 fecha TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE(id_usuario,id_solicitud)
);
INSERT INTO metodo_pago(nombre) VALUES('Tarjeta simulada') ON CONFLICT(nombre) DO NOTHING;
