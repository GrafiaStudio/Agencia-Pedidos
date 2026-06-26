# Ayuda y About — Diseño

**Fecha**: 2026-06-26
**Origen**: Fase 1F de `MASTER-DOCUMENTO-DESARROLLO.txt` ("Sección de Ayuda y About").

## Contexto

Nueva vista principal del menú, con 6 sub-pestañas, mayormente contenido estático. Tres
de las seis necesitan texto que solo el negocio puede proveer (Quiénes Somos, Términos,
Privacidad) — se construyen igual, con placeholders honestos y visibles, no contenido
inventado. Las otras tres (Manual de Usuario, Información de la App, Soporte) se
construyen completas, reutilizando datos reales ya existentes donde aplica.

Explorado el código real antes de diseñar: el menú principal (`showView`, sidebar de
botones `data-view`), el patrón de sub-pestañas de Configuración (`showCfgTab`,
`.cfgtab`/`.cfg-panel`, mapeo por índice posicional — **no reutilizable literal** porque
indexa por posición dentro de `.cfgtab` global, mezclaría las dos vistas si compartieran
clase), el acordeón ya existente (`toggleColl`, `.collapsible`/`.coll-body`/
`.coll-chevron`) y una fragilidad real: `resetForm()` (línea ~2177) hace
`document.querySelector('.coll-body')` **sin scope**, asumiendo que hay un único
acordeón en toda la página (el de Costos en el modal de pedido). Agregar más
`.collapsible` en Ayuda rompería ese reset. Por eso el Manual de Usuario usa sus propias
clases (`.man-step`/`.man-body`/`.man-chevron`) y su propia función de toggle, no las
existentes.

## Alcance

### Navegación
- Nuevo botón en el sidebar (`data-view="ayuda"`), nueva entrada en el objeto `titles` de
  `showView`, nuevo `<div id="view-ayuda" class="view">`.
- Sub-pestañas con clases propias (`.helptab`/`.help-panel`) y función propia
  `showHelpTab(tab)` — mismo patrón visual que Configuración, sin compartir clases (la
  función de Configuración indexa por posición global, compartir clase rompería ambas).

### Pestaña Manual de Usuario
Acordeón con clases propias (`.man-step`/`.man-body`/`.man-chevron`) y función propia
`toggleManual(head)` (copia del patrón de `toggleColl`, sin tocar el acordeón existente
del modal de pedido). 10 pasos con contenido real, escrito a partir de la funcionalidad
real ya construida (no genérico): crear el primer pedido, encargos y costos, pagos,
estados (Nuevo→Listo, urgente/entregado/cancelado/pendiente de pago), cotizaciones,
fichas de producto y tipos de precio, autocompletado en Encargos/Costos, inventario
(stock), documentos PDF + WhatsApp, exportar historial CSV, configurar el negocio.

### Pestaña Quiénes Somos
Muestra `CFG.nombre_negocio` y `CFG.logo_ruta` si ya están configurados (Fase 1E, dato
real, no placeholder). El texto de historia/origen del proyecto es un placeholder visible
y honesto: *"Pendiente: aquí va una breve historia de [nombre del negocio] — la escribe el
dueño del negocio desde Configuración cuando la tenga lista."* Enlace a web/redes: mismo
trato, placeholder hasta que exista el dato.

### Pestaña Información de la App
Backend nuevo: `GET /api/app-info` (protegido por el mismo middleware de `/api`, no hace
falta excepción) devuelve `{nombre, version, fecha_actualizacion, novedades}` desde una
constante en `server.js` (`APP_INFO`), no desde una tabla — no es dato por workspace, es
información de la build. `version` se lee de `package.json` (ya en `2.0.0`).
`fecha_actualizacion` y `novedades` son una constante que **yo actualizo en cada release
significativo** — el documento maestro pide "editable por el administrador" pero no
existe ninguna UI de administración de changelog hoy; documentar esto explícitamente como
limitación conocida, no fingir que hay un editor.

### Pestaña Términos y Condiciones / Política de Privacidad
Contenedores estáticos con placeholder honesto: *"Pendiente: texto legal que proveerá el
negocio."* Sin opción de editar desde la UI todavía (no la pide el documento maestro para
estas dos pestañas — son "contenedor estático").

### Pestaña Soporte
Texto explicativo + botón de WhatsApp reutilizando el patrón ya existente
(`normalizarTelWa`, que ya es agnóstico de pedido) contra una constante `SOPORTE_TEL` en
el frontend. Si `SOPORTE_TEL` está vacía (default), el botón se muestra deshabilitado con
texto "Configura el número de soporte" en vez de abrir un WhatsApp a nadie — evita el
patrón de "botón roto" que el wa.me real de Documentos nunca tiene (porque ahí siempre hay
teléfono del cliente). Email de contacto: usa `CFG.email` si está configurado (dato real
de Configuración), si no, mismo placeholder honesto. Tiempo de respuesta estimado: texto
fijo razonable ("usualmente dentro de 24 horas en días hábiles") — no es dato exclusivo
del negocio, es una expectativa genérica editable a mano en el código si el dueño quiere
otro número.

## Explícitamente fuera de esto
- Editor de changelog/novedades desde la UI — la "novedad" de cada release la actualizo yo
  en el código, no hay panel de administración para esto.
- Imágenes en el Manual de Usuario — el documento maestro lo marca como mejora futura
  ("empieza con texto e ícono, se mejora con imágenes en versiones futuras").
- Cualquier texto legal/de marca real — son placeholders hasta que el negocio los provea.

## Backend (`server.js`)
- Constante `APP_INFO` (nombre, fecha_actualizacion, novedades) + lectura de
  `require('./package.json').version`.
- `GET /api/app-info`: devuelve `{...APP_INFO, version}`.

## Frontend (`public/index.html`)
- Sidebar: nuevo botón `data-view="ayuda"`. `showView`: nueva entrada en `titles`.
- Nuevo `<div id="view-ayuda">` con sub-tabs (`.helptab`/`.help-panel`) y
  `showHelpTab(tab)`.
- Manual de Usuario: 10 bloques `.man-step` + `toggleManual(head)`.
- Quiénes Somos: lectura de `CFG.nombre_negocio`/`CFG.logo_ruta` al pintar la vista.
- Información de la App: `cargarAppInfo()` llama `GET /api/app-info` al entrar a la
  sub-pestaña (patrón ya usado para otras vistas que cargan datos al mostrarse).
- Soporte: constante `SOPORTE_TEL=''` + función `enviarWhatsAppSoporte()` (variante de
  `normalizarTelWa`+`window.open` ya existente, sin depender de un pedido).
