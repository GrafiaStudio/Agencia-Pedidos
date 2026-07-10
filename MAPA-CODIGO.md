# 🗺️ MAPA-CODIGO — índice de navegación (ahorro de tokens)

> **Para la IA:** este proyecto son 2 monolitos grandes. **NO leas los archivos completos.**
> Usa este mapa para leer solo el rango de líneas que necesitas con `Read offset/limit`.
> - `public/index.html` = 4.224 líneas (~85k tokens si se lee entero) → lee tramos.
> - `server.js` = 1.350 líneas (~22k tokens) → lee tramos.
>
> Regenerar este mapa tras cambios grandes: grep de `function`/`app.(get|post|put|delete)` con `-n`.
> Última sync: commit 0eec568 (v3.0 Fase 2b). **server.js=1580 líneas, index.html=4399 líneas.**
> ⚠️ Las tablas grandes de abajo son PRE-v3.0: sus números corrieron ~+120 líneas en server.js y
> ~+250 en index.html. Sirven para saltar cerca; los anclajes EXACTOS de v3.0 están en la sección
> "🆕 v3.0" (abajo). Ante la duda, re-grep del nombre de la función.

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

## 🆕 v3.0 (Fases 1, 2a, 2b) + medidas — anclajes exactos, commit 0eec568

### server.js
| Línea | Qué |
|---|---|
| 120–164 | **Esquema v3.0**: `pedido_versiones` 121 (+ALTER historial usuario/rol/motivo); `roles` 149, `usuarios` 153; `PERMISOS_FASE1` (10 permisos), `permisosDeRol`, `sembrarUsuariosSiFalta` |
| 443–455 | `toFloatCO` (decimal colombiano para tarifas por medida) |
| 503–526 | `pedidoCompleto` (expone `p.version`) |
| 528–556 | **Versionado**: `addHist(pid,txt,ws,actor,motivo)` 528, `actorDe(req)` 534, `firmaClave(pc)` 536, `crearVersion` 542 |
| 624–695 | Medidas: `calcPrecioMedidas` (usa toFloatCO), `calcCostoMedida` 684 (costo proveedor ancho×alto+mín) |
| 884–928 | **Auth**: login usuario+PIN 884, guard carga permisos, `requiere(clave)` |
| 931–1013 | **Endpoints usuarios/roles**: GET /me 935, /me/pass, roles CRUD 949–, usuarios CRUD 981– |
| 1029–1145 | **Pedidos**: GET list 1029, GET :id + **GET :id/versiones 1050**, POST 1055 (crea v1), PUT :id 1089 (firmaClave→crearVersion), DELETE 1137 |
| ~1440 | INSERT/UPDATE fichas_producto: incluye `costo_medida_tarifa/minimo` (+_calc) |

### public/index.html
| Línea | Qué |
|---|---|
| 1265–1284 | Globals `ME/PERMISOS/ES_ADMIN`, `puede()` 1267, `cargarMe`, `aplicarGatingPermisos`, `VIEW_PERM` |
| 1300–1345 | Login: `showPinScreen`, `mostrarLoginPin/User`, `intentarLogin`, `intentarPin` |
| 1785–1795 | `toFloatCO` + `fmtTarifa` (decimales de tarifa) |
| ~1500–1575 | Gestión usuarios/roles (`renderUsuariosRoles`, etc.) |
| 3841 | `recalcularCostosAutomaticos` (suma insumos + **costo por medida** por ítem) |
| 4020 | `renderHist(hist,version)` — badge Versión + usuario·rol·motivo |
| 4153 | `guardar()` — envía `motivo` (Fase 2b) |
| markup | login ~533; tab "Usuarios y Roles" en Config; sidebar con `data-perm`; sección "Costo por medida" en form producto; card Historial con `#ped-version-badge`; footer editor con `#f-motivo` |

## 🆕 v3.0 Fase 3 — Cierre de pedido (commit tras 2026-07-10)

### server.js
| Línea aprox | Qué |
|---|---|
| ~131–135 | Migración `pedidos`: `cerrado`, `cerrado_por`, `cerrado_en`, `cerrado_motivo` |
| PERMISOS_FASE1 | +`reabrir_pedidos` (cerrar=editar_pedidos; reabrir=permiso dedicado) |
| pedidoCompleto | expone `p.cerrado` (bool) |
| PUT /api/pedidos/:id | **409** si `p.cerrado` (bloqueo de edición) |
| tras DELETE pedido | **POST /:id/cerrar** (requiere editar_pedidos; exige entregado) y **POST /:id/reabrir** (requiere reabrir_pedidos) |

### public/index.html
| Qué | Dónde |
|---|---|
| `PERM_LABELS.reabrir_pedidos` | ~1490 |
| CSS `.lock-badge/.cerrado-banner/.ped-cerrado` | tras `.b-canc` (~165) |
| Header editor: `#btn-cerrar`, `#btn-reabrir`, badge `#ped-cerrado-badge` | ~912 |
| Banner `#ped-cerrado-banner` | inicio de `.mbody` |
| `estadoGeneral` → 'Cerrado' + EG_COL + candado en ref lista | ~2065, ~2109, ~2119 |
| `abrirEditar`: visibilidad botones + `aplicarModoCerrado` | ~4130 |
| `abrirNuevo`: oculta botones + limpia modo cerrado | ~4059 |
| **funcs** `aplicarModoCerrado`, `cerrarPedido`, `reabrirPedido` | antes de `archivarPed` (~4200) |

Spec: `docs/superpowers/specs/2026-07-10-fase3-cierre-pedido-design.md`.

---

## 🆕 v3.0 Fase 4 — Módulo Producción (por encargo)

### server.js
| Línea aprox | Qué |
|---|---|
| tras migración cerrado | `ALTER encargos ADD responsable_id, notas_tec` |
| PERMISOS_FASE1 | +`ver_produccion`, `gestionar_produccion`; `const ENC_ESTADOS=[...]` |
| `saveEncargos` | INSERT ahora incluye `responsable_id,notas_tec` (sobreviven a edición comercial) |
| tras cerrar/reabrir | **GET /api/produccion** (tarjetas por encargo de pedidos activos), **GET /api/produccion/equipo**, **PUT /api/produccion/encargo/:id** (estado/responsable/notas; 409 si cerrado; historial) |

### public/index.html
| Qué | Dónde |
|---|---|
| CSS `.prod-board/.prod-col/.prodx-card/.pcx-*` (ojo: `prodx-card`, NO `prod-card` que es de Productos) | tras CSS de cierre (~181) |
| Sidebar nav `data-view="produccion"` + vista `#view-produccion` (barra filtros + `#prod-board`) | sidebar / antes de view-archivo |
| `PERM_LABELS` +ver/gestionar_produccion; `VIEW_PERM.produccion`; showView título + `cargarProduccion()` | ~1490, ~1507, ~2039 |
| **funcs** `cargarProduccion, renderProduccion, prodCardHTMLp, prodEntrega, prodSetEstado, prodSetResp, prodToggleObs, prodGuardarObs, prodFiltrar/ToggleUrg, pesc` | antes de `/* ══ CLIENTES ══ */` |

Spec: `docs/superpowers/specs/2026-07-10-fase4-modulo-produccion-design.md`.

---

## 🆕 v3.0 Fase 5 — Inventario desde Producción (híbrido)

### server.js
| Qué | Dónde |
|---|---|
| `CREATE TABLE consumo_inventario` (ledger reversible) | tras migración de Producción |
| PERMISOS_FASE1 +`consumir_inventario` | catálogo |
| `consumos:[...]` por tarjeta en GET /produccion | dentro del forEach de encargos |
| **POST /produccion/encargo/:id/consumo** (descuenta stock, 409 si cerrado, historial), **DELETE /produccion/consumo/:id** (devuelve stock) | tras PUT /produccion/encargo/:id |
| Descuento automático `descontarStock` SIN cambios (compatibilidad) | — |

### public/index.html
| Qué | Dónde |
|---|---|
| CSS `.pcx-stock/.pcx-stk-*` | tras `.prod-avatar` |
| `PERM_LABELS.consumir_inventario` | ~1490 |
| Botón 📦 + panel `.pcx-stock` en la tarjeta; `prodConsumosHTML`, `prodInvOptions` | en `prodCardHTMLp` |
| `PROD_INV` + carga de `/inventario-items` en `cargarProduccion` | ~2238/2242 |
| **funcs** `prodToggleStock, prodReabrirStock, prodConsumir, prodQuitarConsumo` | tras `prodGuardarObs` |

Spec: `docs/superpowers/specs/2026-07-10-fase5-inventario-desde-produccion-design.md`.

---

## 🆕 v3.0 Fase 6 — Dashboard ejecutivo

### server.js
| Qué | Dónde |
|---|---|
| PERMISOS_FASE1 +`ver_dashboard` | catálogo |
| **GET /api/dashboard?periodo=hoy\|semana\|mes** — kpis/finanzas/recientes/entregas/produccion/actividad. Ingresos por fecha de pago; costos por `p.fecha_pedido` (el `creado` de costos se reescribe al editar) | tras GET /api/stats |

### public/index.html
| Qué | Dónde |
|---|---|
| Nav **Dashboard** (primero, `data-perm="ver_dashboard"`) + vista `#view-dashboard` (saludo + píldoras período + `#dash-kpis/#dash-fin/#dash-grid`) | sidebar / antes de view-pedidos |
| CSS `.dash-*` | tras `.pcx-stk-add` |
| `PERM_LABELS.ver_dashboard`, `VIEW_PERM.dashboard`, showView título+`cargarDashboard()` | ~1490/1507/2039 |
| **funcs** `dashSetPeriodo, dashSaludo, dashEstadoPed, dashEntregaLbl, dashActIcon, cargarDashboard` | antes de `/* ══ PRODUCCIÓN` |

Spec: `docs/superpowers/specs/2026-07-10-fase6-dashboard-design.md`.

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
