# Fase 4 — Módulo Producción — Diseño

**Fecha:** 2026-07-10 · Roadmap v3.0, pilares 2 y 3 (Producción como módulo independiente).
**Decisión del usuario (2026-07-10):** granularidad **por encargo** (cada encargo del pedido es una
tarjeta con su propio estado y responsable). Refleja cómo ya funcionan los datos.
**Criterio visual:** guías 2/3/4 + reglas UI/UX: columnas/tarjetas, nada full-width, sin modales
flotantes (edición inline en la tarjeta).

## Objetivo
Pestaña **Producción** orientada al equipo de taller (no a lo comercial). Vista **derivada** del
Pedido (único origen de verdad — no duplica datos): lista los encargos de los pedidos ACTIVOS como
un **tablero por estado** (Nuevo → Diseño → Aprobación → Producción → Listo). Desde ahí se cambia el
estado, se asigna responsable y se anotan observaciones técnicas. **No** toca valores/cliente/pagos.

## Estado de partida
- Cada `encargos` ya lleva su `estado` (ENC_ESTADOS). El pedido agrega su estado (estadoGeneral).
- `saveEncargos` hace DELETE+INSERT de encargos en cada PUT del pedido → cualquier campo nuevo del
  encargo debe (a) persistirse en saveEncargos y (b) viajar en el round-trip del editor (fEnc) para
  sobrevivir a una edición comercial. Ambas cosas resueltas.

## Modelo de datos (aditivo)
```sql
ALTER TABLE encargos ADD COLUMN responsable_id TEXT DEFAULT '';  -- usuarios.id
ALTER TABLE encargos ADD COLUMN notas_tec TEXT DEFAULT '';       -- observación técnica
```
- Permisos nuevos en `PERMISOS_FASE1`: `ver_produccion`, `gestionar_produccion`.
- `ENC_ESTADOS` en backend (espejo de ENC_ESTS del front).
- `saveEncargos` persiste `responsable_id`/`notas_tec` (leídos de `enc.*`, preservados en ediciones).

## Backend
- **GET /api/produccion** `requiere('ver_produccion')`: pedidos activos (no entregado/cancelado/
  cotización/**cerrado**/archivado) → aplana sus encargos en tarjetas `{pedido_id, ref, cliente,
  urgente, fecha_entrega, encargo_id, numero, estado, categorias, items[], responsable_id/nombre,
  notas_tec}`. Ordena urgentes primero, luego por fecha de entrega.
- **GET /api/produccion/equipo** `requiere('ver_produccion')`: usuarios activos `{id,nombre}` para
  asignar (sin exigir administrar_usuarios).
- **PUT /api/produccion/encargo/:id** `requiere('gestionar_produccion')`: cambia `estado` /
  `responsable_id` / `notas_tec` de UN encargo. Valida responsable, ignora campos sin cambio,
  **409 si el pedido está cerrado**, registra cada cambio en historial con usuario·rol. No toca
  nada comercial.

## Frontend
- Sidebar: nav **Producción** (`data-perm="ver_produccion"`), vista `#view-produccion`,
  `VIEW_PERM.produccion`, título en showView, `cargarProduccion()`.
- **Barra de filtros**: buscar (cliente/#pedido), responsable (incl. "Sin asignar"), etiqueta
  (categoría), toggle Urgentes. Contador de resultados.
- **Tablero** `.prod-board`: una `.prod-col` por estado (dot de color ECOL_MAP + contador). Tarjetas
  `.prodx-card` (⚠ clase con `x` para no colisionar con `.prod-card` del listado de Productos):
  ref·E#, cliente, chips de categoría, resumen de ítems, entrega (con urgencia por color), fila de
  responsable (avatar + select) + botón de observación, select de estado (mueve de columna), y un
  bloque de observación técnica **plegable inline** (no modal).
- Sin permiso `gestionar_produccion` → selects/textarea `disabled` (solo lectura).
- Cambios optimistas: actualiza la tarjeta en memoria y re-renderiza; en error recarga.
- `pesc()` escapa el texto de usuario en las tarjetas.

## Fuera de alcance (Fase 5+)
- Botón **Stock** / consumo de inventario desde la tarjeta (Fase 5, híbrido).
- Drag & drop entre columnas (hoy se mueve con el select de estado).
- Responsable/observación a nivel ítem (hoy es a nivel encargo).
- Marcar el pedido como Entregado desde Producción (sigue en el editor comercial).

## Verificación (hecha 2026-07-10, navegador + API)
GET /produccion devuelve las tarjetas por encargo; el mismo pedido aparece en varias columnas.
Cambiar estado mueve la tarjeta; asignar responsable pone avatar; guardar observación la persiste;
historial registra los 3 con usuario·rol. **Regresión:** guardar el pedido comercialmente NO borra
responsable/estado/nota del encargo. Consola sin errores.
