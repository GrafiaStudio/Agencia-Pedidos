# Modo "Por hoja / imposición" (rediseño del modo pliego) — Diseño

**Fecha**: 2026-06-27
**Origen**: el usuario probó el modo "Por pliego" recién hecho y pidió ampliarlo. Aclaró:
"pliego" en Colombia = 100×70 específico, confunde; lo correcto es hablar de la HOJA /
superficie de impresión (Carta, Oficio, A4, A3, 50×30, personalizada). Y que al COTIZAR se
elija en qué hoja se imprime (eso determina cuántas piezas salen) + poder agregar medidas
propias. Además, factores reales que suman: doble lado, reproceso (matte+UV parcial), corte,
acabados, perforado.

## Modelo (rediseño de `tipo_precio='pliego'`, backward-compatible)
- Nuevas columnas JSON en `fichas_producto`:
  - `pliego_superficies TEXT DEFAULT '[]'` — `[{nombre, piezas, precio, precio_calc}]`. Cada
    hoja/superficie con cuántas piezas rinde y su precio. Ej: Carta→100/$10.000,
    A3→250/$22.000, "50×30"→…
  - `pliego_extras TEXT DEFAULT '[]'` — `[{nombre, valor, valor_calc, tipo}]` con
    `tipo ∈ {pieza, hoja, fijo}`. Ej: Doble lado (por hoja), Corte (fijo), Perforado (por
    pieza), Laminado mate (por pieza).
- **Backward-compat**: si `pliego_superficies` está vacío pero existe el viejo
  `piezas_por_pliego`/`precio_pliego`, `fichaCompleta` sintetiza una superficie
  `[{nombre:'Hoja', piezas, precio}]`. (Los productos pliego viejos siguen funcionando.)
- Se conservan las columnas viejas `piezas_por_pliego`/`precio_pliego` (solo lectura/legacy).

## Cálculo (en el pedido)
Elegida una superficie S y un set de extras E, para cantidad N:
```
piezas = S.piezas ; pliegos = ceil(N / piezas)
base   = pliegos * S.precio
extras = Σ  (tipo pieza: e.valor*N) + (tipo hoja: e.valor*pliegos) + (tipo fijo: e.valor)
total  = base + extras ; unitario = round(total / N)
```
Helper `calcPrecioHoja(ficha, surfIdx, extrasSel, N)` en server.js y index.html (idéntico).

## Validación (`validarFicha`, tipo_precio pliego)
- ≥1 superficie; cada una `piezas>0` y `precio` expresión válida.
- cada extra: `valor` expresión válida y `tipo ∈ {pieza,hoja,fijo}`.

## Frontend — modal
- Renombrar el modo en el selector: "Por pliego (imposición)" → **"Por hoja / imposición"**.
- Sección: tabla **Hojas / superficies** (nombre, piezas, precio) con add/rem; tabla
  **Extras y acabados** (nombre, valor, tipo=pieza/hoja/fijo) con add/rem. Estado
  `fProdHojaSuperficies`, `fProdHojaExtras`. Leyendas con ejemplos ("usuario tonto").
- reset/editar/guardar/validar manejan ambas listas. Al editar se cargan desde la ficha
  (incluida la síntesis backward-compat).

## Frontend — pedido (como variantes)
- `selItem` pliego: `it._hojaSurf=''` (índice de superficie, single-select), `it._hojaExtras={}`
  (extraIdx→true). `valor_unitario=''` hasta elegir superficie.
- `renderHojaSelectsHTML`: un `<select>` de superficies + checkboxes de extras (con su costo).
- `setHojaSurf` / `setHojaExtra` recalculan vía `recalcHojaItem` (usa `calcPrecioHoja`).
  `setItem` al cambiar cantidad recalcula. El detalle refleja "Tarjeta — A4 + Doble lado + Corte".
- Costos automáticos: la sección Costos no recibe nada nuevo (el precio del pliego YA es de
  venta, incluye ganancia; los extras también son precio de venta). Igual que medidas, no
  genera costo interno automático salvo que el producto tenga Insumos.
- Persistencia: `enc_items.config` ya guarda objetos arbitrarios → guardar `{hojaSurf, hojaExtras}`
  junto a `varPicks/ancho/alto`. Restaurar al reabrir.

## Fuera de alcance v1
- Agregar una superficie totalmente nueva EN el pedido (con piezas/precio nuevos al vuelo):
  por ahora se definen todas en el producto (incluida cualquiera "personalizada" como una fila
  más). Si hace falta on-the-fly, mejora futura.
- Unificación total con el motor de variantes (la elección de superficie es un "grupo elige
  una" y los extras son "partes que suman" — misma idea; se mantiene código propio por ahora).
