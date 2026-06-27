# Modo "Por variantes" — Diseño

**Fecha**: 2026-06-26
**Origen**: rediseño total de Productos, sub-proyecto 4 de 6. Modo de cálculo nuevo sobre
el motor de costeo ya montado (ver [[costeo-industria-grafica]] y el spec de Por medidas).
Caso real del usuario: **retablos** — un mismo producto con varios tamaños (10×10, 20×20,
30×40), cada uno con su propio costo y precio de venta.

## Qué es "Por variantes"
Un producto que es **uno solo** pero existe en varias versiones **excluyentes** (el cliente
elige UNA). A diferencia de Combo (varios productos que se suman), aquí las variantes no se
suman: son alternativas. Evita tener que crear 20 productos distintos para 20 tamaños.

## Alcance de esta rebanada (v1)
- Cada variante tiene **nombre + precio**. Se elige la variante al vender; su precio pasa a
  ser el valor unitario de la línea.
- La tarjeta del producto muestra **"desde $X"** (el precio más bajo entre las variantes).

### Deliberadamente fuera de v1 (mejoras siguientes, el usuario pidió "poco a poco")
- **Tramos por cantidad dentro de cada variante** (un 10×10 más barato si pides 10). El
  usuario lo mencionó; se difiere para no apilar demasiado. La tabla `ficha_variantes` se
  diseña dejando lugar para agregarlo después (columna `tramos` reservada, v1 la deja '[]').
- **Inventario por variante** (stock propio de cada tamaño). Hoy el stock es por ficha;
  hacerlo por variante toca `descontarStock`. Se difiere; v1 los productos por variantes no
  participan de la pestaña Inventario (como medidas/combo/promoción, que ya se excluyen).

## Modelo de datos (server.js)
Nuevo `tipo_precio='variantes'` (sumar a `TIPOS_PRECIO_VALIDOS`). Tabla nueva:
```
CREATE TABLE IF NOT EXISTS ficha_variantes(
  id TEXT PRIMARY KEY,
  ficha_id TEXT REFERENCES fichas_producto(id) ON DELETE CASCADE,
  workspace_id TEXT,
  nombre TEXT NOT NULL,
  precio TEXT DEFAULT '',
  precio_calc TEXT,
  tramos TEXT DEFAULT '[]',   -- reservado para tramos por variante (v2)
  orden INTEGER DEFAULT 0
)
```
- `guardarVariantes(fichaId, variantes, wsId)`: borra y reinserta (mismo patrón que
  `guardarComposicion`), `normCalc(v.precio)` para el `_calc`.
- `fichaCompleta`: `f.variantes = SELECT * FROM ficha_variantes WHERE ficha_id=? ORDER BY
  orden`. Para `tipo_precio==='variantes'`, `precio_oficial = min(precio_calc de las
  variantes)` (el "desde"); si no hay variantes, 0.
- `precioOficialFicha`: no necesita rama (el `precio_oficial` de variantes se calcula en
  `fichaCompleta` directamente, igual que el combo individual).
- `validarFicha`: para `'variantes'` — al menos 1 variante; cada una con `nombre` no vacío y
  `precio` expresión válida y definida.
- POST/PUT: llamar `guardarVariantes(id, b.variantes, wsId)` cuando `b.variantes!==undefined`
  (igual que insumos/componentes). Las columnas escalares de la ficha no cambian.

## Frontend — modal de Producto
- El selector "Modo de cálculo" (hoy: Por cantidad / Por medidas) gana una 3ª opción
  **"Por variantes (varios tamaños/versiones)"**. `prodModoCalculo` ahora puede ser
  `'cantidad'|'medidas'|'variantes'`.
- `setModoCalculo`: cuando `'variantes'` → muestra `prod-sec-variantes`, oculta
  margen-precio, escalonado y medidas. (Insumos colapsable sigue disponible, informativo.)
- Sección `prod-sec-variantes`: mini-tabla (nombre + precio) con
  `addVariante`/`remVariante`/`setVariante`/`renderVariantes`, estado `fProdVariantes`.
  Leyenda: "Cada versión del producto con su propio precio. Ej: Retablo 10×10 → $X, 20×20
  → $Y. El cliente elige una al pedir."
- `resetProdForm` limpia `fProdVariantes`/render; `abrirEditarProducto` carga
  `p.variantes`; `guardarProducto` manda `variantes` cuando el modo es variantes y
  `tipo_precio='variantes'`; `validarProductoBody` valida ≥1 variante con nombre+precio.

## Frontend — tarjeta de producto
- `TIPO_LABEL` suma `variantes:'Por variantes'`.
- Para `tipo_precio==='variantes'`, muestra `'desde '+fCOP(precio_oficial)`.

## Frontend — captura en el Encargo
- `acItem`: `ICONOS` suma `variantes:'ti-layout-grid'`; `precioTxt` = `'desde '+fCOP(
  precio_oficial)`.
- `selItem`: rama `'variantes'` — `it._variantes=p.variantes`, `it._varSel=''`,
  `valor_unitario=''` (hasta elegir variante), `_autoPrecio=true`.
- `renderItemsHTML`: si `it._fichaSel?.tipo_precio==='variantes'`, debajo del detalle un
  `<select>` con las variantes (placeholder "Elige el tamaño/versión…"). `setVarItem(encId,
  itemId,idx)` fija `it._varSel`, `valor_unitario=variante.precio_calc`, refleja el nombre
  de la variante en el texto del detalle (ej. "Retablo — 20×20"), actualiza `itval-` y total.
- Las variantes vienen ya en `it._fichaSel.variantes` (repobladas al cargar el pedido por
  el mismo mecanismo que `_fichaSel`). El `valor_unitario` elegido se persiste; cuál
  variante se eligió queda en el texto del detalle (v1, igual criterio que medidas).

## Patrón consistente con lo ya hecho
Misma mecánica que Por medidas: un modo nuevo, una sección en el modal, un control extra en
la fila del Encargo bajo el detalle, y el cálculo refleja en `valor_unitario`. Reusa
`toast`, `displayMoneyVal`, `evalExpr`, `normCalc`, y el patrón destroy-and-recreate de
`guardarComposicion`.
