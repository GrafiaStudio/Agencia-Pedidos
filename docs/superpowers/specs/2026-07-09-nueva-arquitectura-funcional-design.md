# Nueva Arquitectura Funcional (v3.0) — Diseño / Roadmap por fases

**Fecha:** 2026-07-09
**Estado:** 🟡 Borrador para aprobación. NO empezar a codificar hasta confirmar las decisiones
abiertas del final. Este documento descompone el requerimiento; cada fase tendrá luego su propio
spec + plan detallado antes de ejecutarse.

## Origen
Requerimiento del usuario en `MEJORAS/Nueva Arquitectura Funcional del Sistema.md` (11 pilares).
Es el salto a **v3.0**: convertir la app de un sistema mono-usuario (1 PIN → 1 workspace) en una
plataforma **multi-usuario, con roles configurables, módulo de Producción, versionado y bloqueo de
pedidos**. No es una sesión: es un **programa por fases**.

## Principios rectores (no negociables)
1. **Único origen de verdad:** el Pedido es el documento comercial; Producción y Dashboard
   **consumen**, no duplican.
2. **Permisos siempre:** toda acción del backend valida el permiso del rol **antes** de ejecutar.
   La UI oculta lo no permitido, pero el servidor es la autoridad.
3. **Nunca se pierde información:** versionado + archivar (no eliminar). Historial inmutable.
4. **Migraciones aditivas:** `ALTER TABLE … ADD COLUMN` en try/catch; nada destructivo sobre la
   base en producción (Railway, volumen `/app/db`). Respaldo CSV antes de cada fase.
5. **Compatibilidad hacia atrás:** la app debe seguir funcionando para el negocio actual durante
   toda la transición (el PIN de hoy se convierte en la cuenta del propietario, sin fricción).

## Estado actual (punto de partida real)
- **Auth:** PIN de 4 dígitos → JWT (90 días) con `wsId`. **No existe el concepto de usuario.**
  `workspaces(id, nombre, pin UNIQUE, tipo)`; `'main'` = negocio real (PIN = `APP_PIN`).
- **Multi-tenant:** cada tabla de negocio lleva `workspace_id`. Aislamiento por workspace ya funciona.
- **Historial:** `historial(id, pedido_id, texto, fecha, hora, creado)` — **texto plano, sin
  usuario ni rol.** Hay que enriquecerlo.
- **Estados de pedido:** `entregado/cancelado/urgente/es_cotizacion` como flags. No hay "Cerrado"
  ni versiones.
- **Inventario:** hoy el Producto se **amarra** al inventario (`fichas_producto.inventario_item_id`
  + `descontarStock` al confirmar). El requerimiento #4 quiere **desacoplarlo** y mover el consumo
  al momento de Producción (modelo híbrido).

## Roadmap por fases (ordenadas por dependencia)

> Regla de oro del orden: **casi todo depende de "quién eres y qué puedes hacer"** → Usuarios+Roles
> es la Fase 1 obligatoria. El versionado y el cierre necesitan identidad de usuario. Producción y
> Dashboard son módulos nuevos que se apoyan en los estados y permisos ya existentes.

| Fase | Nombre | Pilares | Depende de | Riesgo |
|---|---|---|---|---|
| **1** | **Usuarios + Roles (base)** | 10, 11 | — (base de todo) | 🔴 Alto (toca auth y prod) |
| **2** | **Permisos aplicados + Versionado** | 6, 5 | Fase 1 | 🔴 Alto |
| **3** | **Cierre de pedido** (Entregado→Cerrado, reabrir) | 7 | Fase 2 | 🟠 Medio |
| **4** | **Módulo Producción** (pestaña, filtros, estados) | 2, 3 | Fase 1 (responsable/permiso) | 🟠 Medio |
| **5** | **Inventario desde Producción** (botón Stock, híbrido) | 4 | Fase 4 | 🟠 Medio |
| **6** | **Dashboard ejecutivo** | 8 | Fases 1, 4 | 🟢 Bajo |
| **7** | **Clientes: campos plegables + bloqueo por rol** | 9 | Fase 1 | 🟢 Bajo |
| — | Pilar 1 (Pedido = doc comercial) | 1 | ya casi cubierto por el modelo actual | 🟢 |

### Fase 1 — Usuarios + Roles (la base)
**Objetivo:** pasar de "PIN → workspace" a "usuario+contraseña+rol dentro del workspace", sin
romper el acceso actual.

Nuevas tablas (bosquejo, aditivo):
```
usuarios(
  id TEXT PK, workspace_id TEXT, usuario TEXT, pass_hash TEXT, nombre TEXT,
  rol_id TEXT, activo INTEGER DEFAULT 1, creado TEXT,
  UNIQUE(workspace_id, usuario))
roles(
  id TEXT PK, workspace_id TEXT, nombre TEXT,
  permisos TEXT DEFAULT '{}',   -- JSON: { crear_pedidos:true, ver_costos:false, ... }
  es_admin INTEGER DEFAULT 0,   -- el rol admin tiene todos los permisos siempre
  orden INTEGER DEFAULT 0)
```
- **Login nuevo:** usuario + contraseña → JWT que ahora lleva `{ wsId, userId, rolId }`.
- **Migración del PIN actual:** al arrancar, si el workspace `main` no tiene usuarios, se crea
  automáticamente un usuario **propietario/admin** (rol `es_admin=1`) usando el `APP_PIN` como
  contraseña inicial (o pidiendo definir contraseña en el primer login). El PIN sigue sirviendo de
  puente para no dejar al usuario afuera.
- **Gestión:** el admin crea roles (tipo Discord: nombre + set de permisos con checkboxes), crea
  usuarios y les asigna un rol. Catálogo de permisos = la lista del pilar 11.
- **Seguridad:** `pass_hash` con bcrypt/scrypt (ya está `jsonwebtoken`; agregar hashing). Nunca
  guardar contraseñas en claro.

### Fase 2 — Permisos aplicados + Versionado
- **Middleware de permisos:** helper `requierePermiso('editar_pedidos')` en cada ruta `/api/*`
  sensible. La UI consulta los permisos del usuario (endpoint `/api/me`) y oculta/deshabilita.
- **Versionado de pedidos:** cada modificación "importante" crea una versión. Bosquejo:
  ```
  pedido_versiones(id, pedido_id, version INTEGER, snapshot TEXT/JSON,
    usuario_id, rol, motivo TEXT, creado)
  ```
  Se guarda un snapshot del pedido; el pedido "vivo" apunta a su versión actual. Definir qué cuenta
  como "cambio importante" (decisión abierta).
- **Historial enriquecido:** `historial` gana `usuario_id`, `rol`, `motivo` (ALTER aditivo).

### Fase 3 — Cierre de pedido
- Al marcar **Entregado** → estado **Cerrado** automático (`pedidos.cerrado INTEGER`).
- Cerrado = no editable (bloqueo en backend + UI). Proteger contabilidad/inventario/auditoría.
- **Reabrir:** solo rol con permiso `reabrir_pedidos_cerrados`; queda en historial + nueva versión.

### Fase 4 — Módulo Producción
- Nueva pestaña **Producción** (sidebar). Lista de pedidos activos derivada (no duplica datos).
- Filtros: etiqueta, estado, **responsable**, prioridad, fecha. → requiere `pedidos.responsable_id`
  (o por ítem/encargo — decisión abierta).
- Acciones: cambiar estado de producción, seguimiento de avance, observaciones técnicas.
- **No** modifica valores/cliente/pagos (se valida por permiso).
- Al **guardar un pedido** se genera/actualiza su registro de producción (pilar 2). Evaluar si es
  tabla nueva o vista derivada de los estados que ya viven en el ítem.

### Fase 5 — Inventario desde Producción (híbrido)
- **Desacoplar** producto↔inventario: el amarre actual pasa a ser opcional/sugerencia.
- Botón **"Stock"** en el ítem (dentro de Producción) → modal con inventario disponible → elegir
  uno o varios ítems físicos + cantidades → descuento exacto en ese momento.
- Registrar consumo real: `consumo_inventario(id, pedido_id, item_id, cantidad, usuario_id, fecha)`.
- Mantener compatibilidad con el descuento automático actual para negocios que ya lo usan.

### Fase 6 — Dashboard ejecutivo
- Módulo de solo lectura: pedidos activos/urgentes, cotizaciones, producción, entregas del día,
  ingresos, costos, utilidad, calendario. Reutiliza `/api/stats` + nuevas agregaciones.
- Visible solo para roles con permiso administrativo.

### Fase 7 — Clientes: plegado + bloqueo por rol
- En el Pedido, cliente muestra solo **Código, Nombre, Teléfono, Entidad**; el resto plegado
  (Documento, Dirección, Correo, Segundo contacto, Observaciones). Campos ya existen casi todos.
- Tras confirmar, vendedores **no** editan cliente; solo roles autorizados desde módulo Clientes.
- Clientes: nunca eliminar, solo archivar/reactivar (ya hay `archivado`).

## Decisiones abiertas (confirmar antes del plan de Fase 1)
1. **Login:** ¿el propietario define su contraseña en el primer arranque, o usamos el `APP_PIN`
   actual como contraseña inicial del admin y ya?
2. **Alcance de la Fase 1:** ¿construimos el catálogo de permisos **completo** (los ~15 del pilar
   11) de una, o arrancamos con un set mínimo (crear/editar pedidos, ver costos, admin) y crecemos?
3. **"Cambio importante" para versionar:** ¿toda edición crea versión, o solo campos clave (valor,
   ítems, cliente)? (afecta cuánto crece la base).
4. **Responsable de producción:** ¿se asigna a nivel de **pedido**, de **encargo** o de **ítem**?
5. **Compatibilidad móvil:** el pilar 10 menciona "cada empleado descargará la aplicación". Hoy es
   web (Railway). ¿El alcance incluye app instalable (PWA) o seguimos 100% web por ahora?

## Qué NO incluye este roadmap
- Rediseño visual del PDF (pendiente aparte, sesión dedicada — ver Feed Back 2).
- CORR 001 (pulido del formulario de producto) — tarea menor, independiente de v3.0.

## Próximo paso
Aprobar este roadmap y resolver las 5 decisiones abiertas → escribir el spec detallado de **Fase 1
(Usuarios + Roles)** en `specs/` y su plan paso a paso en `plans/`, luego ejecutar.
