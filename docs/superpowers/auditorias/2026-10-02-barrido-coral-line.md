# Barrido de fallos — Coral Line (2026-10-02)

Registro vivo del barrido pedido por el usuario tras publicar Coral Line: *"un súper barrido en busca
de fallos, errores, ya sea de diseño, de funcionamiento o demás"*. Cada hallazgo lleva su estado.

Estados: `ABIERTO` · `ARREGLADO` (con commit) · `DECISIÓN` (lo decide el usuario) · `DESCARTADO`.

## Ciclo 1 — estático y servidor

| # | Gravedad | Hallazgo | Estado |
|---|---|---|---|
| S1 | Alta | **Permisos que solo existen en la pantalla.** `registrar_pagos` no se exige en ninguna ruta; `GET /api/pedidos` entrega los `costos` a quien no tiene `ver_costos`; `PUT /api/pedidos/:id` deja cambiar pagos y costos con solo `editar_pedidos`. | ABIERTO |
| S2 | Alta | `POST /api/archivar` y `/api/restaurar` no piden permiso: cualquier usuario del negocio archiva pedidos, clientes o productos. | ABIERTO |
| S3 | Alta | El límite de intentos del ingreso usa la cabecera `x-forwarded-for` completa como llave: falseándola se salta el bloqueo y se pueden probar los 10.000 PIN. | ABIERTO |
| S4 | Media | Las subidas aceptan cualquier tipo de archivo y se sirven desde el mismo dominio: un `.html`/`.svg` con código se ejecutaría con la sesión de quien lo abra. | ABIERTO |
| S5 | Media | La app pesa 700 KB y se sirve **sin comprimir** (comprimida ≈ 130 KB). | ABIERTO |
| S6 | Media | Cualquier dirección inexistente devuelve la app entera con código 200: `/robots.txt`, `/.env`, una imagen que falta (700 KB por cada imagen rota). | ABIERTO |
| S7 | Media | App privada sin `noindex`: un buscador puede indexar la pantalla de ingreso. Faltan `description`, `theme-color`, icono para pantalla de inicio. | ABIERTO |
| S8 | Baja | CORS abierto a cualquier origen (`cors()` sin opciones). Riesgo bajo: la sesión va en cabecera, no en cookie. | DECISIÓN |
| S9 | Baja | Sin cabecera HSTS. | ABIERTO |
| S10 | Baja | PIN de 4 dígitos como llave de administrador; negocios de prueba con PIN triviales en producción. | DECISIÓN |
| S11 | Baja | 25 botones solo-icono sin nombre accesible; 1 imagen sin `alt`. | ABIERTO |
| S12 | Baja | 19 `confirm()` y 3 `prompt()` del navegador: rompen la identidad de vidrio. | ABIERTO |
| S13 | Baja | Código muerto del Dashboard anterior (`dashChartIngresos`, `dashChartProduccion`). | ABIERTO |
| S14 | Baja | El CSV exportado todavía se llama `pedidos_grafia_*.csv`. | ABIERTO |

Comprobado y **bien**: no hay funciones llamadas que no existan, ni variables de color sin definir,
ni texto por debajo de 11 px; el SQL solo interpola nombres de listas fijas; producción firma las
sesiones con un secreto propio (no el de desarrollo); `.env`, `server.js` y la base no se filtran.

## Ciclo 2 — navegador (40 pantallas × 5 tamaños, día y noche)

Sin errores de consola ni respuestas de error del servidor en ningún tamaño. Nada se desborda de la
pantalla. Hallazgos:

| # | Gravedad | Hallazgo | Estado |
|---|---|---|---|
| N1 | Alta | **Botón «atrás» del teléfono saca de la app** (no hay historial): no cierra la ventana abierta ni vuelve a la vista anterior. | ABIERTO |
| N2 | Alta | **Cerrar el editor de pedido o de producto pierde lo escrito sin avisar.** | ABIERTO |
| N3 | Media | La tecla Escape no cierra ninguna ventana (solo el buscador); clic fuera tampoco cierra las ventanas simples. | ABIERTO |
| N4 | Media | Recargar la página siempre vuelve al Dashboard: no recuerda dónde estabas. | ABIERTO |
| N5 | Media | Móvil · Productos: la lupa del buscador queda encima del selector de categorías. | ABIERTO |
| N6 | Media | Móvil · editor de producto: 4 campos en una fila; el nombre del producto queda de una letra. | ABIERTO |
| N7 | Media | Móvil · Inventario: tabla apretada, los campos se cortan («unidac», «Opc»). | ABIERTO |
| N8 | Media | Móvil · barra superior: el buscador se encoge hasta «Bu» cuando el título es largo. | ABIERTO |
| N9 | Media | Móvil · blancos táctiles pequeños: borrar ítem 17×20, borrar encargo 14×18, casillas 13×13, favorita 15×15; pestañas de 26–28 px. | ABIERTO |
| N10 | Media | **Manual de ayuda desactualizado**: habla del menú lateral, de «Pendiente de pago», de tipos de precio viejos; no menciona Dashboard, Producción, Bitácora, Coralyne ni Centro de Costos. | ABIERTO |
| N11 | Baja | Reporte del Dashboard sin datos: el eje muestra «0 0 1 1 1». | ABIERTO |
| N12 | Baja | Reporte del Dashboard: la curva suavizada baja de cero entre meses sin movimiento. | ABIERTO |
| N13 | Baja | Producción · tablero: doble desplazamiento (la página y cada columna). | ABIERTO |
| N14 | Baja | Móvil · Registros: la nota «Ventas = …» parte el enlace «Ingresos» a otra columna. | ABIERTO |
| N15 | Baja | Título «Ayuda y About» (mezcla de idiomas). | ABIERTO |
| N16 | Baja | Ingreso: campos de usuario y contraseña en tipografía monoespaciada, sin `<form>` ni etiquetas. | ABIERTO |
| N17 | Baja | Exportar: el selector de formato corta su texto. | ABIERTO |
| N18 | Info | Centro de Costos: las filas «— → $2.000 —» no explican qué es cada cifra (Entrega 4). | PENDIENTE E4 |
| N19 | Info | Ayuda → «Quiénes somos», «Términos» y «Privacidad» muestran «Pendiente: texto que proveerá el negocio». | DECISIÓN |
| N20 | Info | Producción real: hay un estado llamado «despavho» (¿«despacho»?). Es dato del negocio. | DECISIÓN |

Datos: el respaldo de producción pasa la comprobación de integridad, sin registros huérfanos ni
restos de pruebas. En local quedaban 2 códigos de venta «ZZ» de pruebas (solo local).
