# Rediseño del Pedido a página completa (guia2) — Diseño

**Fecha:** 2026-06-27
**Estado:** Aprobado por el usuario (3 decisiones confirmadas + referencia `guia2.png`). Listo para plan.

## Origen
El usuario probó la app en producción y, junto con feedback de UI/UX, pidió un rediseño
estructural del Pedido tomando como referencia **`guia2.png`** (una propuesta de diseño que le
hicieron). Se confirmaron 3 decisiones de modelo con `AskUserQuestion`:

1. **Etiqueta por ÍTEM** (no por encargo), **manteniendo los Encargos** como grupos opcionales.
2. **Todo a página completa** — la ventana flotante (modal) del pedido **desaparece**; tanto ver
   como editar ocupan toda el área.
3. **Estado = 1 desplegable de ciclo** (Nuevo / Entregado / Cancelado / Cotización, excluyentes)
   **+ Urgente y Pendiente de pago como 2 chips** independientes (porque son ortogonales al ciclo).

## Qué muestra guia2 (el norte visual)
Vista "Detalle del pedido" a página completa, dentro del layout normal (sidebar + topbar):
- **Encabezado**: ← volver, `#0015` grande + chip de estado, fecha/hora. A la derecha: botones
  ghost "Imprimir" / "Descargar PDF" y botón sólido "Editar pedido".
- **Tarjeta de cliente**: avatar + nombre + tel·email + chip "Cliente frecuente"; columnas
  Método de pago / Estado / Entrega estimada; Observaciones debajo.
- **Tarjeta "Productos y servicios"** (la pieza central): tabla con filas
  `CANT. | DETALLE | (Ver detalle) | V. UNITARIO | V. TOTAL | ⋮`. Cada fila:
  - número de cantidad grande a la izquierda,
  - **nombre del producto en negrita + su ETIQUETA de color inline**,
  - **línea gris sutil debajo con la variante/especificación** (ej. "120 hojas · 1 tinta · ½ carta"),
  - botón ghost "Ver detalle" que **expande** una sub-tarjeta (Especificaciones / Costos de
    producción / Precios por cantidad),
  - precios unitario y total, y menú `⋮`.
  - "+ Agregar producto o servicio" **dentro** de la tarjeta (no como bloque suelto).
- **Columna derecha (resumen)**, tarjetas apiladas:
  - **Resumen del pedido**: Subtotal, Descuento, Envío, Impuestos, **Total** grande + chip pago.
  - **Progreso del pedido**: barras por etapa.
  - **Archivos adjuntos**: subir/lista.
  - **Historial**.
  - (NUESTRO ajuste) **REGISTRO** (costos del pedido) va **al final, plegado**, nunca primero.

Estética: tarjetas blanco-degradado muy suaves sobre fondo azul-gris, esquinas redondeadas,
sombras difusas, **pocas líneas**, etiquetas de color, números grandes finos. (Ya venimos
aplicando esta dirección en el loop de UI/UX; ver [[ui-ux-rediseno]].)

## Modelo de datos (el cambio de fondo)
**Etiqueta por ítem, additivo y sin romper lo viejo:**
- `enc_items` gana columnas `categoria TEXT DEFAULT ''` y `subcategoria TEXT DEFAULT ''`
  (migración `ALTER TABLE … ADD COLUMN` en try/catch, como manda la lección de
  [[memoria-actualizaciones]]: `CREATE TABLE IF NOT EXISTS` no agrega columnas).
- Los **Encargos siguen existiendo** y conservan su `categorias`/`subcategorias` por
  compatibilidad, pero la UI nueva los trata como **grupos opcionales**; la etiqueta visible y
  editable pasa a estar en **cada ítem**.
- **Backfill suave**: al cargar un pedido viejo, si un ítem no tiene `categoria` pero su encargo
  sí, se hereda en memoria para mostrar (no se fuerza en DB). Pedidos nuevos guardan por ítem.
- El resumen del pedido y el PDF agrupan/listan por ítem; las etiquetas de las tarjetas de la
  lista de pedidos se calculan desde los ítems (unión de sus categorías), cayendo a las del
  encargo si el ítem no tiene.

**Estado (decisión 3):** se conservan las columnas booleanas actuales
(`urgente`, `entregado`, `cancelado`, `pendiente_pago`, `es_cotizacion`) — NO se migra el
esquema. La UI cambia: un `<select>` de **ciclo** mapea a `entregado`/`cancelado`/`es_cotizacion`
(y "Nuevo" = ninguno de esos), excluyentes entre sí; `urgente` y `pendiente_pago` quedan como 2
chips toggle independientes. Esto preserva filtros (Urgentes/Pendientes/Entregados/…) y datos.

## Estructura de vista (decisión 2)
- Se reemplaza el modal `#ovP` por una **vista** dentro de `.main` (como `productos`,
  `clientes`): `showView('pedido-detalle', id)` y `showView('pedido-edit', id|nuevo)`.
- **Detalle** (read): layout guia2 de 2 columnas. Botón "Editar pedido" → modo edición.
- **Edición**: mismo armazón de 2 columnas pero con campos editables (los que hoy están en el
  modal), full-page. "Guardar"/"Cancelar" fijos abajo o en el encabezado.
- Móvil: las 2 columnas se apilan (la de resumen va abajo).
- El botón "Nuevo pedido" abre `pedido-edit` en modo nuevo (ya no el modal).

## Layout del ítem (decisión 1 + guia2)
Fila de ítem (en edición): `Cant. | Detalle + selector de etiqueta + variante sutil debajo |
V. Unitario | ⋮/expandir`. La etiqueta del ítem se elige con un chip compacto (reutiliza
`CATS`/subs). En lectura: como guia2 (nombre + tag + spec gris + Ver detalle).

## Fases de implementación (cada una se despliega y verifica sola)
1. **Backend additivo**: columnas `enc_items.categoria/subcategoria`; guardar/leer; backfill en
   memoria. Sin cambio de UI. Verificar con curl (crear pedido con ítems etiquetados, releer).
2. **Estado ciclo+chips**: reemplazar las 5 casillas por `<select>` de ciclo + 2 chips, mapeando
   a los booleanos. Verificar guardado/lectura y que los filtros del sidebar sigan bien.
3. **Etiqueta por ítem (UI de edición)**: cada fila de ítem con su selector de etiqueta; el
   encargo deja de pedir categoría (o la deja opcional plegada). Verificar persistencia.
4. **Vista detalle full-page (guia2)**: nueva vista de lectura de 2 columnas con resumen,
   progreso, archivos, historial y Registro plegado al final. Verificar con un pedido real.
5. **Edición full-page**: mover los campos del modal a la vista de 2 columnas; jubilar `#ovP`.
   Verificar el ciclo completo crear→editar→guardar→ver.
6. **PDF y tarjetas de lista**: que el PDF y las etiquetas de la lista de pedidos usen las
   etiquetas por ítem. Verificar el PDF de un pedido con ítems de distintas categorías.

## Riesgos / cuidados
- Datos reales en producción: todas las migraciones additivas + try/catch; nunca DROP/rename.
- No romper `descontarStock`, los filtros del sidebar, ni el cálculo de valores (jerarquía de 4
  niveles). Verificar con curl/Node antes de cada push (no hay framework de test).
- El modal `#ovP` se jubila solo al final (fase 5), para no dejar la app a medias entre fases.
- Verificación visual real con Playwright (hay navegador) en cada fase de UI.

## Fuera de alcance (lo dijo el usuario)
- "Agendas personalizadas super detallado" de guia2 — no lo tenemos y es difícil; ese espacio se
  usa para lo que SÍ tenemos (archivos, historial, registro de costos).
