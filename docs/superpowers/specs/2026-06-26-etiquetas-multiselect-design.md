# Multi-selección de Etiquetas y Subetiquetas en Encargos — Diseño

**Fecha**: 2026-06-26
**Origen**: feedback directo del usuario probando la Fase 2E recién desplegada — las
etiquetas son solo informativas (para saber a grandes rasgos de qué va un pedido), así
que debe poder elegirse más de una a la vez. Confirmado con el usuario: las subetiquetas
también deben ser multi-select, mezclando las de todas las etiquetas elegidas en una
sola lista.

## Contexto

Hoy un Encargo guarda una sola `categoria` (id de etiqueta) y una sola `subcategoria`
(string), ambas como columnas `TEXT` simples en `encargos`, sin ninguna validación de
integridad (confirmado en la Fase 2E). Elegir una etiqueta nueva reemplaza la anterior;
las subetiquetas mostradas son solo las de la etiqueta actualmente elegida.

Localizados con grep TODOS los puntos que leen `categoria`/`subcategoria` antes de
diseñar (ninguno quedó fuera): `saveEncargos`, `pedidoCompleto`, `GET
/api/clientes/:id` (resumen de historial), `GET /api/export/csv`, y en el frontend
`renderLista` (badges del pedido), `verCli` (resumen de historial), `setEncCat`/
`setEncSub` (selección), el markup de botones de etiqueta/subetiqueta del modal de
Encargo, y `renderEncSubcats`.

## Alcance

### Modelo de datos: columnas nuevas, no se tocan las viejas
`encargos` gana `categorias TEXT DEFAULT '[]'` (JSON array de ids de etiqueta) y
`subcategorias TEXT DEFAULT '[]'` (JSON array de strings). Las columnas viejas
`categoria`/`subcategoria` **no se vuelven a escribir** desde este cambio en adelante,
pero tampoco se borran ni se migran — quedan como dato histórico congelado de encargos
guardados antes de este cambio.

### Compatibilidad con datos viejos: shim de lectura, no de escritura
En el backend, cualquier lugar que entregue un encargo al frontend (`pedidoCompleto`,
`GET /api/clientes/:id`) resuelve `categorias`/`subcategorias` así: si la columna nueva
ya tiene contenido, se usa tal cual (parseado de JSON); si está vacía Y la columna vieja
tiene un valor, se trata como un array de un solo elemento. Así el frontend nunca necesita
saber que existe una distinción "viejo/nuevo" — siempre recibe un array limpio.

### Selección: togglear, no reemplazar
`setEncCat`/`setEncSub` (que hoy reemplazan el valor) se convierten en
`toggleEncCat`/`toggleEncSub` (agregan o quitan del array). Al quitar una etiqueta, se
filtran del array de subetiquetas elegidas las que ya no pertenezcan a NINGUNA etiqueta
todavía seleccionada (si "Camisetas" solo existía bajo "Estampados" y se quita
"Estampados", "Camisetas" se quita también de lo elegido — pero si "Camisetas" también
fuera subetiqueta de otra etiqueta que sigue elegida, se mantiene).

### Subetiquetas mezcladas (confirmado con el usuario)
El picker de subetiquetas muestra la unión (sin duplicados) de las `subs` de TODAS las
etiquetas actualmente elegidas en una sola lista plana — no agrupada por etiqueta de
origen. Cualquiera de esas se puede marcar, también multi-select.

## Explícitamente fuera de esto
- No se valida que las etiquetas/subetiquetas elegidas existan realmente en `CATS` al
  guardar — mismo nivel (ausencia) de validación que ya tenía esto antes.
- No se migra ni reescribe ningún encargo ya guardado — el shim de lectura cubre los
  datos viejos sin tocarlos.
- Fichas de producto (`categoria_id`) no cambia — sigue siendo de una sola etiqueta; el
  pedido del usuario fue específicamente sobre Encargos/Pedidos, no sobre Productos.

## Backend (`server.js`)
- Migración: `categorias`/`subcategorias` en `encargos`.
- `saveEncargos`: persiste los arrays nuevos (`JSON.stringify`).
- `pedidoCompleto`: resuelve `categorias`/`subcategorias` con el shim de lectura
  descrito arriba, para cada encargo.
- `GET /api/clientes/:id`: la consulta SQL trae también las columnas nuevas y viejas;
  `encargosResumen` se construye con el mismo shim.
- `GET /api/export/csv`: usa `pedidoCompleto`, así que `e.categorias` ya llega como
  array — solo cambia cómo se arma el texto de cada línea del CSV.

## Frontend (`public/index.html`)
- `toggleEncCat(id,catId)` / `toggleEncSub(id,sub)` reemplazan `setEncCat`/`setEncSub`.
- Markup de botones de etiqueta/subetiqueta del modal de Encargo: resaltado por
  `.includes()` en vez de `===`, subetiquetas como unión de las etiquetas elegidas.
- `renderEncSubcats`: misma unión.
- `renderLista`: badges del pedido vía `flatMap` sobre `categorias` de cada encargo
  (antes era `.map` de un solo valor).
- `verCli`: el resumen de historial junta los labels de varias etiquetas y varias
  subetiquetas con coma, en vez de mostrar solo una de cada.
