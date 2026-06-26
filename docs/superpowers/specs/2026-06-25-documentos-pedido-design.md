# Vista Cliente y Documentos Formales — Diseño

**Fecha**: 2026-06-25
**Origen**: Fase 3 de `MASTER-DOCUMENTO-DESARROLLO.txt`. El propio documento la marca como
prioridad #3 ("lo más visible en una demostración"), por delante de lo que queda de la
Fase 2 (2E, etiquetas personalizables — arquitectónico, sin urgencia con un solo negocio
real usando categorías fijas que ya le funcionan).

## Contexto

Primera vez en esta sesión que se evalúa agregar una dependencia nueva. Decisión: nada
nuevo en `package.json` — se genera el PDF **100% en el navegador** con `jsPDF` +
`jspdf-autotable` por CDN, mismo patrón que ya usa la app para tipografía (Google Fonts)
e iconos (Tabler). Cero riesgo de build en Railway (ya hubo un incidente real con
dependencias nativas y la versión de Node, documentado en memoria), y los datos
necesarios (pedido completo + Configuración del negocio) ya están en memoria del
navegador cuando el modal de un pedido está abierto — no hace falta ningún endpoint
nuevo para generar el documento.

## Alcance

### Tipo de documento (según estado del pedido, misma lógica que ya usan los badges existentes)
- `es_cotizacion=true` → **Cotización** — incluye "Válida hasta" usando
  `dias_validez_cotizacion` (ya existe desde la Fase 1E, mismo cálculo que ya usa
  `validezCotHTML`).
- `entregado=true` y completamente pagado (pagos ≥ valor oficial) → **Comprobante de
  Venta**.
- Cualquier otro caso → **Orden de Pedido**.
- Si `cancelado=true`: el botón de generar documento no se muestra — no tiene sentido
  un comprobante formal de algo cancelado.

### Contenido
- Encabezado: logo (`CFG.logo_ruta`, o el logo por defecto si no hay uno propio),
  nombre/NIT/teléfono/email/dirección del negocio — todo ya existe en Configuración
  (Fase 1E).
- Cliente: nombre, teléfono, número de pedido (`#ref`).
- Fecha de emisión (hoy) y fecha de entrega.
- **Líneas del documento: una por encargo, no una por ítem suelto.** Descripción =
  concatenación de los ítems de ese encargo (`cantidad — detalle`, unidos por `; `).
  Monto de la línea = valor efectivo de ese encargo (`calcValorEncargoEfectivo`,
  respeta cualquier ajuste manual a nivel de encargo). El Total final usa el valor
  oficial del pedido (`valorOficialPedido`) — si alguna vez no coincide exactamente con
  la suma de líneas (el dueño dio un descuento global a mano sobre el Valor Final del
  Pedido), eso es válido y esperado: no se inventa una línea de "ajuste" para forzar que
  cuadre.
- Métodos de pago aceptados: lista de `CFG.metodos_pago` (ya existe).
- **Nunca aparece**: costos internos, márgenes de utilidad, notas operativas
  (`p.notas`), insumos, codificaciones internas (ids).

### IVA — opcional por negocio, completamente oculto si no aplica
La mayoría del mercado objetivo (diseñadores/estampadores independientes) no es
responsable de IVA — por eso este toggle no puede ser "una casilla más", tiene que
desaparecer del todo para quien no lo necesita. En Configuración → nueva sección
**Impuestos**:
- **Aplicar IVA** (checkbox, default `no`). Si está en `no`, los dos campos siguientes
  **no se muestran en absoluto** (no solo deshabilitados) — ni en Configuración ni en
  ningún lado del documento aparece la palabra "IVA".
- Solo si "Aplicar IVA" está en `sí`, aparecen: **Porcentaje** (default `19`) y
  **Mostrar desglosado en el documento** (checkbox).
- Los precios ya guardados se interpretan como **IVA incluido** (no se cambia ningún
  cálculo financiero existente en el resto de la app). El documento, solo si Aplicar=sí
  y Desglosado=sí, calcula `Subtotal = Total ÷ (1 + porcentaje/100)` y
  `IVA = Total − Subtotal`, y muestra Subtotal/IVA/Total en líneas separadas en vez de
  un solo "Total".

### Botón de WhatsApp — puente manual hacia la Fase 5
`wa.me` solo puede pre-llenar **texto**, nunca adjuntar un archivo (adjuntar requeriría
la API de pago de WhatsApp Business — eso es exactamente la Fase 5, Agente de IA en
WhatsApp, todavía no construida). El flujo de este sub-proyecto es explícitamente el
puente manual que el propio documento maestro describe ("este botón es el puente antes
de tener el agente de IA completo en Fase 5"):
1. "Generar PDF" descarga/abre el documento.
2. "Enviar por WhatsApp" abre `wa.me` con un mensaje-resumen ya escrito (cliente, número
   de pedido, total, y "Válida hasta" si es cotización) al número del cliente
   (normalizado: solo dígitos, antepone `57` si el número parece colombiano de 10
   dígitos sin código de país).
3. El usuario adjunta el PDF ya descargado a mano dentro de WhatsApp.

Ambos botones viven en el `mfoot` del modal de pedido, visibles solo al editar un
pedido ya guardado (no en "Nuevo pedido" — no hay nada que documentar todavía) y
ocultos si `cancelado=true`.

## Backend
Ningún cambio. Todo el contenido necesario ya lo devuelve `pedidoCompleto()` y
`GET /api/configuracion` — la única novedad de datos es agregar `iva_activo`,
`iva_porcentaje`, `iva_desglosado` a `configuracion_negocio` (mismo patrón que el resto
de columnas de esa tabla, con sus defaults).

## Frontend
- Nuevas funciones puras (sin DOM, sólo toman el pedido completo + `CFG` y devuelven
  los datos ya armados para el PDF): `tipoDocumento(p)`, `lineasDocumento(p)`,
  `calcularIVA(total,porcentaje)`, `mensajeWhatsApp(p,tipo)`, `normalizarTelWa(tel)`.
- `generarPdfPedido(p)`: usa `jsPDF`/`autoTable` para construir el documento con los
  datos de las funciones anteriores + `CFG` (datos del negocio).
- Botones nuevos en el `mfoot` del modal de pedido: "Generar PDF" y "Enviar por
  WhatsApp" (este último deshabilitado/oculto si el cliente no tiene teléfono
  registrado — no hay a quién escribirle).
- Configuración gana una pestaña/sección **Impuestos** con el comportamiento de
  visibilidad condicional descrito arriba.

## Explícitamente fuera de este sub-proyecto
- Envío automático por WhatsApp (Fase 5 — requiere la API de pago de WhatsApp
  Business). El botón de hoy es el puente manual, ya queda listo el lugar donde
  enganchar el envío automático cuando llegue esa fase.
- PDF "para impresión" vs. "para compartir" como archivos distintos — el documento
  maestro los menciona pero un solo PDF tamaño carta sirve para ambos usos sin
  duplicar trabajo.
- Etiquetas personalizables por negocio (Fase 2E) — la categoría de cada encargo en el
  documento sigue mostrando el label de `CATS` de siempre.
