# Marcar ítems como suministrados — Diseño

**Fecha**: 2026-06-26
**Origen**: la pieza de Fase 4-B del documento maestro que quedó explícitamente fuera al
recortar 4-B a "Visibilidad de stock al capturar el pedido" — un checklist de
cumplimiento por ítem, sin relación con la matemática de inventario.

## Contexto

Un pedido puede tener varios ítems dentro de un mismo encargo (ej. 3 productos
distintos). El estado del encargo (Nuevo→Diseño→Aprobación→Producción→Listo) es uno solo
para todo el encargo — no distingue si YA se entregó/suministró un ítem puntual mientras
otros del mismo encargo siguen pendientes. Esto es exactamente lo que pide el documento
maestro: marcar ítems individuales, independiente del estado general.

## Alcance

- Columna nueva `enc_items.suministrado` (booleano, default falso).
- Checkbox por fila en la tabla de ítems de cada Encargo, junto al botón de eliminar.
- Al marcarlo, la fila se atenúa visualmente (opacidad reducida) para que se note de un
  vistazo qué ya se entregó dentro de un encargo con varios ítems.
- Se persiste igual que el resto de los campos del ítem, a través de `saveEncargos`
  (que ya borra y recrea todos los ítems en cada guardado — `suministrado` viaja en el
  mismo payload, sin necesitar un endpoint nuevo).

## Explícitamente fuera de esto
- No afecta el estado del encargo, ni el checkbox "Entregado" del pedido completo, ni
  ningún cálculo de inventario o de Registros — es puramente un checklist visual.
- Sin reporte agregado de "qué falta entregar" — eso seguiría siendo parte de un
  "control de stock vs pedidos" más amplio, todavía no construido.

## Backend (`server.js`)
- `ALTER TABLE enc_items ADD COLUMN suministrado INTEGER DEFAULT 0`.
- `saveEncargos`: persiste `it.suministrado?1:0`.

## Frontend (`public/index.html`)
- Columna nueva en la tabla de ítems con un checkbox por fila, usando `setItem` ya
  existente (genérico para cualquier campo del ítem) — sin función nueva.
- La fila aplica `opacity:.55` cuando `it.suministrado` es verdadero.
