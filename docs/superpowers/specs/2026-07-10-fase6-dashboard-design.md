# Fase 6 — Dashboard ejecutivo — Diseño

**Fecha:** 2026-07-10 · Roadmap v3.0, pilar 8. **Referencia visual: guía 3** (dashboard "¡Buenos días!").
Solo lectura; visible con permiso `ver_dashboard` (admin siempre).

## Objetivo
Vista de un vistazo para el dueño/gerente: KPIs del negocio, resumen financiero del período,
pedidos recientes, entregas próximas y actividad reciente. Reutiliza los datos existentes
(no crea tablas).

## Backend — GET /api/dashboard?periodo=hoy|semana|mes  (`requiere('ver_dashboard')`)
Devuelve `{hoy, periodo, kpis, finanzas, recientes, entregas, produccion, actividad}`:
- **kpis**: activos, urgentes, entregasHoy (fecha_entrega=hoy), cotizaciones + cotValor (suma de
  valor_total de cotizaciones vivas).
- **finanzas** (rango `desde..hoy`; hoy / últimos 7 días / inicio de mes):
  - ingresos = SUM(pagos.monto_calc) por **fecha del pago** (pedidos vivos no cancelados).
  - costos = SUM(costos.monto_calc) por **fecha del pedido** (`p.fecha_pedido`) — ⚠ los registros de
    costos se reescriben en cada PUT (DELETE+INSERT), su `creado` no es confiable como fecha real.
  - utilidad = ingresos − costos; margen = %.
- **recientes**: últimos 5 pedidos (ref, nombre, flags, valor_total oficial vía pedidoCompleto,
  pagado, estados de encargos para derivar el pill).
- **entregas**: activos con fecha_entrega en los próximos 7 días (max 8).
- **produccion**: conteo de encargos por estado (pedidos activos no cerrados) — mismo universo que
  el tablero de Fase 4.
- **actividad**: últimos 8 registros de `historial` (JOIN pedidos para el ref) con usuario.
- Permiso nuevo `ver_dashboard` en PERMISOS_FASE1.

## Frontend
- Sidebar: **Dashboard** primero (`data-perm="ver_dashboard"`); guardia en VIEW_PERM.
- **Saludo** según hora (¡Buenos días/tardes/noches, {nombre}! 👋) + subtítulo, y píldoras de
  período Hoy / 7 días / Mes (recargan el endpoint).
- **Fila KPI** `.dash-kpi` (grid auto-fit): Pedidos activos (tarjeta navy, como guía 3), Urgentes,
  Entregas para hoy, Cotizaciones (+valor), En producción (+desglose; navega al tablero, oculta sin
  ver_produccion). Cada KPI navega a su módulo.
- **Franja financiera** `.dash-fin`: Ingresos / Costos / Utilidad / Margen% — solo con
  `ver_utilidad` o admin.
- **Grid 3 columnas** (`1.35fr 1fr 1fr`, colapsa a 1 en <1100px) con tarjetas `.ped-side-card`:
  - Pedidos recientes: ref · nombre · pill pago (Pagado/Abono/Sin pago) · estado con dot · total;
    click abre el pedido.
  - Entregas próximas: ref · nombre · etiqueta Hoy/Mañana/En Nd/Vencido con color.
  - Actividad reciente: ícono según el texto (pago/entrega/cierre/producción/versión...) + texto +
    usuario·fecha.
- Sin gráficas pesadas ni full-width: tarjetas y columnas (regla UI/UX del usuario).

## Verificación (2026-07-10, navegador + API)
Endpoint responde en los 3 períodos con rangos correctos (mes=2026-07-01). UI: saludo, 5 KPIs,
franja financiera cambia con el período ("Hoy" → "Este mes"), recientes con pills correctos
(#0017 Pagado·Cerrado), actividad con el trail completo de Producción (consumos/reversiones,
responsable, estados) con usuario y hora. Consola sin errores.
