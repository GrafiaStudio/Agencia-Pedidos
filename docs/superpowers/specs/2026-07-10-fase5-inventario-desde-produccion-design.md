# Fase 5 — Inventario desde Producción (híbrido) — Diseño

**Fecha:** 2026-07-10 · Roadmap v3.0, pilar 4 (control de inventario híbrido).
**Criterio visual:** panel **inline** en la tarjeta del encargo (mismo patrón que Observaciones de
Fase 4), no un modal flotante nuevo.

## Objetivo
El operario, desde la tarjeta del encargo en Producción, registra el **material físico realmente
usado**: elige ítem(s) de inventario + cantidad y el sistema **descuenta exacto** en ese momento.
Cada consumo queda en un **ledger reversible**. Convive con el descuento automático del producto
(compatibilidad — no se toca ese camino).

## Estado de partida
- `items_inventario(id,nombre,unidad_medida,stock_actual,stock_minimo,activo,...)`.
- Descuento automático actual: `fichas_producto.inventario_item_id` + `descontarStock(pid)` al
  confirmar un pedido (no cotización). Se mantiene intacto.
- Fase 4 dejó el tablero por encargo con edición inline y permisos.

## Modelo de datos (aditivo)
```sql
CREATE TABLE consumo_inventario(
  id, workspace_id, pedido_id, encargo_id,
  item_inv_id, item_nombre, unidad, cantidad REAL,
  usuario_id, usuario_nombre, creado);  -- ledger, un registro por consumo
```
- Permiso nuevo: `consumir_inventario` (dedicado; distinto de gestionar_inventario/producción).

## Backend
- **GET /api/produccion**: cada tarjeta incluye ahora `consumos:[{id,item_inv_id,item_nombre,unidad,cantidad}]`.
- **POST /api/produccion/encargo/:id/consumo** `requiere('consumir_inventario')`: valida item + cantidad>0,
  exige stock rastreado (`stock_actual!=null`), **409 si el pedido está cerrado**; descuenta
  `stock_actual-=cantidad`, inserta en `consumo_inventario`, `addHist` con usuario·rol. Devuelve el
  consumo y el nuevo stock.
- **DELETE /api/produccion/consumo/:id** `requiere('consumir_inventario')`: **devuelve** la cantidad al
  stock, borra el registro, `addHist` ("revirtió consumo…"). 409 si cerrado. (El historial de
  "consumió" queda — es append-only.)
- El descuento automático (`descontarStock`) sigue igual: compatibilidad.

## Frontend
- `PERM_LABELS.consumir_inventario`.
- Tarjeta: 2º botón-ícono (📦) junto al de nota → `prodToggleStock` abre panel **inline** `.pcx-stock`:
  "Materiales usados" (lista con botón revertir por línea) + fila `select ítem (con su stock) ·
  cantidad · botón consumir`. Sin `consumir_inventario` → solo lectura.
- `cargarProduccion` también trae `GET /inventario-items` → `PROD_INV` para el selector
  (`prodInvOptions` filtra activos con stock rastreado y muestra el stock actual en cada opción).
- Actualización optimista: tras consumir/revertir se actualiza la tarjeta y `PROD_INV` en memoria y
  se re-renderiza dejando el panel abierto (`prodReabrirStock`).

## Interacción con el descuento automático (nota)
El consumo manual es un **ledger independiente**. Si un producto está amarrado a inventario
(`inventario_item_id`) sigue descontando automático al confirmar el pedido; si además se consume
manualmente el mismo ítem, se descuenta dos veces. El flujo previsto del híbrido es: productos **sin**
amarre → consumo manual en Producción. El desacople total (quitar el amarre automático) queda como
refinamiento futuro; hoy el amarre ya es opcional por producto.

## Fuera de alcance (después)
- Reserva de material (distinto de consumo).
- Sugerir automáticamente qué ítems consumir según la ficha del producto.
- Consumo a nivel ítem del encargo (hoy es a nivel encargo).

## Verificación (2026-07-10, navegador + API)
Panel inline abre; consumir 2 de TSHIRT XL bajó stock 10→8; historial "consumió 2 unidad… por
Administrador"; revertir desde la UI devolvió 8→10; 409 si el pedido está cerrado (misma guardia).
Consola sin errores.
