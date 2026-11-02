BEGIN;

-- Las cuentas antiguas conservan sus datos y quedan pendientes de asignación.
-- No se concede administración automáticamente a ninguna cuenta existente.
ALTER TABLE usuario ADD COLUMN IF NOT EXISTS rol VARCHAR(20);
ALTER TABLE usuario ADD COLUMN IF NOT EXISTS id_cliente BIGINT REFERENCES cliente(id_cliente) ON DELETE RESTRICT;
ALTER TABLE usuario ADD COLUMN IF NOT EXISTS id_proveedor BIGINT REFERENCES proveedor(id_proveedor) ON DELETE RESTRICT;
ALTER TABLE usuario ADD COLUMN IF NOT EXISTS activo BOOLEAN NOT NULL DEFAULT TRUE;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='chk_usuario_acceso') THEN
    ALTER TABLE usuario ADD CONSTRAINT chk_usuario_acceso CHECK (
      (rol IS NULL AND id_cliente IS NULL AND id_proveedor IS NULL) OR
      (rol IS NOT NULL AND (
        (rol='administrador' AND id_cliente IS NULL AND id_proveedor IS NULL) OR
        (rol='cliente' AND id_cliente IS NOT NULL AND id_proveedor IS NULL) OR
        (rol='proveedor' AND id_proveedor IS NOT NULL AND id_cliente IS NULL)
      ))
    );
  END IF;
END $$;
CREATE UNIQUE INDEX IF NOT EXISTS uq_usuario_cliente ON usuario(id_cliente) WHERE id_cliente IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_usuario_proveedor ON usuario(id_proveedor) WHERE id_proveedor IS NOT NULL;
COMMIT;
