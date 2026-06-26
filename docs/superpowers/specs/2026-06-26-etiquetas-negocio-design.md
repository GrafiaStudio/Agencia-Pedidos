# Etiquetas personalizables por negocio — Diseño

**Fecha**: 2026-06-26
**Origen**: Fase 2E de `MASTER-DOCUMENTO-DESARROLLO.txt` — la última pieza pendiente de
la Fase 2 completa (todo lo demás: Unitario/Escalonado/Combo/Promocional/Lleva N paga M,
autocompletado, costos, ya está desplegado).

## Contexto

Hoy `CATS` es una constante JS hardcodeada en el frontend (`public/index.html`, no
existe en el backend en absoluto), compartida por **todos los workspaces** — 6
categorías fijas (Estampados, Publicidad, Diseño, Papelería, Artesanías, Servicios), cada
una con un `id` (slug), `label`, una clase CSS de color (`tc`) y un array plano de
subcategorías de texto (`subs`, sin id propio).

Investigado el código real antes de diseñar: no hay ninguna validación de integridad
hoy — `encargos.categoria`/`encargos.subcategoria`/`fichas_producto.categoria_id` son
`TEXT` libres sin `CHECK` ni FK, y guardan el `id`/label tal cual los entrega `CATS`. Esto
simplifica mucho la migración: **sembrando cada workspace con los mismos 6 slugs que ya
usa hoy, ningún dato existente necesita reescribirse.**

La pieza más delicada es el color: hoy son 6 clases CSS fijas (`.tc-estampados`, etc.)
codificadas a mano, una por nombre de categoría — no escala a categorías con nombres
arbitrarios que el negocio cree después. Se resuelve con una **paleta fija de 6 colores**
(los mismos 6 que ya existen visualmente, solo que ahora identificados por un nombre de
paleta en vez de por el nombre de la categoría): el usuario elige uno de los 6 al crear o
editar una etiqueta, no un color libre.

## Alcance

### Modelo de datos
Una tabla nueva, `etiquetas_negocio`, con una fila por categoría y un `workspace_id` —
mismo patrón de aislamiento multi-tenant que el resto de la app. Las subcategorías siguen
siendo texto libre (igual que hoy), guardadas como JSON en una columna (mismo patrón que
`fichas_producto.rangos`) — no se les da identidad propia porque no la tienen hoy y nada
en el alcance de este sub-proyecto lo necesita.

### Siembra perezosa (sin enumerar workspaces de antemano)
La primera vez que un workspace pide sus etiquetas (`GET /api/etiquetas`) y no tiene
ninguna fila todavía, el backend siembra las 6 categorías actuales **con los mismos
slugs de hoy** (`estampados`, `publicidad`, `diseno`, `papeleria`, `artesanias`,
`servicios`) antes de responder. Evita tener que enumerar "todos los workspaces que
existen" — cada uno se siembra solo la primera vez que realmente lo necesita, igual de
correcto para el workspace `main` (datos reales de hoy) que para cualquier workspace de
prueba o futuro.

### Backend: CRUD por workspace
`GET/POST/PUT/DELETE /api/etiquetas` (y `/api/etiquetas/:id` para editar/borrar), todos
protegidos por el middleware `/api` ya existente y filtrados por `req.wsId`. Validación:
nombre no vacío, color debe ser uno de los 6 de la paleta, subcategorías como array de
strings no vacíos.

### Compatibilidad total con el frontend existente, sin tocar los 6 sitios que ya
### consumen `CATS` hoy
La respuesta de `GET /api/etiquetas` devuelve cada fila con la **misma forma** que el
frontend ya espera de `CATS` hoy (`{id, label, tc, subs}`) — el backend mapea
internamente `nombre→label` y `color→tc` (`` `tc-${color}` ``) antes de responder. Esto
significa que `renderLista`, `cargarProductos`, `verCli`, `renderEncs`,
`renderEncSubcats` y `renderProdCatRow` (los 6 lugares que ya leen `CATS.find`/`CATS.map`
hoy) **no cambian en absoluto** — solo cambia de dónde viene el array: de una constante
estática a una variable poblada por `cargarEtiquetas()` al iniciar la sesión, igual
patrón que ya usa `CFG`/`cargarConfiguracion()`.

### Frontend: gestión de etiquetas
Nueva sub-pestaña "Etiquetas" dentro de Configuración (mismo mecanismo `.cfgtab`/
`.cfg-panel`/`showCfgTab` ya existente — agregar un 6to tab ahí es seguro porque es
dentro de la MISMA vista, sin el riesgo de colisión que sí aplicó al construir Ayuda y
About con sus propias clases). Lista de etiquetas con su color, subcategorías (texto
separado por comas, no un repetidor — se mantiene simple) y un toggle activo/inactivo;
botón "Agregar etiqueta" con nombre + selector de 6 swatches de color + campo de
subcategorías. Eliminar una etiqueta es una acción real (no hay "deshacer") — se advierte
en el botón, mismo nivel de fricción que ya tienen otras eliminaciones en la app.

## Explícitamente fuera de esto
- Dar identidad propia a las subcategorías (id, reordenar, etc.) — siguen siendo texto
  libre, igual que hoy.
- Colores libres/hex — solo la paleta fija de 6, por la razón ya explicada (las clases
  CSS no escalan a colores arbitrarios sin generar CSS dinámico, que es más riesgo del
  que justifica esta mejora).
- Migrar datos de pedidos/fichas existentes — no hace falta, la siembra preserva los
  slugs actuales.
- Un filtro de categoría en Pedidos/Registros — no existe hoy, no lo pide este
  sub-proyecto (el documento maestro solo pide poder personalizar las etiquetas, no
  filtrar por ellas).

## Modelo de datos
```sql
CREATE TABLE IF NOT EXISTS etiquetas_negocio(
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  nombre TEXT NOT NULL,
  color TEXT DEFAULT 'slate',
  subs TEXT DEFAULT '[]',
  activo INTEGER DEFAULT 1,
  orden INTEGER DEFAULT 0
);
```
Paleta válida: `purple, amber, orange, teal, green, slate` (las mismas 6 ya usadas
visualmente hoy, solo renombradas de semánticas a genéricas). Las clases CSS
`.tc-estampados`/`.tc-publicidad`/`.tc-diseno`/`.tc-papeleria`/`.tc-artesanias`/
`.tc-servicios` se renombran a `.tc-purple`/`.tc-amber`/`.tc-orange`/`.tc-teal`/
`.tc-green`/`.tc-slate` (mismos colores, mismo orden, solo el nombre de la clase cambia).

## Backend (`server.js`)
- `getEtiquetas(wsId)`: si no hay filas, siembra las 6 default; devuelve el array
  mapeado a `{id,label,tc,color,subs,activo}` (incluye `color` crudo y `tc` ya
  construido, para no obligar al frontend a reconstruirlo).
- `GET/POST/PUT/DELETE /api/etiquetas[/:id]`.

## Frontend (`public/index.html`)
- `const CATS=[...]` → `let CATS=[]`.
- `cargarEtiquetas()` nueva, llamada en `init()` justo después de `cargarConfiguracion()`
  (debe estar lista antes de `cargarPedidos()`, que dispara `renderLista` y sí depende
  de `CATS`).
- Sub-pestaña "Etiquetas" en Configuración: lista + alta + edición + borrado.
- Renombrar las 6 clases CSS de la paleta (`.tc-estampados`→`.tc-purple`, etc.) — el
  HTML/JS que las consume sigue escribiendo `cat.tc` tal cual, sin cambios, porque el
  backend ya entrega el nombre de clase final.
