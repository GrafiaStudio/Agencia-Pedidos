# Costos del pedido: Cantidad y Valor unitario — Plan de Implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Agregar Cantidad y Valor unitario opcionales a cada ítem de costo del pedido, con el Total recalculándose en vivo (sin candado) cuando ambos están presentes, sin romper el uso 100% manual que ya existe.

**Architecture:** Dos columnas nuevas en `costos` (mismo patrón que ya usa `enc_items` para sus campos homólogos) + una función frontend que, en cada cambio de Cantidad o Valor unitario, escribe el producto directamente en el campo Total existente (`monto`), reusando el pipeline de expresiones matemáticas (`evalExpr`/`_calc`) que ya existe para ese campo.

**Tech Stack:** Node.js + Express + better-sqlite3 (backend), HTML/CSS/JS vanilla en un solo archivo (frontend).

## Global Constraints

- Migraciones de esquema: `ALTER TABLE` siempre envuelto en `try/catch`.
- Toda request del frontend pasa por la función `api()` existente — esto no cambia, no se toca esa función.
- Nunca interpolar strings con comillas simples en `onclick`/`oninput` — usar índices/ids (ya establecido, los costos usan `c.id`).
- Nunca `git add -A` — agregar archivos por nombre explícito.
- `git push origin main` solo con confirmación explícita del usuario.
- Sin framework de tests en este proyecto — verificación vía `node -c`, `curl` y, donde aplique, ejecutar la lógica pura del frontend directo con Node (sin DOM) para no depender de un navegador que el agente no tiene en este entorno.

---

## Task 1: Backend — columnas nuevas, validación e INSERTs

**Files:**
- Modify: `agencia/server.js:106` (bloque de migraciones, después de `ALTER TABLE costos ADD COLUMN monto_calc TEXT`)
- Modify: `agencia/server.js:373-375` (validación de costos en `validarPedido`)
- Modify: `agencia/server.js:440` (`POST /api/pedidos`, INSERT de costos)
- Modify: `agencia/server.js:461` (`PUT /api/pedidos/:id`, INSERT de costos)

**Interfaces:**
- Produces: columnas `cantidad TEXT`, `valor_unitario TEXT`, `valor_unitario_calc TEXT` en `costos`. Ambos INSERT pasan a aceptar `c.cantidad` y `c.valor_unitario` en el body de `costos[]`.
- Consumes: `normCalc()`, `definido()`, `evalExpr()` (ya existentes, sin cambios de firma).

- [ ] **Step 1: Migración de columnas**

En `server.js:106`, después de esta línea existente:

```js
try { db.exec("ALTER TABLE costos ADD COLUMN monto_calc TEXT"); } catch(e){}
```

agregar:

```js
try { db.exec("ALTER TABLE costos ADD COLUMN cantidad TEXT DEFAULT ''"); } catch(e){}
try { db.exec("ALTER TABLE costos ADD COLUMN valor_unitario TEXT DEFAULT ''"); } catch(e){}
try { db.exec("ALTER TABLE costos ADD COLUMN valor_unitario_calc TEXT"); } catch(e){}
```

- [ ] **Step 2: Verificar sintaxis y arranque**

Run: `cd "i:/AGENCIA PEDIDOS/agencia" && node -c server.js && echo OK`
Expected: `OK`.

Run (con el servidor parado de antes — verificar primero con `netstat -ano | grep ':3000'` que el puerto está libre):
```bash
npm start &
for i in 1 2 3 4 5 6 7 8 9 10; do curl -s -m 1 http://localhost:3000/ -o /dev/null && break; sleep 1; done
curl -s -m 5 -X POST http://localhost:3000/api/auth/login -H "Content-Type: application/json" -d '{"pin":"1234"}'
PID=$(netstat -ano | grep ':3000' | grep LISTENING | head -1 | awk '{print $NF}'); [ -n "$PID" ] && taskkill //F //PID "$PID"
```
Expected: arranca sin error y el login responde `{"token":"..."}` (confirma que las nuevas `ALTER TABLE` no rompieron el arranque).

- [ ] **Step 3: Validación de Valor unitario en `validarPedido`**

En `server.js`, dentro de `validarPedido`, cambiar:

```js
  (b.costos||[]).forEach((c,i)=>{
    if(definido(c.monto)&&evalExpr(c.monto)===null)errores.push(`Monto del costo #${i+1} no es una expresión válida`);
  });
```

por:

```js
  (b.costos||[]).forEach((c,i)=>{
    if(definido(c.monto)&&evalExpr(c.monto)===null)errores.push(`Monto del costo #${i+1} no es una expresión válida`);
    if(definido(c.valor_unitario)&&evalExpr(c.valor_unitario)===null)errores.push(`Valor unitario del costo #${i+1} no es una expresión válida`);
  });
```

- [ ] **Step 4: Agregar `cantidad`/`valor_unitario` a los dos INSERT de costos**

En `server.js:440` (`POST /api/pedidos`), cambiar:

```js
    (b.costos||[]).forEach(c=>db.prepare('INSERT INTO costos(id,pedido_id,encargo_id,descripcion,monto,monto_calc,workspace_id)VALUES(?,?,?,?,?,?,?)').run(uid(),id,c.encargo_id||'',c.descripcion||'',c.monto||'',normCalc(c.monto),req.wsId));
```

por:

```js
    (b.costos||[]).forEach(c=>db.prepare('INSERT INTO costos(id,pedido_id,encargo_id,descripcion,cantidad,valor_unitario,valor_unitario_calc,monto,monto_calc,workspace_id)VALUES(?,?,?,?,?,?,?,?,?,?)').run(uid(),id,c.encargo_id||'',c.descripcion||'',c.cantidad||'',c.valor_unitario||'',normCalc(c.valor_unitario),c.monto||'',normCalc(c.monto),req.wsId));
```

En `server.js:461` (`PUT /api/pedidos/:id`), cambiar:

```js
    if(b.costos!==undefined){db.prepare('DELETE FROM costos WHERE pedido_id=? AND workspace_id=?').run(pid,req.wsId);(b.costos||[]).forEach(c=>db.prepare('INSERT INTO costos(id,pedido_id,encargo_id,descripcion,monto,monto_calc,workspace_id)VALUES(?,?,?,?,?,?,?)').run(uid(),pid,c.encargo_id||'',c.descripcion||'',c.monto||'',normCalc(c.monto),req.wsId));}
```

por:

```js
    if(b.costos!==undefined){db.prepare('DELETE FROM costos WHERE pedido_id=? AND workspace_id=?').run(pid,req.wsId);(b.costos||[]).forEach(c=>db.prepare('INSERT INTO costos(id,pedido_id,encargo_id,descripcion,cantidad,valor_unitario,valor_unitario_calc,monto,monto_calc,workspace_id)VALUES(?,?,?,?,?,?,?,?,?,?)').run(uid(),pid,c.encargo_id||'',c.descripcion||'',c.cantidad||'',c.valor_unitario||'',normCalc(c.valor_unitario),c.monto||'',normCalc(c.monto),req.wsId));}
```

(`pedidoCompleto()` ya hace `SELECT * FROM costos...` — las columnas nuevas llegan solas al frontend, sin tocar esa función.)

- [ ] **Step 5: Verificar con curl: crear un pedido con costo usando cantidad×valor_unitario**

Run (servidor levantado, mismo patrón de espera del Step 2):
```bash
npm start &
for i in 1 2 3 4 5 6 7 8 9 10; do curl -s -m 1 http://localhost:3000/ -o /dev/null && break; sleep 1; done
TOKEN=$(curl -s -m 5 -X POST http://localhost:3000/api/auth/login -H "Content-Type: application/json" -d '{"pin":"1234"}' | grep -o '"token":"[^"]*"' | cut -d'"' -f4)
RESP=$(curl -s -m 5 -X POST http://localhost:3000/api/pedidos -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{"nombre":"Test Costos","costos":[{"descripcion":"Camisetas","cantidad":"29","valor_unitario":"7800","monto":"226200"}]}')
echo "$RESP" | grep -o '"cantidad":"[^"]*"\|"valor_unitario":"[^"]*"\|"valor_unitario_calc":"[^"]*"\|"monto":"[^"]*"\|"monto_calc":"[^"]*"'
PID_TEST=$(echo "$RESP" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
echo "--- validacion: valor_unitario invalido debe fallar 400 ---"
curl -s -m 5 -w "\nHTTP %{http_code}\n" -X PUT "http://localhost:3000/api/pedidos/$PID_TEST" -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{"costos":[{"descripcion":"x","valor_unitario":"abc","monto":"1000"}]}'
curl -s -m 5 -X DELETE "http://localhost:3000/api/pedidos/$PID_TEST" -H "Authorization: Bearer $TOKEN" -o /dev/null
PID=$(netstat -ano | grep ':3000' | grep LISTENING | head -1 | awk '{print $NF}'); [ -n "$PID" ] && taskkill //F //PID "$PID"
```
Expected: el primer grep muestra `"cantidad":"29"`, `"valor_unitario":"7800"`, `"valor_unitario_calc":"7800"`, `"monto":"226200"`, `"monto_calc":"226200"`. El segundo bloque responde `HTTP 400` con un error que menciona "Valor unitario". El pedido de prueba se borra al final (no debe quedar basura en la base local).

- [ ] **Step 6: Commit**

```bash
cd "i:/AGENCIA PEDIDOS/agencia"
git add server.js
git commit -m "[FEATURE] Costos del pedido: columnas cantidad/valor_unitario (Fase 2D)"
```

---

## Task 2: Frontend — Cantidad, Valor unitario y recálculo en vivo del Total

**Files:**
- Modify: `agencia/public/index.html` (`addCosto`, `setCostoVal`, `renderCostos`, y 3 funciones nuevas: `recalcCostoTotal`, `previewCostoUnit`, `focusCostoUnit`/`blurCostoUnit`)

**Interfaces:**
- Consumes: `evalExpr()`, `displayMoneyVal()`, `esExpresion()`, `previewExpr()`, `fCostos` (array global ya existente), `renderCostosRes()` (ya existente, sin cambios).
- Produces: `recalcCostoTotal(id)`, `previewCostoUnit(id,v)`, `focusCostoUnit(el,id)`, `blurCostoUnit(el,id)` — nuevas, usadas solo dentro de este archivo.

- [ ] **Step 1: `addCosto` inicializa los campos nuevos**

Cambiar:

```js
function addCosto(){fCostos.push({id:uid(),descripcion:'',monto:''});renderCostos()}
```

por:

```js
function addCosto(){fCostos.push({id:uid(),descripcion:'',cantidad:'',valor_unitario:'',monto:''});renderCostos()}
```

- [ ] **Step 2: `recalcCostoTotal` y los helpers de foco/preview del nuevo campo**

Agregar, inmediatamente después de la función `previewCosto` existente (la que ya maneja el preview del campo Total):

```js
function recalcCostoTotal(id){
  const c=fCostos.find(x=>x.id===id);
  if(!c||!c.cantidad)return;
  const unit=evalExpr(c.valor_unitario);
  if(unit==null)return;
  const cant=parseInt(String(c.cantidad||0).replace(/\D/g,''))||0;
  c.monto=String(cant*unit);
  const montoEl=document.getElementById('costo-monto-'+id);
  if(montoEl)montoEl.value=displayMoneyVal(c.monto);
}
function previewCostoUnit(id,v){
  const el=document.getElementById('costunitprev-'+id);
  if(!el)return;
  const show=esExpresion(v);
  el.style.display=show?'block':'none';
  if(show)el.innerHTML=previewExpr(v);
}
function focusCostoUnit(el,id){
  const c=fCostos.find(x=>x.id===id);
  el.value=(c&&c.valor_unitario)||'';
  previewCostoUnit(id,el.value);
}
function blurCostoUnit(el,id){
  const c=fCostos.find(x=>x.id===id);
  el.value=displayMoneyVal(c&&c.valor_unitario);
  const elp=document.getElementById('costunitprev-'+id);
  if(elp)elp.style.display='none';
}
```

- [ ] **Step 3: `setCostoVal` dispara el recálculo**

Cambiar:

```js
function setCostoVal(id,k,v){const c=fCostos.find(x=>x.id===id);if(c)c[k]=v;renderCostosRes();if(k==='monto')previewCosto(id,v)}
```

por:

```js
function setCostoVal(id,k,v){
  const c=fCostos.find(x=>x.id===id);
  if(c)c[k]=v;
  if(k==='cantidad'||k==='valor_unitario')recalcCostoTotal(id);
  renderCostosRes();
  if(k==='monto')previewCosto(id,v);
}
```

(El orden importa: `recalcCostoTotal` debe correr ANTES de `renderCostosRes()`, porque esta última lee `c.monto` para el total agregado de la sección.)

- [ ] **Step 4: Markup — agregar Cantidad y Valor unitario a cada `.costo-item`**

Cambiar:

```js
function renderCostos(){
  document.getElementById('costos-lista').innerHTML=fCostos.map(c=>`
    <div class="costo-item">
      <input type="text" value="${c.descripcion||''}" placeholder="Descripción del costo…" oninput="setCostoVal('${c.id}','descripcion',this.value)">
      <div style="max-width:110px">
        <input type="text" value="${displayMoneyVal(c.monto)}" placeholder="$ 0" oninput="setCostoVal('${c.id}','monto',this.value)" onfocus="focusCostoVal(this,'${c.id}')" onblur="blurCostoVal(this,'${c.id}')" style="max-width:110px;width:100%">
        <div id="costprev-${c.id}" style="font-size:8.5px;font-weight:700;color:var(--teal-dk);margin-top:2px;display:none"></div>
      </div>
      <button class="costo-del" onclick="remCosto('${c.id}')"><i class="ti ti-x"></i></button>
    </div>`).join('');
  renderCostosRes();
}
```

por:

```js
function renderCostos(){
  document.getElementById('costos-lista').innerHTML=fCostos.map(c=>`
    <div class="costo-item">
      <input type="text" value="${c.descripcion||''}" placeholder="Descripción del costo…" oninput="setCostoVal('${c.id}','descripcion',this.value)">
      <input type="text" value="${c.cantidad||''}" placeholder="Cant." style="max-width:55px;width:100%" oninput="setCostoVal('${c.id}','cantidad',this.value)">
      <div style="max-width:95px">
        <input type="text" value="${displayMoneyVal(c.valor_unitario)}" placeholder="V. unit." style="max-width:95px;width:100%" oninput="setCostoVal('${c.id}','valor_unitario',this.value);previewCostoUnit('${c.id}',this.value)" onfocus="focusCostoUnit(this,'${c.id}')" onblur="blurCostoUnit(this,'${c.id}')">
        <div id="costunitprev-${c.id}" style="font-size:8.5px;font-weight:700;color:var(--teal-dk);margin-top:2px;display:none"></div>
      </div>
      <div style="max-width:110px">
        <input type="text" id="costo-monto-${c.id}" value="${displayMoneyVal(c.monto)}" placeholder="$ 0" oninput="setCostoVal('${c.id}','monto',this.value)" onfocus="focusCostoVal(this,'${c.id}')" onblur="blurCostoVal(this,'${c.id}')" style="max-width:110px;width:100%">
        <div id="costprev-${c.id}" style="font-size:8.5px;font-weight:700;color:var(--teal-dk);margin-top:2px;display:none"></div>
      </div>
      <button class="costo-del" onclick="remCosto('${c.id}')"><i class="ti ti-x"></i></button>
    </div>`).join('');
  renderCostosRes();
}
```

(El input de Total gana `id="costo-monto-${c.id}"` — es lo que permite que `recalcCostoTotal` actualice su valor en pantalla sin reconstruir toda la fila y sin robarle el foco al campo que el usuario esté escribiendo en ese momento.)

- [ ] **Step 5: Verificar sintaxis**

Run:
```bash
cd "i:/AGENCIA PEDIDOS/agencia"
SCRATCH="C:/Users/ADMIN/AppData/Local/Temp/claude/i--AGENCIA-PEDIDOS/8d8d31ac-5619-43aa-9270-0aa1f2328221/scratchpad"
awk '/<script>/{f=1;next}/<\/script>/{f=0}f' public/index.html > "$SCRATCH/check.js"
node -c "$SCRATCH/check.js" && echo OK
```
Expected: `OK`.

- [ ] **Step 6: Verificar la lógica pura de `recalcCostoTotal` con Node, sin navegador**

Run (mismo enfoque ya usado para la Configuración: extraer las funciones puras y ejecutarlas con `node`, ya que no manipulan el DOM salvo por `document.getElementById` — para esta prueba se reemplaza esa única línea por una captura en variable):

```bash
SCRATCH="C:/Users/ADMIN/AppData/Local/Temp/claude/i--AGENCIA-PEDIDOS/8d8d31ac-5619-43aa-9270-0aa1f2328221/scratchpad"
cat > "$SCRATCH/test-recalc-costo.js" <<'EOF'
function evalExpr(raw){
  if(raw==null)return null;
  let s=String(raw).trim();
  if(s==='')return null;
  s=s.replace(/[.,]/g,'').replace(/[xX]/g,'*');
  if(!/^[0-9+\-*/()\s]+$/.test(s)||!/[0-9]/.test(s))return null;
  try{const v=Function('"use strict";return('+s+')')();return(typeof v==='number'&&isFinite(v))?Math.round(v):null}catch(e){return null}
}
function displayMoneyVal(raw){if(raw==null||String(raw).trim()==='')return'';const v=evalExpr(raw);return v==null?String(raw):'$'+v.toLocaleString('es-CO')}
let lastSetValue=null;
function recalcCostoTotal(fCostos,id){
  const c=fCostos.find(x=>x.id===id);
  if(!c||!c.cantidad)return;
  const unit=evalExpr(c.valor_unitario);
  if(unit==null)return;
  const cant=parseInt(String(c.cantidad||0).replace(/\D/g,''))||0;
  c.monto=String(cant*unit);
  lastSetValue=displayMoneyVal(c.monto);
}
function assertEq(a,e,l){if(a!==e){console.error('FAIL '+l+': got',a,'expected',e);process.exitCode=1}else console.log('OK   '+l+':',a)}

let fCostos=[{id:'c1',descripcion:'Camisetas',cantidad:'29',valor_unitario:'7800',monto:''}];
recalcCostoTotal(fCostos,'c1');
assertEq(fCostos[0].monto,'226200','29 x 7800 = 226200');
assertEq(lastSetValue,'$226.200','display del total recalculado');

fCostos=[{id:'c1',descripcion:'x',cantidad:'',valor_unitario:'5000',monto:'9999'}];
recalcCostoTotal(fCostos,'c1');
assertEq(fCostos[0].monto,'9999','cantidad vacia: Total NO se toca');

fCostos=[{id:'c1',descripcion:'x',cantidad:'5',valor_unitario:'abc',monto:'9999'}];
recalcCostoTotal(fCostos,'c1');
assertEq(fCostos[0].monto,'9999','valor_unitario invalido: Total NO se toca');

fCostos=[{id:'c1',descripcion:'x',cantidad:'5',valor_unitario:'0',monto:'9999'}];
recalcCostoTotal(fCostos,'c1');
assertEq(fCostos[0].monto,'0','valor_unitario en 0 a proposito: SI se recalcula (a 0)');

fCostos=[{id:'c1',descripcion:'x',cantidad:'3',valor_unitario:'1000+500',monto:''}];
recalcCostoTotal(fCostos,'c1');
assertEq(fCostos[0].monto,'4500','valor_unitario con expresion: 3 x (1000+500)');
EOF
node "$SCRATCH/test-recalc-costo.js"
```
Expected: las 5 líneas imprimen `OK` (sin ningún `FAIL`).

- [ ] **Step 7: Commit**

```bash
cd "i:/AGENCIA PEDIDOS/agencia"
git add public/index.html
git commit -m "[FEATURE] Costos del pedido: Cantidad y Valor unitario con recalculo en vivo (Fase 2D)"
```

---

## Task 3: Verificación final

- [ ] **Step 1: Suite combinada**

Run: `cd "i:/AGENCIA PEDIDOS/agencia" && node -c server.js && echo "server OK"`

Run (igual patrón de extracción ya usado): confirmar `node -c` del `<script>` sin errores.

- [ ] **Step 2: Regresión de endpoints existentes**

Run (servidor levantado): repetir el patrón de curl del Task 1 Step 2 contra `/api/pedidos`, `/api/clientes`, `/api/stats` y confirmar `HTTP 200` en los tres — esta tarea no debería afectarlos, pero `costos` es una tabla que `pedidoCompleto()` lee siempre.

- [ ] **Step 3: Checklist manual para el usuario (el agente no tiene navegador)**

Pedir al usuario que, en `npm start`, abra un pedido cualquiera, vaya a la sección de Costos (colapsable "Registro") y confirme:
1. Cada ítem de costo ahora muestra 4 campos: Detalle, Cant., V. unit., Total.
2. Escribir Cantidad=29 y Valor unitario=7800 hace que Total muestre `$226.200` (29×7.800, mismo ejemplo del documento maestro).
3. Escribir directamente en Total después de eso, y luego volver a tocar Cantidad: el valor escrito a mano en Total se pierde y se recalcula (comportamiento esperado, confirmado con el usuario).
4. Dejar Cantidad o Valor unitario vacíos: Total sigue aceptando texto/expresiones manuales exactamente igual que antes.
5. Guardar el pedido, recargar la página, volver a abrirlo: Cantidad/Valor unitario/Total persisten.

- [ ] **Step 4: Push (solo con confirmación explícita del usuario)**

No ejecutar automáticamente:
```bash
git push origin main
```
