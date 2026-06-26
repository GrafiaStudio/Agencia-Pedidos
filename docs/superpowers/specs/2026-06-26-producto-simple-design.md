# Producto Simple (unificar Unitario+Escalonado+Lleva N paga M) — Diseño

**Fecha**: 2026-06-26
**Origen**: segunda de 4 mejoras independientes acordadas con el usuario (orden
D→A→C→B) tras su feedback sobre la pestaña Productos. Brainstorm ya resuelto y
aprobado en partes 1 y 2 de esa conversación.

## Contexto

Hoy, crear un producto exige elegir entre 5 opciones mezcladas en un solo desplegable:
Unitario, Escalonado, Lleva N paga M, Combo, Promocional. El usuario señaló que
Unitario y Escalonado son redundantes — Escalonado, con un solo rango "desde 1, sin
tope", ya es exactamente Unitario. Pidió que la ventana fuera una sola para ese caso, y
que al crear un producto se elija primero entre 3 caminos grandes: **Producto simple**,
**Combo**, **Promoción** — sin desplegable mezclado.

Investigado el código real antes de diseñar, un hallazgo clave que simplifica todo:
`precioOficialFicha(ficha,precioSugerido)` — la función que resuelve el precio real de
una ficha — **ya es idéntica para Unitario y Escalonado**: `definido(precio_base) ?
precio_base_calc : precioSugerido`. No distingue tipo. La única diferencia real hoy es
que `selItem`/`setItem` usan `detectarPrecioEscalonado(rangos,cantidad)` en vez de
`precio_oficial` cuando el tipo es `'escalonado'` — y si `rangos` viene vacío,
`detectarPrecioEscalonado` devuelve `null` (hoy esto nunca pasa porque `validarFicha`
exige al menos un rango para Escalonado). Esto significa que **no hace falta ninguna
migración de datos ni un campo nuevo** — alcanza con dejar que `rangos` pueda estar
vacío y caer de vuelta a `precio_oficial` cuando ningún rango coincide.

## Alcance

### Modelo: `precio_base` es la base, `rangos` son tramos adicionales opcionales
- `rangos` deja de ser obligatorio para `tipo_precio='escalonado'` — puede quedar
  vacío (caso normal de un producto a precio fijo, hoy llamado "Unitario").
- `detectarPrecioEscalonado` se sigue revisando primero; si ningún rango coincide
  (incluida la lista vacía), se usa `precio_oficial`/`precio_base` como respaldo — en
  vez de quedar sin precio (`null`), que era un caso límite real que esto corrige de
  paso.
- `tipo_precio='unitario'` **deja de escribirse** desde este cambio en adelante — toda
  ficha nueva o editada-y-guardada bajo "Producto simple" se guarda como `'escalonado'`
  (con `rangos` vacío si no se agregó ningún tramo extra). Las fichas `'unitario'` que
  ya existen siguen funcionando exactamente igual sin tocarlas — el código que ya las
  atiende (`selItem`/`setItem`, rama `else`) no cambia. Se migran solas, en silencio, la
  próxima vez que alguien las edite y guarde.
- `tipo_precio='regla'` no cambia — sigue siendo su propio mecanismo, ahora presentado
  como un interruptor dentro de la pantalla de "Producto simple" en vez de una opción
  separada del desplegable.

### Pantalla de creación en dos pasos
1. Al darle "Nuevo producto", se ve primero **3 botones grandes**: Producto simple /
   Combo / Promoción. Nada más todavía.
2. Al elegir uno, se revela el resto del formulario (nombre, categoría, etc.) ya
   ajustado a ese camino, sin ningún desplegable de "tipo de precio" — un enlace
   "← Cambiar tipo" permite volver al paso 1 si se eligió mal (solo visible al crear,
   no al editar).
3. Al **editar** un producto ya existente, se salta directo al paso 2 — el camino se
   deduce solo del `tipo_precio` guardado (`unitario`/`escalonado` sin más → "Producto
   simple" con el interruptor de Lleva-N-paga-M apagado; `regla` → "Producto simple" con
   el interruptor encendido; `combo`/`promocional` → su propio camino).

### Dentro de "Producto simple"
- El campo "Precio base" y el bloque de Margen siguen exactamente igual que hoy (sin
  tocar su mecánica de sugerencia por costo de insumos).
- La tabla de "Rangos de precio" pasa a llamarse **"Tramos adicionales por cantidad
  (opcional)"** y empieza vacía. Si el usuario no agrega ninguno, el producto se
  comporta exactamente como "Unitario" hoy: un solo precio, sin importar la cantidad.
  Si agrega tramos, esos mandan para las cantidades que cubran; "Precio base" sigue
  cubriendo cualquier cantidad que ningún tramo cubra.
- Un interruptor aparte, "Es una promoción 'Lleva N, paga M'": si se activa, se oculta
  la tabla de tramos y aparecen los 2 campos ya existentes (Lleva/Paga) — mutuamente
  excluyente con los tramos (no se pueden combinar ambos mecanismos a la vez).

### Autocompletado de Encargos (Fase 2C) — ajuste menor de paso
Hoy el texto del precio en el dropdown para `'escalonado'` siempre dice "según
cantidad", incluso si no tiene tramos (en cuyo caso el precio es fijo). Se corrige para
mostrar el precio real cuando no hay tramos, y "según cantidad" solo cuando sí los hay.

## Explícitamente fuera de esto
- No toca Combo ni Promoción por dentro — eso es la mejora B, después. Aquí solo se
  arma el punto de entrada de 3 botones (que B usará tal cual).
- No migra ni reescribe ninguna ficha `'unitario'` ya guardada — sigue funcionando
  igual hasta que alguien la edite y guarde.
- No cambia nada de Insumos, Stock o Categoría — esas secciones siguen iguales,
  visibles para los 3 caminos tal como hoy (no se ocultan para Combo/Promoción aunque
  ahí Insumos/Stock casi no se usen — fuera de alcance, no fue parte del pedido).

## Backend (`server.js`)
- `validarFicha`: la validación "Escalonado necesita al menos un rango de precio" se
  elimina — `rangos` vacío es válido ahora para `'escalonado'`.
- Nada más cambia — `precioOficialFicha`, `POST`/`PUT /api/productos` ya funcionan tal
  cual para este nuevo caso (un `rangos` vacío ya es un valor válido que la columna ya
  acepta hoy).

## Frontend (`public/index.html`)
- Modal de Producto: nuevo paso 1 (3 botones) + `elegirCaminoProducto(camino)` que
  oculta el paso 1 y revela el paso 2 ajustado a ese camino — reemplaza a
  `showTipoPrecioSec(tipo)` (que dejará de existir, su lógica se reparte entre el nuevo
  selector de camino y el interruptor de Lleva-N-paga-M dentro de "Producto simple").
- Se quita el `<select id="prod-tipo-precio">`.
- `detectarPrecioEscalonado`: sin cambios en sí — pero `selItem`/`setItem` (rama
  `'escalonado'`) ganan el respaldo a `precio_oficial` cuando no hay coincidencia.
- `acItem`: ajuste del texto de precio en el dropdown (precio real si no hay tramos,
  "según cantidad" si los hay).
- `abrirEditarProducto`: deduce el camino del `tipo_precio` guardado y salta al paso 2.
- `guardarProducto`: siempre manda `tipo_precio:'escalonado'` para el camino "Producto
  simple" sin el interruptor activo (nunca `'unitario'`), o `tipo_precio:'regla'` con el
  interruptor activo.
