# Plan — Fase 1: Usuarios + Roles

**Fecha:** 2026-07-09 · **Spec:** `specs/2026-07-09-fase1-usuarios-roles-design.md`
**Micro-decisiones:** usuario único **por workspace** · **bcryptjs** · seed admin + rol Vendedor ejemplo.

Regla: `node --check` tras cada bloque de edición; pruebas curl al final; respaldo mental del PIN.

---

## Tarea 1 — Dependencia bcryptjs
- `package.json` → agregar `"bcryptjs": "^2.4.3"` a dependencies.
- `npm install` local. Verificar que arranca `node --check server.js`.
- En server.js (junto a los require de arriba): `const bcrypt=require('bcryptjs');`

## Tarea 2 — Tablas roles y usuarios + helpers
Insertar tras el bloque de workspaces (~línea 133, después del seed de workspaces):
- `CREATE TABLE IF NOT EXISTS roles(...)` y `usuarios(...)` según el spec.
- Helper `uid()` ya existe.
- Helper `permisosDeRol(rol)` → si `es_admin` devuelve objeto "todos"; si no, `JSON.parse(rol.permisos)`.

## Tarea 3 — Seed / migración PIN→admin (idempotente)
Función `sembrarUsuariosSiFalta()` que corre al arrancar, para cada workspace:
- Si el workspace ya tiene ≥1 usuario → skip.
- Crear rol admin (`es_admin=1`, "Administrador") si no existe.
- Crear rol "Vendedor" ejemplo con `{crear_pedidos:true, editar_pedidos:true, registrar_pagos:true}`.
- Crear usuario `admin` con `pass_hash=bcrypt.hashSync(ws.pin,10)`, `rol_id=admin`.
- Llamarla después de crear las tablas.

## Tarea 4 — Auth nueva (login + guard)
Reemplazar `POST /api/auth/login` (~788):
- Si `body.usuario && body.pass`: buscar usuarios activos con ese `usuario` (en cualquier ws),
  `bcrypt.compareSync` contra cada `pass_hash`; el que matchee → token `{wsId,userId,rolId}`.
- Si `body.pin`: como hoy, resolver ws por PIN → tomar su usuario admin → token `{wsId,userId,rolId}`.
- Error 401 genérico si nada matchea.
Guard `app.use('/api',…)` (~798): tras `req.wsId`, cargar usuario+rol; setear `req.userId`,
`req.rolId`, `req.permisos`. Si el token es viejo (solo `wsId`), degradar a admin del ws (compat).
Helper `requiere(clave)` → `(req,res,next)=>` 403 si no `req.permisos.__admin` ni `req.permisos[clave]`.

## Tarea 5 — Endpoints usuarios/roles
- `GET /api/me` → `{usuario,nombre,rol,permisos,es_admin}`.
- `POST /api/me/pass` → cambia la propia contraseña (verifica actual).
- `GET/POST/PUT/DELETE /api/roles` con `requiere('administrar_usuarios')`. No permitir borrar admin.
- `GET/POST/PUT /api/usuarios`, `PUT /api/usuarios/:id/pass`, `DELETE`→`activo=0`, con
  `requiere('administrar_usuarios')`. Validar unicidad `(wsId, usuario)`.

## Tarea 6 — Frontend
- Pantalla login: campos Usuario + Contraseña (POST con `{usuario,pass}`); mantener "acceso admin
  por PIN" como enlace secundario que envía `{pin}`.
- Tras login: `GET /api/me` → guardar `PERMISOS`/`ES_ADMIN` globales; helper `puede(clave)`.
- Configuración → nueva pestaña "Usuarios y Roles" (solo si `puede('administrar_usuarios')`):
  lista de usuarios (crear/editar/desactivar/cambiar pass) + editor de roles (nombre + checkboxes
  de permisos; admin bloqueado). Sin string-interpolation de datos de usuario en onclick.

## Tarea 7 — Verificación
`node --check` server.js + script index.html. Levantar server, curl:
1. login `{pin:"1234"}` → token OK. 2. `/api/me` → admin, es_admin true.
3. crear rol Vendedor (crear_pedidos sí, ver_costos no). 4. crear usuario con ese rol.
5. login `{usuario,pass}` → token. 6. `/api/me` refleja permisos. 7. ese usuario → 403 en POST /api/usuarios.
Limpiar usuarios/roles de prueba (o dejar el admin real intacto).

## Tarea 8 — Commit + push
`[FEATURE] v3.0 Fase 1: usuarios + roles configurables (login usuario/pass, PIN=admin, permisos base)`.
