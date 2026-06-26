# Inventario Base — Diseño

**Fecha**: 2026-06-26
**Origen**: Fase 4 de `MASTER-DOCUMENTO-DESARROLLO.txt` ("Inventario y alertas"), primer
sub-proyecto. Cubre solo "Inventario base" + "Alertas de stock insuficiente" — el
"Control de stock vs pedidos" (ver si el stock alcanza para pedidos pendientes, marcar
ítems como suministrados) queda para un sub-proyecto aparte después.

## Contexto

Se eligió Fase 4 antes que el resto de la Fase 1 (roles, onboarding) porque le da valor
operativo inmediato al negocio real que ya usa la app hoy, mientras que roles/onboarding
sirven a un escenario de "vender a otros negocios" que todavía no existe.

Hallazgo clave del código real que define este diseño: `saveEncargos()` en `server.js`
**borra y recrea todos los encargos/ítems de un pedido en cada guardado** (`DELETE FROM
encargos WHERE pedido_id=?` seguido de re-`INSERT` con ids nuevos), tanto al crear como
al editar. No hay continuidad de id entre ediciones. Esto descarta cualquier diseño que
intente "diferenciar qué cambió" entre el guardado anterior y el actual para decidir
cuánto descontar — no hay forma confiable de saber qué ítem de la edición anterior
corresponde a cuál de la nueva. La única forma robusta es descontar una sola vez, en una
transición de estado clara, y guardar una foto de exactamente qué se descontó para poder
revertirla después sin depender del estado (posiblemente ya cambiado) del pedido.

## Alcance

### Vínculo ficha↔ítem (no existe hoy)
`enc_items` gana `ficha_id TEXT` (nullable). El autocompletado de la Fase 2C (`selItem`)
la guarda de ahí en adelante — cuando el usuario elige una ficha del dropdown, el ítem
queda con `ficha_id=<id de la ficha>`. Ítems escritos a mano o ya guardados antes de este
cambio quedan con `ficha_id=NULL` para siempre y **nunca participan del inventario** —
consistente con la filosofía "si no configuras nada, todo sigue funcionando".

### Stock por ficha de producto
Dos columnas nuevas y opcionales en `fichas_producto`: `stock_actual` y `stock_minimo`
(ambas `INTEGER`, nullable). Si están vacías, esa ficha no participa de nada de este
sub-proyecto — ni descuenta ni alerta. Editable en el modal de Producto.

### Momento exacto del descuento (una sola vez por pedido, nunca en ediciones posteriores)
- Al **crear** un pedido con `es_cotizacion` falso desde el inicio (`POST /api/pedidos`).
- Al **convertir** una cotización en pedido real (`PUT /api/pedidos/:id` donde
  `es_cotizacion` pasa de `1` a `0` en este guardado).

En ese momento: se recorren los ítems del pedido que tengan `ficha_id` no nulo, se agrupa
la cantidad total por ficha (`toNum(item.cantidad)`, mismo parseo que ya usa el resto de
la app), y se resta esa cantidad de `stock_actual` en cada ficha referenciada — **solo en
las fichas donde `stock_actual` ya tiene un valor definido** (no `NULL`). Si la ficha
referenciada nunca configuró `stock_actual`, se omite por completo (no se "activa" el
inventario para ella solo por aparecer en un pedido, ni se inicializa en negativo) y
tampoco se incluye en la foto de `stock_consumido`. No hay validación de "stock
suficiente" en este sub-proyecto — restar puede dejar `stock_actual` en negativo, eso es
una señal aceptable de sobreventa, no un error; bloquear la venta si no alcanza es del
sub-proyecto 4-B. **Editar un pedido después (cambiar cantidades, agregar/quitar ítems)
nunca vuelve a tocar el inventario** — limitación explícita de este v1, documentada, no
un bug: evita la complejidad de recalcular deltas contra un guardado que ya se borró.

### La "foto" de lo descontado (para poder restaurar sin ambigüedad)
Columna nueva `pedidos.stock_consumido TEXT` (JSON, mismo patrón que ya usa `rangos` en
`fichas_producto` — no es una tabla nueva). Al descontar, se guarda ahí exactamente qué
se descontó: `[{"ficha_id":"...","cantidad":5},...]`. Esto importa porque si el pedido se
edita después (cambia la cantidad de un ítem), la "foto" sigue siendo la cantidad
ORIGINAL que realmente se descontó — restaurar usa esa foto, no el estado actual del
pedido, así nunca hay ambigüedad sobre cuánto devolver.

### Restauración al cancelar o eliminar
Si `cancelado` pasa de `0` a `1` (`PUT /api/pedidos/:id`) y el pedido tiene
`stock_consumido` no vacío: se suma de vuelta cada `cantidad` a su `stock_actual`
correspondiente, y `stock_consumido` se limpia a `NULL` (vuelve al estado "nada
descontado todavía" — no hay un flujo de "reactivar pedido cancelado" hoy, pero si
existiera en el futuro, este estado queda consistente para que pueda volver a descontar).

El mismo `PUT` puede convertir una cotización directamente en cancelada en una sola
edición (`es_cotizacion` pasa a falso Y `cancelado` pasa a verdadero al mismo tiempo) —
en ese caso se descuenta y se restaura dentro de la misma request, en ese orden, dejando
el stock sin cambios netos (correcto: nunca llegó a ser un compromiso real).

**`DELETE /api/pedidos/:id`** (borrado duro, distinto de cancelar) también restaura el
stock si el pedido tenía `stock_consumido` no vacío — si no, ese stock quedaría perdido
para siempre sin ningún registro que lo explique.

### Alerta de stock bajo
Badge "Stock bajo" en la card del producto (vista Productos) cuando `stock_actual` y
`stock_minimo` están ambos definidos y `stock_actual <= stock_minimo` — mismo patrón
visual que el badge "Inactivo" que ya existe ahí. Sin reporte agregado ni vista nueva en
este sub-proyecto.

## Modelo de datos
```sql
ALTER TABLE fichas_producto ADD COLUMN stock_actual INTEGER;
ALTER TABLE fichas_producto ADD COLUMN stock_minimo INTEGER;
ALTER TABLE enc_items ADD COLUMN ficha_id TEXT;
ALTER TABLE pedidos ADD COLUMN stock_consumido TEXT;
```

## Backend (`server.js`)
- `saveEncargos(pid,encargos,wsId)` persiste `ficha_id` en el `INSERT INTO enc_items`.
- Nueva función `descontarStock(pedido,wsId)`: agrupa cantidad por `ficha_id` entre los
  encargos/ítems del pedido (recién guardado), resta de `stock_actual` en
  `fichas_producto`, devuelve el array de consumo para guardarlo en
  `pedidos.stock_consumido`. Si no hay ningún ítem con `ficha_id`, devuelve `[]` (no pasa
  nada, pero el pedido queda con `stock_consumido='[]'` para registrar que "ya se evaluó
  este pedido" y no se vuelva a evaluar en una edición futura).
- Nueva función `restaurarStock(stockConsumido,wsId)`: hace el inverso — suma de vuelta
  cada cantidad a su `stock_actual`.
- `POST /api/pedidos`: si `!b.es_cotizacion`, llama `descontarStock` después de guardar y
  persiste el resultado en `stock_consumido`.
- `PUT /api/pedidos/:id`: si el pedido existente tenía `es_cotizacion=1` y el body lo
  cambia a falso, y `stock_consumido` está vacío/null, llama `descontarStock`. Si el
  body marca `cancelado=true` y el pedido existente tenía `cancelado=0` y
  `stock_consumido` no está vacío, llama `restaurarStock` y limpia la columna.
- `fichaCompleta(f)` ya devuelve toda la fila — `stock_actual`/`stock_minimo` llegan
  solos al frontend sin cambios adicionales ahí.

## Frontend (`public/index.html`)
- Modal de Producto: dos campos nuevos "Stock actual" y "Stock mínimo" (números,
  opcionales) — se guardan y se cargan igual que el resto de los campos de la ficha.
- `selItem` (Fase 2C) agrega `it.ficha_id=p.id` al seleccionar una ficha del dropdown de
  Encargos (hoy solo guarda `it._fichaSel`, que es transitorio y nunca se envía). El
  payload que ya manda `guardar()` para los ítems necesita incluir `ficha_id`.
- `cargarProductos`/`renderProductos`: badge "Stock bajo" en la card cuando aplica,
  mismo patrón que el badge "Inactivo" ya existente.

## Explícitamente fuera de este sub-proyecto
- Control de stock vs pedidos (ver si el stock alcanza para pedidos pendientes, marcar
  ítems como suministrados) — sub-proyecto 4-B, después.
- Descuento por combos — los combos no existen (dependen de Fase 4 completa/inventario,
  que es justo lo que se está construyendo ahora, pero el tipo de precio "combo" en sí
  sigue sin implementarse, ver Fase 2B).
- Recalcular el inventario al editar un pedido ya creado — limitación explícita
  documentada arriba, no un olvido.
- Reporte agregado de "qué reponer" — eso también es 4-B.
