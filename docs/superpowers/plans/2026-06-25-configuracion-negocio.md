# Configuración del Negocio — Plan de Implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Agregar una vista "Configuración" por workspace (Perfil del Negocio, Preferencias, Pedidos, Notificaciones) cuyos valores tienen efecto real verificable hoy mismo en la app.

**Architecture:** Una tabla nueva `configuracion_negocio` (1 fila por `workspace_id`), 3 endpoints REST nuevos en `server.js`, y una vista nueva en `public/index.html` que carga la config una vez tras login a un objeto global `CFG` del que ya leen las funciones de formato existentes (`fCOP`, `fd`, `faHTML`, el selector de tipo de pago, el default del checkbox de cotización).

**Tech Stack:** Node.js + Express + better-sqlite3 (backend), HTML/CSS/JS vanilla en un solo archivo (frontend), multer (subida de logo).

## Global Constraints

- Nunca interpolar strings con comillas simples en `onclick`/`oninput` — usar índices/ids, no construir HTML con el valor crudo de un campo de texto.
- Toda request del frontend que no sea multipart pasa por la función `api()` existente (`public/index.html:702`) — nunca `fetch()` directo, salvo subida de archivos (patrón ya usado en `subirArchivos`, que sí usa `fetch()` manual por ser `multipart/form-data`).
- Migraciones de esquema: `ALTER TABLE` siempre envuelto en `try/catch`. `CREATE TABLE IF NOT EXISTS` no necesita `try/catch` (ya es idempotente).
- Todo endpoint que toca tablas de negocio filtra por `req.wsId`.
- Nunca `git add -A` — agregar archivos por nombre explícito.
- `git push origin main` solo con confirmación explícita del usuario, nunca de forma autónoma.
- Sin framework de tests en este proyecto (verificación manual/curl, ver "Flujo de deploy" en la memoria del proyecto) — cada tarea usa `node -c`, `curl` y/o pasos manuales en el navegador en vez de tests automatizados.

---

## Task 1: Backend — tabla `configuracion_negocio`, defaults y `hoy()` consciente de zona horaria

**Files:**
- Modify: `agencia/server.js:121` (después del bloque de seed de `workspaces`)
- Modify: `agencia/server.js:178` (definición de `hoy()`)
- Modify: `agencia/server.js:248,373,375,396` (call-sites de `hoy()`)

**Interfaces:**
- Produces: `CFG_DEFAULTS` (objeto), `getConfiguracion(wsId)` (función, retorna objeto plano con los 16 campos de configuración, nunca `null`), `hoy(wsId)` (firma cambiada, ya no es `hoy()`).
- Consumes: nada nuevo — usa `db`, `uid`-style helpers ya existentes en el archivo.

- [ ] **Step 1: Crear la tabla y las constantes de validación**

En `server.js:121`, inmediatamente después de esta línea existente:

```js
  .forEach(([id,pin])=>{ try{ seedWs.run(id,`Workspace de prueba ${id.split('-')[1]}`,pin,'prueba'); }
  catch(e){ console.error('Seed workspace falló:',id,e.message); } });
```

agregar:

```js

// ── CONFIGURACIÓN DEL NEGOCIO (una fila por workspace) ──
db.exec(`CREATE TABLE IF NOT EXISTS configuracion_negocio(
  workspace_id TEXT PRIMARY KEY,
  nombre_negocio TEXT DEFAULT '',
  logo_ruta TEXT DEFAULT '',
  direccion TEXT DEFAULT '',
  telefono TEXT DEFAULT '',
  email TEXT DEFAULT '',
  nit TEXT DEFAULT '',
  moneda_prefijo TEXT DEFAULT '$',
  decimales INTEGER DEFAULT 0,
  separador_miles TEXT DEFAULT '.',
  formato_fecha TEXT DEFAULT 'DD/MM/AAAA',
  zona_horaria TEXT DEFAULT 'America/Bogota',
  dias_validez_cotizacion INTEGER DEFAULT 15,
  estado_default_cotizacion INTEGER DEFAULT 0,
  metodos_pago TEXT DEFAULT '["efectivo","transferencia","nequi","daviplata","otro"]',
  alertas_entrega INTEGER DEFAULT 1,
  dias_anticipacion_entrega INTEGER DEFAULT 3
)`);

const FORMATOS_FECHA=['DD/MM/AAAA','MM/DD/AAAA','AAAA-MM-DD'];
const SEPARADORES_MILES=['.',','];
const METODOS_PAGO_VALIDOS=['efectivo','transferencia','nequi','daviplata','contraentrega','otro'];
const ZONAS_HORARIAS=typeof Intl.supportedValuesOf==='function'
  ?new Set(Intl.supportedValuesOf('timeZone'))
  :new Set(['America/Bogota']);
const CFG_DEFAULTS={
  nombre_negocio:'',logo_ruta:'',direccion:'',telefono:'',email:'',nit:'',
  moneda_prefijo:'$',decimales:0,separador_miles:'.',formato_fecha:'DD/MM/AAAA',
  zona_horaria:'America/Bogota',dias_validez_cotizacion:15,estado_default_cotizacion:0,
  metodos_pago:['efectivo','transferencia','nequi','daviplata','otro'],
  alertas_entrega:1,dias_anticipacion_entrega:3
};
function getConfiguracion(wsId){
  const row=db.prepare('SELECT * FROM configuracion_negocio WHERE workspace_id=?').get(wsId);
  if(!row)return{...CFG_DEFAULTS};
  let metodos;
  try{const a=JSON.parse(row.metodos_pago);metodos=Array.isArray(a)?a:CFG_DEFAULTS.metodos_pago}
  catch(e){metodos=CFG_DEFAULTS.metodos_pago}
  return{
    nombre_negocio:row.nombre_negocio||'',
    logo_ruta:row.logo_ruta||'',
    direccion:row.direccion||'',
    telefono:row.telefono||'',
    email:row.email||'',
    nit:row.nit||'',
    moneda_prefijo:row.moneda_prefijo||CFG_DEFAULTS.moneda_prefijo,
    decimales:row.decimales?1:0,
    separador_miles:row.separador_miles||CFG_DEFAULTS.separador_miles,
    formato_fecha:row.formato_fecha||CFG_DEFAULTS.formato_fecha,
    zona_horaria:row.zona_horaria||CFG_DEFAULTS.zona_horaria,
    dias_validez_cotizacion:row.dias_validez_cotizacion??CFG_DEFAULTS.dias_validez_cotizacion,
    estado_default_cotizacion:row.estado_default_cotizacion?1:0,
    metodos_pago:metodos,
    alertas_entrega:row.alertas_entrega?1:0,
    dias_anticipacion_entrega:row.dias_anticipacion_entrega??CFG_DEFAULTS.dias_anticipacion_entrega
  };
}
```

- [ ] **Step 2: Verificar que el servidor levanta con la tabla nueva**

Run: `cd "i:/AGENCIA PEDIDOS/agencia" && node -c server.js && npm start`
Expected: arranca sin error (`✅ GRAFÍA Studio en http://localhost:3000`). Detener con Ctrl+C tras confirmar.

- [ ] **Step 3: Hacer `hoy()` consciente de la zona horaria del workspace**

En `server.js:178`, reemplazar:

```js
function hoy(){return new Date().toISOString().split('T')[0]}
```

por:

```js
function hoy(wsId){
  const tz=wsId?getConfiguracion(wsId).zona_horaria:CFG_DEFAULTS.zona_horaria;
  try{return new Date().toLocaleDateString('en-CA',{timeZone:tz})}
  catch(e){return new Date().toISOString().split('T')[0]}
}
```

- [ ] **Step 4: Actualizar los 4 call-sites de `hoy()`**

En `server.js:248` (función `addHist`), cambiar:

```js
  db.prepare('INSERT INTO historial(id,pedido_id,texto,fecha,hora,workspace_id)VALUES(?,?,?,?,?,?)').run(uid(),pid,txt,hoy(),ahora(),wsId);
```

por:

```js
  db.prepare('INSERT INTO historial(id,pedido_id,texto,fecha,hora,workspace_id)VALUES(?,?,?,?,?,?)').run(uid(),pid,txt,hoy(wsId),ahora(),wsId);
```

En `server.js:373` (`POST /api/pedidos`), dentro de la misma línea `.run(...)`, cambiar el argumento `hoy()` (penúltimo grupo antes de `b.fecha_entrega`) por `hoy(req.wsId)`. La línea completa pasa de:

```js
      .run(id,ref,cid,b.nombre.trim(),b.tel||'',b.urgente?1:0,b.entregado?1:0,b.cancelado?1:0,b.pendiente_pago?1:0,b.es_cotizacion?1:0,normVF(b.valor_final),normCalc(b.valor_final),hoy(),b.fecha_entrega||'',b.notas||'',req.wsId);
```

a:

```js
      .run(id,ref,cid,b.nombre.trim(),b.tel||'',b.urgente?1:0,b.entregado?1:0,b.cancelado?1:0,b.pendiente_pago?1:0,b.es_cotizacion?1:0,normVF(b.valor_final),normCalc(b.valor_final),hoy(req.wsId),b.fecha_entrega||'',b.notas||'',req.wsId);
```

En `server.js:375` (mismo handler `POST /api/pedidos`, default de fecha de pago), cambiar:

```js
    (b.pagos||[]).forEach(pg=>db.prepare('INSERT INTO pagos(id,pedido_id,monto,monto_calc,fecha,tipo,nota,workspace_id)VALUES(?,?,?,?,?,?,?,?)').run(uid(),id,pg.monto||'',normCalc(pg.monto),pg.fecha||hoy(),pg.tipo||'efectivo',pg.nota||'',req.wsId));
```

por:

```js
    (b.pagos||[]).forEach(pg=>db.prepare('INSERT INTO pagos(id,pedido_id,monto,monto_calc,fecha,tipo,nota,workspace_id)VALUES(?,?,?,?,?,?,?,?)').run(uid(),id,pg.monto||'',normCalc(pg.monto),pg.fecha||hoy(req.wsId),pg.tipo||'efectivo',pg.nota||'',req.wsId));
```

En `server.js:396` (`PUT /api/pedidos/:id`, mismo patrón), cambiar:

```js
    if(b.pagos!==undefined){db.prepare('DELETE FROM pagos WHERE pedido_id=? AND workspace_id=?').run(pid,req.wsId);(b.pagos||[]).forEach(pg=>db.prepare('INSERT INTO pagos(id,pedido_id,monto,monto_calc,fecha,tipo,nota,workspace_id)VALUES(?,?,?,?,?,?,?,?)').run(uid(),pid,pg.monto||'',normCalc(pg.monto),pg.fecha||hoy(),pg.tipo||'efectivo',pg.nota||'',req.wsId));}
```

por:

```js
    if(b.pagos!==undefined){db.prepare('DELETE FROM pagos WHERE pedido_id=? AND workspace_id=?').run(pid,req.wsId);(b.pagos||[]).forEach(pg=>db.prepare('INSERT INTO pagos(id,pedido_id,monto,monto_calc,fecha,tipo,nota,workspace_id)VALUES(?,?,?,?,?,?,?,?)').run(uid(),pid,pg.monto||'',normCalc(pg.monto),pg.fecha||hoy(req.wsId),pg.tipo||'efectivo',pg.nota||'',req.wsId));}
```

- [ ] **Step 5: Verificar sintaxis y arranque**

Run: `cd "i:/AGENCIA PEDIDOS/agencia" && node -c server.js && npm start`
Expected: arranca igual que en el Step 2. Probar `curl -s -X POST http://localhost:3000/api/auth/login -H "Content-Type: application/json" -d "{\"pin\":\"1234\"}"` (PIN local de pruebas) y confirmar que devuelve `{"token":"..."}`. Detener el servidor con Ctrl+C.

- [ ] **Step 6: Commit**

```bash
cd "i:/AGENCIA PEDIDOS/agencia"
git add server.js
git commit -m "[FEATURE] Configuracion: tabla configuracion_negocio y hoy() consciente de zona horaria"
```

---

## Task 2: Backend — endpoints `/api/configuracion`

**Files:**
- Modify: `agencia/server.js` — agregar bloque nuevo justo antes de `app.get('*',...)` (línea 508 en el archivo original, antes del Task 1; revisar el número de línea actual ya que Task 1 agregó código arriba).

**Interfaces:**
- Consumes: `getConfiguracion(wsId)`, `CFG_DEFAULTS`, `FORMATOS_FECHA`, `SEPARADORES_MILES`, `METODOS_PAGO_VALIDOS`, `ZONAS_HORARIAS` (todos de Task 1), `upload` (multer, ya existente en `server.js:175`), `logError` (ya existente).
- Produces: `GET /api/configuracion`, `PUT /api/configuracion`, `POST /api/configuracion/logo` — los tres exigen `Authorization: Bearer <token>` (ya cubierto por el middleware existente en `server.js:326`, que se aplica a todo `/api/*` salvo `/auth/login`).

- [ ] **Step 1: Agregar los tres endpoints**

Justo antes de la línea `app.get('*',(req,res)=>res.sendFile(path.join(__dirname,'public','index.html')));`, agregar:

```js
// ── CONFIGURACIÓN DEL NEGOCIO ──
app.get('/api/configuracion',(req,res)=>{
  res.json(getConfiguracion(req.wsId));
});

app.put('/api/configuracion',(req,res)=>{
  try{
    const b=req.body||{};
    const errores=[];
    if(b.formato_fecha!==undefined&&!FORMATOS_FECHA.includes(b.formato_fecha))errores.push('Formato de fecha no válido');
    if(b.separador_miles!==undefined&&!SEPARADORES_MILES.includes(b.separador_miles))errores.push('Separador de miles no válido');
    if(b.zona_horaria!==undefined&&!ZONAS_HORARIAS.has(b.zona_horaria))errores.push('Zona horaria no válida');
    if(b.metodos_pago!==undefined&&(!Array.isArray(b.metodos_pago)||b.metodos_pago.some(m=>!METODOS_PAGO_VALIDOS.includes(m))))errores.push('Métodos de pago no válidos');
    if(b.dias_validez_cotizacion!==undefined&&(!Number.isInteger(b.dias_validez_cotizacion)||b.dias_validez_cotizacion<0))errores.push('Días de validez de cotización no válido');
    if(b.dias_anticipacion_entrega!==undefined&&(!Number.isInteger(b.dias_anticipacion_entrega)||b.dias_anticipacion_entrega<0))errores.push('Días de anticipación no válido');
    if(errores.length)return res.status(400).json({error:errores.join('. ')});
    const actual=getConfiguracion(req.wsId);
    const nuevo={...actual,...b};
    db.prepare(`INSERT INTO configuracion_negocio
        (workspace_id,nombre_negocio,direccion,telefono,email,nit,moneda_prefijo,decimales,separador_miles,formato_fecha,zona_horaria,dias_validez_cotizacion,estado_default_cotizacion,metodos_pago,alertas_entrega,dias_anticipacion_entrega)
      VALUES(@workspace_id,@nombre_negocio,@direccion,@telefono,@email,@nit,@moneda_prefijo,@decimales,@separador_miles,@formato_fecha,@zona_horaria,@dias_validez_cotizacion,@estado_default_cotizacion,@metodos_pago,@alertas_entrega,@dias_anticipacion_entrega)
      ON CONFLICT(workspace_id) DO UPDATE SET
        nombre_negocio=excluded.nombre_negocio,direccion=excluded.direccion,telefono=excluded.telefono,
        email=excluded.email,nit=excluded.nit,moneda_prefijo=excluded.moneda_prefijo,decimales=excluded.decimales,
        separador_miles=excluded.separador_miles,formato_fecha=excluded.formato_fecha,zona_horaria=excluded.zona_horaria,
        dias_validez_cotizacion=excluded.dias_validez_cotizacion,estado_default_cotizacion=excluded.estado_default_cotizacion,
        metodos_pago=excluded.metodos_pago,alertas_entrega=excluded.alertas_entrega,dias_anticipacion_entrega=excluded.dias_anticipacion_entrega`)
      .run({
        workspace_id:req.wsId,
        nombre_negocio:nuevo.nombre_negocio||'',
        direccion:nuevo.direccion||'',
        telefono:nuevo.telefono||'',
        email:nuevo.email||'',
        nit:nuevo.nit||'',
        moneda_prefijo:nuevo.moneda_prefijo||'$',
        decimales:nuevo.decimales?1:0,
        separador_miles:nuevo.separador_miles||'.',
        formato_fecha:nuevo.formato_fecha||'DD/MM/AAAA',
        zona_horaria:nuevo.zona_horaria||'America/Bogota',
        dias_validez_cotizacion:Number.isInteger(nuevo.dias_validez_cotizacion)?nuevo.dias_validez_cotizacion:15,
        estado_default_cotizacion:nuevo.estado_default_cotizacion?1:0,
        metodos_pago:JSON.stringify(Array.isArray(nuevo.metodos_pago)?nuevo.metodos_pago:CFG_DEFAULTS.metodos_pago),
        alertas_entrega:nuevo.alertas_entrega?1:0,
        dias_anticipacion_entrega:Number.isInteger(nuevo.dias_anticipacion_entrega)?nuevo.dias_anticipacion_entrega:3
      });
    res.json(getConfiguracion(req.wsId));
  }catch(e){logError('PUT /api/configuracion',e);res.status(500).json({error:e.message})}
});

app.post('/api/configuracion/logo',upload.single('logo'),(req,res)=>{
  try{
    if(!req.file)return res.status(400).json({error:'No se recibió ningún archivo'});
    const ruta='/uploads/'+req.file.filename;
    db.prepare(`INSERT INTO configuracion_negocio(workspace_id,logo_ruta) VALUES(?,?)
      ON CONFLICT(workspace_id) DO UPDATE SET logo_ruta=excluded.logo_ruta`).run(req.wsId,ruta);
    res.json({logo_ruta:ruta});
  }catch(e){logError('POST /api/configuracion/logo',e);res.status(500).json({error:e.message})}
});

```

- [ ] **Step 2: Verificar sintaxis**

Run: `cd "i:/AGENCIA PEDIDOS/agencia" && node -c server.js`
Expected: sin salida (sin errores).

- [ ] **Step 3: Probar los 3 endpoints con curl**

Run (con el servidor levantado vía `npm start` en otra terminal, PIN local `1234`):

```bash
TOKEN=$(curl -s -X POST http://localhost:3000/api/auth/login -H "Content-Type: application/json" -d "{\"pin\":\"1234\"}" | grep -o '"token":"[^"]*"' | cut -d'"' -f4)
curl -s http://localhost:3000/api/configuracion -H "Authorization: Bearer $TOKEN"
```

Expected: JSON con los 16 campos default (`"moneda_prefijo":"$"`, `"dias_validez_cotizacion":15`, `"metodos_pago":["efectivo","transferencia","nequi","daviplata","otro"]`, etc.)

Run:

```bash
curl -s -X PUT http://localhost:3000/api/configuracion -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d "{\"nombre_negocio\":\"Prueba SAS\",\"dias_validez_cotizacion\":20,\"metodos_pago\":[\"efectivo\",\"otro\"]}"
```

Expected: JSON de respuesta con `"nombre_negocio":"Prueba SAS"`, `"dias_validez_cotizacion":20`, `"metodos_pago":["efectivo","otro"]`, y el resto de campos sin cambiar (siguen en sus defaults).

Run (caso de error, zona horaria inválida):

```bash
curl -s -X PUT http://localhost:3000/api/configuracion -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d "{\"zona_horaria\":\"Marte/Cráter\"}"
```

Expected: status 400, `{"error":"Zona horaria no válida"}`.

Detener el servidor con Ctrl+C al terminar.

- [ ] **Step 4: Commit**

```bash
cd "i:/AGENCIA PEDIDOS/agencia"
git add server.js
git commit -m "[FEATURE] Configuracion: endpoints GET/PUT /api/configuracion y POST /api/configuracion/logo"
```

---

## Task 3: Frontend — estructura HTML/CSS de la vista Configuración + acceso desde nav

**Files:**
- Modify: `agencia/public/index.html` (CSS ~línea 42, ~línea 350; sidebar ~línea 420-439; topbar ~línea 446-449; vista nueva después de la línea 500; mobile-nav sin cambios)

**Interfaces:**
- Produces: markup con ids `view-configuracion`, `cfg-perfil`, `cfg-preferencias`, `cfg-pedidos`, `cfg-notificaciones` (paneles), y todos los ids de campo individuales listados en el Step 2 (los consume Task 4/5).
- Consumes: clases ya existentes `fr2`, `fr3`, `fg`, `msec`, `ck-box`, `btn-pri`, `icon-btn`, `nav-item`.

- [ ] **Step 1: CSS — pestañas internas y elementos nuevos del sidebar**

En `public/index.html:42`, después de la línea:

```css
.sb-tagline{font-size:8px;font-weight:700;color:rgba(255,255,255,.2);letter-spacing:.14em;text-transform:uppercase;margin-top:6px;text-align:center}
```

agregar:

```css
.sb-bizname{font-size:10px;font-weight:800;color:rgba(255,255,255,.85);text-align:center;margin-top:8px;padding:0 8px}
```

En `public/index.html:350`, después de la línea:

```css
.reg-panel{display:none}.reg-panel.active{display:block}
```

agregar:

```css
.cfg-tabs{display:flex;gap:4px;margin-bottom:16px;flex-wrap:wrap}
.cfgtab{padding:6px 14px;border-radius:20px;border:1.5px solid var(--line);background:var(--white);color:var(--slate);font-size:10px;font-weight:700;cursor:pointer;transition:all .13s}
.cfgtab.active{border-color:var(--navy);background:var(--navy);color:white}
.cfg-panel{display:none}.cfg-panel.active{display:block}
.cfg-mp-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:12px}
.cfg-logo-prev{max-width:160px;max-height:80px;border-radius:var(--r-sm);border:1.5px solid var(--line);display:none;margin-bottom:8px}
```

En la sección `@media(max-width:768px)` (línea ~376-391), después de la línea `.checks-row{grid-template-columns:1fr 1fr}`, agregar:

```css
  .cfg-mp-grid{grid-template-columns:1fr 1fr}
```

- [ ] **Step 2: Sidebar — id del logo, nombre del negocio y acceso a Configuración**

En `public/index.html:421`, el `<img>` del logo empieza con este prefijo exacto (el resto de la línea es el base64, no se toca):

```
    <img src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAWgAAACLCAYAAABMQgNNAAABCGlDQ1BJQ0MgUHJvZmlsZQAAeJxjYGA8wQAELAYMDLl5JUVB7k4KEZFRCuwPGBiBEAwSk4sLGHADoKpv1yBqL+riUYcLcKakFicD6Q9ArFIEtBxopAiQ
```

Reemplazar únicamente ese prefijo por (agrega `id="sbLogoImg"`, sin tocar el resto de la línea):

```
    <img id="sbLogoImg" src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAWgAAACLCAYAAABMQgNNAAABCGlDQ1BJQ0MgUHJvZmlsZQAAeJxjYGA8wQAELAYMDLl5JUVB7k4KEZFRCuwPGBiBEAwSk4sLGHADoKpv1yBqL+riUYcLcKakFicD6Q9ArFIEtBxopAiQ
```

En `public/index.html:422`, cambiar:

```html
    <div class="sb-tagline">Sistema de gestión</div>
```

por:

```html
    <div class="sb-bizname" id="sbBizName" style="display:none"></div>
    <div class="sb-tagline">Sistema de gestión</div>
```

En `public/index.html:437` (dentro de `.sb-footer`), cambiar:

```html
    <button class="nav-item" onclick="abrirExp()"><i class="ti ti-download"></i>Exportar CSV</button>
```

por:

```html
    <button class="nav-item" data-view="configuracion" onclick="showView('configuracion')"><i class="ti ti-settings"></i>Configuración</button>
    <button class="nav-item" onclick="abrirExp()"><i class="ti ti-download"></i>Exportar CSV</button>
```

- [ ] **Step 3: Sidebar — dar `data-view` a los 3 ítems principales existentes (Pedidos/Clientes/Registros)**

En `public/index.html:426-428`, cambiar:

```html
    <button class="nav-item active" onclick="showView('pedidos')"><i class="ti ti-clipboard-list"></i>Pedidos<span class="nb g" id="sb-act">0</span></button>
    <button class="nav-item" onclick="showView('clientes')"><i class="ti ti-users"></i>Clientes</button>
    <button class="nav-item" onclick="showView('registros')"><i class="ti ti-chart-bar"></i>Registros</button>
```

por:

```html
    <button class="nav-item active" data-view="pedidos" onclick="showView('pedidos')"><i class="ti ti-clipboard-list"></i>Pedidos<span class="nb g" id="sb-act">0</span></button>
    <button class="nav-item" data-view="clientes" onclick="showView('clientes')"><i class="ti ti-users"></i>Clientes</button>
    <button class="nav-item" data-view="registros" onclick="showView('registros')"><i class="ti ti-chart-bar"></i>Registros</button>
```

(El `data-view="configuracion"` del nuevo botón ya quedó puesto en el Step 2. Esto reemplaza el sistema de índices posicionales `nIdx` por selección directa — ver Task 4 Step 6 — porque insertar un 4º ítem activable rompía la cuenta manual de índices.)

- [ ] **Step 4: Topbar — ícono de acceso para mobile**

En `public/index.html:448`, cambiar:

```html
      <button class="icon-btn" onclick="abrirExp()"><i class="ti ti-download"></i></button>
```

por:

```html
      <button class="icon-btn" onclick="showView('configuracion')"><i class="ti ti-settings"></i></button>
      <button class="icon-btn" onclick="abrirExp()"><i class="ti ti-download"></i></button>
```

- [ ] **Step 5: Markup de la vista Configuración**

Después de la línea 500 (`</div>`, cierre de `view-registros`) y antes de la línea 502 (`</div>` cierre de `.content`), agregar:

```html
    <!-- CONFIGURACIÓN -->
    <div id="view-configuracion" class="view">
      <div class="cfg-tabs">
        <button class="cfgtab active" onclick="showCfgTab('perfil')">Perfil del negocio</button>
        <button class="cfgtab" onclick="showCfgTab('preferencias')">Preferencias</button>
        <button class="cfgtab" onclick="showCfgTab('pedidos')">Pedidos</button>
        <button class="cfgtab" onclick="showCfgTab('notificaciones')">Notificaciones</button>
      </div>

      <div id="cfg-perfil" class="cfg-panel active">
        <div class="msec"><span class="tri"></span>Identidad</div>
        <img class="cfg-logo-prev" id="cfg-logo-preview">
        <div class="fg" style="margin-bottom:12px">
          <label>Logo del negocio</label><br>
          <button class="btn-pri" type="button" onclick="document.getElementById('cfg-logo-inp').click()"><i class="ti ti-upload"></i> Subir logo</button>
          <input type="file" id="cfg-logo-inp" accept="image/*" style="display:none" onchange="subirLogoCfg(event)">
        </div>
        <div class="fr2 fg">
          <div><label>Nombre del negocio</label><input type="text" id="cfg-nombre" placeholder="GRAFÍA Studio"></div>
          <div><label>NIT o cédula</label><input type="text" id="cfg-nit" placeholder="Opcional"></div>
        </div>
        <div class="fr2 fg">
          <div><label>Teléfono</label><input type="text" id="cfg-telefono" placeholder="310 000 0000"></div>
          <div><label>Email</label><input type="text" id="cfg-email" placeholder="contacto@negocio.com"></div>
        </div>
        <div class="fg"><label>Dirección</label><input type="text" id="cfg-direccion" placeholder="Opcional"></div>
      </div>

      <div id="cfg-preferencias" class="cfg-panel">
        <div class="msec"><span class="tri"></span>Moneda y formato</div>
        <div class="fr3 fg">
          <div><label>Prefijo de moneda</label><input type="text" id="cfg-moneda-prefijo" placeholder="$"></div>
          <div><label>Separador de miles</label>
            <select id="cfg-separador">
              <option value=".">Punto (1.000)</option>
              <option value=",">Coma (1,000)</option>
            </select>
          </div>
          <div><label>Formato de fecha</label>
            <select id="cfg-formato-fecha">
              <option value="DD/MM/AAAA">DD/MM/AAAA</option>
              <option value="MM/DD/AAAA">MM/DD/AAAA</option>
              <option value="AAAA-MM-DD">AAAA-MM-DD</option>
            </select>
          </div>
        </div>
        <div class="ck-box" style="display:inline-flex;margin-bottom:12px"><input type="checkbox" id="cfg-decimales"><label for="cfg-decimales">Mostrar decimales (22.000,00 en vez de 22.000)</label></div>
        <div class="fg"><label>Zona horaria</label><select id="cfg-zona-horaria"></select></div>
      </div>

      <div id="cfg-pedidos" class="cfg-panel">
        <div class="msec"><span class="tri"></span>Cotizaciones</div>
        <div class="fr2 fg">
          <div><label>Días de validez de la cotización</label><input type="number" id="cfg-dias-validez" min="0" placeholder="15"></div>
          <div style="display:flex;align-items:flex-end;padding-bottom:8px">
            <div class="ck-box"><input type="checkbox" id="cfg-estado-default-cot"><label for="cfg-estado-default-cot">Los pedidos nuevos inician como Cotización</label></div>
          </div>
        </div>
        <div class="msec"><span class="tri"></span>Métodos de pago habilitados</div>
        <div class="cfg-mp-grid">
          <div class="ck-box"><input type="checkbox" id="cfg-mp-efectivo"><label for="cfg-mp-efectivo">Efectivo</label></div>
          <div class="ck-box"><input type="checkbox" id="cfg-mp-transferencia"><label for="cfg-mp-transferencia">Transferencia</label></div>
          <div class="ck-box"><input type="checkbox" id="cfg-mp-nequi"><label for="cfg-mp-nequi">Nequi</label></div>
          <div class="ck-box"><input type="checkbox" id="cfg-mp-daviplata"><label for="cfg-mp-daviplata">Daviplata</label></div>
          <div class="ck-box"><input type="checkbox" id="cfg-mp-contraentrega"><label for="cfg-mp-contraentrega">Contraentrega</label></div>
          <div class="ck-box"><input type="checkbox" id="cfg-mp-otro"><label for="cfg-mp-otro">Otro</label></div>
        </div>
      </div>

      <div id="cfg-notificaciones" class="cfg-panel">
        <div class="msec"><span class="tri"></span>Alertas de entrega</div>
        <div class="ck-box" style="display:inline-flex;margin-bottom:12px"><input type="checkbox" id="cfg-alertas-entrega"><label for="cfg-alertas-entrega">Avisar cuando se acerque la fecha de entrega</label></div>
        <div class="fg" style="max-width:220px"><label>Días de anticipación</label><input type="number" id="cfg-dias-anticipacion" min="0" placeholder="3"></div>
      </div>

      <button class="btn-pri" style="margin-top:18px" onclick="guardarConfiguracion()"><i class="ti ti-device-floppy"></i> Guardar configuración</button>
    </div>

```

- [ ] **Step 6: Verificación visual manual**

Run: `cd "i:/AGENCIA PEDIDOS/agencia" && npm start`, abrir `http://localhost:3000`, ingresar PIN `1234`.

Expected:
- El sidebar muestra un nuevo ítem "Configuración" con ícono de engranaje, antes de "Exportar CSV".
- La topbar muestra un ícono de engranaje nuevo a la izquierda del ícono de descarga.
- Click en cualquiera de los dos abre la vista con 4 pestañas (Perfil del negocio / Preferencias / Pedidos / Notificaciones) — el cambio de pestaña ya funciona (clase `cfgtab`/`cfg-panel`/`showCfgTab` se conecta en el Task 4) aunque por ahora `showCfgTab` no existe todavía: es normal que dé error en consola al hacer click en una pestaña distinta a "Perfil del negocio" hasta completar el Task 4. Confirmar solo que la vista carga y la primera pestaña se ve bien (campos, botón "Guardar configuración", logo de subida).
- Pedidos/Clientes/Registros siguen funcionando exactamente igual que antes (el cambio de `nIdx` a `data-view` no rompe el resaltado del ítem activo en el sidebar).

Detener con Ctrl+C.

- [ ] **Step 7: Commit**

```bash
cd "i:/AGENCIA PEDIDOS/agencia"
git add public/index.html
git commit -m "[FEATURE] Configuracion: markup, CSS y acceso desde sidebar/topbar"
```

---

## Task 4: Frontend — carga, render y guardado de la Configuración (JS)

**Files:**
- Modify: `agencia/public/index.html` (agregar bloque de funciones nuevo después de la línea 722, justo después de `function fCOP(...)`/antes de `function ini(...)`; modificar `showView` ~línea 814-826; modificar `init()` ~línea 1608-1619)

**Interfaces:**
- Consumes: `api()` (`public/index.html:702`), `getToken()`/`clearToken()`/`showPinScreen()` (`public/index.html:663-674`), `toast()` (`public/index.html:724`).
- Produces: `CFG` (objeto global), `CFG_DEFAULTS`, `METODOS_PAGO_CATALOGO`, `cargarConfiguracion()`, `aplicarPerfilNegocio()`, `pintarConfiguracion()`, `pintarZonasHorarias()`, `showCfgTab(tab)`, `guardarConfiguracion()`, `subirLogoCfg(e)` — todos usados por Task 5 y por el markup del Task 3.

- [ ] **Step 1: Agregar el objeto `CFG` global y el catálogo de métodos de pago**

Después de `public/index.html:722` (`function ini(n){...}`), agregar:

```js
/* ══ CONFIGURACIÓN DEL NEGOCIO ══ */
const METODOS_PAGO_CATALOGO=[
  {key:'efectivo',label:'Efectivo'},
  {key:'transferencia',label:'Transferencia'},
  {key:'nequi',label:'Nequi'},
  {key:'daviplata',label:'Daviplata'},
  {key:'contraentrega',label:'Contraentrega'},
  {key:'otro',label:'Otro'}
];
const CFG_DEFAULTS={
  nombre_negocio:'',logo_ruta:'',direccion:'',telefono:'',email:'',nit:'',
  moneda_prefijo:'$',decimales:0,separador_miles:'.',formato_fecha:'DD/MM/AAAA',
  zona_horaria:'America/Bogota',dias_validez_cotizacion:15,estado_default_cotizacion:0,
  metodos_pago:['efectivo','transferencia','nequi','daviplata','otro'],
  alertas_entrega:1,dias_anticipacion_entrega:3
};
let CFG={...CFG_DEFAULTS};

async function cargarConfiguracion(){
  try{
    CFG=Object.assign({},CFG_DEFAULTS,await api('GET','/configuracion'));
  }catch(e){
    CFG=Object.assign({},CFG_DEFAULTS);
    console.warn('Configuración:',e.message);
  }
  aplicarPerfilNegocio();
}

function aplicarPerfilNegocio(){
  if(CFG.logo_ruta)document.getElementById('sbLogoImg').src=CFG.logo_ruta;
  const elN=document.getElementById('sbBizName');
  if(CFG.nombre_negocio){elN.textContent=CFG.nombre_negocio;elN.style.display='block'}
  else{elN.style.display='none'}
}

function pintarZonasHorarias(){
  const sel=document.getElementById('cfg-zona-horaria');
  if(sel.options.length)return;
  const zonas=typeof Intl.supportedValuesOf==='function'?Intl.supportedValuesOf('timeZone'):['America/Bogota'];
  sel.innerHTML=zonas.map(z=>`<option value="${z}">${z}</option>`).join('');
}

function pintarConfiguracion(){
  document.getElementById('cfg-nombre').value=CFG.nombre_negocio||'';
  document.getElementById('cfg-direccion').value=CFG.direccion||'';
  document.getElementById('cfg-telefono').value=CFG.telefono||'';
  document.getElementById('cfg-email').value=CFG.email||'';
  document.getElementById('cfg-nit').value=CFG.nit||'';
  const prev=document.getElementById('cfg-logo-preview');
  if(CFG.logo_ruta){prev.src=CFG.logo_ruta;prev.style.display='block'}
  else{prev.style.display='none'}
  document.getElementById('cfg-moneda-prefijo').value=CFG.moneda_prefijo;
  document.getElementById('cfg-decimales').checked=!!CFG.decimales;
  document.getElementById('cfg-separador').value=CFG.separador_miles;
  document.getElementById('cfg-formato-fecha').value=CFG.formato_fecha;
  pintarZonasHorarias();
  document.getElementById('cfg-zona-horaria').value=CFG.zona_horaria;
  document.getElementById('cfg-dias-validez').value=CFG.dias_validez_cotizacion;
  document.getElementById('cfg-estado-default-cot').checked=!!CFG.estado_default_cotizacion;
  METODOS_PAGO_CATALOGO.forEach(m=>{
    const el=document.getElementById('cfg-mp-'+m.key);
    if(el)el.checked=CFG.metodos_pago.includes(m.key);
  });
  document.getElementById('cfg-alertas-entrega').checked=!!CFG.alertas_entrega;
  document.getElementById('cfg-dias-anticipacion').value=CFG.dias_anticipacion_entrega;
}

function showCfgTab(tab){
  document.querySelectorAll('.cfg-panel').forEach(x=>x.classList.remove('active'));
  document.querySelectorAll('.cfgtab').forEach(x=>x.classList.remove('active'));
  document.getElementById('cfg-'+tab).classList.add('active');
  ['perfil','preferencias','pedidos','notificaciones'].forEach((t,i)=>{if(t===tab)document.querySelectorAll('.cfgtab')[i].classList.add('active')});
}

async function guardarConfiguracion(){
  const metodos=METODOS_PAGO_CATALOGO.map(m=>m.key).filter(k=>document.getElementById('cfg-mp-'+k)?.checked);
  const payload={
    nombre_negocio:document.getElementById('cfg-nombre').value.trim(),
    direccion:document.getElementById('cfg-direccion').value.trim(),
    telefono:document.getElementById('cfg-telefono').value.trim(),
    email:document.getElementById('cfg-email').value.trim(),
    nit:document.getElementById('cfg-nit').value.trim(),
    moneda_prefijo:document.getElementById('cfg-moneda-prefijo').value.trim()||'$',
    decimales:document.getElementById('cfg-decimales').checked?1:0,
    separador_miles:document.getElementById('cfg-separador').value,
    formato_fecha:document.getElementById('cfg-formato-fecha').value,
    zona_horaria:document.getElementById('cfg-zona-horaria').value,
    dias_validez_cotizacion:parseInt(document.getElementById('cfg-dias-validez').value,10)||15,
    estado_default_cotizacion:document.getElementById('cfg-estado-default-cot').checked?1:0,
    metodos_pago:metodos,
    alertas_entrega:document.getElementById('cfg-alertas-entrega').checked?1:0,
    dias_anticipacion_entrega:parseInt(document.getElementById('cfg-dias-anticipacion').value,10)||3
  };
  try{
    CFG=Object.assign({},CFG_DEFAULTS,await api('PUT','/configuracion',payload));
    aplicarPerfilNegocio();
    toast('Configuración guardada');
  }catch(e){toast(e.message,false)}
}

async function subirLogoCfg(e){
  const file=e.target.files[0];
  if(!file)return;
  const formData=new FormData();
  formData.append('logo',file);
  const tk=getToken();
  const r=await fetch('/api/configuracion/logo',{method:'POST',body:formData,headers:tk?{'Authorization':'Bearer '+tk}:{}});
  if(r.status===401){clearToken();showPinScreen('Sesión expirada, ingresa el PIN de nuevo');return}
  const data=await r.json();
  if(!r.ok){toast(data.error||'Error al subir el logo',false);return}
  CFG.logo_ruta=data.logo_ruta;
  document.getElementById('cfg-logo-preview').src=data.logo_ruta;
  document.getElementById('cfg-logo-preview').style.display='block';
  aplicarPerfilNegocio();
  toast('Logo actualizado');
}
```

- [ ] **Step 2: Verificar sintaxis del bloque `<script>`**

Run:

```bash
cd "i:/AGENCIA PEDIDOS/agencia"
SCRATCH="C:/Users/ADMIN/AppData/Local/Temp/claude/i--AGENCIA-PEDIDOS/8d8d31ac-5619-43aa-9270-0aa1f2328221/scratchpad"
awk '/<script>/{f=1;next}/<\/script>/{f=0}f' public/index.html > "$SCRATCH/check.js"
node -c "$SCRATCH/check.js"
```

Expected: sin salida (sin errores de sintaxis).

- [ ] **Step 3: Conectar `cargarConfiguracion()` y `pintarConfiguracion()` al ciclo de vida de la app**

En `public/index.html:1608-1619`, cambiar:

```js
async function init(){
  // Pintar la interfaz SIEMPRE, aunque no haya servidor
  renderFiltros();
  document.getElementById('stats').innerHTML=`
    <div class="sc-mini dark"><div class="ico"><i class="ti ti-clipboard-list"></i></div><div><div class="num">—</div><div class="lbl">Pedidos activos</div></div></div>
    <div class="sc-mini light"><div class="ico"><i class="ti ti-package"></i></div><div><div class="num">—</div><div class="lbl">Listos para entregar</div></div></div>`;
  try{await cargarStats()}catch(e){console.warn('Stats:',e.message)}
  try{await cargarPedidos()}catch(e){
    console.warn('Pedidos:',e.message);
    document.getElementById('lista').innerHTML='<div class="empty"><i class="ti ti-plug-x"></i><p>'+e.message+'</p></div>';
  }
}
```

por:

```js
async function init(){
  // Pintar la interfaz SIEMPRE, aunque no haya servidor
  renderFiltros();
  document.getElementById('stats').innerHTML=`
    <div class="sc-mini dark"><div class="ico"><i class="ti ti-clipboard-list"></i></div><div><div class="num">—</div><div class="lbl">Pedidos activos</div></div></div>
    <div class="sc-mini light"><div class="ico"><i class="ti ti-package"></i></div><div><div class="num">—</div><div class="lbl">Listos para entregar</div></div></div>`;
  try{await cargarConfiguracion()}catch(e){console.warn('Configuración:',e.message)}
  try{await cargarStats()}catch(e){console.warn('Stats:',e.message)}
  try{await cargarPedidos()}catch(e){
    console.warn('Pedidos:',e.message);
    document.getElementById('lista').innerHTML='<div class="empty"><i class="ti ti-plug-x"></i><p>'+e.message+'</p></div>';
  }
}
```

En `showView()` (`public/index.html:814-826`), cambiar todo el bloque:

```js
function showView(v){
  document.querySelectorAll('.view').forEach(x=>x.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(x=>x.classList.remove('active'));
  document.querySelectorAll('.mob-btn').forEach(x=>x.classList.remove('active'));
  document.getElementById('view-'+v).classList.add('active');
  const titles={pedidos:'Pedidos',clientes:'Clientes',registros:'Registros'};
  document.getElementById('tb-title').textContent=titles[v]||'';
  const nIdx={pedidos:0,clientes:1,registros:2};
  document.querySelectorAll('.nav-item').forEach(x=>x.classList.remove('active'));
  document.querySelectorAll('.nav-item')[nIdx[v]]?.classList.add('active');
  document.querySelectorAll('.mob-btn')[{pedidos:0,clientes:2,registros:3}[v]||0]?.classList.add('active');
  if(v==='clientes')cargarClientes();
  if(v==='registros'){renderRegistros();showReg('ingresos');}
}
```

por:

```js
function showView(v){
  document.querySelectorAll('.view').forEach(x=>x.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(x=>x.classList.remove('active'));
  document.querySelectorAll('.mob-btn').forEach(x=>x.classList.remove('active'));
  document.getElementById('view-'+v).classList.add('active');
  const titles={pedidos:'Pedidos',clientes:'Clientes',registros:'Registros',configuracion:'Configuración'};
  document.getElementById('tb-title').textContent=titles[v]||'';
  document.querySelector(`.nav-item[data-view="${v}"]`)?.classList.add('active');
  document.querySelectorAll('.mob-btn')[{pedidos:0,clientes:2,registros:3}[v]||0]?.classList.add('active');
  if(v==='clientes')cargarClientes();
  if(v==='registros'){renderRegistros();showReg('ingresos');}
  if(v==='configuracion')pintarConfiguracion();
}
```

(Nota: para `v==='configuracion'` el `mob-btn` que se resalta por defecto es el índice `0` por el `||0` del mapeo — esto es inofensivo porque el botón "Configuración" no existe en `.mob-nav`, así que en mobile solo se llega a esta vista por el ícono de la topbar, que no participa del resaltado de `.mob-btn`.)

- [ ] **Step 4: Verificar sintaxis de nuevo**

Run: igual que el Step 2.
Expected: sin errores.

- [ ] **Step 5: Verificación manual**

Run: `npm start`, abrir la app, ingresar PIN.

Expected:
- Click en "Configuración" (sidebar o topbar): se ve la pestaña "Perfil del negocio" con todos los campos vacíos (primera vez, sin config guardada).
- Cambiar de pestaña (Preferencias/Pedidos/Notificaciones) funciona y muestra los valores default: prefijo `$`, separador "Punto (1.000)", formato `DD/MM/AAAA`, zona horaria con un `<select>` largo (decenas de zonas IANA) con `America/Bogota` seleccionado, 15 días de validez, checkbox de cotización por defecto sin marcar, los 5 métodos de pago ya marcados (`Contraentrega` sin marcar), alertas de entrega marcadas, 3 días de anticipación.
- Cambiar el nombre del negocio a algo como "Prueba Studio", click "Guardar configuración": aparece el toast verde "Configuración guardada", y el sidebar ahora muestra "Prueba Studio" como texto debajo del logo.
- Subir un logo (cualquier imagen pequeña): aparece toast "Logo actualizado", la vista previa se llena, y el logo del sidebar cambia de inmediato.
- Recargar la página (F5) y volver a entrar con el PIN: la Configuración sigue mostrando "Prueba Studio" y el logo subido (persistencia confirmada).

Detener con Ctrl+C.

- [ ] **Step 6: Commit**

```bash
cd "i:/AGENCIA PEDIDOS/agencia"
git add public/index.html
git commit -m "[FEATURE] Configuracion: carga, render y guardado (CFG global, logo, zonas horarias)"
```

---

## Task 5: Frontend — rewiring real (fCOP, fd, faHTML, pagos, cotización, hoy)

**Files:**
- Modify: `agencia/public/index.html:719-721` (`hoy`, `fd`, `fCOP`)
- Modify: `agencia/public/index.html:793-803` (`faHTML`)
- Modify: `agencia/public/index.html:918` (badge de cotización en la lista)
- Modify: `agencia/public/index.html:1228-1234` (select de tipo de pago)
- Modify: `agencia/public/index.html:1332` (default del checkbox de cotización en `resetForm`)
- Modify: `agencia/public/index.html:1383` (texto de validez en la ficha del pedido)

**Interfaces:**
- Consumes: `CFG` (Task 4).
- Produces: `sumarDias(s,n)`, `fmtMiles(v,sep)`, `validezCotHTML(p)` (helpers nuevos); `fd`, `fCOP`, `faHTML`, `hoy` (frontend) con comportamiento cambiado — mismas firmas, mismos nombres.

- [ ] **Step 1: `hoy()`, `fd()`, `fCOP()` conscientes de `CFG`**

En `public/index.html:719-721`, cambiar:

```js
function hoy(){return new Date().toISOString().split('T')[0]}
function fd(s){if(!s)return'—';const[y,m,d]=s.split('-');return`${d}/${m}/${y}`}
function fCOP(n){const v=parseInt(String(n||0).replace(/\D/g,''))||0;return'$'+v.toLocaleString('es-CO')}
```

por:

```js
function hoy(){
  try{return new Date().toLocaleDateString('en-CA',{timeZone:CFG.zona_horaria})}
  catch(e){return new Date().toISOString().split('T')[0]}
}
function sumarDias(s,n){const d=new Date(s+'T00:00:00');d.setDate(d.getDate()+n);return d.toISOString().split('T')[0]}
function fd(s){
  if(!s)return'—';
  const[y,m,d]=s.split('-');
  if(CFG.formato_fecha==='MM/DD/AAAA')return`${m}/${d}/${y}`;
  if(CFG.formato_fecha==='AAAA-MM-DD')return`${y}-${m}-${d}`;
  return`${d}/${m}/${y}`;
}
function fmtMiles(v,sep){
  const s=String(Math.abs(Math.round(v)));
  let out='';
  for(let i=0;i<s.length;i++){
    if(i>0&&(s.length-i)%3===0)out+=sep;
    out+=s[i];
  }
  return(v<0?'-':'')+out;
}
function fCOP(n){
  const v=parseInt(String(n||0).replace(/\D/g,''))||0;
  const miles=fmtMiles(v,CFG.separador_miles);
  const dec=CFG.decimales?(CFG.separador_miles==='.'?',00':'.00'):'';
  return CFG.moneda_prefijo+miles+dec;
}
```

(`hoy()` ya no necesita parámetro en el frontend porque no hay multi-workspace dentro de una misma pestaña del navegador — `CFG` ya es del workspace correcto tras el login.)

- [ ] **Step 2: `faHTML()` con alertas configurables**

En `public/index.html:793-803`, cambiar:

```js
function faHTML(p){
  if(!p.fecha_entrega||p.entregado||p.cancelado)return'';
  const hoyD=new Date();hoyD.setHours(0,0,0,0);
  const entD=new Date(p.fecha_entrega+'T00:00:00');
  const d=Math.round((entD-hoyD)/86400000);
  if(d<0)return`<span class="fa-red">⚠ Vencido ${Math.abs(d)}d</span>`;
  if(d===0)return`<span class="fa-red">⚠ Vence hoy</span>`;
  if(d===1)return`<span class="fa-amb">⏰ Mañana</span>`;
  return`<span class="fa-ok"><i class="ti ti-calendar-due" style="font-size:10px;vertical-align:-1px"></i> ${fd(p.fecha_entrega)}</span>`;
}
```

por:

```js
function faHTML(p){
  if(!CFG.alertas_entrega||!p.fecha_entrega||p.entregado||p.cancelado)return'';
  const hoyD=new Date();hoyD.setHours(0,0,0,0);
  const entD=new Date(p.fecha_entrega+'T00:00:00');
  const d=Math.round((entD-hoyD)/86400000);
  if(d<0)return`<span class="fa-red">⚠ Vencido ${Math.abs(d)}d</span>`;
  if(d===0)return`<span class="fa-red">⚠ Vence hoy</span>`;
  if(d===1)return`<span class="fa-amb">⏰ Mañana</span>`;
  if(d>1&&d<=CFG.dias_anticipacion_entrega)return`<span class="fa-amb">⏰ En ${d}d</span>`;
  return`<span class="fa-ok"><i class="ti ti-calendar-due" style="font-size:10px;vertical-align:-1px"></i> ${fd(p.fecha_entrega)}</span>`;
}
```

- [ ] **Step 3: "Válida hasta" en el badge de cotización (lista) y helper `validezCotHTML`**

Agregar este helper inmediatamente después de la función `faHTML` (recién editada en el Step 2):

```js
function validezCotHTML(p){
  if(!p.es_cotizacion||!p.fecha_pedido)return'';
  return` · Válida hasta ${fd(sumarDias(p.fecha_pedido,CFG.dias_validez_cotizacion))}`;
}
```

En `public/index.html:918`, cambiar:

```js
            ${isCot?'<span class="b-cot">📋 COTIZACIÓN</span>':''}
```

por:

```js
            ${isCot?`<span class="b-cot">📋 COTIZACIÓN${validezCotHTML(p)}</span>`:''}
```

- [ ] **Step 4: Selector de tipo de pago filtrado por métodos habilitados**

En `public/index.html:1228-1234`, cambiar:

```js
          <select onchange="setPagVal('${pg.id}','tipo',this.value)">
            <option value="efectivo"${pg.tipo==='efectivo'?' selected':''}>Efectivo</option>
            <option value="transferencia"${pg.tipo==='transferencia'?' selected':''}>Transferencia</option>
            <option value="nequi"${pg.tipo==='nequi'?' selected':''}>Nequi</option>
            <option value="daviplata"${pg.tipo==='daviplata'?' selected':''}>Daviplata</option>
            <option value="otro"${pg.tipo==='otro'?' selected':''}>Otro</option>
          </select>
```

por:

```js
          <select onchange="setPagVal('${pg.id}','tipo',this.value)">
            ${METODOS_PAGO_CATALOGO.filter(m=>CFG.metodos_pago.includes(m.key)||m.key===pg.tipo).map(m=>
              `<option value="${m.key}"${pg.tipo===m.key?' selected':''}>${m.label}</option>`
            ).join('')}
          </select>
```

- [ ] **Step 5: Default del checkbox de Cotización en pedidos nuevos**

En `public/index.html:1332`, justo después de esta línea (que sigue resetando los 5 checkboxes a `false`, sin cambios):

```js
  ['ck-urg','ck-ent','ck-can','ck-pnd','ck-cot'].forEach(id=>{const e=document.getElementById(id);if(e)e.checked=false});
```

agregar una línea nueva inmediatamente debajo:

```js
  document.getElementById('ck-cot').checked=!!CFG.estado_default_cotizacion;
```

- [ ] **Step 6: "Válida hasta" en la ficha del pedido (modal)**

En `public/index.html:1383`, cambiar:

```js
  document.getElementById('m-ref').textContent='#'+p.ref+' · '+fd(p.fecha_pedido);
```

por:

```js
  document.getElementById('m-ref').textContent='#'+p.ref+' · '+fd(p.fecha_pedido)+validezCotHTML(p);
```

- [ ] **Step 7: Verificar sintaxis**

Run: igual que Task 4 Step 2 (extraer `<script>` y `node -c`).
Expected: sin errores.

- [ ] **Step 8: Verificación manual end-to-end**

Run: `npm start`, abrir la app, ingresar PIN.

Expected:
- En Configuración → Preferencias: cambiar separador de miles a "Coma (1,000)", marcar "Mostrar decimales", guardar. Volver a Pedidos: los valores en las tarjetas ahora se ven como `$22,000.00` en vez de `$22.000`.
- Cambiar formato de fecha a `AAAA-MM-DD`, guardar. Las fechas en las tarjetas (`fd(p.fecha_pedido)`) cambian de `25/06/2026` a `2026-06-25`.
- Crear una cotización nueva (marcar el checkbox "Cotización" al crear un pedido): la tarjeta en la lista muestra `📋 COTIZACIÓN · Válida hasta <fecha+15d>`. Abrir la ficha del pedido: el encabezado bajo el título también muestra `· Válida hasta <fecha>`.
- En Configuración → Pedidos: marcar "Los pedidos nuevos inician como Cotización", guardar. Click en "Nuevo pedido": el checkbox "Cotización" ya aparece marcado por defecto.
- En Configuración → Pedidos: desmarcar "Contraentrega" permanece sin marcar por defecto; marcarlo y guardar. Abrir un pedido y "Registrar pago/abono": el selector de tipo ahora incluye "Contraentrega".
- En Configuración → Notificaciones: cambiar días de anticipación a `5`, guardar. Un pedido con fecha de entrega dentro de 4 días ahora muestra el aviso ámbar "⏰ En 4d" en la lista (antes solo avisaba el día anterior).
- Desmarcar "Avisar cuando se acerque la fecha de entrega", guardar: ningún pedido muestra ya el ícono/aviso de fecha de entrega en la lista, sin importar qué tan próxima esté.
- Revertir separador/decimales/formato de fecha a los valores default y confirmar que la lista vuelve a verse exactamente como al principio (`$22.000`, `25/06/2026`).

Detener con Ctrl+C.

- [ ] **Step 9: Commit**

```bash
cd "i:/AGENCIA PEDIDOS/agencia"
git add public/index.html
git commit -m "[FEATURE] Configuracion: conectar fCOP, fd, alertas de entrega, pagos y cotizacion a CFG"
```

---

## Task 6: Verificación final y deploy

**Files:** ninguno (solo verificación y, si el usuario lo confirma, push).

- [ ] **Step 1: Suite completa de verificación local**

Run:

```bash
cd "i:/AGENCIA PEDIDOS/agencia"
node -c server.js
SCRATCH="C:/Users/ADMIN/AppData/Local/Temp/claude/i--AGENCIA-PEDIDOS/8d8d31ac-5619-43aa-9270-0aa1f2328221/scratchpad"
awk '/<script>/{f=1;next}/<\/script>/{f=0}f' public/index.html > "$SCRATCH/check.js"
node -c "$SCRATCH/check.js"
```

Expected: ambos comandos sin salida (sin errores).

- [ ] **Step 2: Recorrido manual completo en `npm start`**

Repetir, en una sola sesión de navegador sin recargar entre pasos, todo lo descrito en Task 3 Step 6, Task 4 Step 5 y Task 5 Step 8. Confirmar además que Clientes, Registros y la exportación a CSV (`abrirExp`) siguen funcionando sin cambios — son las tres superficies que comparten `fCOP`/`fd` y podrían verse afectadas por el rewiring del Task 5.

- [ ] **Step 3: Revisar el diff completo antes de ofrecer el push**

Run: `cd "i:/AGENCIA PEDIDOS/agencia" && git log --oneline -8 && git status --short`
Expected: 5 commits nuevos de este plan (Tasks 1-5) sobre `f37ce60`/`ab59d30`, working tree limpio (sin cambios sin commitear).

- [ ] **Step 4: Push (solo con confirmación explícita del usuario)**

No ejecutar automáticamente. Preguntar al usuario si quiere desplegar a Railway antes de correr:

```bash
git push origin main
```
