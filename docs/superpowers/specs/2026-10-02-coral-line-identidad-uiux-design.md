# CORAL LINE — identidad propia y rediseño UI/UX — Diseño

**Fecha:** 2026-10-02 · La app deja de ser "la app sin nombre" y pasa a llamarse **CORAL LINE**.
**Fuentes que mandan:** `marca y referencias/REAL diseño-dashboard-UI-UX.jpg` (+ `.svg`) y
`marca y referencias/CORAL-line.jpg` (+ `CORAL line.svg`), hechos por el usuario.
El mini manual en PDF lo hizo una IA: sirve su discurso, **no** su parte gráfica.

## 1. Objetivo

Darle a la app una identidad visual propia y reconocible, partiendo del Dashboard que diseñó el
usuario y extendiendo ese mismo lenguaje, pantalla por pantalla, al resto de la app.

**Cómo debe sentirse** (palabras del usuario): minimalista, con toque de vidrio, moderna, limpia,
estética, y **distinta de los dashboards convencionales**.

**Qué la hace distinta** — estos seis rasgos son el criterio para revisar cada pantalla:
1. **Números gigantes en trazo finísimo** (Montserrat Thin). Es la firma visual.
2. **Fondo de tono medio con atmósfera**, no una página blanca con tarjetas grises.
3. **Dock inferior** en vez de menú lateral: el contenido ocupa todo el ancho.
4. **Vidrio pintado**: tarjetas claras y translúcidas con borde fino, sin sombras duras.
5. **El acento cálido aparece poco**: rosa/naranja/violeta solo en datos y avisos.
6. **Anillos**: el progreso se dibuja con arcos concéntricos, eco del isotipo.

## 2. Decisiones tomadas con el usuario (2026-10-02)

| Tema | Decisión |
|---|---|
| Paleta oficial | **La del manual de marca de CORAL LINE** (`#E9FFFE` · `#92F3F1` · `#23D0D2` · `#118AA0` · `#0A2E3B`). Los tonos más suaves que se ven en el diseño son esos mismos colores vistos a través de degradados y transparencias. |
| Colores extra (rosa, naranja, violeta) | Son **detalles aislados** para dar contraste. No son colores de superficie. |
| Fotos de coral | Son **de ejemplo**. El banner es **del negocio**: quien carga su logo puede cargar también un banner propio. |
| Selector de período | Vive **dentro de la gráfica** (el desplegable "Año"). |
| Archivo, Ayuda, Cerrar sesión | Pasan a vivir **dentro de Perfil**. |
| Filtros rápidos del menú | **Se eliminan** del menú. El Dashboard los muestra y en Pedidos se filtra. |
| Método | El Dashboard es la base; el resto se construye a partir de él. Lo que se pueda mejorar, se mejora. |
| Escala y adaptación a pantallas | Libertad para mejorarlas. |
| Intensidad del color | **Ajuste del negocio**, junto a sus dos colores: un deslizante que gradúa cuánta presencia tiene el color en el fondo. Nació como control de la hoja de muestra y el usuario pidió conservarlo. Por defecto 60. |

Decisiones que tomo yo y quedan aquí escritas para que el usuario las corrija si no le sirven:
- **Coral Line es el tema de fábrica**, no un color fijo. Los dos colores por negocio siguen
  siendo configurables (regla dura del sistema de color: nunca fijar tinta sobre superficie de marca).
- **Modo noche = Deep Teal muy oscuro y poco saturado**, cumpliendo el criterio de julio (poco
  brillo, sin contraste duro, sin perder los destacados).
- **La burbuja central del dock es siempre Dashboard** (es "inicio"). La vista activa se marca
  con icono y texto encendidos, no moviendo la burbuja.
- **Sin emojis en la interfaz** (saludo, avisos): la voz de la marca es serena; se usan iconos.

## 3. Sistema visual

### 3.1 Color

Primitivos de marca (tema de fábrica):

| Token | Hex | Papel |
|---|---|---|
| `--cl-hielo` | `#E9FFFE` | luz, fondos más claros, tinta sobre oscuro |
| `--cl-bruma` | `#92F3F1` | bordes de vidrio, brillos |
| `--cl-cian` | `#23D0D2` | acción, foco, barras de datos |
| `--cl-oceano` | `#118AA0` | estructura, tarjeta protagonista, enlaces |
| `--cl-profundo` | `#0A2E3B` | tinta principal, dock |
| `--cl-coral` `--cl-ambar` `--cl-violeta` | `#FD518B` `#FDA968` `#5F309B` | **solo** líneas de gráfica, anillo de margen y contadores |

Estados (verde listo, ámbar atención, rojo urgente/vencido) se conservan, reafinados para leerse
sobre vidrio. El rojo de los contadores es `#E20613`.

**Cómo se conecta con los colores configurables.** Hoy el negocio elige `color_primario` y
`color_acento`. Eso se mantiene:
- Fábrica nueva: `primario = #0A2E3B`, `acento = #118AA0`.
- Con los colores de fábrica se usan los cinco primitivos exactos. Si el negocio los cambia, hielo,
  bruma y cian **se derivan** del acento por mezcla (`mezcla()` ya existe), y la tinta sobre cada
  superficie la sigue calculando `tintaSobre()`.
- **Migración:** todo workspace cuyo color guardado esté vacío o sea el de la fábrica vieja
  (`#222B46` / `#5B7FA6`) pasa a la fábrica nueva. Quien haya elegido colores propios los conserva.
- Los nombres de token actuales (`--navy`, `--white`, `--teal`, `--brand`…) **se conservan como
  alias** de los nuevos. No se renombra en masa: es la forma de no romper 9.000 líneas.

**Regla de contraste** (corrige cuatro puntos del diseño que hoy no llegan al mínimo legible):
todo texto ≥ 4,5:1. Sobre cian y bruma la tinta es Deep Teal (7,4:1), nunca blanco (1,9:1).
Blanco solo sobre océano oscurecido o Deep Teal. El texto de ejemplo de los campos también cumple.

### 3.2 Fondo ("atmósfera")

Fondo fijo a pantalla completa, hecho solo con degradados de CSS (sin imagen, pesa cero):
de hielo arriba-izquierda a océano abajo-derecha, con dos o tres franjas diagonales de luz muy
tenues y un velo lila apenas perceptible arriba al centro, como en el diseño. Se deriva del
acento, así un negocio con otros colores obtiene su propia atmósfera.

### 3.3 Vidrio — tres niveles

| Nivel | Dónde | Receta |
|---|---|---|
| **Vidrio 1** | tarjetas de contenido | relleno blanco translúcido en degradado, borde de 1 px claro + filo bruma, radio 24, sombra casi imperceptible. **Sin desenfoque real**: detrás solo hay degradado, el desenfoque no aporta y cuesta rendimiento. |
| **Vidrio 2** | lo que flota sobre contenido: dock, Coralyne, desplegables, ventanas | desenfoque real (`backdrop-filter`) + el mismo borde |
| **Vidrio fuerte** | protagonistas: indicador principal, banner, botón primario | relleno océano→cian con brillo superior |

Si el navegador no soporta desenfoque o el sistema pide menos transparencia, las superficies se
vuelven opacas. Nunca texto ilegible por una transparencia.

### 3.4 Tipografía

- **Montserrat** de 100 a 700, más itálicas 300/400/500 (hoy faltan la 100 y las itálicas).
- **Ostrich Sans Heavy**, servida desde la propia app (`public/fonts/`): solo "LINE" y los contadores.
- Ancho de referencia **1920 px** (el lienzo de 2561 se traduce a esa escala):

| Uso | Tamaño / peso |
|---|---|
| Número de indicador | 96 / Thin 100 |
| Cifra destacada (margen, hora) | 44 / Thin–Light |
| Saludo | 28 / Bold, mayúsculas |
| Título de tarjeta | 13 / Medium, mayúsculas, tracking amplio |
| Nombre de cliente en listas | 14 / SemiBold |
| Texto de interfaz | 13 / Regular |
| Dato secundario | 11–12 / Regular o itálica Light |

- **Mínimo absoluto: 11 px.** La itálica solo para datos secundarios y nunca por debajo de 11.
- **La negrita es la excepción.** Hoy hay 223 usos de peso 700/800 y 5 de light; se invierte.
- Los tamaños grandes usan `clamp()` para crecer y encoger con la ventana sin saltos.

### 3.5 Forma, iconos y movimiento

- Radios: tarjeta 24 · elemento interior 12–16 · píldoras y botones 999 · esquinas del dock 40.
- **Iconos:** Tabler se mantiene en toda la app (113 en uso). El dock y los cinco indicadores usan
  los iconos **dibujados por el usuario**, extraídos de su SVG como símbolos en línea.
- **Movimiento calmado:** aparecer con desvanecido y subida corta (200–450 ms), los anillos se
  llenan al cargar, nada rebota. Se respeta "reducir movimiento" del sistema.

## 4. Armazón de la app

### 4.1 Barra superior
Transparente sobre la atmósfera (desaparece la franja blanca). Izquierda: título de la vista; en
Dashboard, el saludo con el nombre y una línea que resume el día con datos reales. Derecha:
buscador en píldora de vidrio · modo día/noche · exportar · campana con contador · Coralyne
(botón cian destacado) · **Nuevo pedido**.

### 4.2 Dock inferior (escritorio)
Barra fija abajo, vidrio 2 sobre Deep Teal, con las esquinas superiores redondeadas. Once destinos,
en este orden: Productos · Pedidos · Clientes · Registros · Costos · **Dashboard** (burbuja
central) · Inventario · Producción · Bitácora · Perfil · Ajustes.
- Respeta permisos (`data-perm`): lo que el rol no ve, no aparece, y el dock se recentra. Si el
  rol no ve Dashboard, el dock no lleva burbuja.
- Pedidos conserva su contador de activos como globo pequeño sobre el icono.
- Desaparece el menú lateral: `.main` y las ventanas a pantalla completa (`#ovP`, `#ovProd`)
  ganan los 220 px.

### 4.3 Perfil como centro personal
El destino Perfil abre una hoja con: mis datos · cambiar contraseña · **Archivo** · **Ayuda** ·
**Cerrar sesión**. Ajustes es la Configuración actual (solo con permiso `configurar_sistema`).

### 4.4 Filtros rápidos
Salen del menú. Los indicadores del Dashboard pasan a ser la entrada: tocar "Urgentes" abre
Pedidos ya filtrado por urgentes; "Cotización activa", por cotizaciones (`filtroRapido()` existe).

### 4.5 Coralyne (el asistente)
El asistente pasa a llamarse **Coralyne** en toda la interfaz.
- En Dashboard, con ventana de 1500 px o más: **panel fijo a la derecha**, como en el diseño.
- En el resto de vistas y en ventanas más angostas: panel flotante de vidrio que se abre con su
  botón. Es el comportamiento actual, con la piel nueva.
- La lógica del asistente no se toca: mismo historial, mismas propuestas con confirmación.

### 4.6 Móvil
Barra inferior de cinco: Pedidos · Nuevo · **Dashboard** (burbuja) · Clientes · Todo.
"Todo", o deslizar la barra hacia arriba, despliega una **hoja inferior** con los once destinos en
cuadrícula —icono, nombre y una descripción de una línea— y arriba una fila con campana, modo
noche, exportar y Coralyne. Sustituye a la ventana "Más". Es la idea que el usuario pidió en julio.

## 5. Dashboard

### 5.1 Piezas

| Pieza | Contenido | Dato |
|---|---|---|
| **5 indicadores** | Pedidos activos (protagonista) · Urgentes · Entregas hoy · Cotización activa · Ítems en proceso. Cada uno navega a su destino filtrado. | existe |
| **Banner del negocio** | Imagen de banner + logo + una frase. Sin banner cargado: banner Coral Line abstracto (degradado + arcos del isotipo). | **nuevo:** `banner_ruta`, `banner_texto` |
| **Reporte de registro** | Barras = ingresos · línea = costos · línea = utilidad. Desplegable dentro de la tarjeta: **Hoy · 7 días · Mes · Año** (por defecto, Año). 7 días y Mes van por día; Año, por mes. En "Hoy" la gráfica muestra los últimos 7 días con hoy resaltado. Con leyenda pequeña. | **nuevo:** serie por período |
| **Pedidos recientes** | Ref · cliente · total y abonado · etiquetas de categoría · anillo de avance. | existe; se añaden avance y categorías |
| **Margen** | Anillo con el acento cálido + ingresos, costos, utilidad. **Sigue el período de la gráfica.** | existe |
| **Recordatorios** | Campana, contador y los dos próximos. | existe (`/eventos/pendientes`) |
| **Bitácora** | La última nota: título, imagen si tiene, extracto. | existe |
| **Etapas de producción** | Las etapas **reales configuradas por el negocio**, con barra, cantidad y porcentaje. | existe |
| **Calendario y reloj** | Mes en español; los días con entregas llevan un punto; tocar un día abre el calendario de Producción en esa fecha. Hora y fecha del negocio. | **nuevo:** entregas del mes |
| **Actividad reciente** | Últimos movimientos. | existe |
| **Coralyne** | Panel fijo. | existe |

El calendario absorbe la antigua lista "Entregas próximas". Ingresos, costos, utilidad y la gráfica
solo se muestran con permiso `ver_utilidad` o administrador, como hoy.

### 5.2 Cambios en el servidor (todos aditivos)
- `GET /api/dashboard`: acepta `periodo=anio`; devuelve `serie` (`etiqueta, ingresos, costos,
  utilidad` por día o por mes según el período); añade `avance` y `categorias` a `recientes`;
  añade `entregasMes` (fecha → cantidad). `serie7` se mantiene hasta que el frontend deje de usarlo.
- `configuracion_negocio`: columnas `banner_ruta`, `banner_texto` (migración con `ALTER TABLE`
  protegido). `POST /api/configuracion/banner`, gemelo del de logo, guardando bajo `/app/db/uploads`.
- El banner se reduce **en el navegador antes de subir** (lienzo → WebP, 1600 px de ancho,
  ~200 KB): el servidor no tiene librería de imágenes y no hace falta añadirla.

### 5.3 Adaptación a pantallas

| Ancho de ventana | Disposición |
|---|---|
| ≥ 1600 | La del diseño: columna de indicadores · zona central · Coralyne fija. En 1920×950 cabe **sin scroll**. |
| 1100 – 1599 | Los indicadores pasan a una fila de cinco arriba; zona central en tres columnas; Coralyne flotante. |
| 768 – 1099 | Dos columnas. |
| < 768 | Una columna. Orden: indicadores (dos por fila, el principal a todo el ancho) → recientes → recordatorios → margen → etapas → calendario → bitácora → actividad. |

## 6. Entregas

Cada entrega tiene su propio plan de implementación y termina con la app entera funcionando.

1. **Piel** — tokens, tipografía, atmósfera, vidrio, migración de colores de fábrica, logo y
   nombre Coral Line en ingreso y pestaña. Toda la app cambia de piel sin mover nada de sitio.
   Primer paso: una **hoja de muestra** (paleta, vidrio, tipografía, botones) que el usuario revisa
   en el navegador antes de aplicar nada al resto.
2. **Armazón** — barra superior, dock, Perfil como centro, Coralyne, móvil con hoja inferior.
3. **Dashboard** — tal como se diseñó, con los datos nuevos y el banner del negocio.
4. **Pantalla por pantalla** — con maqueta previa de las tres más difíciles (lista de pedidos,
   editor de pedido, Producción). Cada una con su propia especificación.
5. **Modo noche** — paleta Deep Teal y barrido de todas las pantallas buscando texto de color fijo
   (cierra el bug de textos ilegibles, que sigue vivo a propósito hasta aquí).
6. **Ingreso, documento PDF e icono de la app.**

Este documento especifica el sistema (secciones 3–5) y cubre en detalle las entregas 1 a 3.
Las entregas 4 a 6 solo quedan enunciadas.

**Hasta la entrega 5 el modo noche sigue funcionando pero sin pulir.**

## 7. Cómo se trabaja y se verifica

- Rama **`coral-line`**. Producción (`main`) no cambia hasta que una entrega esté aprobada; así
  nadie ve la app a medio vestir. Se fusiona y se empuja entrega por entrega.
- Se sigue trabajando sobre `public/index.html` y `server.js`. No se crean archivos paralelos de
  la app. Lo único nuevo son fuentes e iconos en `public/`.
- Verificación de cada entrega, porque no hay framework de pruebas:
  - `node -c server.js`.
  - Capturas con Playwright a 1920, 1366, 768 y 390 px, en día y en noche.
  - Medición de contraste de los textos nuevos.
  - Recorrido de regresión: entrar, crear pedido, editarlo, registrar abono, generar el PDF,
    mover un ítem en Producción, preguntar a Coralyne.
  - Probar con un rol limitado **con su propio token** (el arnés cae al de administrador si el
    del usuario viene vacío).
- El usuario revisa en `http://localhost:3000` (PIN local 1234) y con las capturas.

## 8. Fuera de alcance

- Cambiar la lógica de negocio, permisos, cálculo de valores o el asistente.
- Rediseñar una por una las otras doce pantallas (entrega 4).
- El documento PDF y el ingreso (entrega 6).
- Añadir librerías de gráficos o de interfaz: las gráficas siguen en SVG propio.

## 9. Lo que hace falta del usuario

- Revisar la hoja de muestra: ahí se ve por primera vez la paleta del manual en pantalla, que es
  más viva que los tonos de su archivo de Illustrator. Es el momento de ajustar la intensidad del
  vidrio y de los degradados si hace falta.
- El archivo de la fuente **Ostrich Sans Heavy** (o su visto bueno para descargarla; es de
  licencia abierta).
- Si la extracción de los 16 iconos desde su SVG no queda limpia, exportarlos sueltos.
