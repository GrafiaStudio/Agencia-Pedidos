# Fase 3 — Cierre de pedido — Diseño

**Fecha:** 2026-07-10 · Roadmap v3.0, pilar "Cierre/bloqueo de pedidos".
**Base visual:** guías 2/3/4 (design-system ya implementado) + criterio UI/UX senior:
secciones/columnas/tarjetas, nada de cajas full-width enormes, nada de modales flotantes que
carguen toda la info. El cierre reutiliza el editor de página completa que ya existe.

## Objetivo
Un pedido **entregado** se puede **cerrar** (finalizar). Un pedido cerrado es **de solo lectura**:
no se edita hasta reabrirlo. **Reabrir requiere permiso** (`reabrir_pedidos`). Todo queda en historial.

## Estado actual
- `pedidos` usa flags: `entregado`, `cancelado`, `pendiente_pago`. No hay `estado` string.
- El editor (`#ovP .modal`) es página completa: `.mhead` (título+acciones), `.mbody` (ped-main + ped-side), `.mfoot` (motivo + Cancelar/Guardar). Todo son inputs editables incluso para un entregado.
- Permisos: catálogo `PERMISOS_FASE1` en backend → `GET /me.permisos_catalogo` → surte la UI de roles. `requiere(clave)` (admin siempre pasa).

## Modelo de datos (aditivo)
```sql
ALTER TABLE pedidos ADD COLUMN cerrado INTEGER DEFAULT 0;
ALTER TABLE pedidos ADD COLUMN cerrado_por TEXT DEFAULT '';
ALTER TABLE pedidos ADD COLUMN cerrado_en TEXT DEFAULT '';     -- datetime localtime
ALTER TABLE pedidos ADD COLUMN cerrado_motivo TEXT DEFAULT ''; -- motivo de la última reapertura
```
- `PERMISOS_FASE1` gana `reabrir_pedidos` (cerrar = `editar_pedidos`; reabrir = permiso dedicado).
- `pedidoCompleto` expone `p.cerrado` (bool) + `cerrado_por/en/motivo` (ya vienen como texto).

## Backend
- **PUT /api/pedidos/:id**: si `p.cerrado` → **409** `{error:'…cerrado. Reábrelo para editar.'}` (antes de tocar nada).
- **POST /api/pedidos/:id/cerrar** `requiere('editar_pedidos')`: exige `entregado && !cancelado && !cerrado`; set `cerrado=1, cerrado_por=actor, cerrado_en=now`; `addHist('Pedido cerrado')`. Devuelve pedidoCompleto.
- **POST /api/pedidos/:id/reabrir** `requiere('reabrir_pedidos')`: exige `cerrado`; set `cerrado=0, cerrado_motivo=motivo`; `addHist('Pedido reabierto — Motivo …')`. Devuelve pedidoCompleto.
- Cerrar/reabrir **no** crea versión (no cambia la firma clave); solo historial.

## Frontend (limpio, dentro del design-system)
- **Header**: `#btn-cerrar` ("Cerrar pedido", visible si entregado·!cancelado·!cerrado·`puede('editar_pedidos')`) y `#btn-reabrir` ("Reabrir", visible si cerrado·`puede('reabrir_pedidos')`). Junto al título, badge `🔒 Cerrado`.
- **Banner de solo lectura**: ribbon delgado arriba del `.mbody` — "Pedido cerrado el {fecha} por {usuario}. Solo lectura…". No es una caja enorme; es una línea informativa.
- **Modo cerrado (`aplicarModoCerrado`)**: añade `.ped-cerrado` al modal; deshabilita TODA entrada del `.mbody` (inputs/selects/textarea/botones que no estuvieran ya disabled, con marca `_roDisabled` para re-habilitar exacto al reabrir/abrir otro); oculta `.mfoot` (se cierra con la X). CSS: inputs disabled se ven como valor plano (sin borde, texto navy nítido), no como campo gris feo.
- **Lista**: `estadoGeneral` devuelve `Cerrado` cuando `p.cerrado` (color slate); la fila ya sale atenuada (r-done) porque cerrado⇒entregado.
- **Roles UI**: `PERM_LABELS.reabrir_pedidos='Reabrir pedidos cerrados'`.
- **Confirmaciones**: `confirm()` corto para cerrar; reabrir usa `prompt()` de motivo opcional. Sin modal flotante nuevo.

## Fuera de alcance (después)
- Vista de detalle read-only 100% tipo guía2 (tarjetas en vez de form deshabilitado) — mejora futura.
- Cierre automático al marcar entregado + N días. Cerrar en lote desde la lista.

## Verificación
Entregar un pedido → aparece "Cerrar pedido". Cerrar → badge + banner + form bloqueado + Guardar oculto; PUT responde 409. Rol sin `reabrir_pedidos` no ve "Reabrir". Admin reabrir → vuelve editable. Historial registra cerrar/reabrir con usuario. Probado en navegador (Playwright).
