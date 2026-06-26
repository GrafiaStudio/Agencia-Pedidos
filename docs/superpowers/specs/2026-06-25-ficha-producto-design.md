# Ficha de Producto — Diseño

**Fecha**: 2026-06-25
**Origen**: Fase 2A+2B de `MASTER-DOCUMENTO-DESARROLLO.txt` (raíz del proyecto, fuera del
repo). Segundo sub-proyecto de la Fase 2 ("Inteligencia de precios y productos") — el
primero fue 2D (Cantidad/Valor unitario en costos del pedido, commit `44cb327`).

## Contexto

La Fase 2 se partió en sub-proyectos independientes por las dependencias reales que
tiene (ver `master_documento_roadmap.md` en la memoria persistente): los combos
dependen de inventario (Fase 4, no existe) y las etiquetas personalizables por negocio
(2E) chocan con que `CATS` hoy es un array fijo compartido por todos los workspaces.

Este sub-proyecto cubre **2A (Ficha de Producto)** y **2B (tipos de precio)**, excepto
combos. Cierra dejando la app en un estado funcional propio: las fichas de producto se
pueden crear, editar, listar y buscar en su propia sección, pero **el formulario de
"Nuevo pedido" no se toca en absoluto** — el autocompletado que las conecta con un
pedido es la Fase 2C, el siguiente sub-proyecto, no este.

## Alcance

### Ubicación en la app
Sección nueva **"Productos"** en el sidebar, al mismo nivel que Pedidos/Clientes/
Registros/Configuración. Vista de lista en cards (mismo patrón visual que Clientes, con
una barra de búsqueda por nombre) + modal de creación/edición (mismo patrón que "Nuevo
pedido": cabecera con título/cerrar, cuerpo con secciones, botón guardar).

Cada card de la lista muestra: nombre, categoría (si tiene), un badge con el tipo de
precio, el **Precio oficial** formateado (ver jerarquía del precio abajo — no
necesariamente el `precio_base` crudo), y un badge "Inactivo" si `activo=false`.

### Jerarquía del precio (mismo patrón que Valor Sugerido → Valor Final del Pedido)

```
Insumos (cantidad_usada × costo_unitario de cada uno)
  → Costo total = suma de todos los subtotales (0 si no hay insumos)
  → Precio sugerido = Costo total transformado por el margen (solo si margen_tipo
    es 'multiplicador' o 'porcentaje' — con 'fijo' no hay sugerencia que mostrar),
    recalculado SIEMPRE a partir de los insumos/margen actuales — nunca se guarda fijo.
  → Precio oficial de la ficha = Precio base si está definido (`definido()`, igual al
    resto de la jerarquía de valores de la app), si no el Precio sugerido del momento.
```

`precio_base` se guarda en la base de datos exactamente como lo deja el usuario —
**vacío/`NULL` si nunca lo tocó**, no "completado" con el sugerido al guardar. Esto
importa: si más adelante cambia el costo de un insumo, una ficha sin Precio base manual
debe reflejar el nuevo sugerido automáticamente la próxima vez que se mire — igual que
"Valor Sugerido del Pedido" se recalcula siempre y "Valor Final del Pedido" solo lo
reemplaza si el usuario lo definió explícitamente (`valorOficialPedido()` en
`server.js`). Aquí el equivalente es `precioOficialFicha(ficha)`, análogo en backend y
frontend a las funciones ya existentes (`calcReferencialEncargo`,
`calcValorEncargoEfectivo`, `calcValorSugerido`, `valorOficialPedido`).

Fórmulas del Precio sugerido:
- **Multiplicador**: `Costo total × margen_valor` (ej. costo $11.000 × 2 = $22.000).
- **Porcentaje**: `Costo total + Costo total × (margen_valor/100)`.
- **Fijo**: no aplica — el campo "Precio sugerido" no se muestra; el usuario escribe el
  Precio base directamente. Este modo cubre también los servicios sin insumos (ej.
  "Diseño de logo": sin insumos, sin margen, precio directo $350.000).

`margen_tipo` es siempre uno de los 3 valores anteriores — no existe un 4° estado "sin
margen": un producto sin insumos y sin necesidad de margen simplemente usa `fijo`.

### Insumos (opcional, lista dinámica)
Mismo patrón visual que los ítems de un encargo (tabla con filas agregables/quitables):
nombre, proveedor (opcional), costo unitario (acepta expresiones matemáticas, igual al
resto de campos monetarios de la app — columna `costo_unitario_calc` igual a como
`enc_items.valor_unitario` ya tiene su `_calc`), cantidad usada, unidad de medida (texto
libre, ej. "m", "unidad", "kg"), checkbox "Costo variable" (se guarda pero no se conecta
a ningún lado todavía — está para cuando la Fase 2C lo necesite), subtotal calculado
automáticamente (`cantidad_usada × evalExpr(costo_unitario)`).

### Categoría
Reusa el selector de `CATS` que ya existe (mismo patrón de botones tipo pill que ya usan
los encargos para categoría/subcategoría) — opcional. No se toca nada de `CATS` ni se
adelanta la Fase 2E (etiquetas personalizables por negocio).

### Tipo de precio
Selector que muestra/oculta la sección correspondiente:
- **Unitario**: sin sección adicional. El Precio base es el precio siempre.
- **Escalonado**: tabla dinámica de rangos — columnas Desde / Hasta / Precio por unidad.
  Se pueden agregar tantos rangos como se necesite; el último rango puede dejar "Hasta"
  vacío (sin límite superior). El campo Precio por unidad de cada rango acepta
  expresiones en la UI (conveniencia para escribir, ej. `5*6400`), pero lo que se guarda
  en el JSON de rangos es siempre el número ya evaluado — a diferencia de los campos
  monetarios individuales de la app, un rango dentro del JSON no preserva el texto
  crudo para auditoría (no aplica aquí: no hay "un solo campo" que editar después, son
  filas de una tabla que el usuario puede borrar y rehacer libremente).
  Estructura guardada: `[{"desde":1,"hasta":11,"precio":32000},...,{"desde":36,"hasta":null,"precio":26000}]`.
- **Promocional**: fecha de inicio, fecha de fin, cantidad mínima, descripción libre
  (texto). No hay lógica de vigencia activa todavía (eso depende del autocompletado de
  la Fase 2C, que es quien necesita filtrar por fecha) — se guardan los datos, listos
  para cuando ese sub-proyecto los use.
- *(Combo simple/mixto/con regla: explícitamente fuera de este sub-proyecto.)*

`activo` (checkbox, default `true`): si está en `false`, la card se ve con un badge
"Inactivo" en la lista. No filtra nada todavía — el filtrado real importa cuando exista
el autocompletado (Fase 2C) que decide qué fichas mostrar.

## Modelo de datos

```sql
CREATE TABLE IF NOT EXISTS fichas_producto(
  id TEXT PRIMARY KEY,
  workspace_id TEXT,
  nombre TEXT NOT NULL,
  categoria_id TEXT DEFAULT '',
  tipo_precio TEXT NOT NULL DEFAULT 'unitario',
  margen_tipo TEXT NOT NULL DEFAULT 'fijo',
  margen_valor TEXT DEFAULT '',
  precio_base TEXT DEFAULT '',
  precio_base_calc TEXT,
  rangos TEXT DEFAULT '[]',
  fecha_inicio TEXT DEFAULT '',
  fecha_fin TEXT DEFAULT '',
  cantidad_minima TEXT DEFAULT '',
  descripcion TEXT DEFAULT '',
  activo INTEGER DEFAULT 1,
  creado TEXT DEFAULT(datetime('now','localtime'))
);
CREATE TABLE IF NOT EXISTS ficha_insumos(
  id TEXT PRIMARY KEY,
  ficha_id TEXT REFERENCES fichas_producto(id) ON DELETE CASCADE,
  nombre_insumo TEXT NOT NULL,
  proveedor TEXT DEFAULT '',
  costo_unitario TEXT DEFAULT '',
  costo_unitario_calc TEXT,
  cantidad_usada TEXT DEFAULT '',
  unidad_medida TEXT DEFAULT '',
  es_variable INTEGER DEFAULT 0,
  orden INTEGER DEFAULT 0
);
```

`tipo_precio` ∈ `{unitario, escalonado, promocional}` (sin combos en este sub-proyecto).
`margen_tipo` ∈ `{multiplicador, porcentaje, fijo}`. Ambos validados contra whitelist en
el servidor, mismo patrón que ya usa `formato_fecha`/`separador_miles` en Configuración.

`margen_valor` es un número simple (multiplicador o porcentaje, ej. `2` o `35.5`), NO
acepta expresiones matemáticas — a diferencia de los campos de dinero, no tiene sentido
escribir `2+3` como multiplicador. Se valida como número positivo simple.

## Backend (`server.js`)

Nuevos endpoints, mismo patrón de auth/validación/`workspace_id` que el resto de la API:
- `GET /api/productos` — lista del workspace, acepta `?q=` (busca por nombre).
- `GET /api/productos/:id` — incluye sus insumos.
- `POST /api/productos` — crea ficha + insumos. Valida: `nombre` no vacío,
  `tipo_precio`/`margen_tipo` contra whitelist, `margen_valor` numérico si está definido,
  `precio_base` como expresión válida si está definido (mismo `evalExpr`/`definido` de
  siempre), cada `insumo.costo_unitario` como expresión válida si está definido, y para
  `tipo_precio='escalonado'` valida que `rangos` sea un array no vacío con
  `desde`/`precio` numéricos y `hasta` numérico o `null`.
- `PUT /api/productos/:id` — misma validación, reemplaza insumos igual que
  `saveEncargos` reemplaza encargos (`DELETE` + re-`INSERT`).
- `DELETE /api/productos/:id`.

`GET /api/productos` y `GET /api/productos/:id` devuelven, además de las columnas
crudas, los campos calculados `costo_total`, `precio_sugerido` y `precio_oficial` (vía
`calcCostoTotalInsumos(ficha)`, `calcPrecioSugerido(ficha)` y `precioOficialFicha(ficha)`
en `server.js`, mismo patrón que `pedidoCompleto()` ya agrega `valor_sugerido`/
`valor_total` a cada pedido). El servidor solo persiste lo que llega en `precio_base`
(y su `_calc`) al guardar — nunca escribe un valor calculado ahí.

## Explícitamente fuera de este sub-proyecto
- Autocompletado dentro del formulario de pedido (Fase 2C) — incluye la lógica de
  "detectar en qué rango cae la cantidad" y el filtro de promociones vigentes por fecha.
  Ambas cosas ya tienen los datos guardados y listos, pero no se conectan a nada todavía.
- Combo simple/mixto/con regla (dependen de inventario, Fase 4).
- Etiquetas personalizables por negocio (Fase 2E) — la categoría sigue usando `CATS`.
