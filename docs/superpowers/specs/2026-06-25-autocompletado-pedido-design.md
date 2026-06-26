# Autocompletado en el Pedido — Diseño

**Fecha**: 2026-06-25
**Origen**: Fase 2C de `MASTER-DOCUMENTO-DESARROLLO.txt`. Cuarto sub-proyecto de la
Fase 2 — después de 2D (Cantidad/Valor unitario en costos) y 2A+2B (Ficha de Producto).

## Contexto

Con 2A+2B ya desplegado existen fichas de producto con insumos y 3 tipos de precio
(Unitario/Escalonado/Promocional). Este sub-proyecto conecta esas fichas con el
formulario de pedido vía autocompletado — sin tocar cómo se guarda un pedido
(`POST/PUT /api/pedidos` no cambia), solo rellena campos que el usuario puede editar
después, igual que cualquier otra sugerencia de la app.

La app ya tiene un patrón de autocompletado funcionando (buscar cliente en "Nuevo
pedido": `acCli()`/`.ac-drop`/`.ac-item`) — este sub-proyecto lo mirrorea, no inventa
uno nuevo.

## Alcance

### En Encargos (precio al cliente)
El campo "Detalle" de cada fila de ítem ya existente activa una búsqueda al escribir
2+ letras. El dropdown muestra las fichas de producto **activas** que coinciden, con
un ícono según `tipo_precio` (Unitario `ti-tag`, Escalonado `ti-stairs-up`,
Promocional `ti-discount-2`) y, cuando ya se puede calcular, el precio:
- Unitario: precio oficial.
- Escalonado: "según cantidad" (no hay cantidad todavía en el momento de buscar).
- Promocional: precio oficial — **solo aparece en el dropdown si hoy está entre
  `fecha_inicio` y `fecha_fin`** (si no tiene fechas configuradas, se trata como
  siempre vigente).

Al seleccionar una ficha:
- **Unitario**: llena Detalle con el nombre de la ficha y Valor unitario con el
  precio oficial.
- **Escalonado**: llena Detalle; Valor unitario queda en modo "automático" para esa
  fila (`it._autoPrecio=true`). Mientras esté en ese modo, cada cambio en Cantidad
  recalcula Valor unitario detectando el rango (recorrer `rangos` en orden, devolver
  el primer rango donde `cantidad>=desde` y (`hasta==null` o `cantidad<=hasta`)). Si la
  fila **ya tenía una Cantidad escrita antes de seleccionar la ficha** (el usuario pudo
  llenar esa columna primero), el precio se calcula de inmediato con esa cantidad al
  seleccionar — no hace falta esperar a un cambio posterior. En el momento en que el
  usuario edita Valor unitario directamente, `_autoPrecio` pasa a `false` para esa fila
  y deja de recalcularse solo — **a propósito distinto** de la decisión "se recalcula
  siempre" que se tomó para Costos (2D): el propio ejemplo del documento maestro
  describe que el ajuste manual negociado ("$27.000 en vez de $28.000") es lo que se
  guarda, sin que un cambio posterior de cantidad lo borre. Seleccionar una ficha nueva
  en la misma fila reinicia `_autoPrecio=true`.
- **Promocional**: llena Detalle y Valor unitario con el precio oficial (ya filtrado
  por vigencia al armar el dropdown, así que no hace falta revalidar fecha al elegir).

Todo lo anterior es 100% editable después de seleccionar, igual que cualquier otro
campo de un ítem hoy.

### En Costos (insumos internos, no los ve el cliente)
El campo "Detalle" (`descripcion`) de cada ítem de costo activa una búsqueda distinta:
entre **insumos** de todas las fichas de producto del workspace (no entre fichas
completas). El dropdown muestra nombre del insumo, proveedor (si tiene) y costo
unitario. Al seleccionar: llena Detalle con el nombre del insumo y Valor unitario con
su costo unitario — si el insumo tiene `es_variable=true`, se ve una etiqueta "Variable"
junto al campo (el campo ya es editable por defecto, igual que siempre; la etiqueta es
solo informativa). Esto entra directo al recálculo de Total ya existente (Fase 2D) —
no se duplica esa lógica.

### Explícitamente fuera de esto
- Cualquier cambio a `POST/PUT /api/pedidos` o a cómo se guarda un pedido.
- Etiquetas personalizables por negocio (Fase 2E) — el ícono por tipo de precio no
  tiene relación con `CATS`.
- Combos (siguen sin existir, dependen de Fase 4).

## Backend (`server.js`)

- `GET /api/productos` gana un filtro opcional `?activo=1` (si se manda, solo
  devuelve fichas con `activo=1`; si no se manda, comportamiento idéntico al actual —
  la lista de administración de Productos no pasa este parámetro y sigue viendo todo).
- Endpoint nuevo `GET /api/productos/insumos?q=` — busca `ficha_insumos` cuyo
  `nombre_insumo` coincida (`LIKE`), unido a `fichas_producto` filtrado por
  `workspace_id`, devuelve `{nombre_insumo, proveedor, costo_unitario_calc,
  es_variable}` (máximo 8 resultados, igual límite práctico que ya usa `acCli`
  recortando a 5 — aquí un poco más amplio porque insumos repetidos entre fichas son
  más probables).

## Frontend (`public/index.html`)

- Cada fila de ítem de encargo gana su propio `.ac-wrap`/`.ac-drop` (uno por fila, con
  id único `it-ac-drop-${it.id}`) — a diferencia de `acCli` (un solo campo global), aquí
  hay tantas búsquedas posibles como filas. Resultados en un objeto
  `_acItemResults` indexado por `itemId`, no en una variable plana.
- Mismo patrón para cada ítem de costo (`cost-ac-drop-${c.id}`, objeto
  `_acCostoResults` indexado por `costoId`).
- El cierre del dropdown al hacer click afuera sigue el mismo patrón ya usado para
  `#ac-drop`/`#f-nom`, generalizado a "cualquier `.ac-drop` que no sea ancestro/dueño
  del click".
