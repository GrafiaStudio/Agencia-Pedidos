# Vista Cliente y Documentos Formales Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Generar Cotización/Orden de Pedido/Comprobante de Venta en PDF desde el navegador (sin dependencia nueva en el backend), con IVA opcional por negocio (oculto por completo si no aplica) y un botón puente de envío manual por WhatsApp.

**Architecture:** PDF 100% client-side con `jsPDF` + `jspdf-autotable` cargados por CDN (mismo patrón que Google Fonts/Tabler Icons, ya usado en el proyecto). Funciones puras de armado de documento (sin DOM) separadas de la función que efectivamente dibuja el PDF, para poder probarlas con Node sin navegador. Tres columnas nuevas en `configuracion_negocio` para IVA, con visibilidad condicional total en la UI cuando no aplica.

**Tech Stack:** Node.js + Express + better-sqlite3 (backend, solo 3 columnas nuevas), HTML/CSS/JS vanilla + jsPDF/jspdf-autotable por CDN (frontend).

## Global Constraints

- Cero dependencias nuevas en `package.json` — `jsPDF`/`jspdf-autotable` van por `<script src=...>` CDN, igual a como ya están Google Fonts y Tabler Icons.
- URLs de CDN verificadas (no asumidas): `https://cdn.jsdelivr.net/npm/jspdf@2.5.2/dist/jspdf.umd.min.js` y `https://cdn.jsdelivr.net/npm/jspdf-autotable@5.0.8/dist/jspdf.plugin.autotable.min.js` (autotable 5.0.8 declara soporte para jsPDF `^2`, compatible con 2.5.2). El global que expone jsPDF es `window.jspdf.jsPDF` — **no** un `jsPDF` suelto (confirmado contra el README oficial del proyecto, no asumido de memoria).
- El toggle "Aplicar IVA" en `no` (default) debe ocultar por completo los campos de porcentaje/desglosado — no solo deshabilitarlos — y no debe aparecer la palabra "IVA" en ningún lado si está en `no`.
- El botón de WhatsApp solo pre-llena texto — nunca adjunta el PDF (limitación real de `wa.me`, no un bug).
- Toda request del frontend pasa por `api()` ya existente. Nunca interpolar comillas simples crudas en `onclick`/`oninput`.
- Sin framework de tests — `node -c`, `curl`, y pruebas de lógica pura con Node (el agente no tiene navegador, así que la generación real del PDF la valida el usuario).
- `git push origin main` ya no requiere confirmación previa (autorización del usuario, 2026-06-25) — sigue yendo al final, después de toda la verificación.
- Cualquier `<script src>` de un CDN externo (a diferencia de un `<link>` de CSS) lleva `integrity` (SRI, sha384) calculado directamente del archivo descargado — no un hash reportado por un tercero — y `crossorigin="anonymous"`. JS de terceros sin pin ejecuta con acceso total a la página; CSS no tiene el mismo nivel de riesgo, por eso Google Fonts/Tabler Icons (ya existentes) no lo necesitan pero esto sí.

---

## Task 1: Backend — columnas de IVA en `configuracion_negocio`

**Files:**
- Modify: `agencia/server.js` (tabla `configuracion_negocio`, `CFG_DEFAULTS`, `getConfiguracion`, `PUT /api/configuracion`)

**Interfaces:**
- Produces: columnas `iva_activo INTEGER`, `iva_porcentaje INTEGER`, `iva_desglosado INTEGER` en `configuracion_negocio`; `CFG_DEFAULTS`/`getConfiguracion(wsId)` devuelven también `iva_activo`, `iva_porcentaje`, `iva_desglosado`.

- [ ] **Step 1: Agregar las 3 columnas a la tabla**

En `server.js`, cambiar:

```js
  alertas_entrega INTEGER DEFAULT 1,
  dias_anticipacion_entrega INTEGER DEFAULT 3
)`);
```

por:

```js
  alertas_entrega INTEGER DEFAULT 1,
  dias_anticipacion_entrega INTEGER DEFAULT 3,
  iva_activo INTEGER DEFAULT 0,
  iva_porcentaje INTEGER DEFAULT 19,
  iva_desglosado INTEGER DEFAULT 0
)`);
```

**Importante — esto solo es suficiente para una base de datos nueva.** `configuracion_negocio`
ya existe (se creó en la Fase 1E) tanto en local como en producción, y
`CREATE TABLE IF NOT EXISTS` no agrega columnas a una tabla que ya existe. Agregar
también, inmediatamente después del `)\`);` de arriba, el `ALTER TABLE` correspondiente
envuelto en `try/catch` (mismo patrón que usa el resto del esquema para columnas nuevas
en tablas viejas):

```js
try { db.exec("ALTER TABLE configuracion_negocio ADD COLUMN iva_activo INTEGER DEFAULT 0"); } catch(e){}
try { db.exec("ALTER TABLE configuracion_negocio ADD COLUMN iva_porcentaje INTEGER DEFAULT 19"); } catch(e){}
try { db.exec("ALTER TABLE configuracion_negocio ADD COLUMN iva_desglosado INTEGER DEFAULT 0"); } catch(e){}
```

- [ ] **Step 2: `CFG_DEFAULTS`**

Cambiar:

```js
const CFG_DEFAULTS={
  nombre_negocio:'',logo_ruta:'',direccion:'',telefono:'',email:'',nit:'',
  moneda_prefijo:'$',decimales:0,separador_miles:'.',formato_fecha:'DD/MM/AAAA',
  zona_horaria:'America/Bogota',dias_validez_cotizacion:15,estado_default_cotizacion:0,
  metodos_pago:['efectivo','transferencia','nequi','daviplata','otro'],
  alertas_entrega:1,dias_anticipacion_entrega:3
};
```

por:

```js
const CFG_DEFAULTS={
  nombre_negocio:'',logo_ruta:'',direccion:'',telefono:'',email:'',nit:'',
  moneda_prefijo:'$',decimales:0,separador_miles:'.',formato_fecha:'DD/MM/AAAA',
  zona_horaria:'America/Bogota',dias_validez_cotizacion:15,estado_default_cotizacion:0,
  metodos_pago:['efectivo','transferencia','nequi','daviplata','otro'],
  alertas_entrega:1,dias_anticipacion_entrega:3,
  iva_activo:0,iva_porcentaje:19,iva_desglosado:0
};
```

- [ ] **Step 3: `getConfiguracion`**

Cambiar:

```js
    metodos_pago:metodos,
    alertas_entrega:row.alertas_entrega?1:0,
    dias_anticipacion_entrega:row.dias_anticipacion_entrega??CFG_DEFAULTS.dias_anticipacion_entrega
  };
}
```

por:

```js
    metodos_pago:metodos,
    alertas_entrega:row.alertas_entrega?1:0,
    dias_anticipacion_entrega:row.dias_anticipacion_entrega??CFG_DEFAULTS.dias_anticipacion_entrega,
    iva_activo:row.iva_activo?1:0,
    iva_porcentaje:row.iva_porcentaje??CFG_DEFAULTS.iva_porcentaje,
    iva_desglosado:row.iva_desglosado?1:0
  };
}
```

- [ ] **Step 4: Validación y upsert en `PUT /api/configuracion`**

Cambiar:

```js
    if(b.dias_anticipacion_entrega!==undefined&&(!Number.isInteger(b.dias_anticipacion_entrega)||b.dias_anticipacion_entrega<0))errores.push('Días de anticipación no válido');
    if(errores.length)return res.status(400).json({error:errores.join('. ')});
```

por:

```js
    if(b.dias_anticipacion_entrega!==undefined&&(!Number.isInteger(b.dias_anticipacion_entrega)||b.dias_anticipacion_entrega<0))errores.push('Días de anticipación no válido');
    if(b.iva_porcentaje!==undefined&&(!Number.isInteger(b.iva_porcentaje)||b.iva_porcentaje<0||b.iva_porcentaje>100))errores.push('Porcentaje de IVA no válido');
    if(errores.length)return res.status(400).json({error:errores.join('. ')});
```

Cambiar:

```js
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
```

por:

```js
        (workspace_id,nombre_negocio,direccion,telefono,email,nit,moneda_prefijo,decimales,separador_miles,formato_fecha,zona_horaria,dias_validez_cotizacion,estado_default_cotizacion,metodos_pago,alertas_entrega,dias_anticipacion_entrega,iva_activo,iva_porcentaje,iva_desglosado)
      VALUES(@workspace_id,@nombre_negocio,@direccion,@telefono,@email,@nit,@moneda_prefijo,@decimales,@separador_miles,@formato_fecha,@zona_horaria,@dias_validez_cotizacion,@estado_default_cotizacion,@metodos_pago,@alertas_entrega,@dias_anticipacion_entrega,@iva_activo,@iva_porcentaje,@iva_desglosado)
      ON CONFLICT(workspace_id) DO UPDATE SET
        nombre_negocio=excluded.nombre_negocio,direccion=excluded.direccion,telefono=excluded.telefono,
        email=excluded.email,nit=excluded.nit,moneda_prefijo=excluded.moneda_prefijo,decimales=excluded.decimales,
        separador_miles=excluded.separador_miles,formato_fecha=excluded.formato_fecha,zona_horaria=excluded.zona_horaria,
        dias_validez_cotizacion=excluded.dias_validez_cotizacion,estado_default_cotizacion=excluded.estado_default_cotizacion,
        metodos_pago=excluded.metodos_pago,alertas_entrega=excluded.alertas_entrega,dias_anticipacion_entrega=excluded.dias_anticipacion_entrega,
        iva_activo=excluded.iva_activo,iva_porcentaje=excluded.iva_porcentaje,iva_desglosado=excluded.iva_desglosado`)
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
        dias_anticipacion_entrega:Number.isInteger(nuevo.dias_anticipacion_entrega)?nuevo.dias_anticipacion_entrega:3,
        iva_activo:nuevo.iva_activo?1:0,
        iva_porcentaje:Number.isInteger(nuevo.iva_porcentaje)?nuevo.iva_porcentaje:19,
        iva_desglosado:nuevo.iva_desglosado?1:0
      });
```

- [ ] **Step 5: Verificar sintaxis**

Run: `cd "i:/AGENCIA PEDIDOS/agencia" && node -c server.js && echo OK`
Expected: `OK`.

- [ ] **Step 6: Probar con curl**

Run (verificar primero que el puerto 3000 está libre):
```bash
cd "i:/AGENCIA PEDIDOS/agencia"
npm start &
for i in 1 2 3 4 5 6 7 8 9 10; do curl -s -m 1 http://localhost:3000/ -o /dev/null && break; sleep 1; done
TOKEN=$(curl -s -m 5 -X POST http://localhost:3000/api/auth/login -H "Content-Type: application/json" -d '{"pin":"1234"}' | grep -o '"token":"[^"]*"' | cut -d'"' -f4)

echo "--- defaults: iva_activo debe ser 0 ---"
curl -s -m 5 http://localhost:3000/api/configuracion -H "Authorization: Bearer $TOKEN" | grep -o '"iva_activo":[0-9]*\|"iva_porcentaje":[0-9]*\|"iva_desglosado":[0-9]*'

echo "--- activar IVA con 19% y desglosado ---"
curl -s -m 5 -X PUT http://localhost:3000/api/configuracion -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{"iva_activo":true,"iva_porcentaje":19,"iva_desglosado":true}' | grep -o '"iva_activo":[0-9]*\|"iva_porcentaje":[0-9]*\|"iva_desglosado":[0-9]*'

echo "--- porcentaje invalido debe fallar 400 ---"
curl -s -m 5 -w "\nHTTP %{http_code}\n" -X PUT http://localhost:3000/api/configuracion -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{"iva_porcentaje":150}'

echo "--- volver a dejar todo en default para no afectar la prueba manual del usuario ---"
curl -s -m 5 -X PUT http://localhost:3000/api/configuracion -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{"iva_activo":false,"iva_porcentaje":19,"iva_desglosado":false}' -o /dev/null

PID=$(netstat -ano | grep ':3000' | grep LISTENING | head -1 | awk '{print $NF}'); [ -n "$PID" ] && taskkill //F //PID "$PID"
```
Expected: defaults `"iva_activo":0 "iva_porcentaje":19 "iva_desglosado":0`; tras activar `"iva_activo":1 "iva_porcentaje":19 "iva_desglosado":1`; porcentaje 150 da `HTTP 400`.

- [ ] **Step 7: Commit**

```bash
cd "i:/AGENCIA PEDIDOS/agencia"
git add server.js
git commit -m "[FEATURE] Documentos: columnas de IVA en configuracion_negocio (Fase 3)"
```

---

## Task 2: Frontend — pestaña Impuestos en Configuración (oculta si no aplica)

**Files:**
- Modify: `agencia/public/index.html` (markup de Configuración, `CFG_DEFAULTS`, `pintarConfiguracion`, `guardarConfiguracion`, `showCfgTab`)

**Interfaces:**
- Produces: `onIvaActivoChange()`. `CFG.iva_activo`/`iva_porcentaje`/`iva_desglosado` quedan disponibles para Task 3/4.

- [ ] **Step 1: Pestaña y panel nuevos**

En `public/index.html`, cambiar:

```html
        <button class="cfgtab" onclick="showCfgTab('notificaciones')">Notificaciones</button>
```

por:

```html
        <button class="cfgtab" onclick="showCfgTab('notificaciones')">Notificaciones</button>
        <button class="cfgtab" onclick="showCfgTab('impuestos')">Impuestos</button>
```

Cambiar:

```html
      <div id="cfg-notificaciones" class="cfg-panel">
        <div class="msec"><span class="tri"></span>Alertas de entrega</div>
        <div class="ck-box" style="display:inline-flex;margin-bottom:12px"><input type="checkbox" id="cfg-alertas-entrega"><label for="cfg-alertas-entrega">Avisar cuando se acerque la fecha de entrega</label></div>
        <div class="fg" style="max-width:220px"><label>Días de anticipación</label><input type="number" id="cfg-dias-anticipacion" min="0" placeholder="3"></div>
      </div>
```

por:

```html
      <div id="cfg-notificaciones" class="cfg-panel">
        <div class="msec"><span class="tri"></span>Alertas de entrega</div>
        <div class="ck-box" style="display:inline-flex;margin-bottom:12px"><input type="checkbox" id="cfg-alertas-entrega"><label for="cfg-alertas-entrega">Avisar cuando se acerque la fecha de entrega</label></div>
        <div class="fg" style="max-width:220px"><label>Días de anticipación</label><input type="number" id="cfg-dias-anticipacion" min="0" placeholder="3"></div>
      </div>

      <div id="cfg-impuestos" class="cfg-panel">
        <div class="msec"><span class="tri"></span>IVA</div>
        <div class="ck-box" style="display:inline-flex;margin-bottom:12px"><input type="checkbox" id="cfg-iva-activo" onchange="onIvaActivoChange()"><label for="cfg-iva-activo">Aplicar IVA</label></div>
        <div id="cfg-iva-detalle-wrap" style="display:none">
          <div class="fr2 fg">
            <div><label>Porcentaje</label><input type="number" id="cfg-iva-porcentaje" min="0" max="100" placeholder="19"></div>
            <div style="display:flex;align-items:flex-end;padding-bottom:8px">
              <div class="ck-box"><input type="checkbox" id="cfg-iva-desglosado"><label for="cfg-iva-desglosado">Mostrar desglosado en el documento</label></div>
            </div>
          </div>
        </div>
      </div>
```

- [ ] **Step 2: `showCfgTab` reconoce la pestaña nueva**

Cambiar:

```js
  ['perfil','preferencias','pedidos','notificaciones'].forEach((t,i)=>{if(t===tab)document.querySelectorAll('.cfgtab')[i].classList.add('active')});
```

por:

```js
  ['perfil','preferencias','pedidos','notificaciones','impuestos'].forEach((t,i)=>{if(t===tab)document.querySelectorAll('.cfgtab')[i].classList.add('active')});
```

- [ ] **Step 3: `CFG_DEFAULTS` y `onIvaActivoChange`**

Cambiar:

```js
const CFG_DEFAULTS={
  nombre_negocio:'',logo_ruta:'',direccion:'',telefono:'',email:'',nit:'',
  moneda_prefijo:'$',decimales:0,separador_miles:'.',formato_fecha:'DD/MM/AAAA',
  zona_horaria:'America/Bogota',dias_validez_cotizacion:15,estado_default_cotizacion:0,
  metodos_pago:['efectivo','transferencia','nequi','daviplata','otro'],
  alertas_entrega:1,dias_anticipacion_entrega:3
};
let CFG={...CFG_DEFAULTS};
```

por:

```js
const CFG_DEFAULTS={
  nombre_negocio:'',logo_ruta:'',direccion:'',telefono:'',email:'',nit:'',
  moneda_prefijo:'$',decimales:0,separador_miles:'.',formato_fecha:'DD/MM/AAAA',
  zona_horaria:'America/Bogota',dias_validez_cotizacion:15,estado_default_cotizacion:0,
  metodos_pago:['efectivo','transferencia','nequi','daviplata','otro'],
  alertas_entrega:1,dias_anticipacion_entrega:3,
  iva_activo:0,iva_porcentaje:19,iva_desglosado:0
};
let CFG={...CFG_DEFAULTS};
function onIvaActivoChange(){
  document.getElementById('cfg-iva-detalle-wrap').style.display=document.getElementById('cfg-iva-activo').checked?'block':'none';
}
```

- [ ] **Step 4: `pintarConfiguracion` pinta los 3 campos**

Cambiar:

```js
  document.getElementById('cfg-alertas-entrega').checked=!!CFG.alertas_entrega;
  document.getElementById('cfg-dias-anticipacion').value=CFG.dias_anticipacion_entrega;
```

por:

```js
  document.getElementById('cfg-alertas-entrega').checked=!!CFG.alertas_entrega;
  document.getElementById('cfg-dias-anticipacion').value=CFG.dias_anticipacion_entrega;
  document.getElementById('cfg-iva-activo').checked=!!CFG.iva_activo;
  document.getElementById('cfg-iva-porcentaje').value=CFG.iva_porcentaje;
  document.getElementById('cfg-iva-desglosado').checked=!!CFG.iva_desglosado;
  onIvaActivoChange();
```

- [ ] **Step 5: `guardarConfiguracion` manda los 3 campos**

Cambiar:

```js
    alertas_entrega:document.getElementById('cfg-alertas-entrega').checked?1:0,
    dias_anticipacion_entrega:parseInt(document.getElementById('cfg-dias-anticipacion').value,10)||3
  };
```

por:

```js
    alertas_entrega:document.getElementById('cfg-alertas-entrega').checked?1:0,
    dias_anticipacion_entrega:parseInt(document.getElementById('cfg-dias-anticipacion').value,10)||3,
    iva_activo:document.getElementById('cfg-iva-activo').checked?1:0,
    iva_porcentaje:parseInt(document.getElementById('cfg-iva-porcentaje').value,10)||19,
    iva_desglosado:document.getElementById('cfg-iva-desglosado').checked?1:0
  };
```

- [ ] **Step 6: Verificar sintaxis**

Run:
```bash
cd "i:/AGENCIA PEDIDOS/agencia"
SCRATCH="C:/Users/ADMIN/AppData/Local/Temp/claude/i--AGENCIA-PEDIDOS/8d8d31ac-5619-43aa-9270-0aa1f2328221/scratchpad"
awk '/<script>/{f=1;next}/<\/script>/{f=0}f' public/index.html > "$SCRATCH/check.js"
node -c "$SCRATCH/check.js" && echo OK
```
Expected: `OK`.

- [ ] **Step 7: Verificación funcional**

Run:
```bash
cd "i:/AGENCIA PEDIDOS/agencia"
npm start &
for i in 1 2 3 4 5 6 7 8 9 10; do curl -s -m 1 http://localhost:3000/ -o /dev/null && break; sleep 1; done
curl -s -m 5 http://localhost:3000/ | grep -c 'cfg-impuestos\|cfg-iva-activo\|function onIvaActivoChange'
PID=$(netstat -ano | grep ':3000' | grep LISTENING | head -1 | awk '{print $NF}'); [ -n "$PID" ] && taskkill //F //PID "$PID"
```
Expected: al menos `3`.

- [ ] **Step 8: Commit**

```bash
cd "i:/AGENCIA PEDIDOS/agencia"
git add public/index.html
git commit -m "[FEATURE] Documentos: pestana Impuestos en Configuracion, oculta si no aplica (Fase 3)"
```

---

## Task 3: Frontend — CDN de PDF y funciones puras de armado de documento

**Files:**
- Modify: `agencia/public/index.html` (`<head>`/antes del `<script>` principal: 2 `<script src>` nuevos; bloque de funciones nuevo)

**Interfaces:**
- Produces: `tipoDocumento(p)`, `lineasDocumento(p)`, `calcularIVA(total,porcentaje)`, `normalizarTelWa(tel)`, `mensajeWhatsApp(p,tipo)` — usadas por Task 4.
- Consumes: `calcValorEncargoEfectivo`, `fCOP`, `fd`, `sumarDias`, `CFG` (ya existentes).

- [ ] **Step 1: Cargar jsPDF y jspdf-autotable por CDN**

En `public/index.html`, cambiar:

```html
<div class="toast" id="toast"><i class="ti ti-check"></i><span id="toast-msg"></span></div>

<script>
```

por:

```html
<div class="toast" id="toast"><i class="ti ti-check"></i><span id="toast-msg"></span></div>

<script src="https://cdn.jsdelivr.net/npm/jspdf@2.5.2/dist/jspdf.umd.min.js" integrity="sha384-en/ztfPSRkGfME4KIm05joYXynqzUgbsG5nMrj/xEFAHXkeZfO3yMK8QQ+mP7p1/" crossorigin="anonymous"></script>
<script src="https://cdn.jsdelivr.net/npm/jspdf-autotable@5.0.8/dist/jspdf.plugin.autotable.min.js" integrity="sha384-5jk55M0XWoAw7LyhlXJe19ErOr3doBAPzxw9vahPFbvolqWa2yDk4fhHa2zuYeOa" crossorigin="anonymous"></script>
<script>
```

- [ ] **Step 2: Funciones puras**

En `public/index.html`, inmediatamente después de la función `pagoHTML` existente (la que devuelve los badges "Pagado"/"Abono"/"Sin pago"), agregar:

```js
function tipoDocumento(p){
  if(p.cancelado)return null;
  if(p.es_cotizacion)return'COTIZACIÓN';
  const val=p.valor_total||0;
  const pag=(p.pagos||[]).reduce((a,x)=>a+(parseInt(String(x.monto_calc||0).replace(/\D/g,''))||0),0);
  if(p.entregado&&val>0&&pag>=val)return'COMPROBANTE DE VENTA';
  return'ORDEN DE PEDIDO';
}
function lineasDocumento(p){
  return(p.encargos||[]).map(enc=>{
    const desc=(enc.items||[]).map(it=>`${(it.cantidad||'').trim()} ${(it.detalle||'').trim()}`.trim()).filter(Boolean).join('; ')||'(sin detalle)';
    return{descripcion:desc,monto:calcValorEncargoEfectivo(enc)};
  });
}
function calcularIVA(total,porcentaje){
  const subtotal=Math.round(total/(1+porcentaje/100));
  return{subtotal,iva:total-subtotal,total};
}
function normalizarTelWa(tel){
  let d=String(tel||'').replace(/\D/g,'');
  if(d.length===10)d='57'+d;
  return d;
}
function mensajeWhatsApp(p,tipo){
  let msg=`Hola ${p.nombre}, te comparto el documento "${tipo}" del pedido #${p.ref}.\nTotal: ${fCOP(p.valor_total)}.`;
  if(tipo==='COTIZACIÓN'&&p.fecha_pedido){
    msg+=`\nVálida hasta ${fd(sumarDias(p.fecha_pedido,CFG.dias_validez_cotizacion))}.`;
  }
  return msg;
}
```

- [ ] **Step 3: Verificar sintaxis**

Run: igual que Task 2 Step 6.
Expected: `OK`.

- [ ] **Step 4: Probar las 5 funciones con Node, sin navegador**

Run:
```bash
SCRATCH="C:/Users/ADMIN/AppData/Local/Temp/claude/i--AGENCIA-PEDIDOS/8d8d31ac-5619-43aa-9270-0aa1f2328221/scratchpad"
cat > "$SCRATCH/test-documentos.js" <<'EOF'
function calcValorEncargoEfectivo(enc){return enc._mockEfectivo}
function fCOP(n){const v=parseInt(String(n||0).replace(/\D/g,''))||0;return'$'+v.toLocaleString('es-CO')}
function fd(s){if(!s)return'—';const[y,m,d]=s.split('-');return`${d}/${m}/${y}`}
function sumarDias(s,n){const d=new Date(s+'T00:00:00');d.setDate(d.getDate()+n);return d.toISOString().split('T')[0]}
const CFG={dias_validez_cotizacion:15};

function tipoDocumento(p){
  if(p.cancelado)return null;
  if(p.es_cotizacion)return'COTIZACIÓN';
  const val=p.valor_total||0;
  const pag=(p.pagos||[]).reduce((a,x)=>a+(parseInt(String(x.monto_calc||0).replace(/\D/g,''))||0),0);
  if(p.entregado&&val>0&&pag>=val)return'COMPROBANTE DE VENTA';
  return'ORDEN DE PEDIDO';
}
function lineasDocumento(p){
  return(p.encargos||[]).map(enc=>{
    const desc=(enc.items||[]).map(it=>`${(it.cantidad||'').trim()} ${(it.detalle||'').trim()}`.trim()).filter(Boolean).join('; ')||'(sin detalle)';
    return{descripcion:desc,monto:calcValorEncargoEfectivo(enc)};
  });
}
function calcularIVA(total,porcentaje){
  const subtotal=Math.round(total/(1+porcentaje/100));
  return{subtotal,iva:total-subtotal,total};
}
function normalizarTelWa(tel){
  let d=String(tel||'').replace(/\D/g,'');
  if(d.length===10)d='57'+d;
  return d;
}
function mensajeWhatsApp(p,tipo){
  let msg=`Hola ${p.nombre}, te comparto el documento "${tipo}" del pedido #${p.ref}.\nTotal: ${fCOP(p.valor_total)}.`;
  if(tipo==='COTIZACIÓN'&&p.fecha_pedido){
    msg+=`\nVálida hasta ${fd(sumarDias(p.fecha_pedido,CFG.dias_validez_cotizacion))}.`;
  }
  return msg;
}
function assertEq(a,e,l){if(JSON.stringify(a)!==JSON.stringify(e)){console.error('FAIL '+l+': got',a,'expected',e);process.exitCode=1}else console.log('OK   '+l)}

assertEq(tipoDocumento({cancelado:true,es_cotizacion:true}),null,'cancelado siempre null, incluso si es cotizacion');
assertEq(tipoDocumento({es_cotizacion:true}),'COTIZACIÓN','cotizacion');
assertEq(tipoDocumento({entregado:true,valor_total:50000,pagos:[{monto_calc:'50000'}]}),'COMPROBANTE DE VENTA','entregado y pagado completo');
assertEq(tipoDocumento({entregado:true,valor_total:50000,pagos:[{monto_calc:'20000'}]}),'ORDEN DE PEDIDO','entregado pero no pagado completo: sigue siendo orden');
assertEq(tipoDocumento({entregado:false,valor_total:50000,pagos:[]}),'ORDEN DE PEDIDO','ni cotizacion ni comprobante: orden de pedido');

const lineas=lineasDocumento({encargos:[{_mockEfectivo:22000,items:[{cantidad:'2',detalle:'Camisetas'}]}]});
assertEq(lineas,[{descripcion:'2 Camisetas',monto:22000}],'una linea por encargo, no por item');

assertEq(calcularIVA(119000,19),{subtotal:100000,iva:19000,total:119000},'IVA incluido: 119.000 -> subtotal 100.000 + IVA 19.000');

assertEq(normalizarTelWa('310 000 0000'),'573100000000','normaliza numero colombiano de 10 digitos');
assertEq(normalizarTelWa('573100000000'),'573100000000','numero que ya trae codigo de pais no se altera');

const msgCot=mensajeWhatsApp({nombre:'María',ref:'0042',valor_total:100000,fecha_pedido:'2026-06-25'},'COTIZACIÓN');
if(msgCot.includes('Válida hasta 10/07/2026'))console.log('OK   mensaje de cotizacion incluye validez');
else{console.error('FAIL mensaje de cotizacion: '+msgCot);process.exitCode=1}
EOF
node "$SCRATCH/test-documentos.js"
```
Expected: 9 líneas `OK`.

- [ ] **Step 5: Commit**

```bash
cd "i:/AGENCIA PEDIDOS/agencia"
git add public/index.html
git commit -m "[FEATURE] Documentos: CDN de PDF y funciones puras de armado (Fase 3)"
```

---

## Task 4: Frontend — generación del PDF y botones en el modal de pedido

**Files:**
- Modify: `agencia/public/index.html` (`mfoot` del modal de pedido; `abrirEditar`; nuevas `generarPdfPedido`/`enviarWhatsAppPedido`)

**Interfaces:**
- Consumes: `tipoDocumento`, `lineasDocumento`, `calcularIVA`, `normalizarTelWa`, `mensajeWhatsApp` (Task 3), `CFG`, `METODOS_PAGO_CATALOGO`, `api`, `toast`, `fCOP`, `fd`, `sumarDias`, `window.jspdf.jsPDF`.

- [ ] **Step 1: Botones nuevos en el `mfoot`**

En `public/index.html`, cambiar:

```html
  <div class="mfoot">
    <button class="btn-danger" id="btn-del" style="display:none" onclick="eliminarPed()"><i class="ti ti-trash"></i>Eliminar</button>
    <div style="display:flex;gap:7px;margin-left:auto">
      <button class="btn-ghost" onclick="cerrar()">Cancelar</button>
      <button class="btn-pri" onclick="guardar()"><i class="ti ti-device-floppy"></i>Guardar</button>
    </div>
  </div>
</div>
</div>
```

por:

```html
  <div class="mfoot">
    <button class="btn-danger" id="btn-del" style="display:none" onclick="eliminarPed()"><i class="ti ti-trash"></i>Eliminar</button>
    <button class="btn-ghost" id="btn-pdf" style="display:none" onclick="generarPdfPedido()"><i class="ti ti-file-text"></i>Generar PDF</button>
    <button class="btn-ghost" id="btn-wa" style="display:none" onclick="enviarWhatsAppPedido()"><i class="ti ti-brand-whatsapp"></i>Enviar por WhatsApp</button>
    <div style="display:flex;gap:7px;margin-left:auto">
      <button class="btn-ghost" onclick="cerrar()">Cancelar</button>
      <button class="btn-pri" onclick="guardar()"><i class="ti ti-device-floppy"></i>Guardar</button>
    </div>
  </div>
</div>
</div>
```

- [ ] **Step 2: Mostrar/ocultar los botones al abrir un pedido existente**

En `public/index.html`, dentro de `abrirEditar(id)`, justo después de la línea que ya existe:

```js
  document.getElementById('m-ref').textContent='#'+p.ref+' · '+fd(p.fecha_pedido)+validezCotHTML(p);
```

agregar:

```js
  document.getElementById('btn-pdf').style.display=p.cancelado?'none':'inline-flex';
  document.getElementById('btn-wa').style.display=(p.cancelado||!p.tel)?'none':'inline-flex';
  window._pedidoActualDoc=p;
```

(`abrirNuevo()`/`resetForm()` no necesitan tocarse — los dos botones ya parten en `display:none` desde el HTML, y un pedido nuevo no tiene nada que documentar todavía.)

- [ ] **Step 3: `generarPdfPedido` y `enviarWhatsAppPedido`**

En `public/index.html`, inmediatamente después de la función `mensajeWhatsApp` (Task 3), agregar:

```js
function generarPdfPedido(){
  const p=window._pedidoActualDoc;
  if(!p)return;
  const tipo=tipoDocumento(p);
  if(!tipo){toast('No se puede generar un documento de un pedido cancelado',false);return}
  const{jsPDF}=window.jspdf;
  const doc=new jsPDF({format:'letter'});
  let y=18;
  if(CFG.nombre_negocio){doc.setFontSize(15);doc.text(CFG.nombre_negocio,14,y);y+=7}
  doc.setFontSize(9);
  [CFG.nit&&`NIT: ${CFG.nit}`,CFG.telefono&&`Tel: ${CFG.telefono}`,CFG.email,CFG.direccion].filter(Boolean).forEach(linea=>{doc.text(linea,14,y);y+=5});
  y+=5;
  doc.setFontSize(14);doc.text(tipo,14,y);y+=8;
  doc.setFontSize(10);
  doc.text(`Pedido #${p.ref}`,14,y);doc.text(`Fecha: ${fd(p.fecha_pedido)}`,120,y);y+=6;
  doc.text(`Cliente: ${p.nombre}`,14,y);y+=6;
  if(p.tel){doc.text(`Teléfono: ${p.tel}`,14,y);y+=6}
  if(p.fecha_entrega){doc.text(`Fecha de entrega: ${fd(p.fecha_entrega)}`,14,y);y+=6}
  if(tipo==='COTIZACIÓN'&&p.fecha_pedido){doc.text(`Válida hasta: ${fd(sumarDias(p.fecha_pedido,CFG.dias_validez_cotizacion))}`,14,y);y+=6}
  y+=4;
  doc.autoTable({
    startY:y,
    head:[['Descripción','Valor']],
    body:lineasDocumento(p).map(l=>[l.descripcion,fCOP(l.monto)]),
    styles:{fontSize:9}
  });
  let finalY=doc.lastAutoTable.finalY+8;
  doc.setFontSize(11);
  if(CFG.iva_activo&&CFG.iva_desglosado){
    const{subtotal,iva,total}=calcularIVA(p.valor_total||0,CFG.iva_porcentaje);
    doc.setFontSize(9);
    doc.text(`Subtotal: ${fCOP(subtotal)}`,196,finalY,{align:'right'});finalY+=5;
    doc.text(`IVA (${CFG.iva_porcentaje}%): ${fCOP(iva)}`,196,finalY,{align:'right'});finalY+=6;
    doc.setFontSize(12);doc.text(`Total: ${fCOP(total)}`,196,finalY,{align:'right'});
  }else{
    doc.setFontSize(12);doc.text(`Total: ${fCOP(p.valor_total||0)}`,196,finalY,{align:'right'});
  }
  finalY+=10;
  doc.setFontSize(9);
  if(CFG.metodos_pago&&CFG.metodos_pago.length){
    const labels=CFG.metodos_pago.map(m=>METODOS_PAGO_CATALOGO.find(x=>x.key===m)?.label||m).join(', ');
    doc.text('Métodos de pago aceptados: '+labels,14,finalY);
  }
  doc.save(`${tipo.replace(/\s+/g,'_')}_${p.ref}.pdf`);
}
function enviarWhatsAppPedido(){
  const p=window._pedidoActualDoc;
  if(!p||!p.tel){toast('Este cliente no tiene teléfono registrado',false);return}
  const tipo=tipoDocumento(p);
  if(!tipo){toast('No se puede enviar un documento de un pedido cancelado',false);return}
  const numero=normalizarTelWa(p.tel);
  const texto=encodeURIComponent(mensajeWhatsApp(p,tipo));
  window.open(`https://wa.me/${numero}?text=${texto}`,'_blank');
}
```

- [ ] **Step 4: Verificar sintaxis**

Run: igual que Task 2 Step 6.
Expected: `OK`.

- [ ] **Step 5: Verificación funcional — funciones y botones presentes en el HTML servido + regresión**

Run:
```bash
cd "i:/AGENCIA PEDIDOS/agencia"
npm start &
for i in 1 2 3 4 5 6 7 8 9 10; do curl -s -m 1 http://localhost:3000/ -o /dev/null && break; sleep 1; done
curl -s -m 5 http://localhost:3000/ | grep -c 'function generarPdfPedido\|function enviarWhatsAppPedido\|id="btn-pdf"\|id="btn-wa"\|jspdf.umd.min.js\|jspdf.plugin.autotable.min.js'
TOKEN=$(curl -s -m 5 -X POST http://localhost:3000/api/auth/login -H "Content-Type: application/json" -d '{"pin":"1234"}' | grep -o '"token":"[^"]*"' | cut -d'"' -f4)
curl -s -m 5 -o /dev/null -w "pedidos HTTP %{http_code}\n" http://localhost:3000/api/pedidos -H "Authorization: Bearer $TOKEN"
PID=$(netstat -ano | grep ':3000' | grep LISTENING | head -1 | awk '{print $NF}'); [ -n "$PID" ] && taskkill //F //PID "$PID"
```
Expected: el primer `grep -c` da `6`; `pedidos` responde `HTTP 200`.

- [ ] **Step 6: Commit**

```bash
cd "i:/AGENCIA PEDIDOS/agencia"
git add public/index.html
git commit -m "[FEATURE] Documentos: generar PDF y enviar por WhatsApp desde el pedido (Fase 3)"
```

---

## Task 5: Verificación final

- [ ] **Step 1: Suite combinada**

Run:
```bash
cd "i:/AGENCIA PEDIDOS/agencia"
node -c server.js && echo "server OK"
SCRATCH="C:/Users/ADMIN/AppData/Local/Temp/claude/i--AGENCIA-PEDIDOS/8d8d31ac-5619-43aa-9270-0aa1f2328221/scratchpad"
awk '/<script>/{f=1;next}/<\/script>/{f=0}f' public/index.html > "$SCRATCH/check.js"
node -c "$SCRATCH/check.js" && echo "script OK"
```
Expected: ambos `OK`.

- [ ] **Step 2: Regresión completa + estado del repo**

Run (servidor levantado, mismo patrón de espera): repetir contra `/api/pedidos`, `/api/clientes`, `/api/configuracion`, `/api/productos` — confirmar `HTTP 200` en los 4. Confirmar `git status --short` sin cambios sin commitear y `git log --oneline -8` mostrando los 4 commits de feature de este plan.

- [ ] **Step 3: Checklist manual para el usuario (el agente no tiene navegador, y la generación real del PDF solo se puede confirmar visualmente)**

Pedir al usuario que, en `npm start`, abra un pedido existente y confirme:
1. "Generar PDF" descarga un PDF con logo/datos del negocio, cliente, ítems (uno por encargo) y Total — sin costos internos, márgenes, ni notas.
2. En un pedido marcado como Cotización, el PDF dice "COTIZACIÓN" y muestra "Válida hasta".
3. En un pedido entregado y completamente pagado, el PDF dice "COMPROBANTE DE VENTA".
4. En cualquier otro caso, dice "ORDEN DE PEDIDO".
5. En un pedido cancelado, ninguno de los dos botones aparece.
6. "Enviar por WhatsApp" abre WhatsApp Web/App con un mensaje ya escrito al número del cliente — confirmar que el PDF generado en el paso 1 se puede adjuntar a mano ahí (no se adjunta solo, es la limitación esperada).
7. En Configuración → Impuestos: con "Aplicar IVA" desmarcado (default), no aparece ningún campo de porcentaje ni la palabra IVA en ningún lado, ni en el documento. Al marcarlo, aparecen Porcentaje y "Mostrar desglosado", y si ambos están activos el PDF muestra Subtotal/IVA/Total por separado en vez de un solo Total.

- [ ] **Step 4: Push**

```bash
git push origin main
```
