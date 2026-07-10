# Fase 2b — Versionado de pedidos — Diseño

**Fecha:** 2026-07-09 · Roadmap v3.0, pilares 5 (versionado) + parte de historial.
**Decisión previa:** versionar **solo cambios clave** (cliente, ítems, valores). 100% web.

## Objetivo
Que cada cambio clave de un pedido guarde una **versión** (snapshot) sin sobrescribir, y que el
**historial** registre quién (usuario + rol), cuándo y (opcional) el motivo. Nunca se pierde info.

## Estado actual
- `historial(id, pedido_id, texto, fecha, hora, creado, workspace_id)` — texto plano, sin usuario/rol.
- `addHist(pid,txt,wsId)` escribe una línea. Se llama en POST/PUT (estado, abonos, precios, cancelación).
- `pedidoCompleto(p)` arma el pedido completo (encargos→items, pagos, costos, historial, archivos, valores).
- PUT /api/pedidos/:id ya tiene `p` (viejo), `b` (nuevo), `req.usuario`, `req.rol`, `req.rolId`.

## Modelo de datos (aditivo)
```sql
CREATE TABLE IF NOT EXISTS pedido_versiones(
  id TEXT PRIMARY KEY, pedido_id TEXT, workspace_id TEXT,
  version INTEGER, snapshot TEXT,           -- JSON de pedidoCompleto en ese momento
  usuario_id TEXT, usuario_nombre TEXT, rol TEXT, motivo TEXT,
  creado TEXT DEFAULT(datetime('now','localtime')));
-- historial gana:
ALTER TABLE historial ADD COLUMN usuario_id TEXT DEFAULT '';
ALTER TABLE historial ADD COLUMN usuario_nombre TEXT DEFAULT '';
ALTER TABLE historial ADD COLUMN rol TEXT DEFAULT '';
ALTER TABLE historial ADD COLUMN motivo TEXT DEFAULT '';
```

## Lógica
- `actorDe(req)` → `{id, nombre, rol}` desde `req.usuario`/`req.rol`.
- `addHist(pid, txt, wsId, actor, motivo)` — guarda también usuario/rol/motivo (retrocompatible: actor opcional).
- `firmaClave(pc)` → JSON de lo que cuenta como "cambio clave": `cliente_id`, `nombre`,
  `valor_total`, y los ítems `[{cantidad, detalle, valor_unitario_calc, ficha_id}]`. Ignora
  urgente/notas/estado (esos no crean versión).
- `crearVersion(pid, wsId, actor, motivo)` → snapshot de `pedidoCompleto`, `version = max+1`,
  inserta en `pedido_versiones` + `addHist(... 'Versión N guardada' ..., motivo)`.
- **POST** (crear pedido) → `crearVersion` v1 (estado inicial) con actor.
- **PUT** → calcular `firmaClave` ANTES; aplicar update; calcular `firmaClave` DESPUÉS; si difieren
  → `crearVersion` (nueva versión). Los `addHist` existentes pasan a llevar el actor.
- `pedidoCompleto` expone `p.version` (número de versión actual = max, o 0).

## Endpoints
- `GET /api/pedidos/:id/versiones` → lista liviana `[{version, usuario_nombre, rol, motivo, creado}]`
  (sin snapshot). Solo auth (ver historial no requiere permiso especial).
- (Futuro, no en 2b.1) ver/restaurar un snapshot concreto.

## Frontend
- Editor de pedido: campo **"Motivo del cambio (opcional)"** visible solo al **editar** uno existente;
  `guardar()` lo envía como `b.motivo`.
- Detalle del pedido: mostrar **"Versión N"** y enriquecer el **Historial** para mostrar
  `usuario · rol` en cada línea. Lista de versiones (quién/cuándo/motivo) desde el nuevo endpoint.

## Fuera de 2b.1 (después)
- Restaurar/ver el contenido de una versión anterior (diff/rollback).
- Motivo obligatorio en ciertos cambios.

## Verificación
Crear pedido → v1. Editar valor/ítems/cliente → v2 con usuario/rol/motivo. Editar solo "urgente"
→ NO crea versión. Historial muestra quién. Todo probado en navegador (Playwright).
