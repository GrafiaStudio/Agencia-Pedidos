# Editor de Productos 2.0 — Diseño

**Fecha:** 2026-07-13 · Roadmap v4.0 (Consolidación). Fase grande: 2-3 sesiones.
**Referencia visual OBLIGATORIA:** `i:\PROYECTOS CLAUDE\AGENCIA PEDIDOS\MEJORAS\idea-de-plantilla--para-creacion-de-producto.png`
(mockup del usuario hecho sobre la app real — es el contrato visual de la sección Variantes).

## Decisiones del usuario (2026-07-13, confirmadas una a una)

1. **Pegar tabla → vista previa con confirmación** de columnas antes de crear (nunca crea sin confirmar).
2. **Re-pegar actualiza**: si el nombre de la sub-variante coincide, actualiza precio/costos; nuevas se crean. La vista previa marca cada fila como NUEVA o ACTUALIZA. ("El Excel vivo".)
3. **Integración básica con listas de proveedores EN esta fase**: costo elegible desde lista guardada, queda vinculado, y la app avisa cuando la lista cambió (nunca actualiza sola).
4. **Todo junto** como una sola fase "Editor 2.0": rediseño del mockup + pegar tabla + integración listas.
5. Importar archivo .xlsx: **NO en esta fase** — registrado como caso de uso del futuro AI Gateway (la IA interpreta el archivo y llena las casillas).

## Contexto actual

- Editor de producto en `public/index.html`: sección Variantes = lista vertical de nodos árbol
  (`fProdVariantes`, funciones `renderVariantes/setVariante/addCostoVariante/...`).
- `ficha_variantes`: id, ficha_id, nombre, precio(+calc), tramos JSON, orden, **costos JSON
  `[{nombre,valor}]`**, parent_id, multi, modo ('precio'|'hoja'), piezas, informativa.
- Listas de proveedores ya existen: `costo_listas` + `costo_lista_items` (+parser de pegado en Centro de Costos).
- Reglas duras del usuario: nada full-width, nada modales cargados, columnas/plegables/iconos, sub-variantes visualmente subordinadas a la variante.

## 1. Estructura visual (contrato = mockup)

- **Layout 2 columnas** en la sección Variantes: izquierda píldoras de grupos (nombre + contador
  de sub-variantes + badge "info" si informativa; click selecciona); derecha detalle del grupo.
- **Grupo (variante)**: nombre, costos de este nivel **plegables** (plegado = "Costo de este nivel: $X";
  desplegado = chips nombre+valor + Agregar costo), checkbox multi, duplicar/eliminar, flechas ↑↓.
- **Sub-variante** (tarjeta compacta, anidada, menor jerarquía visual):
  - Plegada: nombre + precio público + costo total del nivel.
  - Desplegada: precio público, selector de modo en UNA línea (radio-pills):
    `● Precio por cantidad ○ Precio por hoja (rendimiento) ○ Por medidas (ancho×alto)`,
    tramos por cantidad en línea compacta (`De [1] a [3] [$12.000] × … + Agregar tramo` con hint
    "si lo dejas vacío se usa el precio público"), costos plegables (igual que grupo).
  - Flechas ↑↓ para reorden manual (persiste columna `orden` existente).
  - Estado de pliegue por tarjeta (mixto permitido), recordado durante la sesión de edición.
- Sub-sub-variantes (hijos de hijos) conservan el mismo patrón, un nivel visual más pequeño.

## 2. Pegar tabla (motor de carga masiva)

- Botón **"📋 Pegar tabla"** en el grupo seleccionado.
- Entrada aceptada: TSV (copiado de Excel), CSV (`;` o `,`), o líneas `nombre → $precio`
  (reutiliza la heurística del parser de listas de proveedores).
- **Detección de columnas** (heurística, siempre corregible en la vista previa):
  - Primera fila sin números → encabezados.
  - Columna 1 → nombre de sub-variante.
  - Encabezado que contenga "precio" → precio público.
  - Encabezado "COSTO X" / "X" restante numérico → costo llamado X.
  - Encabezados con "total" o "utilidad" → **ignorar** (la app los calcula).
  - Sin encabezados → col1 nombre, col2 precio, resto "Costo 1..N".
- **Vista previa**: tabla renderizada; cada columna con selector de rol
  `[Nombre | Precio público | Costo:"<editable>" | Ignorar]`; cada fila con badge
  **NUEVA** o **ACTUALIZA** (match por nombre normalizado: trim + case-insensitive).
  Botones `Crear/Actualizar N sub-variantes` y `Cancelar`.
- Al confirmar: crea/actualiza nodos en `fProdVariantes` (en memoria) — se persiste con el
  Guardar normal del producto (PUT /productos existente). Sin endpoint nuevo.
- Escapado: nombres de columnas/sub-variantes son texto libre → `pesc()`/escape en todos los
  puntos de render (lección de Fase 4.2).

## 3. Costos conectados a listas de proveedores

- **Modelo**: el JSON de costos se extiende a `{nombre, valor, lista_id?, item_id?}` —
  aditivo y retrocompatible (costos existentes sin vínculo siguen igual).
- **UI**: en cada chip de costo, botón 📎 → picker inline (no modal): proveedor → lista → ítem
  → llena nombre+valor y guarda el vínculo. El chip vinculado muestra el icono 📎 con tooltip
  "YANCA · DTF carta".
- **Aviso de desactualización (on-demand, sin push)**: al abrir el editor de un producto (y en el
  Centro de Costos), comparar `valor` del costo vinculado vs `precio_calc` actual del ítem de la
  lista. Si difieren → banner discreto: "⚠ N costos usan precios desactualizados de {proveedor}
  → [Actualizar]" que actualiza los valores (con re-render de totales). Ítem borrado de la lista →
  el vínculo se muestra como roto (chip gris) sin romper el costo.

## 4. Modo "Por medidas" en sub-variantes (backend nuevo)

```sql
ALTER TABLE ficha_variantes ADD COLUMN medida_tarifa TEXT DEFAULT '';
ALTER TABLE ficha_variantes ADD COLUMN medida_tarifa_calc TEXT DEFAULT '';
ALTER TABLE ficha_variantes ADD COLUMN medida_minimo TEXT DEFAULT '';
ALTER TABLE ficha_variantes ADD COLUMN medida_minimo_calc TEXT DEFAULT '';
```
- `modo` gana valor `'medidas'` (hoy 'precio'|'hoja').
- Guardado en `guardarVariantes` + round-trip del editor.
- En el pedido: al elegir una sub-variante modo medidas, el ítem pide ancho×alto y calcula
  `max(mínimo, área × tarifa)` (mismo patrón de `calcPrecioMedidas` de fichas por medidas;
  unidad = la `medida_unidad` de la ficha, default m²).
- `precio_oficial` de la ficha: las hojas modo 'medidas' se EXCLUYEN del cálculo del mínimo
  (no son comparables con precios unitarios). Si TODAS las hojas son modo medidas,
  `precio_oficial = min(tarifas)` y el frontend lo etiqueta "desde $X /m²".

## 5. Fuera de alcance (YAGNI)

- Importar .xlsx / imágenes (→ futuro AI Gateway).
- Actualización silenciosa de costos vinculados (siempre confirmación).
- Drag & drop de reorden (flechas ↑↓ primero).
- Rediseño de otras secciones del editor (insumos, combos, pliego) — misma filosofía pero fases posteriores.

## 6. Plan de sesiones

1. **Sesión A — Estructura**: layout 2 columnas, tarjetas plegables (grupo/sub-variante/costos),
   selector de modo en una línea, tramos compactos, flechas ↑↓ (grupos y subs), regresión total
   del editor actual.
2. **Sesión B — Pegar tabla**: parser TSV/CSV/lista, vista previa con roles por columna,
   NUEVA/ACTUALIZA, creación/actualización en memoria, E2E con la tabla RETABLOS real.
3. **Sesión C — Conexiones**: modo medidas (backend+pedido), picker 📎 desde listas de
   proveedores, aviso de desactualización, verificación integral + móvil.

## 7. Verificación

- E2E Playwright con la tabla RETABLOS del usuario (3 filas × 3 costos nombrados) y con una lista
  pegada estilo WhatsApp.
- Regresión: productos existentes (variantes, tramos, hoja, informativas) se abren y guardan idéntico.
- Re-pegado actualiza sin duplicar; nombres con comillas/apóstrofos no rompen nada (XSS/escape).
- Móvil 390px: columnas colapsan a stack, tarjetas usables.
- Consola limpia en todos los flujos.
