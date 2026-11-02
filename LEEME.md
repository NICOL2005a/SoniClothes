# SoniClothes · Acceso y registro

Rediseño en HTML, CSS y JavaScript con registro y autenticación conectados a PostgreSQL/PGlite. Solo modo claro. Las texturas usan CSS y la pantalla no necesita imágenes ni tipografías externas.

Esta carpeta es una copia de `/Users/nicky/Desktop/WEB/pos_ropa_bootstrap`. La carpeta original y su base no se modificaron. `datos/` contiene la copia de la base existente. La demostración usa otra base, `.demo-data/`, para separar las pruebas de tus registros.

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

## Tu base y tu primera cuenta administradora

1. Detén la demostración con Ctrl+C.
2. Ejecuta `npm run crear-cuenta`. Escribe tu nombre, usuario, correo y contraseña (mínimo 12 caracteres). La contraseña no se muestra al escribirla.
3. Ejecuta `npm start` y entra desde **Administrador**.

No ejecutes la herramienta y el servidor a la vez sobre la misma base PGlite. La primera cuenta se crea desde esta herramienta local de confianza: el registro público nunca concede administración sin aprobación. Las cuentas antiguas no reciben privilegios automáticamente.

En este equipo las dependencias se enlazan con las del proyecto original. En otro equipo usa `npm install`. El ZIP excluye bases de datos, credenciales reales y dependencias. Si trabajas desde el ZIP, copia la carpeta `datos` del proyecto original dentro de esta carpeta antes del primer arranque para conservar sus registros; si no, se creará una base nueva.

## Registro y acceso

- **Cliente:** solo datos básicos (nombre, correo, usuario y contraseña). Se crea una cuenta y un registro de cliente vinculado. Entra de inmediato a la tienda, sin aprobación ni documentación. Al vender en tienda, el administrador debe seleccionar ese cliente para que la venta aparezca en su historial. Puede explorar el catálogo, elegir talla y color, guardar su carrito y hacer una compra con pago de tarjeta simulado. No hay cobros bancarios reales.
- **Proveedor:** solicita acceso con su nombre comercial. El administrador recibe la solicitud en **Solicitudes de acceso** y puede aprobar o rechazar. Al aprobar se crea un proveedor o se vincula uno existente que el administrador seleccione. Solo ve los productos y cuestionarios del proveedor vinculado.
- **Administrador:** solicita acceso desde el mismo formulario y espera aprobación de otro administrador. La cuenta inicial se crea desde la terminal como se explica arriba. Conserva las pantallas del POS y gestiona solicitudes.

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

La pantalla de pago muestra una tarjeta ficticia, de solo lectura, y permite probar **Pago aprobado** o **Tarjeta rechazada**. El navegador envía únicamente el escenario y una clave aleatoria de operación; no envía números de tarjeta, nombres bancarios, CVC ni vencimiento. El servidor rechaza datos adicionales en ese formulario de prueba.

Al aprobar, el servidor vuelve a comprobar precios y stock, registra venta, detalles, pago, folio interno SIM- y la marca de simulación, y vacía el carrito en una sola transacción. La compra aparece en el historial del cliente y en Ventas del administrador con etiqueta de simulación. Los pagos simulados descuentan existencias locales, pero no generan ningún cargo real. Si el pago se rechaza o no hay stock, no se guarda una venta parcial y el carrito se conserva. Las claves de operación impiden duplicar la compra al reenviar la misma solicitud.

La entrega se presenta como recogida en tienda. No se implementan envíos, compras bancarias reales ni facturación fiscal. Las ilustraciones de las prendas son SVG de referencia, no fotografías de productos.

La nueva migración se aplica automáticamente al iniciar. Usa `npm run demo` para probar en la base separada de demostración o `npm start` para utilizar la copia local de tu base. Reinicia el servidor tras actualizar los archivos JavaScript del servidor.
