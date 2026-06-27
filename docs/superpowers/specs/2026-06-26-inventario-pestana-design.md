# Inventario como pestaña propia — Diseño

**Fecha**: 2026-06-26
**Origen**: primera de 6 sub-proyectos derivados del documento de rediseño total de
Productos que el usuario entregó hoy (orden acordado: Inventario aparte → Costos
colapsados → Por medidas → Por variantes → Snapshot de Combos → Fórmula
personalizada). Brainstorm de alcance ya resuelto y aprobado en esta conversación.

## Contexto

Hoy "Stock actual" y "Stock mínimo" son 2 campos dentro del modal de Producto (sección
"Inventario (opcional)", `agencia/public/index.html` líneas 902-906), guardados como
columnas `stock_actual`/`stock_minimo` en `fichas_producto`. El usuario pidió
explícitamente separar esto: *"el inventario será una pestaña o módulo aparte, porque
su lógica es distinta y más operativa... en productos solo se define la información
comercial y de cálculo."*

Investigado el código real antes de diseñar:
- `GET /api/productos` (lista) ya devuelve `stock_actual`/`stock_minimo` para todos los
  productos vía `fichaCompleta()` — no hace falta ningún endpoint nuevo para leer.
- `PUT /api/productos/:id` ya acepta y guarda ambos campos — pero exige el objeto
  completo de la ficha (`b.nombre.trim()` revienta si `nombre` no viene). No admite hoy
  una actualización parcial de solo estos 2 campos.
- El descuento de stock al guardar un pedido (`descontarStock`/`restaurarStock`) ya
  expande Combos/Promociones recursivamente a sus componentes reales — no se toca nada
  de esa lógica en este sub-proyecto.
- El badge "Stock bajo" en la tarjeta de cada producto (línea 1721) ya existe y sigue
  igual.

## Alcance

### Navegación
- Nuevo ítem en el sidebar: **Inventario** (ícono `ti-clipboard-list` o similar),
  ubicado entre Productos y Ayuda.
- Se agrega también al modal "Más" del menú móvil (`irDesdeMas`), igual que los demás
  ítems que no entran en los 4 botones fijos.

### Modal de Producto
- Se elimina la sección "Inventario (opcional)" completa (los 2 inputs `prod-stock-actual`/
  `prod-stock-minimo` y su `<div class="msec">`). El modal de Producto queda solo con
  información comercial y de cálculo.
- Un producto nuevo se sigue guardando con `stock_actual:null`/`stock_minimo:null` (sin
  seguimiento), igual que hoy. Activar seguimiento se hace después, desde Inventario.

### Vista Inventario
- Toolbar con buscador por nombre (mismo patrón que Productos/Clientes) — filtra
  client-side sobre la lista ya cargada.
- Lista solo de productos reales: se excluyen `tipo_precio==='combo'` y
  `'promocional'` (no tienen stock propio, se calculan de sus componentes).
- Orden: 1) **Stock bajo** primero (`stock_actual!=null && stock_minimo!=null &&
  stock_actual<=stock_minimo`), 2) con seguimiento activo y stock sano, 3) sin
  seguimiento (`stock_actual==null`) al final. Dentro de cada grupo, alfabético por
  nombre.
- Cada fila: nombre, categoría (texto, no editable aquí), dos inputs numéricos (Stock
  actual / Stock mínimo, placeholder "Sin seguimiento" cuando están vacíos, igual que
  hoy en el modal), y el badge "Stock bajo" cuando aplica.
- Guardado: al perder el foco (`onblur`) de cualquiera de los 2 inputs de una fila, se
  llama a `PUT /api/productos/:id` reenviando el objeto completo de esa ficha (ya está
  en memoria desde la carga de la lista) con los 2 campos de stock actualizados. Toast
  de confirmación. Sin botón "Guardar" por fila.

## Explícitamente fuera de esto
- No se toca `descontarStock`/`restaurarStock` ni la expansión recursiva de
  Combos/Promociones — ya funciona correctamente.
- No se agrega historial de movimientos (entradas/salidas con fecha) — es solo
  reubicar el mismo mecanismo de "sobreescribir el número" que ya existe hoy.
- No se tocan los avisos de "supera el stock disponible" al armar un Encargo
  (Fase 2C) — siguen leyendo `stock_actual` igual que hoy.
- No hay endpoints ni tablas nuevas en el backend.

## Backend (`server.js`)
Ningún cambio.

## Frontend (`public/index.html`)
- Sidebar: nuevo `<button class="nav-item" data-view="inventario" onclick="showView('inventario')">`.
- Modal "Más" (móvil): nueva entrada `irDesdeMas('inventario')`.
- Nuevo `<div id="view-inventario" class="view">` con toolbar (buscador) y tabla/lista.
- Modal de Producto: se elimina el bloque "Inventario (opcional)" (líneas 902-906) y las
  3 líneas de JS que lo leen/escriben (`abrirEditarProducto` líneas 2323-2324,
  `guardarProducto` líneas 2375-2376 quedan en `null` siempre, ya no se leen del DOM).
- Nueva función `cargarInventario(q)`: reutiliza `productos` ya cargado (o llama
  `GET /api/productos` si la vista se abre primero), filtra `tipo_precio` real, ordena
  por el criterio de arriba, pinta filas.
- Nueva función `guardarStockInventario(fichaId,campo,valor)`: busca la ficha completa
  en el array `productos`, parchea el campo, llama `api('PUT','/productos/'+fichaId,...)`
  con el objeto completo, muestra toast.
