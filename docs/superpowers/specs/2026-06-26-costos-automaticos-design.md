# Costos automáticos desde insumos — Diseño

**Fecha**: 2026-06-26
**Origen**: tercera de 4 mejoras independientes acordadas con el usuario (orden
D→A→C→B). Brainstorm ya resuelto: "se agrega solo, y queda fijo" — al usar un producto
con insumos en un Encargo, sus costos se reflejan solos en la sección Costos del
pedido, escalados por cantidad; se actualizan si la cantidad cambia, se quitan si el
ítem se quita; mientras tanto, se pueden editar a mano si algo cambió en la realidad.

## Contexto

Investigado el código real antes de diseñar, un hallazgo que simplifica todo el
mecanismo: **`GET /api/productos` y `GET /api/productos/:id` ya devuelven cada ficha
con su array `insumos` completo** (vía `fichaCompleta`), así que cuando el usuario elige
un producto en el autocompletado de un Encargo, `it._fichaSel.insumos` ya está
disponible en el navegador — sin pedir nada nuevo al backend.

El otro hallazgo clave: `it._fichaSel` es **transitorio** (ya documentado en la Fase 2C)
— al abrir un pedido ya guardado para editar, cada ítem solo trae `ficha_id`, no la
ficha completa. Esto significa que el cálculo de costos automáticos no puede vivir
"siempre listo" — hay que resolverlo en dos momentos distintos: (1) al elegir un
producto nuevo en el autocompletado (ahí `_fichaSel` ya está), y (2) al abrir un pedido
existente, donde hay que ir a buscar la ficha completa de cada `ficha_id` que aparezca
en los ítems, antes de poder calcular nada.

Dado esto, **el mecanismo queda 100% en el frontend, sin ninguna tabla ni columna
nueva**: las líneas de costo automáticas son entradas normales del array `fCostos` ya
existente, marcadas con una bandera transitoria `_auto:true` (nunca se manda al
backend ni se guarda en la base — el backend nunca necesita saber cuáles costos son
automáticos y cuáles manuales, sigue recibiendo `costos:fCostos` exactamente igual que
hoy, sin cambios de API ni de esquema).

## Alcance

### Cálculo
Nueva función `costoTotalInsumosFicha(insumos)` (espejo del `calcCostoTotalInsumos` del
backend, pero usando `costo_unitario_calc` ya resuelto): suma `cantidad_usada ×
costo_unitario_calc` de cada insumo. El costo automático de un ítem = ese total × la
`cantidad` del ítem en el Encargo.

### Cuándo se recalculan las líneas automáticas
Una función `recalcularCostosAutomaticos()` que: quita de `fCostos` todas las entradas
marcadas `_auto:true`, recorre todos los ítems de todos los Encargos del pedido, y por
cada ítem con `ficha_id` cuya ficha tenga insumos con costo > 0, agrega una línea nueva
(`descripcion:'Insumos: <nombre del producto>'`, `cantidad`, `valor_unitario`, `monto`,
`_auto:true`). Se llama:
- Al seleccionar un producto en el autocompletado de un ítem (ya tiene `_fichaSel`).
- Al cambiar la cantidad de un ítem.
- Al quitar un ítem (su línea automática desaparece con él).
- Al abrir un pedido ya guardado para editar: primero se buscan (en paralelo, sin
  duplicar pedidos por el mismo producto repetido) las fichas completas de cada
  `ficha_id` distinto que aparezca en los ítems, para tener sus insumos disponibles;
  recién entonces se recalculan las líneas automáticas.

### Edición manual
Las líneas automáticas se ven y se editan igual que cualquier línea de Costo — con una
etiqueta visual chica "Automático" para distinguirlas. Si el usuario edita el monto o lo
borra, ese cambio se respeta **para este guardado únicamente**: la próxima vez que se
abra el pedido, se recalculan de cero a partir del estado actual de los ítems y sus
insumos (no se "recuerda" el ajuste manual de la vez anterior) — exactamente la misma
filosofía de "destruir y recrear" que ya usa `saveEncargos` para encargos/ítems, solo
que aquí ocurre en el navegador al cargar/editar, no en el servidor al guardar.

### Guardar
Sin cambios — `guardar()` ya manda `costos:fCostos` completo (automáticas y manuales
mezcladas, sin distinguir) y el backend ya hace `DELETE`+`INSERT` de todo `costos` en
cada guardado, exactamente como hoy.

## Explícitamente fuera de esto
- Sin cambios de backend, de esquema, ni de API — todo el mecanismo vive en el
  navegador.
- No hay forma de "fijar" una línea automática para que sobreviva a la próxima edición
  con un valor manual distinto — se recalcula siempre de cero al reabrir el pedido (si
  algo cambió de verdad, lo correcto es corregir el insumo en la ficha del producto).
- No afecta el cálculo de `costo_total`/`precio_sugerido` de la ficha del producto en sí
  (eso ya existe, sigue igual) — esto es sobre la sección Costos del PEDIDO.

## Frontend (`public/index.html`)
- `costoTotalInsumosFicha(insumos)`: nueva.
- `recalcularCostosAutomaticos()`: nueva, opera sobre `fEnc`/`fCostos` ya existentes.
- `selItem`/`setItem`/`remItem`: ganan una llamada a `recalcularCostosAutomaticos()`.
- `abrirEditar`: antes de pintar el modal, resuelve `_fichaSel` para los `ficha_id`
  distintos de los ítems cargados (vía `GET /api/productos/:id`, en paralelo), y
  después llama `recalcularCostosAutomaticos()`.
- `renderCostos()`: muestra una etiqueta "Automático" en las líneas con `_auto:true`.
