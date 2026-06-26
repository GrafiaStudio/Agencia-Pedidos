# Visibilidad de Stock al Capturar el Pedido — Diseño

**Fecha**: 2026-06-26
**Origen**: Fase 4-B de `MASTER-DOCUMENTO-DESARROLLO.txt` ("Control de stock vs
pedidos"), recortada. Segunda parte de la Fase 4, después de 4-A (Inventario base).

## Contexto

El documento maestro pide "ver si el stock alcanza para cumplir un pedido pendiente" y
"señalar visualmente si no alcanza". Pero con 4-A ya desplegado, el descuento de stock
ocurre **automáticamente al crear el pedido** — para el momento en que alguien mira un
pedido ya guardado, el stock ya se movió; preguntar "¿alcanza?" sobre algo que ya pasó no
tiene sentido. El valor real que queda es avisar **durante la captura**, antes de
guardar — exactamente cuando el dueño está armando el pedido y todavía puede decidir algo
distinto si no hay suficiente.

Se recorta el alcance de 4-B a esto. Lo que sí pide el documento maestro y aquí NO entra
("marcar ítems individuales como suministrados/entregados", un checklist de cumplimiento
separado de la matemática de inventario) queda para un sub-proyecto aparte si se decide
hacerlo — no aporta nada a "ver si alcanza", es una feature de seguimiento distinta.

## Alcance

- El dropdown de autocompletado en Encargos (Fase 2C) muestra el stock disponible junto
  al precio, cuando la ficha tiene `stock_actual` configurado (ej. "Stock: 12").
- Al escribir la Cantidad de un ítem cuya ficha seleccionada tiene `stock_actual`
  configurado, si la cantidad escrita supera el stock disponible, aparece un aviso en
  rojo bajo el campo ("Stock insuficiente (quedan N)") — **no bloquea guardar**, es
  solo informativo, igual que el resto de sugerencias de la app.
- Si la fila ya tenía una Cantidad escrita antes de seleccionar la ficha, el aviso se
  evalúa de inmediato al seleccionar (mismo patrón ya usado para el precio sugerido de
  Escalonado en la Fase 2C).
- Si el ítem no tiene ficha seleccionada, o la ficha no tiene `stock_actual` configurado,
  nunca aparece ningún aviso.

## Explícitamente fuera de esto
- Marcar ítems como suministrados/entregados (checklist de cumplimiento separado).
- Cualquier validación que bloquee guardar un pedido con stock insuficiente — sigue
  siendo aceptable sobrevender, como ya estableció 4-A.
- Tocar la lógica de descuento/restauración de stock (4-A) — esto es puramente
  informativo en el frontend, no cambia ningún cálculo del backend.

## Frontend (`public/index.html`)
- `acItem`: el texto del dropdown gana `· Stock: N` cuando `p.stock_actual!=null`.
- `renderItemsHTML`: cada fila calcula si hay aviso de stock insuficiente
  (`it._fichaSel.stock_actual` vs `it.cantidad`) al construir el HTML — así, cuando
  `selItem` hace su re-render completo de la fila después de elegir una ficha, el aviso
  ya sale correcto sin lógica extra ahí.
- `setItem`: al cambiar Cantidad, actualiza el aviso en vivo (igual patrón que el
  recálculo de precio Escalonado, actualizando el `div` directo sin reconstruir la fila).
