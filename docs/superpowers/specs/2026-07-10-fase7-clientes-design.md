# Fase 7 — Clientes: plegado + bloqueo por rol — Diseño

**Fecha:** 2026-07-10 · Roadmap v3.0, pilar 9. Última fase del roadmap.

## Objetivo
1. En el **Pedido** solo queda visible lo esencial del cliente (Nombre, Teléfono); lo demás
   (NIT, Contacto, Dirección, Email) queda **plegado** tras "Más datos del cliente".
2. Tras confirmar un pedido, **solo roles con `editar_clientes`** modifican los datos del cliente
   (UI bloquea + servidor neutraliza). La edición formal vive en el **módulo Clientes**.
3. Clientes nunca se eliminan del flujo normal (archivar/reactivar ya existía); el borrado
   definitivo (desde Archivo) ahora exige `editar_clientes`.

## Backend
- Permiso nuevo `editar_clientes` en PERMISOS_FASE1.
- **PUT /api/pedidos/:id**: sin permiso → neutraliza `b.nombre/b.tel/b.cliente_id/b.cli_*`
  (los fija a los valores existentes) ANTES de `asegurarCliente` → el pedido se guarda pero el
  cliente no cambia. Crear pedido (POST) sigue libre: crear cliente va con `crear_pedidos`.
- **PUT /api/clientes/:id** (nuevo) `requiere('editar_clientes')`: edita nombre/tel/nit/email/
  direccion/contacto/notas y **propaga nombre/tel a los pedidos** del cliente (copias coherentes).
- **DELETE /api/clientes/:id** → `requiere('editar_clientes')`.

## Frontend
- Editor de pedido: toggle `.cli-more-toggle` ("Más datos del cliente · NIT · contacto · dirección
  · correo") pliega el grid de 4 campos. `abrirNuevo` → plegado; `abrirEditar` → abierto solo si
  hay datos. `aplicarBloqueoCliente()` deshabilita los 6 campos al editar sin permiso y muestra el
  hint "🔒 Solo roles autorizados editan los datos del cliente". Orden importante: se aplica ANTES
  de `aplicarModoCerrado` para que el candado de cliente sobreviva a reabrir un pedido cerrado.
- Módulo Clientes (`verCli` → `renderCliModal(editando)`): ficha compacta (filas `cli-dato`, solo
  campos con valor) + botón **"Editar datos"** (con permiso) que muestra el form inline (nombre,
  tel, nit, email, dirección, contacto, notas) → `guardarCli()` → PUT + refresco de listas. Sin
  permiso, hint de candado.
- `PERM_LABELS.editar_clientes`.

## Verificación (2026-07-10)
API: PUT/DELETE clientes como Vendedor → 403; PUT pedido como Vendedor con `nombre/cli_nit`
cambiados → guarda notas pero nombre/nit intactos. Admin: PUT clientes actualiza y propaga.
UI: plegado abre solo con datos; "Editar datos" en modal Clientes guarda y refresca (email visible).
Consola sin errores.
