# Configuración del Negocio — Diseño

**Fecha**: 2026-06-25
**Origen**: Fase 1E de `MASTER-DOCUMENTO-DESARROLLO.txt` (raíz del proyecto, fuera del repo).
**Relacionado**: base multi-tenant por `workspace_id` (commit `f37ce60`).

## Contexto

El documento maestro define una sección "Configuración" completa con 5 sub-pestañas
(Perfil, Preferencias, Pedidos, Impuestos, Notificaciones). Esta entrega cubre las 4
sub-pestañas que tienen un efecto verificable en la app **hoy**. Quedan fuera, de forma
deliberada:

- **Impuestos (IVA)**: no existe ningún documento (cotización/orden/comprobante en PDF,
  Fase 3) donde mostrarlo. Configurarlo ahora guardaría un valor sin ningún lugar donde
  usarse.
- **Numeración automática de pedidos** (prefijo + reinicio anual): el contador de `ref`
  hoy es global (`UNIQUE` sobre toda la tabla `pedidos`, ver `memoria_actualizaciones.md`
  sección 8). Hacerlo por negocio implica reconstruir esa restricción en SQLite — se trata
  como una decisión aparte, no como parte de esta pantalla.
- **Alertas de stock**: depende de inventario (Fase 4), que no existe.

El usuario indicó que la app debe poder usarse a futuro por negocios fuera de Colombia.
Eso se refleja en cómo se diseñan los campos de Preferencias (sección siguiente), pero
**no** incluye traducir la interfaz (sigue en español, regla existente del proyecto) —
es una iniciativa separada y más grande si llega a necesitarse.

## Alcance

### 1. Perfil del Negocio
Nombre, logo (archivo), dirección, teléfono, email, NIT/cédula.

Efecto real hoy: nombre y logo reemplazan el logo/texto del sidebar **después de iniciar
sesión** (la pantalla de PIN es previa al login — en ese punto no se sabe a qué workspace
pertenece el PIN, así que se mantiene genérica). Dirección/teléfono/email/NIT no se
muestran en ningún lado todavía — se capturan una sola vez y quedan listos para los
documentos de Fase 3.

### 2. Preferencias
Prefijo de moneda, decimales (sí/no), separador de miles, formato de fecha, zona horaria.

Pensado para funcionar fuera de Colombia sin trabajo extra:
- **Prefijo de moneda**: texto libre (no una lista fija) — sirve para `$`, `US$`, `€`,
  `S/`, etc.
- **Separador de miles**: punto o coma, configurable. El separador decimal es siempre el
  contrario (si miles es `.`, decimales usa `,`, y viceversa) — evita que ambos coincidan
  y el número se vuelva ilegible (ej. `1.234.56`).
- **Formato de fecha**: `DD/MM/AAAA` (default, Latam/Europa) | `MM/DD/AAAA` (EE.UU.) |
  `AAAA-MM-DD` (ISO).
- **Zona horaria**: el `<select>` se llena dinámicamente con
  `Intl.supportedValuesOf('timeZone')` (todas las zonas IANA, soportado en Node 24 y
  navegadores modernos) — no una lista corta hardcodeada a Latinoamérica. El backend
  valida contra la misma lista.

Efecto real hoy: `fCOP()` (única función de formato de dinero en el frontend) y `fd()`
(única función de formato de fecha) leen estos valores. La zona horaria corrige además
`hoy()` en el backend, que hoy usa `new Date().toISOString()` (UTC puro) — eso adelanta
la fecha hasta 5 horas antes de medianoche en Bogotá (UTC-5). Con esta config, `hoy()`
calcula la fecha en la zona configurada del workspace.

### 3. Pedidos
Días de validez de cotización, estado por defecto al crear pedido, métodos de pago
habilitados.

Efecto real hoy:
- **Días de validez**: se muestra "Válida hasta DD/MM" junto al badge de Cotización en
  la lista y en la ficha del pedido (calculado como `fecha_pedido + dias`, no se guarda
  como fecha fija).
- **Estado por defecto**: controla si el checkbox "Cotización" de un pedido nuevo arranca
  marcado.
- **Métodos de pago**: catálogo fijo de 6 (`efectivo`, `transferencia`, `nequi`,
  `daviplata`, `contraentrega`, `otro`) — el `<select>` de tipo de pago en cada abono solo
  muestra los habilitados. Pagos históricos con un método luego deshabilitado siguen
  mostrando su valor original (no se pierde el dato, solo no aparece para pagos nuevos).
  `otro` reutiliza el campo `nota` ya existente en `pagos` para el texto libre — sin
  cambio de esquema en esa tabla.

### 4. Notificaciones
Alertas de fecha de entrega (sí/no), días de anticipación.

Efecto real hoy: generaliza `faHTML()`, que hoy solo avisa "Mañana" (día siguiente,
hardcodeado). Con la config: si está apagada, no se muestra ninguna alerta; si está
prendida, el aviso ámbar aparece desde `dias_anticipacion` días antes (no solo el día
anterior). "Vencido" y "Vence hoy" siguen siendo siempre rojos cuando la alerta está
activa.

## Modelo de datos

Tabla nueva, una fila por workspace (mismo patrón sin `FOREIGN KEY` que el resto del
esquema):

```sql
CREATE TABLE IF NOT EXISTS configuracion_negocio(
  workspace_id TEXT PRIMARY KEY,
  nombre_negocio TEXT,
  logo_ruta TEXT,
  direccion TEXT,
  telefono TEXT,
  email TEXT,
  nit TEXT,
  moneda_prefijo TEXT DEFAULT '$',
  decimales INTEGER DEFAULT 0,
  separador_miles TEXT DEFAULT '.',
  formato_fecha TEXT DEFAULT 'DD/MM/AAAA',
  zona_horaria TEXT DEFAULT 'America/Bogota',
  dias_validez_cotizacion INTEGER DEFAULT 15,
  estado_default_cotizacion INTEGER DEFAULT 0,
  metodos_pago TEXT DEFAULT '["efectivo","transferencia","nequi","daviplata"]',
  alertas_entrega INTEGER DEFAULT 1,
  dias_anticipacion_entrega INTEGER DEFAULT 3
);
```

Si un workspace no tiene fila todavía, el backend responde con los valores por defecto
sin crear nada — la fila solo se crea al primer `PUT`. Esto preserva la filosofía de la
app ("si no configuras nada, todo sigue funcionando").

## Backend (`server.js`)

- `GET /api/configuracion` → fila de `req.wsId` o defaults (sin crear fila).
- `PUT /api/configuracion` → upsert (`INSERT ... ON CONFLICT(workspace_id) DO UPDATE`).
  Valida: `formato_fecha` contra las 3 opciones, `separador_miles` contra `.`/`,`,
  `zona_horaria` contra `Intl.supportedValuesOf('timeZone')`, `metodos_pago` contra el
  catálogo de 6, enteros (`dias_validez_cotizacion`, `dias_anticipacion_entrega`)
  positivos.
- `POST /api/configuracion/logo` (multipart, reusa el `multer` ya configurado para
  adjuntos de pedidos) → guarda archivo, actualiza `logo_ruta`, retorna la nueva ruta.
- `hoy(wsId)` deja de ser puro-UTC: usa `Intl.DateTimeFormat`/`toLocaleDateString('en-CA',
  {timeZone})` con la zona configurada del workspace (fallback `America/Bogota` si no hay
  fila o falla la zona). Todos los call-sites de `hoy()` pasan a recibir `wsId` (ya está
  disponible en cada uno vía `req.wsId`).

## Frontend (`public/index.html`)

- Vista nueva `view-configuracion`, mismo patrón visual que "Registros": pestañas
  internas (`cfg-tabs`/`cfgtab`/`cfg-panel`, análogas a `reg-tabs`/`rtab`/`reg-panel` pero
  con nombre propio para no confundir a quien lea el código más adelante) con 4 paneles:
  Perfil, Preferencias, Pedidos, Notificaciones.
- Acceso: ítem nuevo en `.sb-footer` del sidebar (ícono engranaje, junto a "Exportar
  CSV"/"Cerrar sesión") + ícono en `.tb-right` de la topbar para que sea alcanzable en
  mobile (el `mob-nav` inferior ya tiene sus 4 botones ocupados).
- Un único botón "Guardar configuración" al fondo de la vista que envía un solo `PUT` con
  los campos de las 4 pestañas. El logo se sube aparte, de inmediato al elegir el archivo
  (igual que los adjuntos de un pedido).
- Tras el login, la app llama `GET /api/configuracion` una vez y guarda el resultado en un
  objeto global `CFG`. `fCOP()`, `fd()`, el render del `<select>` de tipo de pago,
  `faHTML()` y el default del checkbox de cotización en `abrirNuevo()`/`resetForm()` leen
  de `CFG` en vez de valores hardcodeados. Si `GET /api/configuracion` falla o el
  workspace no tiene fila, `CFG` usa los mismos defaults documentados arriba. Para la
  mayoría de campos esos defaults igualan el comportamiento hardcodeado actual (prefijo
  `$`, sin decimales, separador `.`, fecha `DD/MM/AAAA`, método de pago sin filtrar,
  cotización no marcada por defecto) — **excepto** `dias_anticipacion_entrega` (default
  3, tomado del documento maestro), que sí cambia lo que se ve hoy: la alerta ámbar de
  entrega próxima pasa de aparecer solo "Mañana" (1 día antes, hardcodeado) a aparecer
  desde 3 días antes. Es un cambio deliberado, no un efecto secundario no buscado.
- Sidebar: el logo/nombre actual (imagen base64 embebida) se mantiene como *fallback*
  visual. Si `CFG.logo_ruta` existe, se reemplaza el `src` de esa imagen. Si
  `CFG.nombre_negocio` existe, se agrega un texto con el nombre debajo del logo (hoy no
  hay texto de nombre ahí, el nombre está dibujado dentro del logo actual) — si no se
  configura nada, no aparece texto nuevo y la vista es idéntica a la actual.

## Fuera de alcance (explícito)

- Impuestos/IVA, numeración automática por negocio, alertas de stock — ver "Contexto".
- Traducción de la interfaz a otros idiomas — la interfaz sigue en español; lo que este
  diseño habilita es que los *datos* (moneda, fecha, zona horaria) se adapten a cualquier
  país, no el idioma de los textos fijos.
