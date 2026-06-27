# Motor de costeo + Modo "Por medidas" — Diseño

**Fecha**: 2026-06-26
**Origen**: rediseño total de Productos (documento del usuario). Sub-proyecto 3 de 6,
elegido como **primera rebanada vertical** del motor de costeo compartido — decisión de
arquitectura tomada por el usuario: los modos de cálculo son atajos amigables sobre un
mismo motor (ver [[costeo-industria-grafica]]). El usuario autorizó modo autónomo:
construir todos los modos al final, sin pausar a confirmar. Este spec arranca con "Por
medidas" porque es el caso con la fórmula más clara que dio el usuario (pendones/lonas)
y porque ejercita el motor con **costos por área + costos fijos + cobro mínimo** a la
vez — la base más completa para los modos siguientes.

## Contexto (código real, leído antes de diseñar)
- `fichas_producto.tipo_precio` hoy: `unitario`/`escalonado`/`promocional`/`combo`/`regla`.
  `TIPOS_PRECIO_VALIDOS` en server.js línea 472.
- El precio real de una ficha lo resuelve `precioOficialFicha(ficha,precioSugerido)`
  (server.js ~501) y, para combos individuales, una suma en `fichaCompleta` (~516).
- En el pedido, `selItem` (index.html ~1969) fija `it._fichaSel`, `it.ficha_id`, y según
  `tipo_precio` calcula `valor_unitario` (escalonado→`detectarPrecioEscalonado`,
  regla→`calcularPrecioRegla`, resto→`precio_oficial`). `setItem` (~1887) recalcula al
  cambiar la cantidad si `_autoPrecio`. La fila de ítem (`renderItemsHTML` ~2042) tiene
  columnas: cantidad | detalle(autocompletado) | valor_unitario | suministrado | borrar.
- Los campos monetarios ya aceptan expresiones matemáticas (`evalExpr` + columnas
  `_calc`). El helper `normCalc` guarda crudo+calculado.

**Caso real del usuario (pendones):** ancho×alto×constante del proveedor da el costo;
él "lo dobla" (≈×2) y eso ya absorbe diseño, mensajería y su ganancia. O sea: en la
práctica trabaja con una **tarifa por m² que ya es precio de venta**, más a veces costos
fijos que suma aparte, y un cobro mínimo para trabajos chicos.

## La diferencia clave de "Por medidas"
Un producto "Por medidas" **no tiene un precio único** — su precio depende de las medidas
que se den **al vender**, no al crear. Por eso:
- Al **crear** el producto se define la *tarifa por unidad de medida* (no un precio).
- Al **vender** (en el Encargo) se dan ancho×alto y el sistema calcula la línea.
- La **tarjeta** del producto muestra la tarifa ("$X / m²"), no un precio.

## Modelo de datos (server.js)
Nuevo `tipo_precio = 'medidas'`. Columnas nuevas en `fichas_producto` (todas con
`ALTER TABLE ... ADD COLUMN` en try/catch, porque la tabla ya existe en producción —
lección durable de [[memoria_actualizaciones]]):
- `medida_unidad TEXT DEFAULT 'm2'` — una de: `m2` (área, ancho×alto en m), `m` (lineal,
  solo una dimensión), `cm2` (área en cm). Para pendones: `m2`.
- `medida_tarifa TEXT DEFAULT ''` + `medida_tarifa_calc TEXT` — tarifa por unidad de
  medida (cruda + calculada). Es **precio de venta por unidad** (ya incluye ganancia,
  como trabaja el usuario). El margen no se aplica encima en v1.
- `costos_fijos TEXT DEFAULT '[]'` — JSON: `[{nombre, valor, valor_calc}]`. Montos que se
  suman **una vez por pieza** (diseño, mensajería), no se multiplican por el área.
- `cobro_minimo TEXT DEFAULT ''` + `cobro_minimo_calc TEXT` — piso de precio por pieza.

`TIPOS_PRECIO_VALIDOS` suma `'medidas'`.

### Cálculo del precio de una pieza (motor, compartido)
```
area = (unidad==='m')? ancho : ancho*alto      // en la unidad elegida
precio_pieza = max( cobro_minimo , area*tarifa + Σ costos_fijos )
```
Función nueva `calcPrecioMedidas(ficha, ancho, alto)` — existe en server.js (para validar/
documentar) y en index.html (para el cálculo en vivo en el pedido), con lógica idéntica
(mismo patrón que `detectarPrecioEscalonado`, que hoy está duplicado a propósito en
ambos lados).

### `precioOficialFicha` / `fichaCompleta`
- `fichaCompleta`: parsea `costos_fijos` (JSON→array), expone las columnas `medida_*` y
  `cobro_minimo`. Para `tipo_precio==='medidas'`, `precio_oficial = toNum(medida_tarifa_calc)`
  (la tarifa, como valor representativo para la tarjeta — la tarjeta le pone el sufijo
  "/unidad"). No es un precio de venta real de una pieza (esa necesita medidas).
- `precioOficialFicha`: agrega una rama temprana — si `tipo_precio==='medidas'`, devuelve
  `toNum(medida_tarifa_calc)`. El resto sin cambios.

### Validación (`validarFicha`)
Para `tipo_precio==='medidas'`:
- `medida_unidad` debe estar en `['m2','m','cm2']`.
- `medida_tarifa` requerido y expresión válida (`evalExpr`).
- cada `costos_fijos[i].valor`, si está definido, expresión válida.
- `cobro_minimo`, si está definido, expresión válida.

### POST/PUT `/api/productos`
Persisten las columnas nuevas con `normVF`/`normCalc` para tarifa y cobro_minimo, y
`JSON.stringify` de `costos_fijos` (cada `valor` con su `valor_calc` vía `normCalc`).
Helper `guardar... ` no hace falta: van inline en el INSERT/UPDATE como las demás
columnas.

## Frontend — modal de Producto (index.html)
- El camino "Producto simple" (`prodCaminoActual==='simple'`) gana un **selector "Modo de
  cálculo"** (visible solo en ese camino, no en combo/promoción): por ahora 2 opciones —
  "Por cantidad / precio fijo" (lo de hoy: precio base + tramos + regla) y "Por medidas".
  (Los modos Variantes/Fórmula/Pliego se agregan después, este selector es el punto de
  enganche.)
- Estado nuevo: `prodModoCalculo` (`'cantidad'` | `'medidas'`), `fProdCostosFijos` (array).
- Nueva sección `prod-sec-medidas` (oculta salvo modo medidas):
  - Unidad de medida (dropdown: "Metro cuadrado (ancho × alto)" = m2, "Metro lineal" = m,
    "Centímetro cuadrado" = cm2).
  - Tarifa por [unidad] — input monetario con preview de expresión, leyenda "Es tu precio
    de venta por unidad; ya incluye tu ganancia. Ej: si cobras $30.000 el m², escribe
    30000."
  - Costos fijos adicionales (opcional) — mini-tabla nombre+valor (diseño, mensajería),
    con `addCostoFijo`/`remCostoFijo`/`setCostoFijo`/`renderCostosFijos`. Leyenda: "Se
    suman una vez a cada pieza, sin importar el tamaño."
  - Cobro mínimo (opcional) — input monetario. Leyenda: "Si el cálculo da menos que esto,
    se cobra esto. Para trabajos muy chicos."
- Cuando modo medidas está activo: se ocultan Precio base, Margen, Tramos y el interruptor
  Lleva-N-paga-M (medidas no los usa). Insumos sigue disponible (informativo, opcional).
- `elegirCaminoProducto`, `resetProdForm`, `abrirEditarProducto`, `guardarProducto`,
  `validarProductoBody` manejan `prodModoCalculo`/`fProdCostosFijos`. Al editar, el modo
  se deduce: `tipo_precio==='medidas'`→modo medidas; resto→modo cantidad.
- `guardarProducto`: si modo medidas, `tipo_precio='medidas'` y manda `medida_unidad`,
  `medida_tarifa`, `costos_fijos`, `cobro_minimo`; los campos de cantidad (rangos, regla,
  precio_base) van vacíos/neutros.

## Frontend — tarjeta de producto (`cargarProductos`)
- `TIPO_LABEL` suma `medidas:'Por medidas'`.
- Para `tipo_precio==='medidas'`, en vez de `fCOP(precio_oficial)` muestra
  `fCOP(precio_oficial)+' / '+SUF_UNIDAD[medida_unidad]` (m²/m/cm²).

## Frontend — captura en el Encargo
- `acItem` (~1943): `ICONOS` suma `medidas:'ti-ruler-2'`; `precioTxt` para medidas =
  `fCOP(p.precio_oficial)+' / '+sufijo`.
- `selItem` (~1969): rama nueva para `'medidas'` — `it._medidas=true`, `it._ancho=''`,
  `it._alto=''`, `it._autoPrecio=true`, `valor_unitario=''` (hasta dar medidas). `cantidad`
  default '1' si está vacía (1 pieza).
- `calcPrecioMedidas(ficha,ancho,alto)` en index.html (idéntica al backend).
- `renderItemsHTML` (~2042): si `it._fichaSel?.tipo_precio==='medidas'`, debajo del detalle
  se inserta una mini-fila: "Ancho × Alto" (2 inputs numéricos, en la unidad del producto)
  + leyenda con el área y el precio calculado. `setMedidaItem(encId,itemId,campo,valor)`
  guarda `it._ancho/_alto`, recalcula `valor_unitario` vía `calcPrecioMedidas`, actualiza
  el campo `itval-` y el total. Las medidas se reflejan también en el texto del detalle
  (ej. "Pendón lona — 1.5×2 m") para que queden en el documento/PDF.
- Persistencia: el `valor_unitario` calculado SÍ se guarda (es el precio de la línea). Las
  medidas crudas (`_ancho`/`_alto`) son transitorias (como `_fichaSel`); su rastro queda
  en el texto del detalle. (Guardar medidas estructuradas por ítem es una mejora futura.)

## Explícitamente fuera de esta rebanada
- Modos Por variantes, Fórmula, y Rendimiento de pliego — vienen después, reusando el
  motor y el selector "Modo de cálculo" que esta rebanada deja montado.
- Aplicar margen sobre la tarifa (hoy la tarifa ya es precio final) — mejora futura si el
  usuario quiere separar costo/precio en medidas.
- Inventario para productos "Por medidas" (son a-medida, sin stock por unidad) — no
  participan de la pestaña Inventario (que ya excluye lo que no tiene stock).
- Guardar ancho/alto estructurados por ítem en la BD — v1 los deja en el texto del detalle.
- Costos fijos que NO se multipliquen por cantidad de piezas — v1 los mete en el precio
  por pieza (si pides 2 pendones, el diseño se cuenta 2 veces). Mejora futura.
