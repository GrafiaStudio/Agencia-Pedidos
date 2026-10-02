# CORAL LINE · Entregas 2 y 3 — Armazón y Dashboard · Plan

**Goal:** que la app tenga la ESTRUCTURA del diseño del usuario (`marca y referencias/REAL diseño-dashboard-UI-UX.jpg`), no solo su piel: dock inferior en vez de menú lateral, barra superior nueva, Coralyne fija en el Dashboard y el Dashboard tal como se diseñó.

**Pedido del usuario (2026-10-02):** *"va bien pero aún estamos lejos de lo que se planteó en mi diseño… veo es un revestimiento a la estructura que se tenía… la idea es llevarlo a lo que se diseñó. Quiero que trabajes en loop hasta llegar a ese resultado."*

**Método:** ciclos de construir → capturar a 1920×950 → comparar lado a lado con el diseño → corregir. Cada ciclo deja la app funcionando.

**Spec:** `docs/superpowers/specs/2026-10-02-coral-line-identidad-uiux-design.md` §4 (armazón) y §5 (Dashboard).

## Restricciones (de la spec y de la Entrega 1)
- Mismas reglas de color de la Entrega 1: tintas calculadas, `--boton`/`--sel` para acciones, lo que flota es opaco, colores de estado como texto en `--*-tinta`.
- Contraste ≥ 4,5:1 medido con `docs/superpowers/herramientas/legible.*` en día y noche.
- Permisos: lo que el rol no ve no aparece (`data-perm`). Si no ve el Dashboard, entra a Pedidos.
- Lógica de negocio intacta. Cambios de servidor solo aditivos.

## Tareas

### A · Servidor (aditivo)
1. `GET /api/dashboard`: acepta `periodo=anio`; devuelve `serie` = `[{etq, d, ingresos, costos, utilidad}]` (hoy y 7 días → 7 días; mes → días del mes; año → 12 meses del año en curso). `recientes` incluye `encargos[{categorias, items[{estado,categoria}]}]` para calcular avance y etiquetas en el cliente.
2. `GET /api/dashboard/entregas?mes=AAAA-MM` → `{ 'AAAA-MM-DD': n }` de pedidos activos.
3. `configuracion_negocio.banner_ruta`, `banner_texto` (migración protegida) + `POST /api/configuracion/banner` (gemelo del logo) + `banner_texto` en el `PUT`.

### B · Armazón
1. **Dock** fijo abajo (11 destinos del diseño, Dashboard en burbuja central, iconos `#ci-*`), con `data-view`/`data-perm`. El menú lateral se oculta en escritorio (queda en el DOM por compatibilidad). `.main`, `#ovP`, `#ovProd` ocupan todo el ancho.
2. **Barra superior**: transparente; izquierda título (en Dashboard: saludo + resumen del día); derecha buscador en píldora, teclas cuadradas (noche, exportar, campana con contador Ostrich), tecla Coralyne cian, **Nuevo pedido**.
3. **Perfil = centro personal**: mis datos, contraseña, Archivo, Ayuda, Exportar, Cerrar sesión. Ajustes = Configuración.
4. **Inicio**: quien puede ver el Dashboard entra al Dashboard.
5. **Móvil**: barra de 5 (Pedidos · Nuevo · Dashboard en burbuja · Clientes · Todo) + hoja inferior con todos los destinos (icono + nombre + descripción).

### C · Coralyne
1. El asistente pasa a llamarse **Coralyne** en la interfaz.
2. En el Dashboard con ventana ≥ 1600 px el panel vive **fijo a la derecha** (el mismo nodo, reubicado); en el resto, flotante.
3. Piel del diseño: título «CORALYNE», burbujas de vidrio, estrella grande de fondo cuando está vacío, campo en píldora blanca abajo.

### D · Dashboard (≥ 1600 px, sin scroll en 1920×950)
Rejilla: `[indicadores 270] [4 columnas] [Coralyne 370]` × `[banner 130] [fila 1fr] [fila 1fr]`.
1. 5 indicadores apilados (número Thin + icono propio + etiqueta); el primero en vidrio fuerte. Tocar → Pedidos filtrado.
2. Banner del negocio (imagen subida o abstracto Coral Line con arcos del isotipo) + frase + imagotipo.
3. Reporte de registro: barras ingresos + líneas costos/utilidad, desplegable Hoy/7 días/Mes/Año (Año por defecto), leyenda.
4. Pedidos recientes (3): ref, nombre, total y abono, etiquetas pastel, anillo de avance.
5. Margen: anillo punteado con el degradado cálido + ingresos/costos/utilidad del período de la gráfica.
6. Recordatorios: campana + contador Ostrich rojo + 2 próximos.
7. Bitácora: última nota (título, imagen si tiene, extracto).
8. Etapas de producción: etapas reales, barra y porcentaje.
9. Calendario (mes navegable, puntos en días con entregas) + reloj y fecha.
10. Actividad reciente.
11. Adaptación: 1100–1599 indicadores en fila y Coralyne flotante; 768–1099 dos columnas; < 768 una.

### E · Ciclo de comparación y cierre
1. Captura 1920×950 junto al diseño; anotar diferencias; corregir; repetir.
2. 1366, 768, 390 · día y noche · contraste medido · recorrido funcional (`t9.js`) · rol limitado.
3. MAPA-CODIGO.md.
