# Combo/Promoción rediseñado — Diseño

**Fecha**: 2026-06-26
**Origen**: cuarta y última de las 4 mejoras independientes acordadas con el usuario
(orden D→A→C→B), la más grande. Brainstorm ya resuelto y aprobado en partes 2 y 3 de esa
conversación; este documento agrega las decisiones técnicas concretas que faltaban para
poder implementarlo.

## Contexto

Ya aprobado con el usuario: Combo y Promoción comparten la misma mecánica de
composición (productos reales + cantidad de cada uno) que Combo ya tiene hoy. La
diferencia es que Promoción tiene fecha de inicio/fin (+ cantidad mínima, ya existente)
y su propio precio especial; además admite ítems libres de texto (sin ficha real, sin
inventario) mezclados con productos reales — exclusivo de Promoción. Ambos ganan un
modo de precio todo-o-nada: un precio GLOBAL único para todo el paquete (como hoy), o
un precio POR PRODUCTO que se suman (nuevo).

Investigado el código real antes de diseñar:
- `combo_composicion.componente_ficha_id` es `TEXT NOT NULL` hoy, sin `REFERENCES` (a
  diferencia de `ficha_id`, que sí tiene FK al padre). Para los ítems libres de
  Promoción, en vez de migrar la columna a nullable (riesgoso en una tabla con datos
  reales en producción), se usa **`''` (string vacío) como "no es un producto real"** —
  evita cualquier migración de esquema, y el resto del código ya trata
  `||''`/`if(!valor)` de forma consistente con esto en todas partes.
- `descontarStock` hoy mira `ficha.tipo_precio==='combo'` explícitamente para decidir si
  expandir. Con Promoción ahora compartiendo composición, esto se simplifica: **ya no
  importa el tipo** — cualquier ficha que tenga filas en `combo_composicion` se expande
  en sus componentes; si no tiene ninguna, se trata como antes (stock propio directo).
  Esto cubre Combo y Promoción nuevas automáticamente, y de regalo deja funcionando sin
  tocar nada las Promociones VIEJAS de un solo producto (nunca tuvieron composición,
  siguen descontando su propio stock — ni un dato se migra).
- Las Promociones viejas (sin composición) seguían sin tener NINGUNA validación
  específica hoy (no exigían nada de `fecha_inicio`/`cantidad_minima`). Esto importa
  para decidir si una Promoción nueva debe exigir al menos un componente: **no** — eso
  rompería la posibilidad de seguir usando una Promoción simple de un solo producto
  (la ficha de ese producto YA es la promoción, con su `precio_base` como precio
  especial) sin tener que redeclarar nada. Combo sí sigue exigiendo al menos un
  componente, porque su único propósito es agrupar productos.

## Alcance

### Modelo de datos
```sql
ALTER TABLE fichas_producto ADD COLUMN combo_precio_modo TEXT DEFAULT 'global';
ALTER TABLE combo_composicion ADD COLUMN componente_nombre TEXT DEFAULT '';
ALTER TABLE combo_composicion ADD COLUMN precio_unitario TEXT DEFAULT '';
ALTER TABLE combo_composicion ADD COLUMN precio_unitario_calc TEXT;
```
`combo_precio_modo`: `'global'` (default, precio único en `precio_base`) o
`'individual'` (cada componente lleva su propio `precio_unitario`, se suman).

### Validación (compartida entre `combo` y `promocional`)
- `combo_precio_modo` debe ser `'global'` o `'individual'`.
- Combo exige al menos un componente; Promoción no (puede quedar sin composición,
  comportándose como hoy).
- Por cada componente: si tiene `componente_ficha_id`, debe existir, no puede ser el
  mismo que se edita, y no puede ser otro combo/promoción (anti-anidación, igual que
  hoy). Si NO tiene `componente_ficha_id` (ítem libre), solo válido en Promoción, y
  necesita `componente_nombre`. Siempre necesita `cantidad_consumida` entero positivo.
  Si el modo es `'individual'`, además necesita `precio_unitario` válido.

### Cálculo de precio
`fichaCompleta` ya resuelve `precio_oficial` vía `precioOficialFicha` (que usa
`precio_base`). Para `combo`/`promocional` con `combo_precio_modo==='individual'`, se
calcula en su lugar como la suma de `cantidad_consumida × precio_unitario_calc` de cada
componente — `precio_base` queda sin usar en ese modo.

### Inventario
`descontarStock` deja de revisar `tipo_precio` — expande cualquier ficha con filas en
`combo_composicion`, sin importar el tipo (ver razonamiento en Contexto). Los
componentes con `componente_ficha_id` vacío (ítems libres) se omiten del descuento.

### Frontend — modal de Producto
La sección de composición (selector de modo de precio + tabla de componentes) se
comparte entre los caminos Combo y Promoción — ya no es exclusiva de "Combo". Dentro de
Promoción, además aparece un botón "Agregar ítem libre" (nombre + cantidad + precio si
el modo es individual, sin buscador de productos) junto al de "Agregar componente"
(búsqueda de productos reales, como ya existe). La sección de vigencia (fechas +
cantidad mínima + descripción) sigue siendo exclusiva de Promoción, debajo de la
composición.

### Documento/PDF
Una línea de pedido cuya ficha sea `combo` o `promocional` con componentes se desglosa
en el documento: título con el nombre de la ficha (para Promoción, antecedido por
"Promoción: "), y debajo cada componente con su cantidad — el precio por componente
solo se muestra si el modo es `'individual'`; en modo `'global'` se ve solo qué incluye
y el total al final, sin precios sueltos por ítem.

## Explícitamente fuera de esto
- No se migra ninguna Promoción vieja (sin composición) — sigue funcionando exactamente
  igual, sin exigirle nada nuevo.
- Sin combos/promociones anidados — un componente nunca puede ser otro combo o
  promoción.
- No se permite mezclar items con y sin precio dentro del mismo modo `'individual'` —
  si el modo es individual, todos los componentes (reales y libres) necesitan su propio
  precio; si es global, ninguno lo necesita.

## Backend (`server.js`)
- Migración: 3 columnas nuevas (ver arriba).
- `validarFicha`: el bloque de `'combo'` se generaliza a `'combo'||'promocional'`, con
  las diferencias descritas en Validación.
- `guardarComposicion`: persiste `componente_nombre`/`precio_unitario`/
  `precio_unitario_calc` además de lo que ya guardaba.
- `fichaCompleta`: calcula `precio_oficial` distinto cuando `combo_precio_modo` es
  `'individual'` para `combo`/`promocional`.
- `descontarStock`: la función `acumular` deja de mirar `tipo_precio`, expande por
  presencia de filas en `combo_composicion` (ver Inventario).
- `POST`/`PUT /api/productos`: persisten `combo_precio_modo`.

## Frontend (`public/index.html`)
- Sección de composición compartida entre Combo y Promoción (selector de modo +
  tabla), con soporte de ítems libres (solo visible en Promoción).
- `elegirCaminoProducto`: ambos caminos muestran la composición; solo Promoción
  muestra además la vigencia y el botón de ítem libre.
- `guardarProducto`: manda `combo_precio_modo` y los componentes con sus precios si
  aplica.
- Documento del pedido (PDF y resumen en pantalla si existe): desglose de combo/
  promoción según el modo de precio.
