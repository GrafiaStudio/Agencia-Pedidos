# Marcar ítems como suministrados Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Checkbox por ítem de Encargo para marcarlo como suministrado/entregado, independiente del estado del encargo y del pedido.

**Architecture:** Una columna nueva en `enc_items`, persistida a través de `saveEncargos` (ya recibe el array completo de ítems en cada guardado). Sin endpoints nuevos — reutiliza `setItem` ya genérico en el frontend.

**Tech Stack:** Node.js + Express + better-sqlite3 (backend), HTML/CSS/JS vanilla (frontend).

## Global Constraints

- No afecta inventario, estado del encargo, ni cálculos de Registros — puramente visual/checklist.
- `git push origin main` no requiere confirmación previa (autorización del usuario).

---

## Task 1: Backend — columna y persistencia

**Files:**
- Modify: `agencia/server.js`

- [ ] **Step 1: Migración**

Releer primero con `grep -n -A1 'ALTER TABLE enc_items ADD COLUMN valor_unitario_calc' agencia/server.js` (debe estar cerca de las demás migraciones de `enc_items`). Cambiar:

```js
try { db.exec("ALTER TABLE enc_items ADD COLUMN valor_unitario_calc TEXT"); } catch(e){}
```

por:

```js
try { db.exec("ALTER TABLE enc_items ADD COLUMN valor_unitario_calc TEXT"); } catch(e){}
try { db.exec("ALTER TABLE enc_items ADD COLUMN suministrado INTEGER DEFAULT 0"); } catch(e){}
```

- [ ] **Step 2: `saveEncargos` persiste `suministrado`**

Releer primero con `grep -n -A8 "^function saveEncargos" agencia/server.js` para confirmar el bloque completo exacto. Cambiar:

```js
    (enc.items||[]).forEach((it,j)=>{
      db.prepare('INSERT INTO enc_items(id,encargo_id,cantidad,detalle,valor_unitario,valor_unitario_calc,ficha_id,orden,workspace_id)VALUES(?,?,?,?,?,?,?,?,?)').run(uid(),eid,it.cantidad||'',it.detalle||'',it.valor_unitario||'0',normCalc(it.valor_unitario)||'0',it.ficha_id||null,j,wsId);
    });
```

por:

```js
    (enc.items||[]).forEach((it,j)=>{
      db.prepare('INSERT INTO enc_items(id,encargo_id,cantidad,detalle,valor_unitario,valor_unitario_calc,ficha_id,suministrado,orden,workspace_id)VALUES(?,?,?,?,?,?,?,?,?,?)').run(uid(),eid,it.cantidad||'',it.detalle||'',it.valor_unitario||'0',normCalc(it.valor_unitario)||'0',it.ficha_id||null,it.suministrado?1:0,j,wsId);
    });
```

- [ ] **Step 3: Verificar sintaxis**

Run: `cd "i:/AGENCIA PEDIDOS/agencia" && node -c server.js && echo OK`
Expected: `OK`.

- [ ] **Step 4: Probar con curl**

Run (verificar primero que el puerto 3000 está libre):
```bash
cd "i:/AGENCIA PEDIDOS/agencia"
npm start &
for i in 1 2 3 4 5 6 7 8 9 10; do curl -s -m 1 http://localhost:3000/ -o /dev/null && break; sleep 1; done
TOKEN=$(curl -s -m 5 -X POST http://localhost:3000/api/auth/login -H "Content-Type: application/json" -d '{"pin":"1234"}' | grep -o '"token":"[^"]*"' | cut -d'"' -f4)
RESP=$(curl -s -m 5 -X POST http://localhost:3000/api/pedidos -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{"nombre":"Test Suministrado","encargos":[{"items":[{"cantidad":"2","detalle":"Item A","suministrado":true},{"cantidad":"1","detalle":"Item B","suministrado":false}]}]}')
echo "$RESP" | grep -o '"suministrado":[a-z]*'
PID1=$(echo "$RESP" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
curl -s -m 5 -X DELETE "http://localhost:3000/api/pedidos/$PID1" -H "Authorization: Bearer $TOKEN" -o /dev/null
PID=$(netstat -ano | grep ':3000' | grep LISTENING | head -1 | awk '{print $NF}'); [ -n "$PID" ] && taskkill //F //PID "$PID"
```
Expected: `"suministrado":true` y `"suministrado":false` (uno de cada, en el mismo orden en que se mandaron).

- [ ] **Step 5: Commit**

```bash
cd "i:/AGENCIA PEDIDOS/agencia"
git add server.js
git commit -m "[FEATURE] Marcar items como suministrados: columna y persistencia (Fase 4-B remanente)"
```

---

## Task 2: Frontend — checkbox por ítem

**Files:**
- Modify: `agencia/public/index.html` (encabezado de la tabla de ítems; `renderItemsHTML`)

- [ ] **Step 1: Encabezado de la tabla**

Releer primero con `grep -n 'id="it-\${enc.id}"' agencia/public/index.html` para confirmar el bloque exacto (incluye el `<thead>` en la misma línea o la siguiente). Cambiar:

```html
          <thead><tr><th style="width:70px">Cant.</th><th>Detalle / Especificación</th><th style="width:100px">V. Unitario</th><th style="width:30px"></th></tr></thead>
```

por:

```html
          <thead><tr><th style="width:70px">Cant.</th><th>Detalle / Especificación</th><th style="width:100px">V. Unitario</th><th style="width:34px" title="Suministrado">✓</th><th style="width:30px"></th></tr></thead>
```

- [ ] **Step 2: Checkbox por fila + atenuar fila suministrada**

Releer primero con `grep -n -A12 "^function renderItemsHTML" agencia/public/index.html` para confirmar el bloque completo exacto (incluye la línea larga de Valor unitario y el botón de eliminar). Cambiar:

```js
function renderItemsHTML(enc){
  return(enc.items||[]).map((it,j)=>{
    const stockDisp=(it._fichaSel&&it._fichaSel.stock_actual!=null)?it._fichaSel.stock_actual:null;
    const cantNum=parseInt(String(it.cantidad||0).replace(/\D/g,''))||0;
    const stockWarn=(stockDisp!=null&&cantNum>stockDisp)?`Stock insuficiente (quedan ${stockDisp})`:'';
    return`
    <tr>
```

por:

```js
function renderItemsHTML(enc){
  return(enc.items||[]).map((it,j)=>{
    const stockDisp=(it._fichaSel&&it._fichaSel.stock_actual!=null)?it._fichaSel.stock_actual:null;
    const cantNum=parseInt(String(it.cantidad||0).replace(/\D/g,''))||0;
    const stockWarn=(stockDisp!=null&&cantNum>stockDisp)?`Stock insuficiente (quedan ${stockDisp})`:'';
    return`
    <tr${it.suministrado?' style="opacity:.55"':''}>
```

Y, en la misma función, cambiar (el botón de eliminar, al final de la fila):

```js
      <td style="width:30px"><button class="item-del" onclick="remItem('${enc.id}','${it.id}')"><i class="ti ti-x"></i></button></td>
    </tr>`;
  }).join('');
}
```

por:

```js
      <td style="width:34px;text-align:center"><input type="checkbox" title="Suministrado" ${it.suministrado?'checked':''} onchange="setItem('${enc.id}','${it.id}','suministrado',this.checked)"></td>
      <td style="width:30px"><button class="item-del" onclick="remItem('${enc.id}','${it.id}')"><i class="ti ti-x"></i></button></td>
    </tr>`;
  }).join('');
}
```

(`setItem` ya es genérico — `it[k]=v` acepta cualquier campo, incluido `'suministrado'`, sin tocar esa función.)

- [ ] **Step 3: Verificar sintaxis**

Run:
```bash
cd "i:/AGENCIA PEDIDOS/agencia"
SCRATCH="C:/Users/ADMIN/AppData/Local/Temp/claude/i--AGENCIA-PEDIDOS/8d8d31ac-5619-43aa-9270-0aa1f2328221/scratchpad"
awk '/<script>/{f=1;next}/<\/script>/{f=0}f' public/index.html > "$SCRATCH/check.js"
node -c "$SCRATCH/check.js" && echo OK
```
Expected: `OK`.

- [ ] **Step 4: Verificación funcional**

Run:
```bash
cd "i:/AGENCIA PEDIDOS/agencia"
npm start &
for i in 1 2 3 4 5 6 7 8 9 10; do curl -s -m 1 http://localhost:3000/ -o /dev/null && break; sleep 1; done
curl -s -m 5 http://localhost:3000/ | grep -c 'Suministrado\|it.suministrado'
TOKEN=$(curl -s -m 5 -X POST http://localhost:3000/api/auth/login -H "Content-Type: application/json" -d '{"pin":"1234"}' | grep -o '"token":"[^"]*"' | cut -d'"' -f4)
curl -s -m 5 -o /dev/null -w "pedidos HTTP %{http_code}\n" http://localhost:3000/api/pedidos -H "Authorization: Bearer $TOKEN"
PID=$(netstat -ano | grep ':3000' | grep LISTENING | head -1 | awk '{print $NF}'); [ -n "$PID" ] && taskkill //F //PID "$PID"
```
Expected: el `grep -c` da al menos `2`; `pedidos` responde `HTTP 200`.

- [ ] **Step 5: Commit**

```bash
cd "i:/AGENCIA PEDIDOS/agencia"
git add public/index.html
git commit -m "[FEATURE] Marcar items como suministrados: checkbox por fila (Fase 4-B remanente)"
```

---

## Task 3: Verificación final

- [ ] **Step 1: Suite combinada + regresión**

Run:
```bash
cd "i:/AGENCIA PEDIDOS/agencia"
node -c server.js && echo "server OK"
SCRATCH="C:/Users/ADMIN/AppData/Local/Temp/claude/i--AGENCIA-PEDIDOS/8d8d31ac-5619-43aa-9270-0aa1f2328221/scratchpad"
awk '/<script>/{f=1;next}/<\/script>/{f=0}f' public/index.html > "$SCRATCH/check.js"
node -c "$SCRATCH/check.js" && echo "script OK"
```
Expected: ambos `OK`. Confirmar `git status --short` sin cambios sin commitear.

- [ ] **Step 2: Checklist manual para el usuario (el agente no tiene navegador)**

Pedir al usuario que, en un pedido con un encargo de varios ítems, marque el checkbox de uno y confirme que esa fila se ve atenuada (no las demás), que guarda y al reabrir el pedido sigue marcado.

- [ ] **Step 3: Push**

```bash
git push origin main
```
