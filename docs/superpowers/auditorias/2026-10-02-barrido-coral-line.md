# Barrido de fallos — Coral Line (2026-10-02)

Registro vivo del barrido pedido por el usuario tras publicar Coral Line: *"un súper barrido en busca
de fallos, errores, ya sea de diseño, de funcionamiento o demás"*. Cada hallazgo lleva su estado.

Estados: `ABIERTO` · `ARREGLADO` (con commit) · `DECISIÓN` (lo decide el usuario) · `DESCARTADO`.

## Ciclo 1 — estático y servidor

| # | Gravedad | Hallazgo | Estado |
|---|---|---|---|
| S1 | Alta | **Permisos que solo existen en la pantalla.** `registrar_pagos` no se exige en ninguna ruta; `GET /api/pedidos` entrega los `costos` a quien no tiene `ver_costos`; `PUT /api/pedidos/:id` deja cambiar pagos y costos con solo `editar_pedidos`. | PARCIAL — «Registrar pagos» ya se exige (servidor y pantalla). **Ver costos sigue siendo solo de pantalla**: los costos automáticos se calculan en el navegador, así que ocultarlos de verdad exige mover ese cálculo al servidor (trabajo aparte) |
| S2 | Alta | `POST /api/archivar` y `/api/restaurar` no piden permiso: cualquier usuario del negocio archiva pedidos, clientes o productos. | ARREGLADO |
| S3 | Alta | El límite de intentos del ingreso usa la cabecera `x-forwarded-for` completa como llave: falseándola se salta el bloqueo y se pueden probar los 10.000 PIN. | ARREGLADO |
| S4 | Media | Las subidas aceptan cualquier tipo de archivo y se sirven desde el mismo dominio: un `.html`/`.svg` con código se ejecutaría con la sesión de quien lo abra. | ARREGLADO |
| S5 | Media | La app pesa 700 KB y se sirve **sin comprimir** (comprimida ≈ 130 KB). | ARREGLADO (694 KB → 149 KB) |
| S6 | Media | Cualquier dirección inexistente devuelve la app entera con código 200: `/robots.txt`, `/.env`, una imagen que falta (700 KB por cada imagen rota). | ARREGLADO |
| S7 | Media | App privada sin `noindex`: un buscador puede indexar la pantalla de ingreso. Faltan `description`, `theme-color`, icono para pantalla de inicio. | ARREGLADO (+ manifiesto e iconos de app) |
| S8 | Baja | CORS abierto a cualquier origen (`cors()` sin opciones). Riesgo bajo: la sesión va en cabecera, no en cookie. | DECISIÓN |
| S9 | Baja | Sin cabecera HSTS. | ARREGLADO |
| S10 | Baja | PIN de 4 dígitos como llave de administrador; negocios de prueba con PIN triviales en producción. | DECISIÓN |
| S11 | Baja | 25 botones solo-icono sin nombre accesible; 1 imagen sin `alt`. | ARREGLADO |
| S12 | Baja | 19 `confirm()` y 3 `prompt()` del navegador: rompen la identidad de vidrio. | PENDIENTE E4 (hace falta un diálogo propio de vidrio) |
| S13 | Baja | Código muerto del Dashboard anterior (`dashChartIngresos`, `dashChartProduccion`). | ARREGLADO |
| S14 | Baja | El CSV exportado todavía se llama `pedidos_grafia_*.csv`. | ARREGLADO |

Comprobado y **bien**: no hay funciones llamadas que no existan, ni variables de color sin definir,
ni texto por debajo de 11 px; el SQL solo interpola nombres de listas fijas; producción firma las
sesiones con un secreto propio (no el de desarrollo); `.env`, `server.js` y la base no se filtran.

## Ciclo 2 — navegador (40 pantallas × 5 tamaños, día y noche)

Sin errores de consola ni respuestas de error del servidor en ningún tamaño. Nada se desborda de la
pantalla. Hallazgos:

| # | Gravedad | Hallazgo | Estado |
|---|---|---|---|
| N1 | Alta | **Botón «atrás» del teléfono saca de la app** (no hay historial): no cierra la ventana abierta ni vuelve a la vista anterior. | ARREGLADO |
| N2 | Alta | **Cerrar el editor de pedido o de producto pierde lo escrito sin avisar.** | ARREGLADO |
| N3 | Media | La tecla Escape no cierra ninguna ventana (solo el buscador); clic fuera tampoco cierra las ventanas simples. | ARREGLADO |
| N4 | Media | Recargar la página siempre vuelve al Dashboard: no recuerda dónde estabas. | ARREGLADO |
| N5 | Media | Móvil · Productos: la lupa del buscador queda encima del selector de categorías. | ARREGLADO |
| N6 | Media | Móvil · editor de producto: 4 campos en una fila; el nombre del producto queda de una letra. | ARREGLADO |
| N7 | Media | Móvil · Inventario: tabla apretada, los campos se cortan («unidac», «Opc»). | ARREGLADO |
| N8 | Media | Móvil · barra superior: el buscador se encoge hasta «Bu» cuando el título es largo. | ARREGLADO |
| N9 | Media | Móvil · blancos táctiles pequeños: borrar ítem 17×20, borrar encargo 14×18, casillas 13×13, favorita 15×15; pestañas de 26–28 px. | ARREGLADO |
| N10 | Media | **Manual de ayuda desactualizado**: habla del menú lateral, de «Pendiente de pago», de tipos de precio viejos; no menciona Dashboard, Producción, Bitácora, Coralyne ni Centro de Costos. | ARREGLADO (19 temas) |
| N11 | Baja | Reporte del Dashboard sin datos: el eje muestra «0 0 1 1 1». | ARREGLADO |
| N12 | Baja | Reporte del Dashboard: la curva suavizada baja de cero entre meses sin movimiento. | ARREGLADO |
| N13 | Baja | Producción · tablero: doble desplazamiento (la página y cada columna). | ARREGLADO |
| N14 | Baja | Móvil · Registros: la nota «Ventas = …» parte el enlace «Ingresos» a otra columna. | ARREGLADO |
| N15 | Baja | Título «Ayuda y About» (mezcla de idiomas). | ARREGLADO |
| N16 | Baja | Ingreso: campos de usuario y contraseña en tipografía monoespaciada, sin `<form>` ni etiquetas. | ARREGLADO |
| N17 | Baja | Exportar: el selector de formato corta su texto. | ARREGLADO |
| N18 | Info | Centro de Costos: las filas «— → $2.000 —» no explican qué es cada cifra (Entrega 4). | PENDIENTE E4 |
| N19 | Info | Ayuda → «Quiénes somos», «Términos» y «Privacidad» muestran «Pendiente: texto que proveerá el negocio». | DECISIÓN |
| N20 | Info | Producción real: hay un estado llamado «despavho» (¿«despacho»?). Es dato del negocio. | DECISIÓN |

Datos: el respaldo de producción pasa la comprobación de integridad, sin registros huérfanos ni
restos de pruebas. En local quedaban 2 códigos de venta «ZZ» de pruebas (solo local).

## Ciclo 3 — escapado (lo más grave que apareció)

| # | Gravedad | Hallazgo | Estado |
|---|---|---|---|
| E1 | **Alta** | **Un texto con comillas se cortaba y se perdía.** `Pendón 24"x36" brillante` quedaba en `Pendón 24` al reabrir el pedido o el producto, y al guardar se perdía para siempre: anotación del encargo, nota del pago, descripción del costo, insumos, proveedor, hojas, extras, etiquetas. En artes gráficas las pulgadas son cosa de todos los días. | ARREGLADO |
| E2 | **Alta** | **Nombres y notas sin escapar** en la lista de pedidos, clientes, productos, tablas de Registros y autocompletados: un «<» rompía la pantalla y un usuario podía inyectar código que corre en la sesión del administrador. | ARREGLADO |

Verificado con `canario.js`: contra la versión anterior marca 31 pantallas y 5 campos cortados; contra
la corregida, cero.

## Qué se probó al final (todo en local, rama `barrido-oct`)

`t2 t4 t7 t9 t9b` 74/74 · `func` 22/22 (antes 9/22) · `nav` 41/41 · `tsrv` 36/36 · `canario` limpio ·
contraste real 0 bajo 4,5:1 con colores de fábrica (día y noche), índigo de producción y móvil.

## Lo que queda para que decida el usuario

- **S1 (ver costos)** — mover el cálculo de costos automáticos al servidor para que el permiso sea real.
- **S8 (CORS abierto)** — cerrarlo si nada externo llama a la API.
- **S10 (PIN de 4 dígitos)** — la contraseña del usuario `admin` de GRAFÍA sigue siendo el mismo PIN. Ya se
  puede usar un PIN de hasta 12 dígitos (variable `APP_PIN` en Railway; actualizar `RESPALDOS-BD/pin.txt`).
  Los negocios de prueba `prueba-1…5` siguen abiertos en producción con PIN triviales.
- **N19** — textos de «Quiénes somos», «Términos» y «Privacidad».
- **N20** — estado «despavho» en producción.
