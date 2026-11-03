# SoniClothes · Acceso y registro

Rediseño en HTML, CSS y JavaScript con registro y autenticación conectados a PostgreSQL/PGlite. Solo modo claro. Las texturas usan CSS y la pantalla no necesita imágenes ni tipografías externas.

Copia de `/Users/nicky/Desktop/WEB/pos_ropa_bootstrap`en cuanto a estructuras. Su base de datos se modifico. `datos/` contiene la copia de la base existente. La demostración usa otra base, `.demo-data/`, para separar las pruebas de tus registros.

## Demostración

Con Node.js 18 o superior, abre una terminal en esta carpeta:

```sh
npm install
npm run demo
```

Abre `http://localhost:3000/login.html`.

| Acceso | Usuario | Contraseña de demostración |
|---|---|---|
| Administrador | admin.demo | SoniDemo!2026-Admin |
| Cliente | cliente.demo | SoniDemo!2026-Cliente |
| Proveedor | proveedor.demo | SoniDemo!2026-Proveedor |

Estas cuentas se crean solo con `npm run demo` sobre la base integrada de demostración. No deben utilizarse en un despliegue real. El servidor escucha únicamente en este equipo.

## Registro y acceso

- **Cliente:** solo datos básicos (nombre, correo, usuario y contraseña). Se crea una cuenta y un registro de cliente vinculado. Entra de inmediato a la tienda, sin aprobación ni documentación. Puede explorar el catálogo, elegir talla y color, guardar su carrito y hacer una compra con pago de tarjeta simulado. No hay cobros bancarios reales.
- **Proveedor:** solicita acceso con su nombre comercial. El administrador recibe la solicitud en **Solicitudes de acceso** y puede aprobar o rechazar. Al aprobar se crea un proveedor o se vincula uno existente que el administrador seleccione. Desde **Agregar prendas**, envía el cuestionario con sus artículos. Las prendas quedan pendientes y puede adjuntar fotos desde **Mi negocio**.
- **Administrador:** las cuentas administrativas se crean desde la terminal. **Punto de venta** muestra el directorio, **Solicitudes** permite revisar accesos de proveedores y **Revisar prendas** permite publicar o rechazar propuestas. **Ingresos** muestra el importe bruto por compra y proveedor.

Las solicitudes se consultan al abrir la bandeja o al pulsar **Actualizar solicitudes**. No se envían correos, SMS ni avisos externos. Tras aprobar, la persona puede entrar con la contraseña elegida; comunícale tu decisión por el medio habitual.

## Cambios en la base

El arranque aplica `04_accesos.sql`, `05_solicitudes.sql` y `06_tienda.sql`, que admiten ejecuciones repetidas:

- `usuario.rol`: cliente, proveedor o administrador.
- `usuario.id_cliente` y `usuario.id_proveedor`: enlace con su registro del negocio.
- `usuario.activo`: permite revocar una cuenta; el servidor lo consulta en cada petición.
- `solicitud_acceso`: solicitud, hash de contraseña, estado, fechas y administrador que la revisó.
- `carrito_item`: cantidades por variante y cuenta de cliente.
- `venta_simulada`: marca compras de prueba, con una clave que evita duplicarlas al reintentar.

La copia conserva los usuarios previos sin asignarles rol, por lo que no pueden acceder hasta una asignación controlada. El registro público crea un cliente nuevo: no vincula compras antiguas únicamente por coincidencia de correo, para evitar atribuir historial ajeno.

## PostgreSQL externo

Copia `.env.example` como `.env`, establece `DB_MODE=postgres` y configura las variables PGHOST, PGPORT, PGDATABASE, PGUSER y PGPASSWORD. Mantén `SONICLOTHES_DEMO=0`. Haz una copia de seguridad antes: el arranque aplicará el esquema y las migraciones. La conexión externa no se ha probado porque el proyecto compartido utiliza PGlite y no aporta una configuración externa activa.

## Archivos principales

- `public/login.html`, `public/login.css`, `public/login.js`: acceso y registro.
- `public/cliente.html`, `public/proveedor.html`, `public/portal.css`, `public/portal.js`: portales privados.
- `public/solicitudes.html`, `public/solicitudes.js`: aprobación de cuentas.
- `acceso.js`, `registro.js`, `servidor.js`: autenticación y autorización.
- `04_accesos.sql`, `05_solicitudes.sql`, `06_tienda.sql`: migraciones.
- `public/app.css` y `public/app-shell.js`: estética y navegación comunes para todos los módulos.
- `public/tienda.html`, `public/carrito.html`, `public/pago.html`, `public/tienda.js` y `public/tienda.css`: compra del cliente.
- `tienda.js`: carrito y pago simulado en el servidor.
- `crear-cuenta.js`: alta local de la primera cuenta administradora.

## Verificación y límites

`npm test` utiliza una base temporal. Comprueba registro inmediato de clientes, aprobación/rechazo, bloqueo de escalada a administrador, aislamiento de datos entre cuentas, sesiones, ventas y reversión de stock. La base original no participa.

Las sesiones se guardan en memoria y se cierran al reiniciar el servidor. La recuperación automática de contraseña no está implementada: la pantalla indica que se contacte con la administración. Las contraseñas usan scrypt y sal aleatoria. Las cookies de sesión son HttpOnly y SameSite=Strict. El servidor valida rol, cuenta activa y propiedad de los datos.

El trabajo se entrega para uso y pruebas locales. Para Internet se necesita alojamiento de Node/PostgreSQL, HTTPS y configuración de origen. APP_ORIGIN fija el origen autorizado. TRUST_PROXY=1 solo se usa detrás de un proxy de confianza.


## Tienda y pago simulado

El cliente entra al catálogo después de iniciar sesión o registrarse. Puede filtrar por categoría, buscar, elegir talla y color y añadir prendas al carrito. El carrito vive en la base, separado por cuenta. Se puede cambiar la cantidad, eliminar prendas y consultar el total antes de pagar.

La pantalla de pago muestra una tarjeta ficticia y permite enviar la compra a revisión. Administración decide el resultado en **Solicitudes → Pagos simulados**. **Mis compras** muestra el estado de cada solicitud.

El carrito queda en espera durante la revisión. Al aprobar, el servidor verifica existencias, registra la compra simulada y vacía el carrito en una transacción. Al rechazar, conserva el carrito y el cliente puede ajustarlo. La migración `09_solicitud_pago.sql` guarda las solicitudes y sus decisiones.

La entrega se presenta como recogida en tienda. No se implementan envíos, compras bancarias reales ni facturación fiscal. Las ilustraciones de las prendas son SVG de referencia, no fotografías de productos.

La nueva migración se aplica automáticamente al iniciar. Usa `npm run demo` para probar en la base separada de demostración o `npm start` para utilizar la copia local de tu base. Reinicia el servidor tras actualizar los archivos JavaScript del servidor.

La migración `08_revision.sql` incorpora la revisión de prendas y guarda el proveedor atribuido en cada detalle de compra nueva. Los importes son brutos. Las compras históricas sin proveedor guardado y las prendas con varios proveedores quedan como **Sin atribución**.
