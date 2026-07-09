# 🗺️ MAPA-CODIGO — índice de navegación (ahorro de tokens)

> **Para la IA:** este proyecto son 2 monolitos grandes. **NO leas los archivos completos.**
> Usa este mapa para leer solo el rango de líneas que necesitas con `Read offset/limit`.
> - `public/index.html` = 4.224 líneas (~85k tokens si se lee entero) → lee tramos.
> - `server.js` = 1.350 líneas (~22k tokens) → lee tramos.
>
> Regenerar este mapa tras cambios grandes: grep de `function`/`app.(get|post|put|delete)` con `-n`.
> Última sync: commit 334c5c1 (B1.4b). Si los números bailan ±20 líneas, sigue sirviendo para saltar cerca.

---

## 📄 server.js (backend Express + better-sqlite3)

| Rango | Sección |
|---|---|
| 1–26 | requires, app, multer, paths, DB open (WAL) |
| 27–291 | **Esquema SQLite** — `db.exec CREATE TABLE`: pedidos/encargos/items 27; workspaces 125; configuracion_negocio 136; items_inventario 199; fichas_producto 212; ficha_insumos 230; combo_composicion 242; ficha_variantes 250; etiquetas_negocio 267 |
| 292–375 | `getConfiguracion(wsId)` 292 |
| 376–396 | helpers base: uid 376, hoy 377, ahora 382, nextRef 383, toNum 389, definido 390, normVF 391 |
| 397–462 | expr/valores: evalExpr 397, normCalc 408, calcReferencialEncargo 415, calcValorEncargoEfectivo 421, calcValorSugerido 424, valorOficialPedido 427, resolverCategoriasEncargo 431, pedidoCompleto 439, txtCancelacion 459 |
| 463–563 | historial/encargos/stock/cliente: addHist 463, saveEncargos 467, descontarStock 480, restaurarStock 520, asegurarCliente 533, logError 554 |
| 564–667 | **precio de ficha/producto**: calcPrecioPliegoUnit 564, calcPrecioHojaTotal 572, calcPrecioMedidas 588, calcCostoTotalInsumos 599, calcPrecioSugerido 605, detectarPrecioEscalonado 616, precioOficialFicha 625, fichaCompleta 638 |
| 668–787 | validaciones: validarFicha 668, validarPedido 761 |
| 365–368 | middleware: cors, json(10mb), static, /uploads |
| 788–813 | auth: POST /api/auth/login 788, guard `app.use('/api')` 798 |
| 814–938 | **rutas pedidos**: GET list 814, GET :id 829, POST 835, PUT :id 867, DELETE :id 907, POST :id/archivos 916, DELETE /archivos/:id 930 |
| 939–963 | rutas clientes: GET list 939, GET :id 947 |
| 964–1038 | GET /stats 964, GET /export/csv 982, GET /registros/utilidades 1004, GET /app-info 1025 |
| 1039–1160 | etiquetas: sembrarEtiquetas 1039, getEtiquetas 1045, validarEtiqueta 1053; config: GET /configuracion 1062, PUT 1066, POST /configuracion/logo 1116; GET /etiquetas 1127, POST 1130, PUT :id 1142, DELETE :id 1154 |
| 1161–1287 | fichas/productos helpers+rutas: guardarInsumos 1186, guardarComposicion 1193, cfJSON/supJSON/extrasJSON 1201, guardarVariantes 1210, arbolVariantes 1221, hojasVariantes 1237; GET /productos 1161, /productos/insumos 1169, GET :id 1180, POST 1245, PUT :id 1264, DELETE :id 1281 |
| 1288–1348 | inventario: GET 1288, POST 1291, PUT :id 1301, DELETE :id 1311; DELETE /clientes/:id 1318; POST /archivar 1325, /restaurar 1333, GET /archivo 1341 |
| 1349 | catch-all `app.get('*')` → index.html |

---

## 📄 public/index.html (frontend SPA en un archivo)

| Rango | Bloque |
|---|---|
| 1–8 | head |
| **9–527** | `<style>` — todo el CSS |
| **529–1226** | `<body>` — markup HTML de todas las vistas y modales |
| 1227–1228 | scripts jspdf + autotable (CDN) |
| **1229–4222** | `<script>` — toda la lógica JS (ver desglose abajo) |

### Desglose del `<script>` (index.html)

| Rango | Feature | Funciones clave |
|---|---|---|
| 1233–1253 | etiquetas load | cargarEtiquetas |
| 1255–1293 | **auth/PIN** | getToken/setToken/clearToken, showPinScreen, intentarPin, cerrarSesion |
| 1294–1367 | **API + utils fmt** | api 1294, hoy/sumarDias/fd, fmtMiles/fCOP, ini, normMetodos, metodoLabel/metodosPagoActivos |
| 1369–1533 | **Config negocio** | cargarConfiguracion 1373, aplicarPerfilNegocio, pintarConfiguracion 1398, showCfgTab, edición etiquetas 1435–1487, guardarConfiguracion 1488, métodos pago 1519–1532, subirLogoCfg 1533 |
| 1549–1614 | utils UI + ayuda | uid, toast, toggleColl, showHelpTab, toggleManual, pintarAyuda*, enviarWhatsAppSoporte |
| 1615–1671 | valores/expr encargo | calcProg, evalExpr, esExpresion, previewExpr, displayMoneyVal, calc*Encargo, valorOficialModal |
| 1671–1868 | **Documento / PDF** | faHTML, validezCotHTML, pagoHTML, tipoDocumento, lineasDocumento, calcularIVA, whatsapp, cargarImagenPDF, **construirPdfPedido 1757**, generarPdfPedido, imprimirPedido, compartirPedido, enviarWhatsAppPedido |
| 1869–1912 | **Navegación/vistas** | showView 1869, cargarStats 1887, renderFiltros, setFiltro, filtroRapido, buscar |
| 1914–2007 | **Lista de pedidos** | estadoGeneral, cargarPedidos 1929, renderLista 1956, entregaCell, buildEncSummary |
| 2008–2021 | clientes list | cargarClientes |
| 2022–2069 | **Productos (lista)** | prodCardHTML, cargarProductos, renderProductos |
| 2070–2111 | inventario | cargarInventario, renderInventario, nuevoItemInv, guardarItemInv, eliminarItemInv |
| 2112–2140 | archivo (papelera) | cargarArchivo, restaurarArch, eliminarArch |
| 2141–2178 | ver cliente (modal) | verCli, nuevoPedidoDesdeCliente, cerrarCli |
| 2182–2259 | **Pedido modal — cliente/encargos** | acCli, selCli, addEnc, remEnc, toggleEncCat/Sub, setEncVal, setEncEst |
| 2260–2331 | **Pedido modal — items** | addItem, remItem, setItem 2262, updateItemTotalCell, setItemTotal |
| 2332–2600 | **Precio del item** (hoja/medidas/variantes) | collectPrecioEdits, detectarPrecioEscalonado, hoja* 2359–2431, medidas 2432–2462, variantes* 2463–2566, acItem 2574 |
| 2641–2812 | **Render encargos/items** | renderEncs 2641, renderItemsHTML 2675, tags/cats/notas/estados de item, renderEncItems 2769, focus/blur valores |
| 2813–2848 | Prod editor — hoja sup/extras | addHojaSup, renderHojaSup, addHojaExtra, renderHojaExtras |
| 2849–3032 | **Prod editor — VARIANTES (árbol)** | setModoCalculo, nodoVarNuevo 2885, add/rem/set variante, duplicarVariante 2891, tramos 2905–2907, costos 2908–2911, htmlNodo* 2945–3002, renderVariantes 3004 |
| 3033–3178 | Prod editor — costos fijos/combo/insumos | costos fijos 3039–3051, combo/componentes 3052–3099, insumos 3108–3171 |
| 3179–3262 | Prod editor — precio sugerido/camino/rangos | recalcPrecioSugerido 3179, actualizarVisibilidadPrecioBase, elegirCaminoProducto 3220, rangos 3240–3262 |
| 3263–3534 | **Prod editor — form** | resetProdForm 3263, abrirNuevoProducto 3319, duplicarProducto 3342, abrirEditarProducto 3352, validarProductoBody 3412, guardarProducto 3473, eliminarProducto 3526 |
| 3535–3641 | Pedido modal — valor/progreso/pagos | actualizarValorTotal 3545, actualizarProgreso, addPago/remPago/setPagVal, renderPagos, renderPagRes |
| 3642–3673 | cotización/estado/reintegro | esCotizacionModal, toggleCotiz, onEstadoCiclo, onReintegroChange, aplicarVistaCotizacion |
| 3674–3837 | **Registro de costos (del pedido)** | costoTotal* 3674, recalcularCostosAutomaticos 3684, addCosto/remCosto/setCostoVal, acCosto, renderCostos, renderCostosRes |
| 3838–3867 | adjuntos/historial | subirArchivos, remArch, renderArchivos, renderHist |
| 3868–4041 | **Pedido — form + guardar** | resetForm 3868, abrirNuevo 3887, abrirEditar 3905, validarExpresionesBody 3963, guardar 3981, eliminarPed 4020, archivarPed 4025, archivarProducto 4030, archivarCli 4035 |
| 4042–4066 | modales más/export | abrirMas, cerrarMas, irDesdeMas, abrirExp, exportar |
| 4067–4206 | **Registros (contabilidad)** | renderRegistros 4067, regRango, regSetFiltro, regPedidosFiltrados, showReg, buildRegPanel 4133 |
| 4207–4221 | **init()** | arranque de la app |

---

## 📚 Documentos de contexto (raíz del proyecto — abrir solo si hace falta)

| Archivo | Peso | Qué contiene |
|---|---|---|
| `DOCUMENTO_COMPLETO_PARA_DESARROLLADOR.md` | 98 KB | doc de desarrollo completa (la más pesada — evitar leer entera) |
| `MASTER-DOCUMENTO-DESARROLLO.txt` | 22 KB | documento maestro de desarrollo |
| `PROYECTO_CONTEXTO.md` | 12 KB | contexto del proyecto |
| `CORRECCIONES-PARA-IA.txt` | 6.5 KB | lista de correcciones pedidas |
| `RESUMEN_EJECUTIVO_1_PAGINA.md` | 7 KB | resumen ejecutivo 1 página |
| `MEJORAS/Feed Back 2 a revisar.pdf` | 1.7 MB | feedback ronda 2 (pendiente de revisar) |
| `MEJORAS/Nueva Arquitectura Funcional del Sistema.pdf` | 35 KB | arquitectura funcional propuesta |
