CREATE TABLE IF NOT EXISTS solicitud_pago (
 id_solicitud UUID PRIMARY KEY,
 id_usuario BIGINT NOT NULL REFERENCES usuario(id_usuario),
 id_cliente BIGINT NOT NULL REFERENCES cliente(id_cliente),
 items JSONB NOT NULL,
 total NUMERIC(14,2) NOT NULL CHECK(total>0),
 estado TEXT NOT NULL DEFAULT 'pendiente' CHECK(estado IN ('pendiente','aprobada','rechazada')),
 fecha TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
 revisada_por BIGINT REFERENCES usuario(id_usuario),
 revisada_en TIMESTAMPTZ,
 id_venta BIGINT REFERENCES venta(id_venta)
);
CREATE UNIQUE INDEX IF NOT EXISTS solicitud_pago_pendiente_usuario ON solicitud_pago(id_usuario) WHERE estado='pendiente';
