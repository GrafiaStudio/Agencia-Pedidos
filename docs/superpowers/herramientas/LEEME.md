# Herramientas de verificación visual (CORAL LINE)

No hay framework de pruebas en este proyecto; esto es lo que verifica la interfaz de verdad.
Requieren la app corriendo en **`http://127.0.0.1:3000`** — ojo: en esta máquina `localhost:3000`
lo ocupa otro programa. Usan el Playwright que ya trae `../../.pw-mcp` (ruta fija en `pw.js`).
Las capturas van a `cap/` (o a `CAP_DIR` si se define). `cap/` no se sube al repositorio.

| Archivo | Para qué |
|---|---|
| `pw.js` | Arnés: abre la app con sesión (PIN 1234 o usuario/clave), modo día/noche y tamaño de ventana. **Nunca cae al token de admin**: si no hay token, falla. |
| `legible.js` + `legible.py` | Mide el **contraste real** de cada texto e icono contra el fondo que lo rodea en la captura (a los lados de las letras, evitando iconos o negritas vecinas), en ~35 pantallas (vistas, pestañas, editores, ventanas). `node legible.js noche [ancho alto]` → `python legible.py noche 3.0 -v`. Meta: `ILEGIBLES 0` y `por debajo de 4,5: 0`. |
| `t9.js` | Recorrido funcional por la interfaz: crear pedido con 2 ítems, editar, abono, PDF, mover en Producción, asistente, colores y fábrica, archivar, rol limitado. **Crea datos `ZZ …`: barrerlos al terminar.** |
| `ciclo.js` + `compara.py` | Ciclo de diseño: `node ciclo.js c1 1920 950` captura el Dashboard y `python compara.py c1` lo pone debajo del diseño del usuario (`marca y referencias/REAL diseño-dashboard-UI-UX.jpg`). |
| `tban.js` | Banner propio: sube `fondo.png` por la interfaz, comprueba que llega como WebP reducido, lo ve en el Dashboard y lo quita. |
| `t9b.js` | Tablet (768) y móvil (390), día y noche: sin scroll horizontal, sin errores, barra móvil. |
| `../muestras/medir_contraste.py` | Versión simple: mide puntos sueltos sobre una captura. |

**Trampas conocidas de la medición:** un elemento tapado por la burbuja del dock puede salir como «ilegible» (comprobar con un recorte); y `compara.py` necesita Pillow.

**⚠️ Pruebas que GUARDAN configuración** (`t9.js`, `tban.js`, y `t3.js` si se recupera): cambian colores, intensidad o banner del negocio `main` y luego vuelven a fábrica. **No correrlas mientras el usuario esté probando la app local**: le borrarían lo que configuró. `legible.js` no guarda nada; con `FABRICA=1` mide con los colores de fábrica solo en la página de prueba.
