# Promoción "Lleva N, paga M" (Combo con regla) — Diseño

**Fecha**: 2026-06-26
**Origen**: Fase 2 de `MASTER-DOCUMENTO-DESARROLLO.txt`, "Combo con regla" — la pieza que
quedó explícitamente fuera del sub-proyecto de Combos (simple/mixto) porque no es una
composición de productos, es una regla de descuento por cantidad sobre un solo producto.
Ejemplo del documento maestro: "Lleva 3 paga 2. Requiere mínimo 3 unidades para
activarse."

## Contexto

No es un combo de productos distintos — es el mismo producto, con un precio efectivo más
bajo cuando la cantidad alcanza un umbral. El patrón más parecido ya construido es
Escalonado (Fase 2A+2B/2C): precio que depende de la cantidad, calculado en el frontend al
seleccionar la ficha o al cambiar la cantidad (`detectarPrecioEscalonado` +
`it._autoPrecio`), nunca en el backend al guardar. Este sub-proyecto replica exactamente
ese mecanismo con otra fórmula.

## Alcance

### Tipo de precio nuevo: `regla`
Campos nuevos en `fichas_producto`: `regla_lleva` (entero, cuántas unidades activan la
regla — "3" en el ejemplo) y `regla_paga` (entero, cuántas se cobran de cada grupo
completo — "2"). El precio unitario de referencia sigue siendo `precio_base` (igual que
Unitario) — la regla nunca aparece si la cantidad pedida es menor a `regla_lleva`.

### Fórmula
Para una cantidad pedida, se calculan grupos completos de `regla_lleva` unidades; cada
grupo completo cobra `regla_paga` unidades, y las unidades sueltas que no llenan un grupo
completo se cobran todas. El precio unitario que se guarda en el ítem es el promedio
resultante, redondeado al peso (el sistema no maneja centavos en COP, y el resto de la
app ya redondea valores de esta forma):
```
unidadesPagadas = floor(cantidad/lleva)*paga + (cantidad % lleva)
precioUnitarioEfectivo = round(unidadesPagadas * precioBase / cantidad)
```
Ejemplo (Lleva 3 Paga 2, precio base $30.000): cantidad 9 → 3 grupos completos → 6
unidades pagadas → $180.000 ÷ 9 = $20.000 por unidad. Cantidad 7 → 2 grupos + 1 suelta →
5 unidades pagadas → $150.000 ÷ 7 = $21.429 por unidad (no exacto; se acepta el
redondeo, es la misma clase de aproximación que ya existe en otros cálculos de la app).

### Validación
`regla_lleva`/`regla_paga` deben ser enteros positivos, y `regla_paga` debe ser menor que
`regla_lleva` (si no, no hay descuento real y la "promoción" no tiene sentido).

### Integración con el autocompletado (mismo patrón que Escalonado)
- En el dropdown de Encargos, el texto de precio para `regla` es el mismo literal
  `'según cantidad'` que ya usa Escalonado (no hay un precio único sin saber la cantidad).
- Ícono propio en `ICONOS`.
- `selItem`: cuando la ficha es `regla`, activa `it._autoPrecio=true` y calcula el precio
  inicial si ya había cantidad escrita — mismo patrón que Escalonado.
- `setItem`: al cambiar Cantidad con `_autoPrecio` activo y ficha de tipo `regla`,
  recalcula el precio unitario — mismo patrón que Escalonado. Se apaga
  (`_autoPrecio=false`) en el momento en que el usuario edita el Valor unitario a mano,
  igual que las demás reglas de auto-precio ya existentes.

### Inventario
Sin cambios: una ficha `regla` se trata exactamente igual que Unitario para
`descontarStock`/restauración/aviso de stock insuficiente — no es una composición, tiene
su propio `stock_actual` si se configura.

## Explícitamente fuera de esto
- Reglas más complejas (ej. "el 4to más caro gratis", descuentos por rangos de precio
  en vez de cantidad) — solo el patrón "lleva N paga M" descrito en el documento maestro.
- Mostrar el desglose "grupos completos + sueltas" en el documento/PDF del cliente — el
  documento sigue mostrando cantidad × valor unitario efectivo, igual que cualquier otro
  ítem.

## Modelo de datos
```sql
ALTER TABLE fichas_producto ADD COLUMN regla_lleva INTEGER;
ALTER TABLE fichas_producto ADD COLUMN regla_paga INTEGER;
```

## Backend (`server.js`)
- `TIPOS_PRECIO_VALIDOS` gana `'regla'`.
- `validarFicha`: bloque nuevo para `tipo_precio==='regla'`.
- `POST`/`PUT /api/productos`: `regla_lleva`/`regla_paga` en INSERT/UPDATE (mismo patrón
  que `stock_actual`/`stock_minimo`).
- `fichaCompleta`/`SELECT *` ya devuelve los campos nuevos sin cambios adicionales.

## Frontend (`public/index.html`)
- Selector de tipo de precio: opción "Lleva N, paga M".
- Nueva sección con dos campos numéricos ("Lleva" / "Paga"), mismo patrón visual que
  Stock actual/mínimo.
- Nueva función `calcularPrecioRegla(lleva,paga,precioUnitario,cantidad)`.
- `selItem`/`setItem`: extienden la rama que hoy solo cubre `'escalonado'` para también
  cubrir `'regla'` con la nueva función.
- `acItem`: `ICONOS` gana `regla`; el texto de precio en el dropdown trata `regla` igual
  que `escalonado` (`'según cantidad'`).
