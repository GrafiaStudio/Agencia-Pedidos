# Variantes internas (árbol de variantes) — Diseño

**Fecha**: 2026-06-26
**Origen**: visión universal del usuario (ver [[plantilla-variantes-universal]]): "las
variantes tienen variantes internas". Decisiones tomadas: **2 niveles en la UI** (modelo de
datos recursivo de todos modos) y **costos que se acumulan por nivel**.

## Modelo (recursivo, backward-compatible)
- `ficha_variantes` gana `parent_id TEXT DEFAULT ''` (ALTER TABLE, la tabla ya existe en
  prod). Un nodo con `parent_id=''` es de nivel 1; con `parent_id=X` es hijo de X.
- Un nodo **sin hijos = hoja**: carga `precio` + `tramos` + `costos`. (Las variantes planas
  que ya existen son hojas → siguen funcionando idénticas.)
- Un nodo **con hijos = grupo**: NO carga precio/tramos (sus hojas los cargan), pero SÍ
  puede cargar `costos` (se acumulan hacia abajo).
- `guardarVariantes(fichaId, variantes, wsId)`: recibe el árbol anidado (cada nodo con
  `hijos:[]`), lo aplana a filas con `parent_id` recorriéndolo (recursivo, soporta cualquier
  profundidad aunque la UI hoy exponga 2). Borra y reinserta como hoy.
- `fichaCompleta`: carga todas las filas, parsea `costos`/`tramos` por nodo, y **reconstruye
  el árbol** anidando hijos bajo su `parent_id`; devuelve `f.variantes` = nivel 1, cada uno
  con `hijos`.
- `precio_oficial` ("desde") = mínimo, sobre todas las **hojas**, del precio que cubre 1
  unidad (tramo-para-1 ?? precio_calc).
- `validarFicha` (variantes): cada nodo nivel-1 debe tener nombre; si es hoja, precio
  válido; si es grupo, ≥1 hijo y cada hijo válido (recursivo). Producto necesita ≥1 variante.

## Costo de una hoja (acumulación por nivel)
`costo(hoja) = Σ insumos globales del producto + Σ costos de cada nodo en el camino
raíz→hoja (incluida la hoja)`. Helper `costoAcumuladoHoja(ficha, path)`.

## Frontend modal (2 niveles)
- `fProdVariantes` pasa a árbol: cada nodo `{id,nombre,precio,tramos,costos,hijos}`.
- `renderVariantes`: tarjetas de nivel 1. Cada tarjeta:
  - nombre + su mini-tabla de `costos` (siempre — costos de este nivel).
  - botón "Agregar sub-variante" → empuja un hijo y oculta precio/tramos del padre.
  - si **no** tiene hijos: muestra además precio + tramos (es hoja).
  - si tiene hijos: muestra las sub-tarjetas (nombre + precio + tramos + costos cada una),
    sin precio/tramos en el padre.
- Funciones: las actuales `add/rem/setVariante`, `add/rem/setCostoVariante`,
  `add/rem/setTramoVariante` se generalizan para operar sobre un nodo identificado por su
  `id` buscándolo en el árbol (`buscarNodoVariante(id)` recursivo). `addSubVariante(vid)`.

## Frontend pedido (selector en cascada)
- `selItem` para variantes: `it._varPath=[]` (índices del camino), `valor_unitario=''`.
- `renderItemsHTML`: si el producto es variantes, muestra selects en cascada: nivel 1
  siempre; si el nodo elegido tiene `hijos`, un 2º select; hasta llegar a una hoja.
  `setVarPath(encId,itemId,nivel,idx)` fija el camino hasta ese nivel (trunca lo más
  profundo), y si el nodo es hoja calcula el precio por cantidad (tramos de la hoja).
- Precio por cantidad: `detectarPrecioEscalonado(hoja.tramos, cant) ?? hoja.precio_calc`.
  Al cambiar la cantidad (`setItem`), si hay hoja elegida, recalcula.
- `recalcularCostosAutomaticos`: para un ítem de variantes con hoja elegida, costo unitario
  = `costoAcumuladoHojaFE(ficha, path)` (globales + costos de cada nodo del camino); × cant.
- El detalle del ítem refleja el camino (ej. "Retablo — 20×25 — con vidrio").

## Backward-compat
Variantes planas existentes (sin parent_id, sin hijos) son hojas: cascada de 1 solo select,
precio/costos como hoy. Cero migración de datos.
