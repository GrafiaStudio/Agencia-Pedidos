# Fase 1 — Usuarios + Roles — Diseño

**Fecha:** 2026-07-09
**Estado:** 🟡 Borrador para aprobación. Primera fase del roadmap v3.0
(`2026-07-09-nueva-arquitectura-funcional-design.md`). Al aprobar → se escribe el plan paso a paso
en `plans/` y se ejecuta.

## Origen
Pilares 10 y 11 de la Nueva Arquitectura: pasar de **1 PIN → 1 workspace** a **multi-usuario con
roles configurables** dentro del mismo workspace. Es la base de la que dependen versionado (Fase 2),
permisos (Fase 2), cierre (Fase 3), responsable en Producción (Fase 4) y Dashboard (Fase 6).

## Decisiones ya confirmadas (del roadmap)
1. **El `APP_PIN` actual = contraseña inicial del admin.** Sin fricción: hoy entras con PIN, mañana
   ese mismo PIN es la contraseña del usuario propietario.
2. **Permisos: set mínimo y crecer.** Fase 1 implementa el motor de permisos + un set pequeño;
   fases siguientes agregan permisos al catálogo.
3. **Versionado: solo cambios clave** (afecta Fase 2; aquí solo dejamos el `usuario_id` disponible
   en el historial para que Fase 2 lo use).
4. **100% web** (nada de PWA en esta fase).

## Estado actual (código real)
- **Login:** `POST /api/auth/login` recibe `{pin}` → busca `workspaces.pin` → firma JWT `{wsId}`
  (90d). (`server.js` ~788)
- **Guard:** `app.use('/api', …)` verifica el JWT y setea `req.wsId`. (`server.js` ~798)
- **No hay tabla de usuarios ni roles.** El "quién" no existe todavía.

## Modelo de datos (aditivo, no destructivo)

```sql
CREATE TABLE IF NOT EXISTS roles(
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  nombre TEXT NOT NULL,
  permisos TEXT DEFAULT '{}',      -- JSON { "crear_pedidos":true, "ver_costos":false, ... }
  es_admin INTEGER DEFAULT 0,      -- admin => todos los permisos, siempre (no editable a false)
  orden INTEGER DEFAULT 0,
  creado TEXT DEFAULT(datetime('now','localtime'))
);
CREATE TABLE IF NOT EXISTS usuarios(
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  usuario TEXT NOT NULL,           -- login (único dentro del workspace)
  pass_hash TEXT NOT NULL,         -- bcrypt
  nombre TEXT DEFAULT '',          -- nombre visible
  rol_id TEXT,
  activo INTEGER DEFAULT 1,        -- desactivar sin borrar
  creado TEXT DEFAULT(datetime('now','localtime'))
);
-- índice lógico de unicidad: (workspace_id, usuario). Se valida en el backend
-- (el resto del esquema tampoco usa UNIQUE compuestos estrictos).
```

### Seed / migración automática (al arrancar, idempotente)
Para cada workspace existente que **no tenga usuarios**:
1. Crear un **rol admin** (`es_admin=1`, nombre "Administrador").
2. Crear un **usuario propietario** `usuario="admin"`, `pass_hash = bcrypt(PIN del workspace)`,
   `rol_id = admin`. → así el PIN de hoy sigue funcionando como contraseña del admin.
3. (Opcional) crear un rol "Vendedor" de ejemplo con permisos básicos, desactivado hasta que el
   admin lo use. *(decisión micro — ver abajo)*

Todo con `INSERT OR IGNORE` / chequeo previo → correr el server N veces no duplica nada.

## Autenticación nueva (con compatibilidad)
`POST /api/auth/login` acepta **dos formas** durante y después de la transición:
- **`{usuario, pass}`** → busca `usuarios` en todos los workspaces por `usuario` + verifica bcrypt.
  *(si un mismo `usuario` puede repetirse entre workspaces, el login pide también identificar el
  negocio, o resolvemos por unicidad global del usuario — decisión micro).*
- **`{pin}`** (compat) → como hoy: resuelve workspace por PIN y entra como su **usuario admin**.

El JWT pasa de `{wsId}` a **`{wsId, userId, rolId}`** (90d).

Guard `app.use('/api', …)`: además de `req.wsId`, setea `req.userId`, `req.rolId`, y carga
`req.permisos` (JSON del rol; si `es_admin`, permisos = todos). Nuevo endpoint **`GET /api/me`**
devuelve `{ usuario, nombre, rol, permisos, es_admin }` para que el frontend sepa qué mostrar.

## Motor de permisos (mínimo, crecible)
- Helper `tienePermiso(req, clave)`: `true` si `req.permisos.es_admin` o `req.permisos[clave]===true`.
- Helper de ruta `requiere('clave')` → middleware que corta con 403 si no tiene el permiso.
- **Set inicial de permisos (Fase 1):**
  `administrar_usuarios`, `configurar_sistema`, `crear_pedidos`, `editar_pedidos`, `ver_costos`,
  `ver_utilidad`, `registrar_pagos`.
  (El resto del catálogo del pilar 11 se agrega en fases siguientes; el motor ya los soporta porque
  son solo claves en el JSON.)
- En Fase 1 aplicamos `requiere()` solo a las rutas de **gestión de usuarios/roles** y dejamos el
  resto igual (para no romper nada). La aplicación masiva de permisos a todas las rutas es **Fase 2**.

## Endpoints nuevos (Fase 1)
- `GET /api/me` — identidad + permisos del usuario actual.
- `GET /api/usuarios` · `POST /api/usuarios` · `PUT /api/usuarios/:id` · `PUT /api/usuarios/:id/pass`
  · `DELETE`→ desactivar. *(requieren `administrar_usuarios`)*
- `GET /api/roles` · `POST /api/roles` · `PUT /api/roles/:id` · `DELETE /api/roles/:id`.
  *(requieren `administrar_usuarios`)*
- `POST /api/me/pass` — cambiar la propia contraseña (cualquier usuario).

Todos filtran por `req.wsId` (aislamiento multi-tenant intacto).

## Frontend (index.html)
- **Login:** la pantalla de PIN gana pestaña/campos **Usuario + Contraseña**; el PIN queda como
  "acceso rápido de administrador". Guardar token igual que hoy (`localStorage`).
- **Configuración → nueva sección "Usuarios y Roles"** (solo visible con `administrar_usuarios`):
  - Lista de usuarios (nombre, usuario, rol, activo) + crear/editar/desactivar.
  - Editor de roles estilo Discord: nombre + **checkboxes de permisos**; el rol admin sale bloqueado.
- **Gating de UI:** tras login, `GET /api/me` guarda `PERMISOS` global; helper `puede('clave')`
  oculta botones/menús no permitidos. En Fase 1 el gating real de UI es mínimo (la sección de
  usuarios); se amplía en Fase 2.
- Regla de la casa: **nada de string interpolation con datos de usuario en `onclick`** (nombres con
  apóstrofes) → usar índices/referencias.

## Compatibilidad / seguridad
- **Dependencia nueva:** `bcrypt` (o `bcryptjs` puro-JS para evitar binarios nativos en Railway —
  decisión micro). Nunca guardar contraseñas en claro.
- El login por PIN sigue vivo → el negocio actual no se queda afuera ni un minuto.
- Migración 100% aditiva; **respaldo CSV antes de desplegar** (regla de la casa).
- Rutas viejas intactas: solo se **agrega** identidad; no se cambia la lógica de pedidos.

## Verificación (antes de "listo")
- `node --check` en server.js y en el `<script>` de index.html.
- Pruebas curl: (a) login con PIN sigue dando token válido; (b) `GET /api/me` responde admin con
  todos los permisos; (c) crear rol "Vendedor" con `crear_pedidos` sí / `ver_costos` no; (d) crear
  usuario con ese rol; (e) login de ese usuario; (f) `GET /api/me` refleja permisos correctos;
  (g) ese usuario recibe 403 al llamar `POST /api/usuarios`.
- Navegador: login por usuario, ver sección Usuarios/Roles, crear rol y usuario. Limpiar datos de
  prueba al terminar.

## Micro-decisiones (resolver al escribir el plan, no bloquean el diseño)
1. **Unicidad de `usuario`:** ¿único por workspace (y el login pide negocio si hay choque) o único
   global? Propuesta: único por workspace; como en la práctica hay pocos workspaces reales, el login
   por usuario+pass resuelve por el primero que haga match y, si hay ambigüedad, se añade el PIN del
   negocio. Simplest: **único global** para el MVP.
2. **`bcrypt` vs `bcryptjs`:** propuesta `bcryptjs` (sin compilación nativa, más seguro para el
   deploy de Railway).
3. **Roles de ejemplo sembrados:** ¿sembramos "Vendedor"/"Producción" de muestra o solo el admin?
   Propuesta: solo admin + un "Vendedor" vacío de ejemplo, editable.

## Próximo paso
Aprobar este diseño → escribir `plans/2026-07-09-fase1-usuarios-roles.md` con pasos chicos
(old/new exactos, `node --check` tras cada cambio, pruebas curl) → ejecutar tarea por tarea.
