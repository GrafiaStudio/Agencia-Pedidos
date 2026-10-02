# Herramientas de verificación visual (CORAL LINE)

No hay framework de pruebas en este proyecto; esto es lo que verifica la interfaz de verdad.
Requieren la app corriendo en **`http://127.0.0.1:3000`** — ojo: en esta máquina `localhost:3000`
lo ocupa otro programa. Usan el Playwright que ya trae `../../.pw-mcp` (ruta fija en `pw.js`).
Las capturas van a `cap/` (o a `CAP_DIR` si se define). `cap/` no se sube al repositorio.

| Archivo | Para qué |
|---|---|
| `pw.js` | Arnés: abre la app con sesión (PIN 1234 o usuario/clave), modo día/noche y tamaño de ventana. **Nunca cae al token de admin**: si no hay token, falla. |
| `legible.js` + `legible.py` | Mide el **contraste real** de cada texto e icono contra el píxel de fondo de la captura, en ~35 pantallas (vistas, pestañas, editores, ventanas). `node legible.js noche [ancho alto]` → `python legible.py noche 3.0 -v`. Meta: `ILEGIBLES 0` y `por debajo de 4,5: 0`. |
| `t9.js` | Recorrido funcional por la interfaz: crear pedido con 2 ítems, editar, abono, PDF, mover en Producción, asistente, colores y fábrica, archivar, rol limitado. **Crea datos `ZZ …`: barrerlos al terminar.** |
| `t9b.js` | Tablet (768) y móvil (390), día y noche: sin scroll horizontal, sin errores, barra móvil. |
| `../muestras/medir_contraste.py` | Versión simple: mide puntos sueltos sobre una captura. |
