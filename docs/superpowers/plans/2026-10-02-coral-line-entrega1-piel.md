# CORAL LINE · Entrega 1 — Piel · Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que toda la app cambie de piel a CORAL LINE (color, fondo, vidrio, tipografía y marca) sin mover nada de sitio ni tocar la lógica.

**Architecture:** La app ya calcula su tema en un solo sitio, `aplicarTemaColor()`, a partir de dos colores por negocio. Se reescribe esa función para que derive la piel nueva y se conservan los nombres de token actuales como alias, de modo que las ~1.400 líneas de CSS que ya usan `var(--navy)`, `var(--white)`, `var(--line)`… cambian solas. Lo que tiene color escrito a mano (246 apariciones) se reemplaza por familias con una tabla. La implementación de referencia, ya probada en navegador, es `aplicarPiel()` de la hoja de muestra.

**Tech Stack:** HTML/CSS/JS vanilla en `public/index.html` · Node + Express + better-sqlite3 en `server.js` · Montserrat (Google Fonts) · Ostrich Sans Heavy (propia, OFL) · Tabler Icons.

**Spec:** `docs/superpowers/specs/2026-10-02-coral-line-identidad-uiux-design.md` (secciones 3 y 6).

**Referencia viva:** `docs/superpowers/muestras/coral-line-piel.html` — abrirla en el navegador. Acepta `?modo=noche`, `?i=<intensidad>`, `?p=<hex>&a=<hex>`, `?menu=1`.

## Global Constraints

- Paleta oficial: `#E9FFFE` · `#92F3F1` · `#23D0D2` · `#118AA0` · `#0A2E3B`. Acentos solo en datos y avisos: `#FDA968` · `#FD518B` · `#5F309B`. Contadores: `#E20613` (día), `#FF5F6B` (noche).
- Fábrica nueva: `color_primario = #0A2E3B`, `color_acento = #118AA0`. Fábrica vieja: `#222B46` / `#5B7FA6`.
- Los colores por negocio siguen siendo configurables. **Nunca fijar un color de texto sobre una superficie de marca**: la tinta se calcula.
- Todo texto ≥ 4,5:1; texto grande e iconos ≥ 3:1. Sobre cian y bruma, tinta oscura.
- Tamaño mínimo de letra: **11 px**. La negrita es la excepción.
- Radios: tarjeta 24 · interior 12–16 · píldoras 999.
- Se trabaja sobre `public/index.html` y `server.js`. No se crean archivos paralelos de la app.
- No se renombran los tokens actuales: se conservan como alias.
- Cambios aditivos; nada de lógica de negocio, permisos ni asistente.
- Rama `coral-line`. No se empuja a `main` hasta que el usuario apruebe la entrega.
- Sin emojis en textos nuevos de interfaz.
- No hay framework de pruebas: se verifica con `node -c`, Playwright y medición de contraste.
- El PDF y el ingreso completo son de la Entrega 6; el modo noche pulido, de la 5. Aquí el modo noche debe quedar **funcionando**, no perfecto.

## Review Focus

1. **Negocio con colores propios claros** (p. ej. principal amarillo): el texto sobre botones, menú y tarjeta protagonista debe seguir leyéndose. → comprobación en Tarea 2, paso 6.
2. **Workspace con colores viejos guardados** (`#222B46`/`#5B7FA6` explícitos en la base): debe pasar a Coral Line, y quien eligió otros debe conservarlos. → comprobación en Tarea 3, paso 4.
3. **Ventanas y paneles que flotan sobre contenido** (campana, buscador global, asistente, modales): no pueden quedar translúcidos sin desenfoque, o el texto de abajo se mezcla. → comprobación en Tarea 4, paso 5.
4. **Tablas y filas densas al subir la letra a 11 px** (lista de pedidos, editor de pedido, cuadrícula de variantes): no deben desbordar ni solaparse. → comprobación en Tarea 6, paso 5.
5. **Modo noche en pantallas no rediseñadas**: ningún texto oscuro sobre fondo oscuro. → comprobación en Tarea 8, paso 3.

---

### Task 0: Hoja de muestra y activos de marca — HECHA (2026-10-02)

**Files:**
- Created: `docs/superpowers/muestras/coral-line-piel.html` (hoja de muestra autocontenida)
- Created: `docs/superpowers/muestras/coral-simbolos.svg` (27 símbolos: 22 iconos `ci-*` + 5 logos `cl-*`)
- Created: `docs/superpowers/muestras/medir_contraste.py`
- Created: `public/fonts/OstrichSans-Heavy.woff2` (12,6 KB, OFL, The League of Moveable Type)
- Created: `public/favicon.svg`

**Interfaces:**
- Produces: `aplicarPiel()` — implementación de referencia de los tokens. Los símbolos `#ci-<nombre>` (trazo, `currentColor`, grosor por CSS) y `#cl-imagotipo|isotipo|vertical|responsive2|responsive3` (relleno `currentColor`).

Verificado en navegador a 1920, 1366 y 390 px, en día y en noche, y con los colores de otro negocio. Contraste medido sobre captura: 26 textos en día y 26 en noche, todos por encima del mínimo.

- [x] Extraer iconos y logo del SVG del usuario
- [x] Convertir Ostrich Sans Heavy a woff2
- [x] Construir la hoja y verificarla
- [ ] **Puerta:** el usuario la revisa y da el número de **Intensidad** (por defecto 60). Ese número va a `PIEL_INTENSIDAD` en la Tarea 2.

---

### Task 1: Fuentes, símbolos y nombre en la app

**Files:**
- Modify: `public/index.html:6-8` (título y fuentes), `:9` (inicio de `<style>`), tras `<body>` (símbolos)

**Interfaces:**
- Consumes: `docs/superpowers/muestras/coral-simbolos.svg`, `public/fonts/OstrichSans-Heavy.woff2`
- Produces: `font-family:'Ostrich Sans'` (peso 900); símbolos `#ci-*` y `#cl-*` disponibles en toda la app; clase `.ic`.

- [ ] **Step 1: Título y fuentes.** Reemplazar las líneas 6–7:

```html
<title>CORAL LINE</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Montserrat:ital,wght@0,100..800;1,300..500&family=DM+Mono:wght@400;500&display=swap" rel="stylesheet">
```

Se mantiene el rango hasta 800 mientras existan pesos 800 en el CSS (se eliminan en la Tarea 6).

- [ ] **Step 2: Ostrich Sans y clase de icono.** Como primera regla dentro de `<style>`:

```css
@font-face{font-family:'Ostrich Sans';font-weight:900;font-style:normal;font-display:swap;src:url('/fonts/OstrichSans-Heavy.woff2') format('woff2')}
.ic{fill:none;stroke:currentColor;stroke-width:1.35px;stroke-linecap:round;stroke-linejoin:round;flex-shrink:0}
```

- [ ] **Step 3: Símbolos.** Insertar el contenido completo de `docs/superpowers/muestras/coral-simbolos.svg` inmediatamente después de `<body>`.

- [ ] **Step 4: Icono de pestaña.** `public/favicon.svg` ya existe (isotipo de tamaño mínimo, `cl-responsive3`, en Deep Teal sobre hielo). Enlazarlo en `<head>`:

```html
<link rel="icon" type="image/svg+xml" href="/favicon.svg">
```

- [ ] **Step 5: Verificar.**

Run: `node -c server.js && npm start` y abrir `http://localhost:3000`.
Con Playwright: `document.fonts.check("900 20px 'Ostrich Sans'")` → `true`; `!!document.getElementById('ci-dashboard')` → `true`; `document.title` → `"CORAL LINE"`; `fetch('/fonts/OstrichSans-Heavy.woff2')` → 200 con `content-type` de fuente (ojo: la ruta comodín devuelve 200 con HTML si el archivo no existe).

- [ ] **Step 6: Commit** — `git commit -m "Coral Line: fuentes, símbolos y nombre en la app"`

---

### Task 2: Tokens y `aplicarTemaColor()`

**Files:**
- Modify: `public/index.html:10-30` (`:root`), `:2528` (`COLOR_FABRICA`), `:2603-2659` (`aplicarTemaColor`)

**Interfaces:**
- Consumes: `hexRgb`, `rgbHex`, `mezcla(hex,destino,cuanto)`, `luminancia`, `colorValido`, `esNoche()`, `CFG` (existentes).
- Produces: funciones `alfa(hex,a)`, `contraste(a,b)`, `tintaMejor(fondo,osc,cla)`, `apagar(hex,t)`; constantes `CL`, `FABRICA_VIEJA`, `PIEL_INTENSIDAD`. Tokens nuevos: `--tinta --tinta-2 --tinta-3 --luz --luz-tinta --luz-halo --foco --bruma --hielo --atmosfera --v1 --v1-borde --v1-brillo --v2 --v2-borde --v2-opaco --vf --vf-tinta --vf-borde --campo --pista --barra --pri --pri-tinta --sel --sel-tinta --contador --sombra --sombra-2 --violeta --violeta-tinta --violeta-suave --violeta-borde --ambar-tinta --verde-tinta --rojo-tinta`. Tokens viejos que siguen saliendo de aquí (alias): `--navy --navy2 --slate --muted --white --bg --line --line-lt --teal --teal-dk --teal-lt --magenta --yellow --brand --brand-txt --brand-txt-dim --acento-txt --acento-ink --sb-* --body-bg --sh --sh-lg`.
- `tintaSobre()` e `inkSeguro()` **no se tocan**: los usa el PDF (Entrega 6).

- [ ] **Step 1: `:root`.** Reemplazar el bloque de las líneas 10–30 por:

```css
:root{
  /* Primitivos de marca — manual CORAL LINE */
  --cl-hielo:#E9FFFE;--cl-bruma:#92F3F1;--cl-cian:#23D0D2;--cl-oceano:#118AA0;--cl-profundo:#0A2E3B;
  --cl-coral:#FD518B;--cl-ambar:#FDA968;--cl-violeta:#5F309B;
  /* Valores de arranque (día, fábrica). aplicarTemaColor() los recalcula enseguida. */
  --navy:#0A2E3B;--navy2:#234550;
  --magenta:#118AA0;--yellow:#23D0D2;
  --grad:linear-gradient(150deg,var(--yellow),var(--magenta));
  --teal:#118AA0;--teal-lt:#CBEFF1;--teal-dk:#0F768A;
  --slate:#45606A;--muted:#536D76;
  --line:rgba(10,46,59,.10);--line-lt:rgba(10,46,59,.05);--bg:#B5E3E6;--white:#F4FFFF;
  --amber:#F5A623;--amber-lt:rgba(245,166,35,.22);
  --red:#E5484D;--red-lt:rgba(229,72,77,.15);
  --green:#2BAD72;--green-lt:rgba(43,173,114,.18);
  --purple:#5F309B;--purple-lt:rgba(95,48,155,.13);
  --orange:#F07140;--orange-lt:rgba(240,113,64,.16);
  --sb-grad:linear-gradient(180deg,#234550 0%,#0A2E3B 52%,#061C24 100%);
  --brand:#0A2E3B;--brand-txt:#E9FFFE;--brand-txt-dim:rgba(233,255,254,.4);--acento-txt:#FFFFFF;--acento-ink:#0F768A;
  --sb-txt:rgba(233,255,254,.88);--sb-txt-2:rgba(233,255,254,.5);--sb-txt-3:rgba(233,255,254,.24);--sb-line:rgba(233,255,254,.08);
  --sb-activo-bg:linear-gradient(90deg,rgba(35,208,210,.26),rgba(35,208,210,.06));--sb-activo-barra:#23D0D2;
  --body-bg:#B5E3E6;
  --r:16px;--r-sm:12px;--r-lg:24px;
  --sh:0 14px 34px rgba(10,46,59,.07);--sh-lg:0 18px 44px rgba(10,46,59,.16);
}
```

- [ ] **Step 2: Constantes y ayudantes.** Reemplazar la línea 2528 (`const COLOR_FABRICA=…`) por:

```js
const COLOR_FABRICA={primario:'#0A2E3B',acento:'#118AA0'};
const FABRICA_VIEJA={primario:'#222B46',acento:'#5B7FA6'};
const CL={cian:'#23D0D2',bruma:'#92F3F1',hielo:'#E9FFFE'};
const PIEL_INTENSIDAD=60; // lo fijó el usuario en la hoja de muestra
```

Y tras `function colorValido…` añadir:

```js
function alfa(hex,a){const c=hexRgb(hex)||[0,0,0];return`rgba(${c[0]},${c[1]},${c[2]},${a})`}
function contraste(a,b){const x=luminancia(a),y=luminancia(b);return(Math.max(x,y)+.05)/(Math.min(x,y)+.05)}
// De dos tintas posibles, la que mejor se lee sobre ese fondo
function tintaMejor(fondo,osc,cla){return contraste(fondo,osc)>=contraste(fondo,cla)?osc:cla}
// Quita saturación sin cambiar la luminosidad (para el modo noche)
function apagar(hex,t){const c=hexRgb(hex)||[0,0,0],g=.3*c[0]+.59*c[1]+.11*c[2];return mezcla(hex,rgbHex([g,g,g]),t)}
```

- [ ] **Step 3: `aplicarTemaColor()`.** Reemplazar la función entera (líneas 2603–2659) por:

```js
function aplicarTemaColor(){
  const P=(colorValido(CFG.color_primario)?CFG.color_primario:COLOR_FABRICA.primario).toUpperCase();
  const A=(colorValido(CFG.color_acento)?CFG.color_acento:COLOR_FABRICA.acento).toUpperCase();
  const noche=esNoche(), f=PIEL_INTENSIDAD/60, lim=v=>Math.max(0,Math.min(1,v));
  const fab=P===COLOR_FABRICA.primario&&A===COLOR_FABRICA.acento;
  // Con los colores de fábrica se usan los del manual; con otros, se derivan del acento
  const CIAN=fab?CL.cian:mezcla(A,'#FFFFFF',.30), BRUMA=fab?CL.bruma:mezcla(A,'#FFFFFF',.58), HIELO=fab?CL.hielo:mezcla(A,'#FFFFFF',.91);
  let OSC=P,n=0; while(luminancia(OSC)>.06&&n++<30)OSC=mezcla(OSC,'#000000',.12); // tinta oscura que siempre se lee
  const raiz=document.documentElement; raiz.dataset.tema=noche?'noche':'dia';
  const t={};

  // ── Marca: igual de día y de noche ──
  const tintaP=tintaMejor(P,OSC,HIELO);
  t['brand']=P; t['brand-txt']=tintaP; t['brand-txt-dim']=mezcla(tintaP,P,.42);
  t['acento-txt']=tintaMejor(A,OSC,'#FFFFFF');
  t['teal']=A; t['magenta']=A; t['yellow']=CIAN;
  t['luz']=CIAN; t['luz-tinta']=tintaMejor(CIAN,OSC,'#FFFFFF'); t['luz-halo']=alfa(CIAN,noche?.28:.42); t['foco']=alfa(CIAN,.26);
  t['bruma']=BRUMA; t['hielo']=HIELO;
  t['pri']=`linear-gradient(135deg,${CIAN},${mezcla(CIAN,A,.42)})`; t['pri-tinta']=tintaMejor(mezcla(CIAN,A,.42),OSC,'#FFFFFF');
  t['sb-txt']=tintaP; t['sb-txt-2']=mezcla(tintaP,P,.42); t['sb-txt-3']=mezcla(tintaP,P,.70); t['sb-line']=mezcla(tintaP,P,.88);
  t['sb-activo-bg']=`linear-gradient(90deg,${alfa(CIAN,.26)},${alfa(CIAN,.06)})`; t['sb-activo-barra']=CIAN;
  t['sb-grad']=`linear-gradient(180deg,${mezcla(P,'#FFFFFF',.10)} 0%,${P} 52%,${mezcla(P,'#000000',.38)} 100%)`;

  let atm;
  if(!noche){
    const c1=mezcla(HIELO,A,lim(.07*f)),c2=mezcla(HIELO,A,lim(.24*f)),c3=mezcla(HIELO,A,lim(.52*f));
    atm=[`linear-gradient(120deg,rgba(255,255,255,.55) 0%,rgba(255,255,255,0) 30%)`,
      `linear-gradient(112deg,transparent 40%,rgba(255,255,255,.20) 46%,transparent 55%)`,
      `linear-gradient(112deg,transparent 63%,rgba(255,255,255,.12) 69%,transparent 78%)`,
      `radial-gradient(52% 42% at 58% 0%,rgba(190,182,238,${lim(.30*f)}),transparent 72%)`,
      `radial-gradient(78% 88% at 100% 100%,${c3},transparent 70%)`,
      `linear-gradient(155deg,${c1} 0%,${c2} 55%,${mezcla(c2,c3,.55)} 100%)`];
    t['bg']=c2;
    t['tinta']=OSC; t['tinta-2']=mezcla(OSC,'#FFFFFF',.24); t['tinta-3']=mezcla(OSC,'#FFFFFF',.30);
    t['navy']=OSC; t['navy2']=mezcla(OSC,'#FFFFFF',.10); t['slate']=t['tinta-2']; t['muted']=t['tinta-3'];
    t['white']=mezcla(HIELO,'#FFFFFF',.5);
    t['line']=alfa(OSC,.10); t['line-lt']=alfa(OSC,.05);
    t['teal-dk']=contraste(A,'#FFFFFF')>=3.6?mezcla(A,OSC,.22):mezcla(A,OSC,.5); t['acento-ink']=t['teal-dk'];
    t['teal-lt']=mezcla(HIELO,A,.14);
    t['v1']='linear-gradient(150deg,rgba(255,255,255,.62),rgba(255,255,255,.28))';
    t['v1-borde']=alfa(mezcla(BRUMA,A,.34),.5); t['v1-brillo']='rgba(255,255,255,.8)';
    t['v2']='rgba(255,255,255,.66)'; t['v2-borde']='rgba(255,255,255,.75)'; t['v2-opaco']=t['white'];
    const f1=mezcla(A,OSC,.12),f2=mezcla(A,OSC,.30),f3=mezcla(A,OSC,.50);
    t['vf']=`linear-gradient(140deg,${f1},${f2} 55%,${f3})`; t['vf-tinta']=tintaMejor(f1,OSC,'#FFFFFF'); t['vf-borde']=alfa(BRUMA,.45);
    t['campo']='rgba(255,255,255,.62)'; t['pista']='rgba(255,255,255,.66)';
    t['barra']=`linear-gradient(90deg,${A},${mezcla(A,P,.55)})`;
    t['sel']=P; t['sel-tinta']=tintaP; t['contador']='#E20613';
    t['sombra']=alfa(OSC,.07); t['sombra-2']=alfa(OSC,.16);
    t['violeta']='#5F309B'; t['violeta-tinta']='#46217A'; t['violeta-suave']='rgba(95,48,155,.13)'; t['violeta-borde']='rgba(95,48,155,.28)';
    t['ambar-tinta']='#6E4600'; t['verde-tinta']='#0F5D38'; t['rojo-tinta']='#9E1A21';
    t['purple']='#5F309B'; t['purple-lt']='rgba(95,48,155,.13)';
    t['amber-lt']='rgba(245,166,35,.24)'; t['red-lt']='rgba(229,72,77,.15)'; t['green-lt']='rgba(43,173,114,.19)'; t['orange-lt']='rgba(240,113,64,.16)';
  }else{
    const n0=apagar(mezcla(P,'#000000',.22),.30),n1=apagar(mezcla(P,'#000000',.50),.35);
    atm=[`linear-gradient(120deg,rgba(255,255,255,.035) 0%,rgba(255,255,255,0) 30%)`,
      `linear-gradient(112deg,transparent 40%,rgba(255,255,255,.022) 46%,transparent 55%)`,
      `radial-gradient(52% 42% at 58% 0%,rgba(130,110,210,${lim(.07*f)}),transparent 72%)`,
      `radial-gradient(78% 88% at 100% 100%,${alfa(A,lim(.20*f))},transparent 70%)`,
      `linear-gradient(155deg,${apagar(mezcla(P,A,.08),.25)} 0%,${n0} 45%,${n1} 100%)`];
    t['bg']=n0;
    t['tinta']=mezcla(HIELO,n0,.12); t['tinta-2']=mezcla(HIELO,n0,.28); t['tinta-3']=mezcla(HIELO,n0,.40);
    t['navy']=t['tinta']; t['navy2']=mezcla(HIELO,n0,.05); t['slate']=t['tinta-2']; t['muted']=t['tinta-3'];
    t['white']=mezcla(n0,'#FFFFFF',.07);
    t['line']=alfa(HIELO,.10); t['line-lt']=alfa(HIELO,.05);
    t['teal-dk']=mezcla(CIAN,HIELO,.25); t['acento-ink']=t['teal-dk'];
    t['teal-lt']=alfa(A,.22);
    t['v1']='linear-gradient(150deg,rgba(255,255,255,.085),rgba(255,255,255,.035))';
    t['v1-borde']=alfa(BRUMA,.15); t['v1-brillo']='rgba(255,255,255,.07)';
    t['v2']=alfa(mezcla(n0,'#FFFFFF',.06),.72); t['v2-borde']=alfa(BRUMA,.2); t['v2-opaco']=t['white'];
    const f1=mezcla(A,n0,.28),f2=mezcla(A,n0,.5),f3=mezcla(A,n0,.68);
    t['vf']=`linear-gradient(140deg,${f1},${f2} 55%,${f3})`; t['vf-tinta']=tintaMejor(f1,OSC,HIELO); t['vf-borde']=alfa(BRUMA,.22);
    t['campo']='rgba(255,255,255,.065)'; t['pista']='rgba(255,255,255,.10)';
    t['barra']=`linear-gradient(90deg,${mezcla(A,CIAN,.5)},${A})`;
    t['sel']=mezcla(A,n0,.22); t['sel-tinta']=tintaMejor(t['sel'],OSC,HIELO); t['contador']='#FF5F6B';
    t['sombra']='rgba(0,0,0,.22)'; t['sombra-2']='rgba(0,0,0,.38)';
    t['violeta']='#B48BEA'; t['violeta-tinta']='#CFB4F7'; t['violeta-suave']='rgba(150,110,220,.24)'; t['violeta-borde']='rgba(180,139,234,.34)';
    t['ambar-tinta']='#FFCF85'; t['verde-tinta']='#86E2B4'; t['rojo-tinta']='#FFA3A7';
    t['purple']='#B48BEA'; t['purple-lt']='rgba(150,110,220,.24)';
    t['amber-lt']='rgba(245,166,35,.22)'; t['red-lt']='rgba(229,72,77,.24)'; t['green-lt']='rgba(43,173,114,.22)'; t['orange-lt']='rgba(240,113,64,.22)';
  }
  t['atmosfera']=atm.join(','); t['body-bg']=t['atmosfera'];
  t['sh']=`0 14px 34px ${t['sombra']}`; t['sh-lg']=`0 18px 44px ${t['sombra-2']}`;
  const s=raiz.style; Object.entries(t).forEach(([k,v])=>s.setProperty('--'+k,v));
}
```

- [ ] **Step 4: `node -c` no aplica al HTML; comprobar sintaxis del script.**

Run: extraer el `<script>` principal a un archivo temporal y `node --check` sobre él (los `<script>` van de la primera línea tras el CDN de jsPDF al final). Expected: sin errores.

- [ ] **Step 5: Verificar en navegador.** `npm start`, entrar (PIN local 1234). Con Playwright:

```js
getComputedStyle(document.documentElement).getPropertyValue('--brand').trim()   // "#0A2E3B"
getComputedStyle(document.documentElement).getPropertyValue('--luz').trim()     // "#23D0D2"
getComputedStyle(document.body).backgroundImage.includes('gradient')            // true
```

Y `alternarModoTema()` → `--navy` pasa a un tono claro, `--bg` a uno oscuro.

- [ ] **Step 6: Review Focus 1 — negocio con colores claros.** En la consola:

```js
CFG.color_primario='#F2D43B'; CFG.color_acento='#FFE98A'; aplicarTemaColor();
['brand-txt','acento-txt','vf-tinta','pri-tinta','sel-tinta'].map(k=>getComputedStyle(document.documentElement).getPropertyValue('--'+k).trim())
```

Expected: todas son tintas **oscuras** (ninguna `#FFFFFF` ni hielo). Captura del Dashboard y de Pedidos: todo se lee. Luego `cfgColoresFabrica()`.

- [ ] **Step 7: Commit** — `git commit -m "Coral Line: tokens nuevos y cálculo de la piel"`

---

### Task 3: Fábrica nueva y migración de colores

**Files:**
- Modify: `server.js:586` (`CFG_DEFAULTS`), `server.js:~260` (tras los `ALTER` de color)

**Interfaces:**
- Produces: todo workspace sin color o con la fábrica vieja responde `color_primario:'#0A2E3B'`, `color_acento:'#118AA0'` en `GET /api/configuracion`.

- [ ] **Step 1: Defaults.** En `CFG_DEFAULTS` de `server.js`:

```js
  // C1 · colores de marca (los de fábrica de CORAL LINE). Alimentan la app y el PDF.
  color_primario:'#0A2E3B',color_acento:'#118AA0'
```

- [ ] **Step 2: Migración.** Tras la línea `ALTER TABLE configuracion_negocio ADD COLUMN color_acento…`:

```js
// CORAL LINE · quien nunca eligió colores (o tenía guardados los de la fábrica vieja) pasa a la
// fábrica nueva. Quien eligió colores propios los conserva. Es idempotente.
try {
  db.prepare(`UPDATE configuracion_negocio SET color_primario='', color_acento=''
    WHERE UPPER(COALESCE(color_primario,'')) IN ('','#222B46') AND UPPER(COALESCE(color_acento,'')) IN ('','#5B7FA6')`).run();
} catch(e){}
```

Vaciar (en vez de escribir el color nuevo) deja que mande `CFG_DEFAULTS`: una futura fábrica no exigirá otra migración.

- [ ] **Step 3: Sintaxis.** Run: `node -c server.js` — Expected: sin salida.

- [ ] **Step 4: Review Focus 2 — comprobar los tres casos** contra la base local (`db/agencia.db`), con el servidor apagado:

```bash
node -e "
const db=require('better-sqlite3')('db/agencia.db');
console.log(db.prepare('SELECT workspace_id,color_primario,color_acento FROM configuracion_negocio').all());"
```

Anotar el estado. Poner un workspace de prueba con `'#222B46','#5B7FA6'` y otro con `'#7A1F3D','#C24D2C'`; arrancar y parar el servidor; repetir la consulta. Expected: el primero queda en `''/''`, el segundo intacto. `GET /api/configuracion` del primero devuelve `#0A2E3B`/`#118AA0`. Restaurar los valores anotados.

- [ ] **Step 5: Commit** — `git commit -m "Coral Line: colores de fábrica nuevos y migración de los viejos"`

---

### Task 4: Atmósfera y superficies compartidas

**Files:**
- Modify: `public/index.html` bloque `<style>` (líneas 32–40, 64–65, 80, 100, 137, 167, 183, 639, 647, 750, 760–764, 768, 772)

**Interfaces:**
- Consumes: `--atmosfera --v1 --v1-borde --v1-brillo --v2 --v2-opaco --campo --foco --luz --vf --vf-tinta --vf-borde`.

- [ ] **Step 1: Fondo.** `body{…background:var(--body-bg);background-attachment:fixed…}` ya consume `--body-bg` (ahora la atmósfera). Añadir `background-color:var(--bg)` como respaldo.

- [ ] **Step 2: Tarjetas → vidrio 1.** Reemplazo literal en todo el `<style>` (21 apariciones):

| Buscar | Reemplazar por |
|---|---|
| `linear-gradient(180deg,#FDFEFF 0%,#F3F7FC 100%)` | `var(--v1)` |
| `linear-gradient(180deg,#FDFEFF,#F3F7FC)` | `var(--v1)` |
| `linear-gradient(180deg,#FDFEFF 0%,#F4F8FC 100%)` | `var(--v1)` |
| `linear-gradient(180deg,#FDFEFF,#F4F8FC)` | `var(--v1)` |

En las clases de tarjeta (`.sc-mini`, `.sc`, `.pcard`, `.ped-table`, `.dash-kpi`, `.dash-fin`, `.ped-side-card`, `.ur-col`, `.cx-kpi`) cambiar `border:1px solid transparent` por `border:1.5px solid var(--v1-borde)` y añadir `box-shadow:inset 0 1px 0 var(--v1-brillo),var(--sh)`.

- [ ] **Step 3: Protagonistas → vidrio fuerte.** `.sc-mini.dark`, `.sc.dk`, `.dash-kpi.k-nav`: `background:var(--vf);border-color:var(--vf-borde)` y su texto `color:var(--vf-tinta)` (hoy usan `rgba(255,255,255,…)` fijo: reemplazar por `var(--vf-tinta)` con `opacity` para los secundarios).

- [ ] **Step 4: Campos y barra.**

```css
input,textarea,select{…border:1.5px solid var(--v1-borde);…background:var(--campo);…}
input:hover,textarea:hover,select:hover{border-color:var(--teal)}
input:focus,textarea:focus,select:focus{background:var(--v2-opaco);border-color:var(--luz);box-shadow:0 0 0 3px var(--foco)}
.topbar{background:var(--v2);-webkit-backdrop-filter:blur(16px);backdrop-filter:blur(16px);border-bottom:1px solid var(--line);…}
.mhead{background:var(--v2-opaco);…}
#ovP,#ovProd{background:var(--atmosfera),var(--bg)}
#ovP .modal{background:transparent}
```

`#ovProd` hoy tiene un degradado fijo de tres colores (`#EFECF9,#E9EEF8,#EAF2F1`): se reemplaza por la línea de arriba.

- [ ] **Step 5: Review Focus 3 — lo que flota no puede transparentarse.** `--white` sigue siendo **opaco**, así que `.modal`, `.bell-panel`, `.gb-panel`, `.ia-panel` no cambian de naturaleza. Comprobar con Playwright, sobre la lista de pedidos: abrir la campana, el buscador global (escribir "a") y el asistente; para cada panel,

```js
getComputedStyle(document.querySelector('.bell-panel')).backgroundColor  // sin canal alfa < 1
```

y una captura de cada uno: el texto de la lista de abajo no se ve a través.

- [ ] **Step 6: Capturas** de Dashboard, Pedidos, editor de pedido, Productos, Producción y Configuración a 1920×950. Nada blanco puro de fondo; las tarjetas se distinguen del fondo.

- [ ] **Step 7: Commit** — `git commit -m "Coral Line: atmósfera, vidrio y campos"`

---

### Task 5: Barrido de colores fijos

**Files:**
- Modify: `public/index.html` bloque `<style>` (246 apariciones fuera de `:root`) y 31 estilos en línea del markup/JS.

Se reemplaza **por familias**. Quedan fuera, a propósito, las dos paletas categóricas (`.bit-dot.bc-*`/`.bit-tab-chip.bt-*` y `.tc-*`): son colores de identidad de etiquetas, no de piel.

- [ ] **Step 1: Neutros claros de fondo → `var(--campo)`:**
`#F8FAFD #F6F9FC #F2F6FB #F4F7FB #F5F8FC #F0F4F6 #EEF1F4 #EEF2F7 #F7FAFD #EDF2F8 #EFF3F9 #E9EFF7 #E8EDF2 #F5F5F5 #F9F9F9 #F4F8FC #E8EFF8 #D7E3F0`
(los degradados `linear-gradient(…#F7FAFD,#EDF2F8)` y `…#EFF3F9,#E9EFF7` pasan a `var(--campo)` enteros).

- [ ] **Step 2: Bordes neutros → `var(--v1-borde)`:** `#D4DEEA #CBD8E8 #C9D6E5 #DCE5EF #CCC #AAA`.

- [ ] **Step 3: Azules de la marca vieja:**

| Buscar | Reemplazar por |
|---|---|
| `#5E708A`, `#4A5A70`, `#4A5568`, `#6B7A8D`, `#8A9EAD` | `var(--slate)` |
| `#3E5C82` | `var(--teal-dk)` |
| `#222B46` | `var(--brand)` |
| `#5B7FA6`, `#4A6FA5` | `var(--teal)` |
| `#9DBBDC` | `var(--luz)` |
| `rgba(91,127,166,` | usar `var(--foco)` en los `box-shadow` de foco y `var(--line-lt)` en los fondos de hover |
| `rgba(74,98,142,` · `rgba(34,43,70,` · `rgba(70,98,142,` · `rgba(20,26,41,` · `rgba(10,14,40,` | `var(--sombra)` / `var(--sombra-2)` según sea sombra suave o velo de ventana |

- [ ] **Step 4: Violeta** (cotización, variantes, relaciones de Bitácora):

| Buscar | Reemplazar por |
|---|---|
| `#7B6EF6`, `#6A5AE0`, `#897FD0` | `var(--violeta)` |
| `#5B4FD6`, `#4A3CB8` | `var(--violeta-tinta)` |
| `#EDE9FB #FBFAFE #F1EEFB #EEEAFB #F8F6FF #EFEBFF #F7F5FE #F6F4FD` | `var(--violeta-suave)` |
| `#C9BEF3 #E7E1F8 #D9D3FF #D9D0F3 #D9D2F5 #C9C2E6` | `var(--violeta-borde)` |

- [ ] **Step 5: Estados.**

| Buscar | Reemplazar por |
|---|---|
| `#9B6500 #8A6D1B #B8860B #A5761B` (como `color`) | `var(--ambar-tinta)` |
| `#FBF0DD #FDFAF3 #FBF3DD #FFF0C2` | `var(--amber-lt)` |
| `#F5D5A0 #E9D08C #E8A93C #C79A3C` (borde/relleno) | `var(--amber)` |
| `#1A6B45 #1E7A4D` | `var(--verde-tinta)` |
| `#E4F5EC #F3FBF6` | `var(--green-lt)` |
| `#BFE0CE #9ADABC #3E9B6B` | `var(--green)` |
| `#C0392B` | `var(--rojo-tinta)` |
| `#FDE7E9` | `var(--red-lt)` |
| `#F5C0C2 #F0C9C9` (bordes) | `color-mix(in srgb,var(--red) 45%,transparent)` |

- [ ] **Step 6: Blanco como tinta.** Los `color:#fff` sobre fondo de marca (`.nb.urg`, avatares, chips de rol) → `var(--brand-txt)` cuando el fondo es `var(--brand)`; sobre un color categórico fijo se dejan.

- [ ] **Step 7: Estilos en línea del JS.** `grep -n "color:#\|background:#\|stroke=\"#" public/index.html` fuera del `<style>`: aplicar las mismas tablas. En `cargarDashboard()` y `dashDonut()`: `#9DBBDC`→`var(--luz)`, `#1A6B45`→`var(--verde-tinta)`, `#3E5C82`→`var(--teal-dk)`, `#E0F5F4`/`#0BB5B0`→`var(--teal-lt)`/`var(--teal-dk)`.

- [ ] **Step 8: Verificar que no queda nada sin clasificar.**

```bash
python - <<'EOF'
import re
L=open('public/index.html',encoding='utf-8').read().split('\n')
s=next(i for i,l in enumerate(L) if '<style>' in l); e=next(i for i,l in enumerate(L) if '</style>' in l)
permitidas=('bit-dot','bit-col','bit-tab-chip','.tc-','--cl-',':root')
resto=[(i+1,m.group(0)) for i in range(s+22,e) for m in re.finditer(r'#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b',L[i]) if not any(p in L[i] for p in permitidas)]
print(len(resto),'colores fijos fuera de las paletas categóricas'); print(resto[:40])
EOF
```

Expected: `0`, o solo los del bloque `html[data-tema="noche"]` (se resuelven en la Tarea 8).

- [ ] **Step 9: Capturas** de las 13 vistas en día. Comparar con las de la Tarea 4: ningún parche gris-azulado de la marca vieja.

- [ ] **Step 10: Commit** — `git commit -m "Coral Line: colores fijos reemplazados por tokens"`

---

### Task 6: Tipografía — pesos y piso de 11 px

**Files:**
- Modify: `public/index.html` (CSS y estilos en línea)

Estado de partida, medido: 270 tamaños por debajo de 11 px (179 en CSS, 91 en línea) y 223 pesos 700/800 frente a 5 de 300.

- [ ] **Step 1: Piso de tamaño.** Reemplazo con expresión regular en todo el archivo:
`font-size:(8|8\.5|9|9\.5|10|10\.5)px` → `font-size:11px`.

- [ ] **Step 2: Pesos.** `font-weight:800` → `font-weight:600`; `font-weight:700` → `font-weight:600`.

- [ ] **Step 3: Etiquetas en mayúsculas a Medium.** Toda regla CSS que contenga `text-transform:uppercase` pasa su `font-weight` a `500`:

```python
import re
p='public/index.html'; t=open(p,encoding='utf-8').read()
i,j=t.index('<style>'),t.index('</style>')
css=t[i:j]
def regla(m):
    r=m.group(0)
    return re.sub(r'font-weight:\d+','font-weight:500',r) if 'text-transform:uppercase' in r else r
css=re.sub(r'[^{}]+\{[^{}]*\}',regla,css)
open(p,'w',encoding='utf-8',newline='').write(t[:i]+css+t[j:])
```

- [ ] **Step 4: Números protagonistas a Thin.** `.dash-kpi .num`, `.sc-mini .num`, `.sc-n`: `font-weight:100` y tamaño `clamp(40px,3.4vw,64px)`. Cifras de dinero destacadas (`.dash-fin .fm .fv`, `.pt-total`): `font-weight:300`.

- [ ] **Step 5: Review Focus 4 — nada desborda.** Con Playwright a 1366×768 y 1920×950, en Pedidos (lista), editor de pedido con un pedido de 3 encargos, cuadrícula de variantes de un producto y Producción (kanban):

```js
[...document.querySelectorAll('.view.active *, #ovP.open *, #ovProd.open *')]
  .filter(e=>e.scrollWidth>e.clientWidth+1 && getComputedStyle(e).overflowX==='visible' && e.children.length===0)
  .map(e=>e.className+' | '+e.textContent.slice(0,30)).slice(0,20)
```

Expected: `[]`. Lo que aparezca se corrige ahí mismo con `white-space:nowrap;overflow:hidden;text-overflow:ellipsis` o permitiendo el salto de línea; nunca bajando el tamaño.

- [ ] **Step 6: Quitar el peso 800 del enlace de fuentes** (`wght@0,100..700`) y comprobar `grep -c "font-weight:800" public/index.html` → `0`.

- [ ] **Step 7: Commit** — `git commit -m "Coral Line: tipografía fina y tamaño mínimo de 11 px"`

---

### Task 7: Marca en el ingreso y en el menú

**Files:**
- Modify: `public/index.html:1385-1391` (CSS del ingreso), `:1397-1400` (markup), `:1426-1428` (logo del menú), `aplicarPerfilNegocio()` (~2698)

**Interfaces:**
- Consumes: `#cl-imagotipo`, `#cl-vertical`, `--atmosfera`, `--v1`.

- [ ] **Step 1: Ingreso.**

```css
.pin-screen{…background:var(--atmosfera),var(--bg);…}
.pin-box{background:var(--v1);border:1.5px solid var(--v1-borde);box-shadow:inset 0 1px 0 var(--v1-brillo),var(--sh-lg);…}
.pin-logo{width:148px;height:102px;fill:var(--navy);margin:0 auto 6px;display:block}
```

Markup: reemplazar `<span class="tri"></span><h2>GRAFÍA Studio</h2>` por

```html
<svg class="pin-logo" viewBox="0 0 148 102" role="img" aria-label="Coral Line"><use href="#cl-vertical" width="148" height="102"/></svg>
```

- [ ] **Step 2: Logo por defecto del menú.** Sustituir el `<img id="sbLogoImg" src="data:image/png;base64,…">` por dos elementos: el imagotipo Coral Line (visible cuando el negocio no tiene logo) y el `<img id="sbLogoImg">` vacío (visible cuando sí).

```html
<svg id="sbLogoCL" viewBox="0 0 136 33" style="width:136px;height:33px;fill:var(--sb-txt);margin:0 auto;display:block" role="img" aria-label="Coral Line"><use href="#cl-imagotipo" width="136" height="33"/></svg>
<img id="sbLogoImg" alt="" style="display:none;max-width:150px;max-height:60px">
```

En `aplicarPerfilNegocio()`:

```js
const img=document.getElementById('sbLogoImg'),cl=document.getElementById('sbLogoCL');
if(CFG.logo_ruta){img.src=CFG.logo_ruta;img.style.display='block';cl.style.display='none'}
else{img.style.display='none';cl.style.display='block'}
```

Esto además quita ~40 KB de imagen en base64 del HTML.

- [ ] **Step 3: Textos.** `grep -n "GRAF[IÍ]A" public/index.html`: lo que nombre a la app pasa a "CORAL LINE"; lo que sea dato del negocio o nombre de archivo de exportación se deja y se anota para la Entrega 6.

- [ ] **Step 4: Verificar.** Cerrar sesión → captura del ingreso en día y noche. Con un workspace sin logo se ve el imagotipo; subir un logo en Configuración → se ve el del negocio.

- [ ] **Step 5: Commit** — `git commit -m "Coral Line: marca en el ingreso y en el menú"`

---

### Task 8: Modo noche funcionando

**Files:**
- Modify: `public/index.html:938-962` (bloque `html[data-tema="noche"]`)

- [ ] **Step 1:** Reemplazar los colores fijos del bloque por tokens:

```css
html[data-tema="noche"] input,html[data-tema="noche"] textarea,html[data-tema="noche"] select{background:var(--campo);color:var(--navy)}
html[data-tema="noche"] input:hover,html[data-tema="noche"] textarea:hover,html[data-tema="noche"] select:hover{border-color:var(--teal)}
html[data-tema="noche"] input:focus,html[data-tema="noche"] textarea:focus,html[data-tema="noche"] select:focus{background:var(--v2-opaco)}
html[data-tema="noche"] input::placeholder,html[data-tema="noche"] textarea::placeholder{color:var(--muted)}
```

Las reglas que forzaban fondo oscuro a `.topbar`, `.sc`, `.sc-mini`, `.ped-table`, `.pcard`, `.cx-kpi`, `.ur-col`, `.dash-kpi`, `.cerrado-banner` **se eliminan**: esas clases ya usan `var(--v1)`/`var(--v2)`, que cambian solas. Las de `.pcard.canc|.pend|.cot`, `.pcx-stock`, `.pcal-chip`, `.pcrono-track`, `.ev-form`, `.cxl-pega`, `.cx-fila.cx-tot`, `.bit-rel-sec`, `.pcx-obs textarea`, `.cl-pick` pasan a `background:var(--campo)`; `.bell-item:hover` a `var(--line-lt)`.

- [ ] **Step 2:** El filtro `html[data-tema="noche"] .sb-logo img{filter:brightness(1.35)}` se conserva (logos de negocio oscuros).

- [ ] **Step 3: Review Focus 5 — barrido de legibilidad.** En modo noche, por cada una de las 13 vistas y con el editor de pedido y el de producto abiertos:

```js
(()=>{const lum=c=>{const m=c.match(/[\d.]+/g).map(Number),f=v=>{v/=255;return v<=.03928?v/12.92:Math.pow((v+.055)/1.055,2.4)};return .2126*f(m[0])+.7152*f(m[1])+.0722*f(m[2])};
return [...document.querySelectorAll('.view.active *, .overlay.open *')].filter(e=>e.children.length===0&&e.textContent.trim()&&e.offsetParent)
 .filter(e=>lum(getComputedStyle(e).color)<.12).map(e=>(e.className||e.tagName)+' | '+e.textContent.trim().slice(0,28)).slice(0,30)})()
```

Expected: `[]` (ningún texto de tinta oscura). Lo que salga tiene un color fijo: se pasa a token.

- [ ] **Step 4: Commit** — `git commit -m "Coral Line: modo noche sobre los tokens nuevos"`

---

### Task 9: Verificación integral y entrega

- [ ] **Step 1:** `node -c server.js`.
- [ ] **Step 2: Capturas** de las 13 vistas + ingreso + editor de pedido + editor de producto, a 1920×950, 1366×768, 768×1024 y 390×844, en día y noche.
- [ ] **Step 3: Contraste medido** en Dashboard, Pedidos y editor de pedido (día y noche) con `docs/superpowers/muestras/medir_contraste.py`. Expected: `por debajo del mínimo: 0`.
- [ ] **Step 4: Regresión funcional:** entrar · crear un pedido `ZZ prueba piel` con dos ítems · editarlo · registrar un abono · generar el PDF · mover un ítem en Producción · preguntar al asistente · cambiar los colores en Configuración y guardarlos · restaurar fábrica. Luego archivar y **comprobar** que no quedan datos `ZZ`.
- [ ] **Step 5: Rol limitado con su propio token** (crear usuario `zzpiel<timestamp>`, iniciar sesión y verificar que el token no viene vacío): las vistas sin permiso siguen ocultas.
- [ ] **Step 6: Actualizar `MAPA-CODIGO.md`** con los anclajes nuevos (tokens, `aplicarTemaColor`, símbolos).
- [ ] **Step 7:** Mostrar las capturas al usuario. Con su visto bueno: `git checkout main && git merge --no-ff coral-line && git push origin main`, y verificar en producción.
