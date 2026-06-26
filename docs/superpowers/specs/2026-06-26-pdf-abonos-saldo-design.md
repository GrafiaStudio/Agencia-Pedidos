# PDF: Abonos y Saldo del Cliente — Diseño

**Fecha**: 2026-06-26
**Origen**: feedback del usuario probando el PDF ya desplegado (Fase 3) — "me encantó el
PDF que se pueda imprimir... pero en este deben mostrarse los abonos y saldo del
cliente". Primera de 4 mejoras independientes surgidas de la misma sesión de feedback
(orden acordado: PDF → Producto Simple → Costos automáticos → Combo/Promoción).

## Contexto

`generarPdfPedido()` ya muestra: datos del negocio, tipo de documento (Cotización/Orden
de Pedido/Comprobante de Venta), datos del cliente, tabla de ítems por encargo,
Subtotal/IVA/Total (si aplica) y métodos de pago aceptados. No muestra los abonos
(`p.pagos`) ya registrados ni el saldo pendiente — dato que el modal del pedido ya
calcula y muestra en pantalla ("Pagos y abonos"), pero que nunca llegó al documento
impreso/enviado por WhatsApp.

## Alcance

Después del bloque de Total (y antes de "Métodos de pago aceptados"), si el pedido tiene
al menos un abono registrado, se agrega:
- Una tabla chica (mismo estilo `autoTable` ya usado para los ítems): Fecha, Forma de
  pago, Monto — una fila por abono, en el mismo orden que ya se muestran en el modal.
- Debajo: "Pagado: $X" (suma de abonos) y "Saldo pendiente: $Y" (Total − Pagado, nunca
  negativo).

Si el pedido no tiene ningún abono, no aparece nada de esto — ni la tabla vacía ni las
líneas de Pagado/Saldo.

## Explícitamente fuera de esto
- No cambia qué tipo de documento se genera (Cotización/Orden/Comprobante) ni cuándo.
- No agrega abonos nuevos ni permite registrar pagos desde el PDF — es solo lectura de lo
  que ya existe.
- Sin cambios de diseño/presentación general del PDF (el usuario ya avisó que eso se
  mejora después, en otra ronda).

## Frontend (`public/index.html`)
- `generarPdfPedido()`: después de pintar el Total, si `(p.pagos||[]).length`, agrega una
  `doc.autoTable` con cabecera `['Fecha','Forma de pago','Monto']` y body mapeado desde
  `p.pagos` (reutiliza `fd`, `fCOP`, `METODOS_PAGO_CATALOGO` ya existentes), luego dos
  líneas de texto con Pagado y Saldo pendiente, antes de continuar con métodos de pago.
