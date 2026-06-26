# Costos automáticos desde insumos Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Al usar un producto con insumos en un Encargo, sus costos se reflejan solos en la sección Costos del pedido, escalados por cantidad, sin tocar las líneas que el usuario escribió a mano.

**Architecture:** 100% frontend, sin cambios de backend ni de esquema. Las líneas automáticas son entradas normales de `fCostos` marcadas con una bandera transitoria `_auto:true` (nunca se manda al backend en ningún sentido especial — `guardar()` ya manda `costos:fCostos` completo tal cual, sin cambios). Se recalculan desde cero (quitando las viejas, agregando las nuevas) cada vez que cambia algo relevante: seleccionar/quitar un ítem, cambiar su cantidad, o abrir un pedido ya guardado para editar.

**Tech Stack:** HTML/CSS/JS vanilla (frontend).

## Global Constraints

- Sin cambios de backend, de esquema ni de API.
- Las líneas automáticas son editables/borrables como cualquier costo — el cambio se respeta solo para ese guardado; al reabrir el pedido se recalculan de cero.
- `it._fichaSel` es transitorio — al abrir un pedido ya guardado, hay que resolverlo primero (vía `GET /api/productos/:id`) antes de poder calcular nada.
- `git push origin main` no requiere confirmación previa (autorización del usuario).

---

## Task 1: Frontend — cálculo y recalculo de costos automáticos

**Files:**
- Modify: `agencia/public/index.html`

**Interfaces:**
- Produces: `costoTotalInsumosFicha(insumos)`, `recalcularCostosAutomaticos()`.

- [ ] **Step 1: `costoTotalInsumosFicha` y `recalcularCostosAutomaticos`**

Releer primero con `grep -n -A1 "^function addCosto" agencia/public/index.html` para confirmar el ancla exacta (única ocurrencia). Inmediatamente antes de `function addCosto(){...}`, agregar:

```js
function costoTotalInsumosFicha(insumos){
  return(insumos||[]).reduce((a,it)=>{
    const cant=parseInt(String(it.cantidad_usada||0).replace(/\D/g,''))||0;
    const unit=parseInt(String(it.costo_unitario_calc||0).replace(/\D/g,''))||0;
    return a+cant*unit;
  },0);
}
function recalcularCostosAutomaticos(){
  fCostos=fCostos.filter(c=>!c._auto);
  fEnc.forEach(e=>{
    (e.items||[]).forEach(it=>{
      if(!it._fichaSel||!it._fichaSel.insumos||!it._fichaSel.insumos.length)return;
      const costoUnit=costoTotalInsumosFicha(it._fichaSel.insumos);
      if(costoUnit<=0)return;
      const cantNum=parseInt(String(it.cantidad||0).replace(/\D/g,''))||0;
      if(cantNum<=0)return;
      fCostos.push({id:uid(),descripcion:'Insumos: '+it._fichaSel.nombre,cantidad:String(cantNum),valor_unitario:String(costoUnit),monto:String(cantNum*costoUnit),_auto:true});
    });
  });
  renderCostos();
}
```

- [ ] **Step 2: Verificar sintaxis**

Run:
```bash
cd "i:/AGENCIA PEDIDOS/agencia"
SCRATCH="C:/Users/ADMIN/AppData/Local/Temp/claude/i--AGENCIA-PEDIDOS/8d8d31ac-5619-43aa-9270-0aa1f2328221/scratchpad"
awk '/<script>/{f=1;next}/<\/script>/{f=0}f' public/index.html > "$SCRATCH/check.js"
node -c "$SCRATCH/check.js" && echo OK
```
Expected: `OK`.

- [ ] **Step 3: Prueba de lógica pura con Node**

Run:
```bash
node -e "
function costoTotalInsumosFicha(insumos){
  return(insumos||[]).reduce((a,it)=>{
    const cant=parseInt(String(it.cantidad_usada||0).replace(/\D/g,''))||0;
    const unit=parseInt(String(it.costo_unitario_calc||0).replace(/\D/g,''))||0;
    return a+cant*unit;
  },0);
}
const insumosVaso=[{cantidad_usada:'1',costo_unitario_calc:'1000'},{cantidad_usada:'2',costo_unitario_calc:'500'}];
console.log('costo de 1 vaso:', costoTotalInsumosFicha(insumosVaso));
console.log('costo de 5 vasos:', costoTotalInsumosFicha(insumosVaso)*5);
"
```
Expected: `costo de 1 vaso: 2000`; `costo de 5 vasos: 10000`.

- [ ] **Step 4: Commit**

```bash
cd "i:/AGENCIA PEDIDOS/agencia"
git add public/index.html
git commit -m "[FEATURE] Costos automaticos: calculo y recalculo desde insumos de la ficha"
```

---

## Task 2: Frontend — disparar el recálculo al seleccionar, cambiar cantidad o quitar un ítem

**Files:**
- Modify: `agencia/public/index.html` (`selItem`; `setItem`; `remItem`)

- [ ] **Step 1: `selItem` recalcula al elegir un producto**

Releer primero con `grep -n -A4 "renderEncItems\(encId\);" agencia/public/index.html` para confirmar el bloque exacto al final de `selItem` (única ocurrencia de `renderEncItems(encId);\n  actualizarValorTotal();\n}` seguida de línea en blanco y `function renderEncs()`). Cambiar:

```js
  renderEncItems(encId);
  actualizarValorTotal();
}

function renderEncs(){
```

por:

```js
  renderEncItems(encId);
  actualizarValorTotal();
  recalcularCostosAutomaticos();
}

function renderEncs(){
```

- [ ] **Step 2: `setItem` recalcula al cambiar Cantidad**

Releer primero con `grep -n -A14 "if(k==='cantidad'){" agencia/public/index.html` para confirmar el bloque completo exacto (el bloque del aviso de stock, dentro de `setItem`). Cambiar:

```js
    if(k==='cantidad'){
      const stockEl=document.getElementById('itstock-'+itemId);
      if(stockEl){
        const stockDisp=(it._fichaSel&&it._fichaSel.stock_actual!=null)?it._fichaSel.stock_actual:null;
        const cantNum2=parseInt(String(v||0).replace(/\D/g,''))||0;
        if(stockDisp!=null&&cantNum2>stockDisp){
          stockEl.textContent=`Stock insuficiente (quedan ${stockDisp})`;
          stockEl.style.display='block';
        }else{
          stockEl.style.display='none';
        }
      }
    }
  }
```

por:

```js
    if(k==='cantidad'){
      const stockEl=document.getElementById('itstock-'+itemId);
      if(stockEl){
        const stockDisp=(it._fichaSel&&it._fichaSel.stock_actual!=null)?it._fichaSel.stock_actual:null;
        const cantNum2=parseInt(String(v||0).replace(/\D/g,''))||0;
        if(stockDisp!=null&&cantNum2>stockDisp){
          stockEl.textContent=`Stock insuficiente (quedan ${stockDisp})`;
          stockEl.style.display='block';
        }else{
          stockEl.style.display='none';
        }
      }
      recalcularCostosAutomaticos();
    }
  }
```

- [ ] **Step 3: `remItem` recalcula al quitar un ítem**

Releer primero con `grep -n "^function remItem" agencia/public/index.html`. Cambiar:

```js
function remItem(encId,itemId){const e=fEnc.find(x=>x.id===encId);if(e)e.items=e.items.filter(i=>i.id!==itemId);renderEncItems(encId);actualizarValorTotal()}
```

por:

```js
function remItem(encId,itemId){const e=fEnc.find(x=>x.id===encId);if(e)e.items=e.items.filter(i=>i.id!==itemId);renderEncItems(encId);actualizarValorTotal();recalcularCostosAutomaticos()}
```

- [ ] **Step 4: Verificar sintaxis**

Run: igual que Task 1 Step 2.
Expected: `OK`.

- [ ] **Step 5: Commit**

```bash
cd "i:/AGENCIA PEDIDOS/agencia"
git add public/index.html
git commit -m "[FEATURE] Costos automaticos: recalcular al elegir, cambiar cantidad o quitar un item"
```

---

## Task 3: Frontend — resolver fichas y recalcular al abrir un pedido existente

**Files:**
- Modify: `agencia/public/index.html` (`abrirEditar`)

- [ ] **Step 1: Resolver `_fichaSel` de cada `ficha_id` y recalcular**

Releer primero con `grep -n -A10 "^async function abrirEditar(id)" agencia/public/index.html` para confirmar el bloque completo exacto. Cambiar:

```js
async function abrirEditar(id){
  const p=await api('GET',`/pedidos/${id}`);
  editId=id;editCliId=p.cliente_id||null;
  fEnc=JSON.parse(JSON.stringify(p.encargos||[]));
  // Asegurar items en cada encargo
  fEnc.forEach(e=>{if(!e.items||!e.items.length)e.items=[{id:uid(),cantidad:'',detalle:'',valor_unitario:''}]});
  encCounter=fEnc.length?Math.max(...fEnc.map(e=>e.numero||0)):0;
  fPag=JSON.parse(JSON.stringify(p.pagos||[]));
  fArch=JSON.parse(JSON.stringify(p.archivos||[]));
  fCostos=JSON.parse(JSON.stringify(p.costos||[]));
```

por:

```js
async function abrirEditar(id){
  const p=await api('GET',`/pedidos/${id}`);
  editId=id;editCliId=p.cliente_id||null;
  fEnc=JSON.parse(JSON.stringify(p.encargos||[]));
  // Asegurar items en cada encargo
  fEnc.forEach(e=>{if(!e.items||!e.items.length)e.items=[{id:uid(),cantidad:'',detalle:'',valor_unitario:''}]});
  encCounter=fEnc.length?Math.max(...fEnc.map(e=>e.numero||0)):0;
  fPag=JSON.parse(JSON.stringify(p.pagos||[]));
  fArch=JSON.parse(JSON.stringify(p.archivos||[]));
  fCostos=JSON.parse(JSON.stringify(p.costos||[]));
  const fichaIds=[...new Set(fEnc.flatMap(e=>e.items.map(it=>it.ficha_id).filter(Boolean)))];
  if(fichaIds.length){
    const fichas=await Promise.all(fichaIds.map(fid=>api('GET',`/productos/${fid}`).catch(()=>null)));
    const fichasPorId={};
    fichas.forEach(f=>{if(f)fichasPorId[f.id]=f});
    fEnc.forEach(e=>e.items.forEach(it=>{if(it.ficha_id&&fichasPorId[it.ficha_id])it._fichaSel=fichasPorId[it.ficha_id]}));
    recalcularCostosAutomaticos();
  }
```

- [ ] **Step 2: Verificar sintaxis**

Run: igual que Task 1 Step 2.
Expected: `OK`.

- [ ] **Step 3: Verificación funcional**

Run:
```bash
cd "i:/AGENCIA PEDIDOS/agencia"
npm start &
for i in 1 2 3 4 5 6 7 8 9 10; do curl -s -m 1 http://localhost:3000/ -o /dev/null && break; sleep 1; done
TOKEN=$(curl -s -m 5 -X POST http://localhost:3000/api/auth/login -H "Content-Type: application/json" -d '{"pin":"1234"}' | grep -o '"token":"[^"]*"' | cut -d'"' -f4)

echo "--- crear producto con un insumo de costo conocido ---"
FID=$(curl -s -m 5 -X POST http://localhost:3000/api/productos -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{"nombre":"Vaso Costos Test","precio_base":"15000","insumos":[{"nombre_insumo":"Vinilo","costo_unitario":"1000","cantidad_usada":"1"}]}' | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)

echo "--- crear pedido con 5 unidades de ese producto, sin costos manuales ---"
PID1=$(curl -s -m 5 -X POST http://localhost:3000/api/pedidos -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d "{\"nombre\":\"Test Costos Auto\",\"encargos\":[{\"items\":[{\"cantidad\":\"5\",\"detalle\":\"Vaso Costos Test\",\"ficha_id\":\"$FID\"}]}]}" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)

echo "--- confirmar que el pedido guardado existe (la sincronizacion de costos es 100% frontend, no se ve en este GET) ---"
curl -s -m 5 -o /dev/null -w "GET pedido HTTP %{http_code}\n" "http://localhost:3000/api/pedidos/$PID1" -H "Authorization: Bearer $TOKEN"

echo "--- limpieza ---"
curl -s -m 5 -X DELETE "http://localhost:3000/api/pedidos/$PID1" -H "Authorization: Bearer $TOKEN" -o /dev/null
curl -s -m 5 -X DELETE "http://localhost:3000/api/productos/$FID" -H "Authorization: Bearer $TOKEN" -o /dev/null
PID=$(netstat -ano | grep ':3000' | grep LISTENING | head -1 | awk '{print $NF}'); [ -n "$PID" ] && taskkill //F //PID "$PID"
```
Expected: `GET pedido HTTP 200`. Nota: como el cálculo es 100% frontend (no hay nada que verificar vía curl sobre la lógica de recálculo en sí — eso lo confirma el checklist manual del usuario), esta prueba solo confirma que el flujo de creación/borrado sigue intacto.

- [ ] **Step 4: Commit**

```bash
cd "i:/AGENCIA PEDIDOS/agencia"
git add public/index.html
git commit -m "[FEATURE] Costos automaticos: resolver fichas y recalcular al abrir un pedido existente"
```

---

## Task 4: Frontend — etiqueta visual "Automático" en la lista de Costos

**Files:**
- Modify: `agencia/public/index.html` (`renderCostos`)

- [ ] **Step 1: Mostrar la etiqueta cuando `c._auto` es verdadero**

Releer primero con `grep -n -A6 "^function renderCostos" agencia/public/index.html` para confirmar el bloque completo exacto. Cambiar:

```js
function renderCostos(){
  document.getElementById('costos-lista').innerHTML=fCostos.map(c=>`
    <div class="costo-item">
      <div class="ac-wrap" style="flex:1"><input type="text" value="${c.descripcion||''}" placeholder="Descripción del costo…" oninput="setCostoVal('${c.id}','descripcion',this.value);acCosto('${c.id}',this.value)"><div class="ac-drop" id="cost-ac-drop-${c.id}"></div></div>
      <input type="text" value="${c.cantidad||''}" placeholder="Cant." style="max-width:55px;width:100%" oninput="setCostoVal('${c.id}','cantidad',this.value)">
```

por:

```js
function renderCostos(){
  document.getElementById('costos-lista').innerHTML=fCostos.map(c=>`
    <div class="costo-item">
      <div class="ac-wrap" style="flex:1"><input type="text" value="${c.descripcion||''}" placeholder="Descripción del costo…" oninput="setCostoVal('${c.id}','descripcion',this.value);acCosto('${c.id}',this.value)"><div class="ac-drop" id="cost-ac-drop-${c.id}"></div>${c._auto?'<div style="font-size:8px;font-weight:700;color:var(--teal-dk);margin-top:2px">Automático (insumos)</div>':''}</div>
      <input type="text" value="${c.cantidad||''}" placeholder="Cant." style="max-width:55px;width:100%" oninput="setCostoVal('${c.id}','cantidad',this.value)">
```

- [ ] **Step 2: Verificar sintaxis**

Run: igual que Task 1 Step 2.
Expected: `OK`.

- [ ] **Step 3: Verificación funcional**

Run:
```bash
cd "i:/AGENCIA PEDIDOS/agencia"
npm start &
for i in 1 2 3 4 5 6 7 8 9 10; do curl -s -m 1 http://localhost:3000/ -o /dev/null && break; sleep 1; done
curl -s -m 5 http://localhost:3000/ | grep -c 'recalcularCostosAutomaticos\|costoTotalInsumosFicha\|Automático (insumos)'
TOKEN=$(curl -s -m 5 -X POST http://localhost:3000/api/auth/login -H "Content-Type: application/json" -d '{"pin":"1234"}' | grep -o '"token":"[^"]*"' | cut -d'"' -f4)
curl -s -m 5 -o /dev/null -w "pedidos HTTP %{http_code}\n" http://localhost:3000/api/pedidos -H "Authorization: Bearer $TOKEN"
PID=$(netstat -ano | grep ':3000' | grep LISTENING | head -1 | awk '{print $NF}'); [ -n "$PID" ] && taskkill //F //PID "$PID"
```
Expected: el `grep -c` da al menos `3`; `pedidos` responde `HTTP 200`.

- [ ] **Step 4: Commit**

```bash
cd "i:/AGENCIA PEDIDOS/agencia"
git add public/index.html
git commit -m "[FEATURE] Costos automaticos: etiqueta visual en la lista de Costos"
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
Expected: ambos `OK`. Confirmar `git status --short` sin cambios sin commitear.

- [ ] **Step 2: Checklist manual para el usuario (el agente no tiene navegador, no puede probar el cálculo real en pantalla)**

Pedir al usuario que: cree un producto con al menos un insumo de costo conocido; lo use en un Encargo de un pedido con una cantidad cualquiera; confirme que en la sección Costos aparece sola una línea "Insumos: [nombre del producto]" con la etiqueta "Automático" y el monto correcto (costo del insumo × cantidad); cambie la cantidad del ítem y confirme que el monto se actualiza solo; quite el ítem y confirme que la línea desaparece; guarde el pedido, lo cierre, y lo reabra — confirmar que la línea automática sigue ahí con el monto correcto. Confirmar también que una línea de Costo escrita a mano (sin relación a ningún producto) nunca se ve afectada por nada de esto.

- [ ] **Step 3: Push**

```bash
git push origin main
```
