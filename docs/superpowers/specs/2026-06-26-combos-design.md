# Combos (simple y mixto) — Diseño

**Fecha**: 2026-06-26
**Origen**: Fase 2 de `MASTER-DOCUMENTO-DESARROLLO.txt`, tipo de precio "Combo" — la única
pieza de 2A+2B que quedó fuera cuando se construyó Ficha de Producto, porque dependía de
inventario (Fase 4, ya desplegada en 4-A/4-B).

## Contexto

El documento maestro describe 3 variantes de Combo: **simple** (mismo producto, cantidad
fija, precio cerrado — ej. "6 vasos a $108.000"), **mixto** (productos distintos, precio
total cerrado — ej. "Kit bienvenida: camiseta + vaso + pendón a $95.000") y **con regla**
("Lleva 3 paga 2", se activa solo si la cantidad alcanza un mínimo).

Las primeras dos comparten exactamente el mismo mecanismo: una ficha de tipo `combo` con
una lista de componentes (`ficha_id` del producto real + cantidad que consume cada uno),
precio cerrado en `precio_base` (el mismo campo que ya usa Unitario, sin campos nuevos de
precio). "Combo con regla" es otra cosa: no es una composición de productos, es una
**regla de descuento condicionada a cantidad** sobre un solo producto — más parecido a
una variante de Escalonado que a un combo. Mezclar los tres en un solo sub-proyecto
infla el alcance sin necesidad. **Este sub-proyecto cubre solo simple + mixto.** "Combo
con regla" queda pendiente, sin fecha, como una pieza separada del motor de precios.

Explorado el código real antes de diseñar: el patrón ya establecido de `ficha_insumos`
(tabla hija + `guardarInsumos` DELETE+INSERT + inclusión en `fichaCompleta` + UI
repetidora con `fProdInsumos`/`addInsumo`/`renderInsumos`) es exactamente el patrón a
replicar para la composición del combo, con otra forma de datos.

## Alcance

### Tipo de precio nuevo: `combo`
`TIPOS_PRECIO_VALIDOS` gana `'combo'`. Usa el `precio_base`/`precio_base_calc` que ya
existe (precio cerrado total del combo, editable igual que Unitario) — sin campos de
precio nuevos.

### Composición del combo (tabla nueva `combo_composicion`)
`id, ficha_id (el combo), componente_ficha_id (el producto real), cantidad_consumida,
orden, workspace_id`. Un combo simple tiene una sola fila (ej. componente="Vaso",
cantidad=6); un combo mixto tiene varias (una fila por producto distinto del kit).
Función `guardarComposicion(fichaId,componentes,wsId)`, DELETE+INSERT, mismo patrón que
`guardarInsumos`. `fichaCompleta(f)` agrega `f.componentes=[...]`.

### Validación (`validarFicha`, cuando `tipo_precio==='combo'`)
- Debe tener al menos un componente.
- Cada componente necesita `componente_ficha_id` no vacío y `cantidad_consumida` entero
  positivo.
- El componente debe existir y pertenecer al mismo workspace (consulta a `db` dentro de
  la validación — ya hay precedente de acceso a `db` en el handler que llama a esta
  función).
- **El componente no puede ser otro combo** (anti-anidación: sin combos de combos, ni
  ciclos). Si `fichas_producto.tipo_precio` del componente es `'combo'`, error.
- En `PUT` (editar un combo ya existente), el componente no puede ser la ficha que se
  está editando (anti-auto-referencia). En `POST` no aplica (la ficha nueva aún no tiene
  id, no hay forma de auto-referenciarse al crearla).

### Descuento de inventario — expansión recursiva en `descontarStock`
Hoy `descontarStock` agrupa cantidad por `ficha_id` directo y resta de `stock_actual`.
Pasa a expandir: si el `ficha_id` de un ítem es de tipo `combo`, en vez de tocar su
stock (los combos no tienen `stock_actual` propio — queda `NULL`, igual que cualquier
ficha sin seguimiento), se multiplica la cantidad del ítem por la `cantidad_consumida`
de cada componente y se acumula esa cantidad en el componente real. La función queda
recursiva (soporta cualquier profundidad aunque hoy la validación ya impide más de un
nivel) para no tener que tocarla otra vez si en el futuro se relaja esa regla.
**`restaurarStock` no cambia** — ya opera sobre la "foto" de `stock_consumido`, que con
este cambio queda compuesta por los componentes reales expandidos, nunca por el id del
combo. El diseño de la Fase 4-A (restaurar desde la foto, no desde el estado actual) ya
cubre este caso sin tocarlo.

### Frontend — modal de Producto
- Selector de tipo de precio gana la opción "Combo".
- Nueva sección "Composición del combo" (visible solo si tipo es Combo, mismo patrón de
  `showTipoPrecioSec` ya existente para Escalonado/Promocional): repetidor de filas, cada
  una con autocompletado para buscar la ficha componente (reutiliza el patrón de
  autocompletado por fila ya generalizado en la Fase 2C, indexado por id de fila) +
  campo de cantidad. Variable en memoria `fProdComponentes`, funciones
  `addComponente`/`remComponente`/`setComponente`/`renderComponentes` — mismo patrón que
  `fProdInsumos`.
- El autocompletado de búsqueda de componentes usa el mismo endpoint `GET
  /api/productos?q=&activo=1` ya existente, filtrando en el cliente cualquier resultado
  cuyo `tipo_precio==='combo'` (no se puede elegir un combo como componente, refuerza en
  UI la misma regla que ya valida el backend).

### Frontend — autocompletado de Encargos
`ICONOS` gana `combo:'ti-package'`. El precio mostrado en el dropdown y al seleccionar
(`selItem`) es igual al de Unitario (`fCOP(p.precio_oficial)`, sin auto-recálculo por
cantidad) — ya cae naturalmente en la rama `else` existente de `selItem`, sin tocar esa
función.

## Explícitamente fuera de este sub-proyecto
- **Combo con regla** ("Lleva 3 paga 2") — mecanismo de descuento condicionado a
  cantidad sobre un solo producto, no de composición; diseño aparte, sin fecha.
- Mostrar el stock combinado de los componentes en el dropdown de autocompletado para un
  combo (hoy solo muestra `stock_actual` de la ficha misma, que para un combo es
  `NULL`) — mejora de UX posible más adelante, no bloquea esta entrega.
- Costo/margen calculado automáticamente a partir del costo de los componentes — el
  precio del combo sigue siendo 100% manual en `precio_base`, igual que Unitario.
- Combos anidados (un combo como componente de otro combo) — bloqueado explícitamente
  por validación, no implementado.

## Modelo de datos
```sql
CREATE TABLE IF NOT EXISTS combo_composicion(
  id TEXT PRIMARY KEY,
  ficha_id TEXT REFERENCES fichas_producto(id) ON DELETE CASCADE,
  componente_ficha_id TEXT NOT NULL,
  cantidad_consumida INTEGER NOT NULL,
  orden INTEGER DEFAULT 0,
  workspace_id TEXT
);
```

## Backend (`server.js`)
- `TIPOS_PRECIO_VALIDOS` gana `'combo'`.
- `guardarComposicion(fichaId,componentes,wsId)`: DELETE+INSERT.
- `validarFicha(b)`: bloque nuevo para `tipo_precio==='combo'` (ver Validación arriba).
- `fichaCompleta(f)`: agrega `f.componentes`.
- `POST`/`PUT /api/productos`: llaman `guardarComposicion` después de `guardarInsumos`,
  mismo patrón condicional que insumos en PUT (`if(b.componentes!==undefined)`).
- `descontarStock(pid,wsId)`: se reescribe para expandir combos recursivamente antes de
  acumular consumo (ver arriba). Se re-verifica con la misma secuencia curl ya probada en
  la Fase 4-A (20→20→15→15→20→17→20) como prueba de regresión antes de dar por bueno el
  cambio — el comportamiento para fichas no-combo no debe cambiar en nada.

## Frontend (`public/index.html`)
- Selector de tipo de precio: opción "Combo".
- `showTipoPrecioSec`: nueva rama para `#prod-sec-combo`.
- Sección "Composición del combo": repetidor con autocompletado por fila + cantidad.
- `guardarProducto()`: payload gana `componentes`.
- `resetProdForm`/`abrirEditarProducto`: limpian/cargan `fProdComponentes`.
- `acItem`: `ICONOS` gana `combo`.
