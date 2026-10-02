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
| `limpia_zz.js` | Borra de la BD LOCAL los pedidos/clientes «ZZ …» y usuarios «zzpiel…» que dejan las pruebas. Correr tras `t9.js`. |
| `t9b.js` | Tablet (768) y móvil (390), día y noche: sin scroll horizontal, sin errores, barra móvil. |
| `../muestras/medir_contraste.py` | Versión simple: mide puntos sueltos sobre una captura. |

**Trampas conocidas de la medición:** un elemento tapado por la burbuja del dock puede salir como «ilegible» (comprobar con un recorte); y `compara.py` necesita Pillow.

**⚠️ Pruebas que GUARDAN configuración**: `t9.js` cambia colores e intensidad del negocio `main` pero **guarda lo que había y lo restaura al final**; `tban.js` sube y quita un banner (no restaura uno previo). **No correrlas mientras el usuario esté probando la app local**: le borrarían lo que configuró. `legible.js` no guarda nada; con `FABRICA=1` mide con los colores de fábrica solo en la página de prueba.

**Medir con otros colores sin guardarlos:** `FABRICA=1 node legible.js dia` (colores de fábrica) o
`COLORES="#211552,#211552" node legible.js noche` (principal,acento). Antes de publicar, medir al
menos con fábrica y con los colores que tenga guardados producción: un acento muy oscuro hace el
fondo profundo y es ahí donde aparecen los textos que no se leen.

**Después de publicar:** `node prodcheck.js` verifica PRODUCCIÓN en solo lectura (portada, fuente,
rutas nuevas, que pedidos y clientes sigan ahí, y abre el Dashboard en día, noche y móvil). Lee el
PIN de `RESPALDOS-BD/pin.txt` y no lo imprime. Mirar siempre sus capturas (`cap/prod-*.png`): los
datos reales muestran cosas que en local no salen (p. ej. el logo oscuro del negocio en modo noche).

## Barrido de fallos (2026-10-02) — herramientas nuevas

| Archivo | Qué hace |
|---|---|
| `barrido_estatico.py` | Lee `index.html` y `server.js` sin ejecutarlos: funciones llamadas que no existen, ids rotos o repetidos, variables CSS sin definir, emojis, textos < 11 px, botones sin nombre, metadatos. |
| `esc_scan.py` / `esc_scan2.py` | Buscan textos del usuario metidos sin escapar en atributos (`value="${…}"`) y en plantillas HTML. |
| `canario.js` | **La prueba que manda para el escapado.** Crea en LOCAL datos «ZZ» con una etiqueta marcada y comillas, recorre las pantallas y dice dónde llega viva; comprueba que los campos conservan el texto completo. Borra lo que crea. |
| `barrido_nav.js <ancho> <alto> [dia\|noche]` | 40 pantallas y ventanas: errores de consola, respuestas ≥400, desbordes, textos cortados, blancos táctiles chicos, imágenes rotas. Deja capturas `cap/bn-*.png`. |
| `contacto.py salida.png columnas ancho archivos…` | Hoja de contacto con varias capturas para revisarlas de un vistazo. |
| `func.js` | Flujos de uso: ingreso, Escape, clic fuera, períodos del Dashboard, foco de teclado, atrás, recargar, cambios sin guardar, exportar. |
| `nav.js` | La navegación a fondo (41 casos): atrás/adelante con ventanas, editores con cambios, hoja «Todo», Coralyne, recargar. |
| `tsrv.js` | El servidor: compresión, 304, 404 reales, robots, subidas en caja de arena, permisos de archivar y de pagos, límite de intentos. Crea y borra un rol y un usuario «ZZ». |
| `iconos.js` | Regenera los iconos de la app (`apple-touch-icon.png`, `icon-192/512`, maskable) desde `favicon.svg`. |

Orden recomendado antes de publicar: `chk_js.py` → `t2 t4 t7 t9 t9b` → `func nav tsrv canario` → `limpia_zz.js` →
`legible.js` (fábrica y colores de producción, día y noche) → publicar → `prodcheck.js`.

⚠️ `tsrv.js` hace 9 ingresos fallidos a propósito. El freno global salta a los 25 fallos en 15 minutos:
no correrlo tres veces seguidas o el ingreso local queda pausado 15 minutos (reiniciar el servidor lo limpia).
