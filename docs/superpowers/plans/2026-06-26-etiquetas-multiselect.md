# Multi-selección de Etiquetas/Subetiquetas en Encargos Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir elegir varias Etiquetas y varias Subetiquetas (mezcladas) por Encargo, sin perder la lectura de datos ya guardados con una sola etiqueta/subetiqueta.

**Architecture:** Columnas nuevas `encargos.categorias`/`subcategorias` (JSON array). Un helper `resolverCategoriasEncargo(enc)` resuelve, para cualquier encargo leído de la base, un array limpio: usa la columna nueva si tiene contenido, si no cae a la columna vieja (`categoria`/`subcategoria`) como array de un elemento. Las columnas viejas no se vuelven a escribir desde ahora, solo se leen como respaldo de datos históricos.

**Tech Stack:** Node.js + Express + better-sqlite3 (backend), HTML/CSS/JS vanilla (frontend).

## Global Constraints

- No se migra ni reescribe ningún encargo ya guardado — el shim de lectura cubre los datos viejos.
- Sin validación nueva de integridad sobre `categorias`/`subcategorias` — mismo nivel (ninguno) que ya tenía esto.
- Subetiquetas mezcladas: el picker muestra la unión de `subs` de todas las etiquetas elegidas, sin agrupar por etiqueta de origen (confirmado con el usuario).
- `git push origin main` no requiere confirmación previa (autorización del usuario).

---

## Task 1: Backend — modelo de datos y guardado

**Files:**
- Modify: `agencia/server.js`

**Interfaces:**
- Produces: `resolverCategoriasEncargo(enc)` — muta `enc.categorias`/`enc.subcategorias` a arrays limpios.

- [ ] **Step 1: Migración**

Releer primero con `grep -n -A1 'ALTER TABLE enc_items ADD COLUMN suministrado' agencia/server.js`. Cambiar:

```js
try { db.exec("ALTER TABLE enc_items ADD COLUMN suministrado INTEGER DEFAULT 0"); } catch(e){}
```

por:

```js
try { db.exec("ALTER TABLE enc_items ADD COLUMN suministrado INTEGER DEFAULT 0"); } catch(e){}
try { db.exec("ALTER TABLE encargos ADD COLUMN categorias TEXT DEFAULT '[]'"); } catch(e){}
try { db.exec("ALTER TABLE encargos ADD COLUMN subcategorias TEXT DEFAULT '[]'"); } catch(e){}
```

- [ ] **Step 2: Helper `resolverCategoriasEncargo`**

Releer primero con `grep -n -A2 "^function pedidoCompleto" agencia/server.js` para confirmar el ancla exacta. Inmediatamente antes de `function pedidoCompleto(p){`, agregar:

```js
function resolverCategoriasEncargo(enc){
  let cats=[]; try{cats=JSON.parse(enc.categorias||'[]')}catch(e){cats=[]}
  if(!cats.length&&enc.categoria)cats=[enc.categoria];
  let subs=[]; try{subs=JSON.parse(enc.subcategorias||'[]')}catch(e){subs=[]}
  if(!subs.length&&enc.subcategoria)subs=[enc.subcategoria];
  enc.categorias=cats;
  enc.subcategorias=subs;
}
```

- [ ] **Step 3: `pedidoCompleto` resuelve categorías por encargo**

Releer primero con `grep -n -A4 "^function pedidoCompleto" agencia/server.js`. Cambiar:

```js
function pedidoCompleto(p){
  if(!p)return null;
  const encargos=db.prepare('SELECT * FROM encargos WHERE pedido_id=? ORDER BY orden').all(p.id);
  encargos.forEach(enc=>{enc.items=db.prepare('SELECT * FROM enc_items WHERE encargo_id=? ORDER BY orden').all(enc.id)});
```

por:

```js
function pedidoCompleto(p){
  if(!p)return null;
  const encargos=db.prepare('SELECT * FROM encargos WHERE pedido_id=? ORDER BY orden').all(p.id);
  encargos.forEach(enc=>{enc.items=db.prepare('SELECT * FROM enc_items WHERE encargo_id=? ORDER BY orden').all(enc.id);resolverCategoriasEncargo(enc)});
```

- [ ] **Step 4: `saveEncargos` persiste los arrays nuevos**

Releer primero con `grep -n -A8 "^function saveEncargos" agencia/server.js`. Cambiar:

```js
    db.prepare('INSERT INTO encargos(id,pedido_id,numero,categoria,subcategoria,estado,valor,valor_calc,anotacion,orden,workspace_id)VALUES(?,?,?,?,?,?,?,?,?,?,?)')
      .run(eid,pid,enc.numero||i+1,enc.categoria||'',enc.subcategoria||'',enc.estado||'Nuevo',enc.valor||'',normCalc(enc.valor),enc.anotacion||'',i,wsId);
```

por:

```js
    db.prepare('INSERT INTO encargos(id,pedido_id,numero,categoria,subcategoria,categorias,subcategorias,estado,valor,valor_calc,anotacion,orden,workspace_id)VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)')
      .run(eid,pid,enc.numero||i+1,'','',JSON.stringify(enc.categorias||[]),JSON.stringify(enc.subcategorias||[]),enc.estado||'Nuevo',enc.valor||'',normCalc(enc.valor),enc.anotacion||'',i,wsId);
```

(Las columnas viejas `categoria`/`subcategoria` quedan vacías para encargos guardados desde ahora — ya no se usan para nada nuevo, solo siguen existiendo por los encargos guardados antes de este cambio.)

- [ ] **Step 5: Verificar sintaxis**

Run: `cd "i:/AGENCIA PEDIDOS/agencia" && node -c server.js && echo OK`
Expected: `OK`.

- [ ] **Step 6: Probar con curl**

Run:
```bash
cd "i:/AGENCIA PEDIDOS/agencia"
npm start &
for i in 1 2 3 4 5 6 7 8 9 10; do curl -s -m 1 http://localhost:3000/ -o /dev/null && break; sleep 1; done
TOKEN=$(curl -s -m 5 -X POST http://localhost:3000/api/auth/login -H "Content-Type: application/json" -d '{"pin":"1234"}' | grep -o '"token":"[^"]*"' | cut -d'"' -f4)
RESP=$(curl -s -m 5 -X POST http://localhost:3000/api/pedidos -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{"nombre":"Test Multi","encargos":[{"categorias":["estampados","diseno"],"subcategorias":["Camisetas","Branding"]}]}')
echo "$RESP" | grep -o '"categorias":\[[^]]*\]\|"subcategorias":\[[^]]*\]'
PID1=$(echo "$RESP" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
curl -s -m 5 -X DELETE "http://localhost:3000/api/pedidos/$PID1" -H "Authorization: Bearer $TOKEN" -o /dev/null
PID=$(netstat -ano | grep ':3000' | grep LISTENING | head -1 | awk '{print $NF}'); [ -n "$PID" ] && taskkill //F //PID "$PID"
```
Expected: `"categorias":["estampados","diseno"]` y `"subcategorias":["Camisetas","Branding"]`.

- [ ] **Step 7: Commit**

```bash
cd "i:/AGENCIA PEDIDOS/agencia"
git add server.js
git commit -m "[FEATURE] Etiquetas: encargos guardan multiples categorias/subcategorias"
```

---

## Task 2: Backend — historial de cliente y export CSV

**Files:**
- Modify: `agencia/server.js`

- [ ] **Step 1: `GET /api/clientes/:id` resuelve arrays en `encargosResumen`**

Releer primero con `grep -n -A11 "^app.get('/api/clientes/:id'" agencia/server.js` para confirmar el bloque completo exacto. Cambiar:

```js
    const encs=db.prepare('SELECT id,categoria,subcategoria,valor,valor_calc FROM encargos WHERE pedido_id=? ORDER BY orden').all(p.id);
    encs.forEach(e=>{e.items=db.prepare('SELECT cantidad,valor_unitario,valor_unitario_calc FROM enc_items WHERE encargo_id=?').all(e.id)});
    p.valor_sugerido=calcValorSugerido(encs);
    p.valor_total=valorOficialPedido(p,p.valor_sugerido);
    p.encargosResumen=encs.map(e=>({categoria:e.categoria,subcategoria:e.subcategoria}));
```

por:

```js
    const encs=db.prepare('SELECT id,categoria,subcategoria,categorias,subcategorias,valor,valor_calc FROM encargos WHERE pedido_id=? ORDER BY orden').all(p.id);
    encs.forEach(e=>{e.items=db.prepare('SELECT cantidad,valor_unitario,valor_unitario_calc FROM enc_items WHERE encargo_id=?').all(e.id);resolverCategoriasEncargo(e)});
    p.valor_sugerido=calcValorSugerido(encs);
    p.valor_total=valorOficialPedido(p,p.valor_sugerido);
    p.encargosResumen=encs.map(e=>({categorias:e.categorias,subcategorias:e.subcategorias}));
```

- [ ] **Step 2: `GET /api/export/csv` usa los arrays**

Releer primero con `grep -n "const encRes=" agencia/server.js`. Cambiar:

```js
    const encRes=(p.encargos||[]).map(e=>`[${e.categoria||''}] ${(e.items||[]).map(i=>`${i.cantidad} ${i.detalle}`).join(', ')}`).join(' | ');
```

por:

```js
    const encRes=(p.encargos||[]).map(e=>`[${(e.categorias||[]).join(', ')}] ${(e.items||[]).map(i=>`${i.cantidad} ${i.detalle}`).join(', ')}`).join(' | ');
```

- [ ] **Step 3: Verificar sintaxis**

Run: igual que Task 1 Step 5.
Expected: `OK`.

- [ ] **Step 4: Probar con curl**

Run:
```bash
cd "i:/AGENCIA PEDIDOS/agencia"
npm start &
for i in 1 2 3 4 5 6 7 8 9 10; do curl -s -m 1 http://localhost:3000/ -o /dev/null && break; sleep 1; done
TOKEN=$(curl -s -m 5 -X POST http://localhost:3000/api/auth/login -H "Content-Type: application/json" -d '{"pin":"1234"}' | grep -o '"token":"[^"]*"' | cut -d'"' -f4)
RESP=$(curl -s -m 5 -X POST http://localhost:3000/api/pedidos -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{"nombre":"Test Multi Cliente","encargos":[{"categorias":["estampados","diseno"],"subcategorias":["Camisetas"]}]}')
PID1=$(echo "$RESP" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
CID=$(echo "$RESP" | grep -o '"cliente_id":"[^"]*"' | head -1 | cut -d'"' -f4)
echo "--- historial del cliente debe traer los arrays ---"
curl -s -m 5 "http://localhost:3000/api/clientes/$CID" -H "Authorization: Bearer $TOKEN" | grep -o '"categorias":\[[^]]*\]'
echo "--- CSV debe traer ambas categorias en el texto del encargo ---"
curl -s -m 5 "http://localhost:3000/api/export/csv" -H "Authorization: Bearer $TOKEN" | grep -o 'estampados, diseno'
curl -s -m 5 -X DELETE "http://localhost:3000/api/pedidos/$PID1" -H "Authorization: Bearer $TOKEN" -o /dev/null
PID=$(netstat -ano | grep ':3000' | grep LISTENING | head -1 | awk '{print $NF}'); [ -n "$PID" ] && taskkill //F //PID "$PID"
```
Expected: `"categorias":["estampados","diseno"]` en el historial; `estampados, diseno` presente en el CSV.

- [ ] **Step 5: Commit**

```bash
cd "i:/AGENCIA PEDIDOS/agencia"
git add server.js
git commit -m "[FEATURE] Etiquetas: historial de cliente y export CSV usan multiples categorias"
```

---

## Task 3: Frontend — selección múltiple en el modal de Encargo

**Files:**
- Modify: `agencia/public/index.html` (`setEncCat`/`setEncSub` → `toggleEncCat`/`toggleEncSub`; markup de botones; `renderEncSubcats`)

**Interfaces:**
- Produces: `toggleEncCat(id,catId)`, `toggleEncSub(id,sub)` — reemplazan `setEncCat`/`setEncSub`.

- [ ] **Step 1: `toggleEncCat`/`toggleEncSub`**

Releer primero con `grep -n "function setEncCat\|function setEncSub" agencia/public/index.html` para confirmar las 2 líneas exactas. Cambiar:

```js
function setEncCat(id,cat){const e=fEnc.find(x=>x.id===id);if(e){e.categoria=cat;e.subcategoria=''}renderEncs()}
function setEncSub(id,sub){const e=fEnc.find(x=>x.id===id);if(e)e.subcategoria=sub;renderEncSubcats(id)}
```

por:

```js
function toggleEncCat(id,catId){
  const e=fEnc.find(x=>x.id===id);
  if(!e)return;
  e.categorias=e.categorias||[];
  const i=e.categorias.indexOf(catId);
  if(i>=0)e.categorias.splice(i,1);else e.categorias.push(catId);
  const subsValidas=new Set(e.categorias.flatMap(cid=>CATS.find(c=>c.id===cid)?.subs||[]));
  e.subcategorias=(e.subcategorias||[]).filter(s=>subsValidas.has(s));
  renderEncs();
}
function toggleEncSub(id,sub){
  const e=fEnc.find(x=>x.id===id);
  if(!e)return;
  e.subcategorias=e.subcategorias||[];
  const i=e.subcategorias.indexOf(sub);
  if(i>=0)e.subcategorias.splice(i,1);else e.subcategorias.push(sub);
  renderEncSubcats(id);
}
```

- [ ] **Step 2: Markup de botones de etiqueta/subetiqueta**

Releer primero con `grep -n -A6 'class="cat-row"' agencia/public/index.html` para confirmar el bloque completo exacto. Cambiar:

```html
          <div class="cat-row" style="margin-bottom:${enc.categoria?'6px':'0'}">
            ${CATS.map(c=>`<button class="cat-btn${enc.categoria===c.id?' sel':''}" onclick="setEncCat('${enc.id}','${c.id}')">${c.label}</button>`).join('')}
          </div>
          <div class="subcat-row" id="sc-${enc.id}" style="margin-bottom:0">
            ${enc.categoria?CATS.find(c=>c.id===enc.categoria)?.subs.map(s=>`<button class="scat-btn${enc.subcategoria===s?' sel':''}" onclick="setEncSub('${enc.id}','${s}')">${s}</button>`).join(''):''}
          </div>
```

por:

```html
          <div class="cat-row" style="margin-bottom:${(enc.categorias||[]).length?'6px':'0'}">
            ${CATS.map(c=>`<button class="cat-btn${(enc.categorias||[]).includes(c.id)?' sel':''}" onclick="toggleEncCat('${enc.id}','${c.id}')">${c.label}</button>`).join('')}
          </div>
          <div class="subcat-row" id="sc-${enc.id}" style="margin-bottom:0">
            ${(enc.categorias||[]).length?[...new Set((enc.categorias||[]).flatMap(cid=>CATS.find(c=>c.id===cid)?.subs||[]))].map(s=>`<button class="scat-btn${(enc.subcategorias||[]).includes(s)?' sel':''}" onclick="toggleEncSub('${enc.id}','${s}')">${s}</button>`).join(''):''}
          </div>
```

- [ ] **Step 3: `renderEncSubcats` con unión de subetiquetas**

Releer primero con `grep -n -A9 "^function renderEncSubcats" agencia/public/index.html` para confirmar el bloque completo exacto. Cambiar:

```js
function renderEncSubcats(id){
  const enc=fEnc.find(x=>x.id===id);
  if(!enc)return;
  const sw=document.getElementById('sc-'+id);
  if(!sw)return;
  if(!enc.categoria){sw.innerHTML='';return}
  const cat=CATS.find(c=>c.id===enc.categoria);
  if(!cat){sw.innerHTML='';return}
  sw.innerHTML=cat.subs.map(s=>`<button class="scat-btn${enc.subcategoria===s?' sel':''}" onclick="setEncSub('${enc.id}','${s}')">${s}</button>`).join('');
}
```

por:

```js
function renderEncSubcats(id){
  const enc=fEnc.find(x=>x.id===id);
  if(!enc)return;
  const sw=document.getElementById('sc-'+id);
  if(!sw)return;
  const cats=(enc.categorias||[]).map(cid=>CATS.find(c=>c.id===cid)).filter(Boolean);
  if(!cats.length){sw.innerHTML='';return}
  const subs=[...new Set(cats.flatMap(c=>c.subs))];
  sw.innerHTML=subs.map(s=>`<button class="scat-btn${(enc.subcategorias||[]).includes(s)?' sel':''}" onclick="toggleEncSub('${enc.id}','${s}')">${s}</button>`).join('');
}
```

- [ ] **Step 4: Verificar sintaxis**

Run:
```bash
cd "i:/AGENCIA PEDIDOS/agencia"
SCRATCH="C:/Users/ADMIN/AppData/Local/Temp/claude/i--AGENCIA-PEDIDOS/8d8d31ac-5619-43aa-9270-0aa1f2328221/scratchpad"
awk '/<script>/{f=1;next}/<\/script>/{f=0}f' public/index.html > "$SCRATCH/check.js"
node -c "$SCRATCH/check.js" && echo OK
```
Expected: `OK`.

- [ ] **Step 5: Commit**

```bash
cd "i:/AGENCIA PEDIDOS/agencia"
git add public/index.html
git commit -m "[FEATURE] Etiquetas: seleccion multiple de etiqueta/subetiqueta en el modal de Encargo"
```

---

## Task 4: Frontend — badges del pedido y resumen de historial

**Files:**
- Modify: `agencia/public/index.html` (`renderLista`; `verCli`)

- [ ] **Step 1: `renderLista` junta categorías de todos los encargos**

Releer primero con `grep -n "const cats=\[...new Set" agencia/public/index.html`. Cambiar:

```js
    const cats=[...new Set((p.encargos||[]).map(e=>e.categoria).filter(Boolean))];
```

por:

```js
    const cats=[...new Set((p.encargos||[]).flatMap(e=>e.categorias||[]))];
```

- [ ] **Step 2: `verCli` muestra varias etiquetas/subetiquetas por encargo**

Releer primero con `grep -n -A3 "const resumen=" agencia/public/index.html` para confirmar el bloque completo exacto. Cambiar:

```js
      const resumen=(p.encargosResumen||[]).map(e=>{
        const cat=CATS.find(x=>x.id===e.categoria);
        return[cat?cat.label:e.categoria,e.subcategoria].filter(Boolean).join(' - ');
      }).filter(Boolean).join(', ');
```

por:

```js
      const resumen=(p.encargosResumen||[]).map(e=>{
        const catLabels=(e.categorias||[]).map(id=>CATS.find(c=>c.id===id)?.label||id).join(', ');
        const subLabels=(e.subcategorias||[]).join(', ');
        return[catLabels,subLabels].filter(Boolean).join(' - ');
      }).filter(Boolean).join(', ');
```

- [ ] **Step 3: Verificar sintaxis**

Run: igual que Task 3 Step 4.
Expected: `OK`.

- [ ] **Step 4: Verificación funcional**

Run:
```bash
cd "i:/AGENCIA PEDIDOS/agencia"
npm start &
for i in 1 2 3 4 5 6 7 8 9 10; do curl -s -m 1 http://localhost:3000/ -o /dev/null && break; sleep 1; done
curl -s -m 5 http://localhost:3000/ | grep -c 'toggleEncCat\|toggleEncSub'
TOKEN=$(curl -s -m 5 -X POST http://localhost:3000/api/auth/login -H "Content-Type: application/json" -d '{"pin":"1234"}' | grep -o '"token":"[^"]*"' | cut -d'"' -f4)
curl -s -m 5 -o /dev/null -w "pedidos HTTP %{http_code}\n" http://localhost:3000/api/pedidos -H "Authorization: Bearer $TOKEN"
curl -s -m 5 -o /dev/null -w "clientes HTTP %{http_code}\n" http://localhost:3000/api/clientes -H "Authorization: Bearer $TOKEN"
PID=$(netstat -ano | grep ':3000' | grep LISTENING | head -1 | awk '{print $NF}'); [ -n "$PID" ] && taskkill //F //PID "$PID"
```
Expected: el `grep -c` da al menos `4`; ambos endpoints en `HTTP 200`.

- [ ] **Step 5: Commit**

```bash
cd "i:/AGENCIA PEDIDOS/agencia"
git add public/index.html
git commit -m "[FEATURE] Etiquetas: badges del pedido y resumen de historial con multiples categorias"
```

---

## Task 5: Verificación final

- [ ] **Step 1: Suite combinada + regresión completa**

Run:
```bash
cd "i:/AGENCIA PEDIDOS/agencia"
node -c server.js && echo "server OK"
SCRATCH="C:/Users/ADMIN/AppData/Local/Temp/claude/i--AGENCIA-PEDIDOS/8d8d31ac-5619-43aa-9270-0aa1f2328221/scratchpad"
awk '/<script>/{f=1;next}/<\/script>/{f=0}f' public/index.html > "$SCRATCH/check.js"
node -c "$SCRATCH/check.js" && echo "script OK"
```
Expected: ambos `OK`.

- [ ] **Step 2: Regresión — un pedido viejo con una sola categoría (formato anterior) sigue mostrando su etiqueta correctamente**

Run (servidor levantado, mismo patrón de espera): crear un pedido usando el formato VIEJO (sin `categorias`, solo si la API todavía aceptara `categoria` — dado que `saveEncargos` ya no lee `enc.categoria` del body, este caso ya no aplica para pedidos NUEVOS; en su lugar, simular un dato viejo insertando directo en la tabla no es parte de este plan — en cambio, confirmar leyendo cualquier pedido real ya existente en la base local que tenga `categoria` poblada de antes de este cambio, y confirmar que `GET /api/pedidos` lo sigue devolviendo con `categorias` resuelta como array de un elemento). Si no hay ningún pedido viejo en la base local de pruebas, anotar esto en el reporte final en vez de inventar uno — la regresión real se confirma en producción con datos reales ya existentes.

- [ ] **Step 3: Checklist manual para el usuario (el agente no tiene navegador)**

Pedir al usuario que, en un Encargo, marque dos o más Etiquetas a la vez y confirme que ambas quedan resaltadas; que las Subetiquetas mostradas sean la mezcla de las dos; que pueda marcar varias Subetiquetas también; que al quitar una Etiqueta, las Subetiquetas que ya no correspondan a ninguna elegida se desmarquen solas. Confirmar que un pedido viejo (de antes de este cambio) sigue mostrando su etiqueta de siempre sin romperse.

- [ ] **Step 4: Push**

```bash
git push origin main
```
