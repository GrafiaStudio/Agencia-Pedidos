# Ayuda y About Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Nueva vista principal "Ayuda y About" con 6 sub-pestañas (Manual de Usuario, Quiénes Somos, Información de la App, Términos y Condiciones, Política de Privacidad, Soporte).

**Architecture:** Vista nueva siguiendo el patrón visual de Configuración (sub-tabs) pero con clases CSS propias (`.helptab`/`.help-panel`) — reutilizar literalmente `.cfgtab`/`.cfg-panel` rompería el reset de tabs de ambas vistas, porque `showCfgTab` opera sobre esas clases sin distinguir de qué vista son. El acordeón del Manual de Usuario también usa clases propias (`.man-step` etc.) en vez de las del acordeón ya existente (`.collapsible`), porque `resetForm()` ya asume que solo existe un `.coll-body` en toda la página. Tres pestañas (Quiénes Somos, Términos, Privacidad) llevan placeholders honestos donde el contenido depende de texto que solo el negocio puede proveer.

**Tech Stack:** Node.js + Express + better-sqlite3 (backend), HTML/CSS/JS vanilla (frontend).

## Global Constraints

- No usar las clases `.cfgtab`/`.cfg-panel`/`.collapsible`/`.coll-body`/`.coll-chevron` para nada de esta vista — son de Configuración/Costos y compartirlas rompe ambas vistas (ver Architecture arriba).
- No inventar contenido de negocio real (historia del negocio, textos legales) — placeholder honesto y visible donde no hay dato.
- `git push origin main` no requiere confirmación previa (autorización del usuario).
- Sin framework de tests — `node -c`, curl, y verificación con `grep` (el agente no tiene navegador).

---

## Task 1: Backend — endpoint de información de la app

**Files:**
- Modify: `agencia/server.js`

**Interfaces:**
- Produces: `GET /api/app-info` → `{nombre, version, fecha_actualizacion, novedades:[...]}`.

- [ ] **Step 1: Constante `APP_INFO` y endpoint**

Releer primero el bloque real con `grep -n "// ── CONFIGURACIÓN DEL NEGOCIO" agencia/server.js` para confirmar el ancla exacta. Cambiar:

```js
// ── CONFIGURACIÓN DEL NEGOCIO ──
app.get('/api/configuracion',(req,res)=>{
  res.json(getConfiguracion(req.wsId));
});
```

por:

```js
// ── INFORMACIÓN DE LA APP (estática, no es dato por workspace) ──
const APP_INFO={
  nombre:'GRAFÍA Studio',
  fecha_actualizacion:'2026-06-26',
  novedades:[
    'Inventario: stock por producto con descuento y restauración automática.',
    'Aviso de stock insuficiente al armar un pedido.',
    'Nueva sección de Ayuda y About.'
  ]
};
app.get('/api/app-info',(req,res)=>{
  res.json({...APP_INFO,version:require('./package.json').version});
});

// ── CONFIGURACIÓN DEL NEGOCIO ──
app.get('/api/configuracion',(req,res)=>{
  res.json(getConfiguracion(req.wsId));
});
```

- [ ] **Step 2: Verificar sintaxis**

Run: `cd "i:/AGENCIA PEDIDOS/agencia" && node -c server.js && echo OK`
Expected: `OK`.

- [ ] **Step 3: Probar con curl**

Run:
```bash
cd "i:/AGENCIA PEDIDOS/agencia"
npm start &
for i in 1 2 3 4 5 6 7 8 9 10; do curl -s -m 1 http://localhost:3000/ -o /dev/null && break; sleep 1; done
TOKEN=$(curl -s -m 5 -X POST http://localhost:3000/api/auth/login -H "Content-Type: application/json" -d '{"pin":"1234"}' | grep -o '"token":"[^"]*"' | cut -d'"' -f4)
curl -s -m 5 http://localhost:3000/api/app-info -H "Authorization: Bearer $TOKEN"
echo
PID=$(netstat -ano | grep ':3000' | grep LISTENING | head -1 | awk '{print $NF}'); [ -n "$PID" ] && taskkill //F //PID "$PID"
```
Expected: JSON con `"nombre":"GRAFÍA Studio"`, `"version":"2.0.0"`, `"fecha_actualizacion"` y `"novedades"` como array.

- [ ] **Step 4: Commit**

```bash
cd "i:/AGENCIA PEDIDOS/agencia"
git add server.js
git commit -m "[FEATURE] Ayuda y About: endpoint de informacion de la app (Fase 1F)"
```

---

## Task 2: Frontend — navegación y estructura de la vista

**Files:**
- Modify: `agencia/public/index.html` (CSS; sidebar; `showView`; nuevo `<div id="view-ayuda">` con sub-tabs; `showHelpTab`)

**Interfaces:**
- Produces: función `showHelpTab(tab)` — switching entre los 6 `.help-panel`.

- [ ] **Step 1: CSS de sub-tabs propio (`.helptab`/`.help-panel`)**

Releer primero con `grep -n "cfg-panel{display:none}" agencia/public/index.html`. Cambiar:

```css
.cfg-panel{display:none}.cfg-panel.active{display:block}
```

por:

```css
.cfg-panel{display:none}.cfg-panel.active{display:block}
.help-tabs{display:flex;gap:4px;margin-bottom:16px;flex-wrap:wrap}
.helptab{padding:6px 14px;border-radius:20px;border:1.5px solid var(--line);background:var(--white);color:var(--slate);font-size:10px;font-weight:700;cursor:pointer;transition:all .13s}
.helptab.active{border-color:var(--navy);background:var(--navy);color:white}
.help-panel{display:none}.help-panel.active{display:block}
```

- [ ] **Step 2: Botón nuevo en el sidebar**

Releer primero con `grep -n 'data-view="configuracion"' agencia/public/index.html`. Cambiar:

```html
    <button class="nav-item" data-view="configuracion" onclick="showView('configuracion')"><i class="ti ti-settings"></i>Configuración</button>
```

por:

```html
    <button class="nav-item" data-view="ayuda" onclick="showView('ayuda')"><i class="ti ti-help-circle"></i>Ayuda</button>
    <button class="nav-item" data-view="configuracion" onclick="showView('configuracion')"><i class="ti ti-settings"></i>Configuración</button>
```

- [ ] **Step 3: `showView` reconoce la nueva vista**

Releer primero con `grep -n "const titles=" agencia/public/index.html`. Cambiar:

```js
  const titles={pedidos:'Pedidos',clientes:'Clientes',registros:'Registros',configuracion:'Configuración',productos:'Productos'};
```

por:

```js
  const titles={pedidos:'Pedidos',clientes:'Clientes',registros:'Registros',configuracion:'Configuración',productos:'Productos',ayuda:'Ayuda y About'};
```

- [ ] **Step 4: Estructura de la vista con sus 6 sub-tabs (contenido vacío por ahora)**

Releer primero con `grep -n -A6 'Guardar configuración' agencia/public/index.html` (el botón de Guardar es único en todo el archivo) para confirmar el ancla exacta. Debe verse así (el `</div>` de la línea siguiente al botón es el que cierra `view-configuracion`; las líneas después de esa son los `</div>` que cierran wrappers de `.main`, NO tocar esas):

```html
      <button class="btn-pri" style="margin-top:18px" onclick="guardarConfiguracion()"><i class="ti ti-device-floppy"></i> Guardar configuración</button>
    </div>

  </div>
</div>
</div>
```

Insertar el nuevo bloque entre el `</div>` que cierra `view-configuracion` y la línea en blanco que sigue (es decir, ANTES de los tres `</div>` de wrappers — el nuevo `view-ayuda` debe quedar como hermano de `view-configuracion`, dentro del mismo wrapper, no después de que ese wrapper cierre). Cambiar:

```html
      <button class="btn-pri" style="margin-top:18px" onclick="guardarConfiguracion()"><i class="ti ti-device-floppy"></i> Guardar configuración</button>
    </div>

  </div>
```

por:

```html
      <button class="btn-pri" style="margin-top:18px" onclick="guardarConfiguracion()"><i class="ti ti-device-floppy"></i> Guardar configuración</button>
    </div>

    <!-- AYUDA Y ABOUT -->
    <div id="view-ayuda" class="view">
      <div class="help-tabs">
        <button class="helptab active" onclick="showHelpTab('manual')">Manual de Usuario</button>
        <button class="helptab" onclick="showHelpTab('quienes')">Quiénes Somos</button>
        <button class="helptab" onclick="showHelpTab('info')">Información de la App</button>
        <button class="helptab" onclick="showHelpTab('terminos')">Términos y Condiciones</button>
        <button class="helptab" onclick="showHelpTab('privacidad')">Política de Privacidad</button>
        <button class="helptab" onclick="showHelpTab('soporte')">Soporte</button>
      </div>

      <div id="help-manual" class="help-panel active"></div>
      <div id="help-quienes" class="help-panel"></div>
      <div id="help-info" class="help-panel"></div>
      <div id="help-terminos" class="help-panel"></div>
      <div id="help-privacidad" class="help-panel"></div>
      <div id="help-soporte" class="help-panel"></div>
    </div>

  </div>
```

Nótese el `  </div>` final — es el mismo wrapper que cerraba originalmente justo después de `view-configuracion`; aquí se conserva, solo que ahora cierra después de `view-ayuda` (que quedó como hermano, no como hijo, de `view-configuracion`). No omitirlo.

(El contenido real de cada `help-panel` se llena en las Tasks 3 y 4 — dejarlos vacíos aquí es intencional para mantener este paso enfocado solo en navegación/estructura.)

- [ ] **Step 5: `showHelpTab`**

Releer primero con `grep -n "function toggleColl" agencia/public/index.html` para anclar justo después de esa función (mismo bloque general de funciones de UI). Inmediatamente después del cierre de `toggleColl` (`}` seguido de línea en blanco), agregar:

```js
function showHelpTab(tab){
  document.querySelectorAll('.help-panel').forEach(x=>x.classList.remove('active'));
  document.querySelectorAll('.helptab').forEach(x=>x.classList.remove('active'));
  document.getElementById('help-'+tab).classList.add('active');
  ['manual','quienes','info','terminos','privacidad','soporte'].forEach((t,i)=>{if(t===tab)document.querySelectorAll('.helptab')[i].classList.add('active')});
  if(tab==='quienes')pintarAyudaQuienesSomos();
  if(tab==='info')cargarAppInfo();
  if(tab==='soporte')pintarAyudaSoporte();
}
```

(Las funciones `pintarAyudaQuienesSomos`/`cargarAppInfo`/`pintarAyudaSoporte` se escriben en la Task 4 — hasta entonces esto da `ReferenceError` si se hace click en esas pestañas, lo cual es esperado y se resuelve en esa misma sesión de trabajo antes del commit final de la Task 4.)

- [ ] **Step 6: Verificar sintaxis**

Run:
```bash
cd "i:/AGENCIA PEDIDOS/agencia"
SCRATCH="C:/Users/ADMIN/AppData/Local/Temp/claude/i--AGENCIA-PEDIDOS/8d8d31ac-5619-43aa-9270-0aa1f2328221/scratchpad"
awk '/<script>/{f=1;next}/<\/script>/{f=0}f' public/index.html > "$SCRATCH/check.js"
node -c "$SCRATCH/check.js" && echo OK
```
Expected: `OK` (las referencias a funciones que aún no existen no son errores de sintaxis, solo lo serían en tiempo de ejecución al hacer click).

- [ ] **Step 7: Commit**

```bash
cd "i:/AGENCIA PEDIDOS/agencia"
git add public/index.html
git commit -m "[FEATURE] Ayuda y About: navegacion y estructura de la vista (Fase 1F)"
```

---

## Task 3: Frontend — Manual de Usuario (acordeón de 10 pasos)

**Files:**
- Modify: `agencia/public/index.html` (CSS; contenido de `#help-manual`; `toggleManual`)

**Interfaces:**
- Produces: función `toggleManual(head)`.

- [ ] **Step 1: CSS del acordeón propio (`.man-step` etc.)**

Releer primero con `grep -n "help-panel{display:none}.help-panel.active" agencia/public/index.html` (agregado en la Task 2). Cambiar:

```css
.help-panel{display:none}.help-panel.active{display:block}
```

por:

```css
.help-panel{display:none}.help-panel.active{display:block}
.man-step{border:1.5px solid var(--line);border-radius:var(--r);overflow:hidden;margin-bottom:10px}
.man-head{display:flex;align-items:center;justify-content:space-between;padding:10px 14px;cursor:pointer;background:var(--line-lt);transition:background .12s;user-select:none}
.man-head:hover{background:#e8edf2}
.man-head-l{font-size:10px;font-weight:800;color:var(--slate);text-transform:uppercase;letter-spacing:.06em}
.man-chevron{color:var(--muted);font-size:14px;transition:transform .2s}
.man-chevron.open{transform:rotate(180deg)}
.man-body{display:none;padding:14px;border-top:1.5px solid var(--line);font-size:11.5px;color:var(--slate);line-height:1.6}
.man-body.open{display:block}
```

- [ ] **Step 2: Contenido del Manual de Usuario**

Releer primero con `grep -n '<div id="help-manual" class="help-panel active"></div>' agencia/public/index.html`. Cambiar:

```html
      <div id="help-manual" class="help-panel active"></div>
```

por:

```html
      <div id="help-manual" class="help-panel active">
        <div class="man-step">
          <div class="man-head" onclick="toggleManual(this)"><div class="man-head-l">1. Crear tu primer pedido</div><i class="ti ti-chevron-down man-chevron"></i></div>
          <div class="man-body">Ve a <b>Pedidos → Nuevo pedido</b>. Escribe el nombre y teléfono del cliente — si ya existe, la app lo reconoce solo. Agrega al menos un Encargo con sus ítems (cantidad, detalle, valor unitario) y guarda.</div>
        </div>
        <div class="man-step">
          <div class="man-head" onclick="toggleManual(this)"><div class="man-head-l">2. Encargos y costos</div><i class="ti ti-chevron-down man-chevron"></i></div>
          <div class="man-body"><b>Encargos</b> es lo que le cobras al cliente: categoría, subcategoría, estado y los ítems con su cantidad y valor. <b>Costos</b> es lo que te cuesta a ti producirlo (insumos, mano de obra) — no se le muestra al cliente y se resta de la ganancia en Registros.</div>
        </div>
        <div class="man-step">
          <div class="man-head" onclick="toggleManual(this)"><div class="man-head-l">3. Registrar pagos</div><i class="ti ti-chevron-down man-chevron"></i></div>
          <div class="man-body">En la sección Pagos de cada pedido, registra cada abono con su fecha y forma de pago. El saldo pendiente se calcula solo a partir del valor total del pedido.</div>
        </div>
        <div class="man-step">
          <div class="man-head" onclick="toggleManual(this)"><div class="man-head-l">4. Cómo usar los estados</div><i class="ti ti-chevron-down man-chevron"></i></div>
          <div class="man-body">Cada Encargo avanza por: Nuevo → Diseño → Aprobación → Producción → Listo. El pedido completo, por separado, se puede marcar como Urgente, Entregado, Cancelado o Pendiente de pago — son independientes del estado del encargo.</div>
        </div>
        <div class="man-step">
          <div class="man-head" onclick="toggleManual(this)"><div class="man-head-l">5. Cotizaciones</div><i class="ti ti-chevron-down man-chevron"></i></div>
          <div class="man-body">Marca "Es cotización" en un pedido que todavía no es un compromiso real con el cliente. Mientras esté marcada, no descuenta inventario ni cuenta como venta. Cuando el cliente confirme, desmarca la casilla y guarda — ahí se vuelve un pedido real.</div>
        </div>
        <div class="man-step">
          <div class="man-head" onclick="toggleManual(this)"><div class="man-head-l">6. Fichas de producto</div><i class="ti ti-chevron-down man-chevron"></i></div>
          <div class="man-body">En <b>Productos</b>, crea una ficha por cada producto o servicio: nombre, categoría, tipo de precio (Unitario, Escalonado por cantidad, o Promocional con fechas de vigencia), insumos opcionales y margen.</div>
        </div>
        <div class="man-step">
          <div class="man-head" onclick="toggleManual(this)"><div class="man-head-l">7. Autocompletado en el pedido</div><i class="ti ti-chevron-down man-chevron"></i></div>
          <div class="man-body">Al escribir el Detalle de un ítem (en Encargos o en Costos), aparecen sugerencias de tus fichas e insumos ya guardados. Selecciona una y el precio se llena solo.</div>
        </div>
        <div class="man-step">
          <div class="man-head" onclick="toggleManual(this)"><div class="man-head-l">8. Inventario (stock)</div><i class="ti ti-chevron-down man-chevron"></i></div>
          <div class="man-body">En la ficha de cada producto puedes configurar "Stock actual" y "Stock mínimo". Al confirmar un pedido real (no cotización) que use ese producto, el stock baja solo. Si cancelas o eliminas ese pedido, el stock se restaura.</div>
        </div>
        <div class="man-step">
          <div class="man-head" onclick="toggleManual(this)"><div class="man-head-l">9. Documentos y WhatsApp</div><i class="ti ti-chevron-down man-chevron"></i></div>
          <div class="man-body">Desde el pedido puedes generar un PDF (Cotización, Orden de Pedido o Comprobante de Venta, según el estado) y enviarlo al cliente por WhatsApp con un mensaje ya armado.</div>
        </div>
        <div class="man-step">
          <div class="man-head" onclick="toggleManual(this)"><div class="man-head-l">10. Exportar datos y configurar el negocio</div><i class="ti ti-chevron-down man-chevron"></i></div>
          <div class="man-body">"Exportar CSV" en el menú lateral descarga tus pedidos para abrirlos en Excel. "Configuración" guarda los datos de tu negocio, preferencias de moneda y fecha, métodos de pago e IVA.</div>
        </div>
      </div>
```

- [ ] **Step 3: `toggleManual`**

Releer primero con `grep -n "function showHelpTab" agencia/public/index.html` (agregada en la Task 2) para anclar justo después de su cierre. Agregar inmediatamente después:

```js
function toggleManual(head){
  const body=head.nextElementSibling;
  const chev=head.querySelector('.man-chevron');
  body.classList.toggle('open');
  chev.classList.toggle('open');
}
```

- [ ] **Step 4: Verificar sintaxis**

Run: igual que Task 2 Step 6.
Expected: `OK`.

- [ ] **Step 5: Commit**

```bash
cd "i:/AGENCIA PEDIDOS/agencia"
git add public/index.html
git commit -m "[FEATURE] Ayuda y About: Manual de Usuario con 10 pasos (Fase 1F)"
```

---

## Task 4: Frontend — Quiénes Somos, Información de la App, Términos, Privacidad, Soporte

**Files:**
- Modify: `agencia/public/index.html` (contenido de los 5 `help-panel` restantes; `pintarAyudaQuienesSomos`; `cargarAppInfo`; `pintarAyudaSoporte`; `enviarWhatsAppSoporte`)

**Interfaces:**
- Consumes: `CFG.nombre_negocio`, `CFG.logo_ruta`, `CFG.email` (ya cargados globalmente, Fase 1E); `GET /api/app-info` (Task 1); `normalizarTelWa(tel)` (ya existente, Fase 3).
- Produces: `pintarAyudaQuienesSomos()`, `cargarAppInfo()`, `pintarAyudaSoporte()`, `enviarWhatsAppSoporte()`.

- [ ] **Step 1: Contenido de los 5 paneles**

Releer primero con `grep -n '<div id="help-quienes" class="help-panel"></div>' agencia/public/index.html` (y las 4 líneas siguientes) para confirmar el texto exacto antes de editar. Cambiar:

```html
      <div id="help-quienes" class="help-panel"></div>
      <div id="help-info" class="help-panel"></div>
      <div id="help-terminos" class="help-panel"></div>
      <div id="help-privacidad" class="help-panel"></div>
      <div id="help-soporte" class="help-panel"></div>
```

por:

```html
      <div id="help-quienes" class="help-panel">
        <div id="ayuda-quienes-logo" style="margin-bottom:14px;display:none"><img id="ayuda-quienes-logo-img" style="max-height:60px" alt="Logo"></div>
        <div id="ayuda-quienes-nombre" style="font-size:14px;font-weight:800;color:var(--navy);margin-bottom:8px"></div>
        <p style="font-size:11.5px;color:var(--muted);line-height:1.6;font-style:italic">Pendiente: aquí va una breve historia del negocio — la escribe el dueño cuando la tenga lista.</p>
      </div>
      <div id="help-info" class="help-panel">
        <div id="ayuda-info-body" style="font-size:11.5px;color:var(--slate);line-height:1.7">Cargando…</div>
      </div>
      <div id="help-terminos" class="help-panel">
        <p style="font-size:11.5px;color:var(--muted);line-height:1.6;font-style:italic">Pendiente: texto legal que proveerá el negocio.</p>
      </div>
      <div id="help-privacidad" class="help-panel">
        <p style="font-size:11.5px;color:var(--muted);line-height:1.6;font-style:italic">Pendiente: texto legal que proveerá el negocio.</p>
      </div>
      <div id="help-soporte" class="help-panel">
        <p style="font-size:11.5px;color:var(--slate);line-height:1.6;margin-bottom:14px">¿Tienes dudas o problemas usando la app? Escríbenos.</p>
        <div id="ayuda-soporte-email" style="font-size:11.5px;color:var(--slate);margin-bottom:10px"></div>
        <button class="btn-pri" id="btn-soporte-wa" onclick="enviarWhatsAppSoporte()"><i class="ti ti-brand-whatsapp"></i>Escribir por WhatsApp</button>
        <p style="font-size:10px;color:var(--muted);margin-top:14px">Tiempo de respuesta estimado: usualmente dentro de 24 horas en días hábiles.</p>
      </div>
```

- [ ] **Step 2: Funciones de las 3 pestañas dinámicas**

Releer primero con `grep -n "function toggleManual" agencia/public/index.html` (agregada en la Task 3) para anclar justo después de su cierre. Agregar inmediatamente después:

```js
const SOPORTE_TEL='';
function pintarAyudaQuienesSomos(){
  const wrap=document.getElementById('ayuda-quienes-logo');
  const img=document.getElementById('ayuda-quienes-logo-img');
  if(CFG.logo_ruta){img.src=CFG.logo_ruta;wrap.style.display='block'}else{wrap.style.display='none'}
  document.getElementById('ayuda-quienes-nombre').textContent=CFG.nombre_negocio||'';
}
async function cargarAppInfo(){
  const el=document.getElementById('ayuda-info-body');
  try{
    const d=await api('GET','/app-info');
    const novedadesHtml=(d.novedades||[]).map(n=>`<li>${n}</li>`).join('');
    el.innerHTML=`<div style="font-weight:800;color:var(--navy);font-size:13px;margin-bottom:4px">${d.nombre}</div>
      <div>Versión: ${d.version}</div>
      <div>Última actualización: ${d.fecha_actualizacion}</div>
      <div style="margin-top:10px;font-weight:700">Novedades de esta versión</div>
      <ul style="margin:4px 0 0 16px;padding:0">${novedadesHtml}</ul>`;
  }catch(e){el.textContent='No se pudo cargar la información de la app.'}
}
function pintarAyudaSoporte(){
  const el=document.getElementById('ayuda-soporte-email');
  el.textContent=CFG.email?`Email: ${CFG.email}`:'Pendiente: email de contacto que proveerá el negocio.';
  const btn=document.getElementById('btn-soporte-wa');
  if(!SOPORTE_TEL){
    btn.disabled=true;
    btn.innerHTML='<i class="ti ti-brand-whatsapp"></i>Configura el número de soporte';
  }
}
function enviarWhatsAppSoporte(){
  if(!SOPORTE_TEL)return;
  const numero=normalizarTelWa(SOPORTE_TEL);
  const texto=encodeURIComponent('Hola, tengo una consulta sobre GRAFÍA Studio.');
  window.open(`https://wa.me/${numero}?text=${texto}`,'_blank');
}
```

- [ ] **Step 3: Verificar sintaxis**

Run: igual que Task 2 Step 6.
Expected: `OK`.

- [ ] **Step 4: Verificación funcional**

Run:
```bash
cd "i:/AGENCIA PEDIDOS/agencia"
npm start &
for i in 1 2 3 4 5 6 7 8 9 10; do curl -s -m 1 http://localhost:3000/ -o /dev/null && break; sleep 1; done
curl -s -m 5 http://localhost:3000/ | grep -c 'view-ayuda\|showHelpTab\|toggleManual\|pintarAyudaQuienesSomos\|cargarAppInfo\|pintarAyudaSoporte\|enviarWhatsAppSoporte'
TOKEN=$(curl -s -m 5 -X POST http://localhost:3000/api/auth/login -H "Content-Type: application/json" -d '{"pin":"1234"}' | grep -o '"token":"[^"]*"' | cut -d'"' -f4)
curl -s -m 5 -o /dev/null -w "app-info HTTP %{http_code}\n" http://localhost:3000/api/app-info -H "Authorization: Bearer $TOKEN"
PID=$(netstat -ano | grep ':3000' | grep LISTENING | head -1 | awk '{print $NF}'); [ -n "$PID" ] && taskkill //F //PID "$PID"
```
Expected: el `grep -c` da al menos `7`; `app-info` responde `HTTP 200`.

- [ ] **Step 5: Commit**

```bash
cd "i:/AGENCIA PEDIDOS/agencia"
git add public/index.html
git commit -m "[FEATURE] Ayuda y About: Quienes Somos, Info de la app, Terminos, Privacidad y Soporte (Fase 1F)"
```

---

## Task 5: Verificación final

- [ ] **Step 1: Suite combinada + regresión**

Run:
```bash
cd "i:/AGENCIA PEDIDOS/agencia"
node -c server.js && echo "server OK"
SCRATCH="C:/Users/ADMIN/AppData/Local/Temp/claude/i--AGENCIA-PEDIDOS/8d8d31ac-5619-43aa-9270-0aa1f2328221/scratchpad"
awk '/<script>/{f=1;next}/<\/script>/{f=0}f' public/index.html > "$SCRATCH/check.js"
node -c "$SCRATCH/check.js" && echo "script OK"
```
Expected: ambos `OK`.

- [ ] **Step 2: Regresión de endpoints existentes**

Run (servidor levantado, mismo patrón de espera): repetir contra `/api/pedidos`, `/api/clientes`, `/api/configuracion`, `/api/productos`, `/api/app-info` — confirmar `HTTP 200` en los 5. Confirmar `git status --short` sin cambios sin commitear.

- [ ] **Step 3: Checklist manual para el usuario (el agente no tiene navegador)**

Pedir al usuario que, en `npm start`, confirme: el sidebar muestra "Ayuda" con ícono de ayuda; al entrar, ve el Manual de Usuario con 10 pasos que se expanden/colapsan al hacer click; las otras 5 pestañas cambian correctamente; "Quiénes Somos" muestra el nombre/logo del negocio si ya los configuró en Configuración; "Información de la App" muestra versión y novedades; "Soporte" muestra su email si está configurado, y el botón de WhatsApp aparece deshabilitado (hasta que se configure un número real en el código).

- [ ] **Step 4: Push**

```bash
git push origin main
```
