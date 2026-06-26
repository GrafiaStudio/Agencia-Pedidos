# Autocompletado en el Pedido Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Conectar las fichas de producto (ya desplegadas) con el formulario de pedido vía autocompletado, en Encargos (precio al cliente) y en Costos (insumos internos), sin tocar `POST/PUT /api/pedidos`.

**Architecture:** Generaliza el patrón de autocompletado que ya existe para buscar cliente (`acCli`/`.ac-drop`/`.ac-item`) a múltiples filas simultáneas — resultados indexados por id de fila en vez de una variable plana, y el cierre-al-hacer-click-afuera generalizado a cualquier `.ac-wrap`. Dos endpoints de búsqueda en el backend (uno ya existe y solo gana un filtro, el otro es nuevo).

**Tech Stack:** Node.js + Express + better-sqlite3 (backend), HTML/CSS/JS vanilla (frontend).

## Global Constraints

- `POST/PUT /api/pedidos` no se modifican en ningún task de este plan.
- Toda request del frontend pasa por `api()` ya existente.
- Nunca interpolar strings con comillas simples en `onclick`/`oninput` — usar ids.
- Todo endpoint que toca tablas de negocio filtra por `req.wsId`.
- Nunca `git add -A`. `git push origin main` solo con confirmación explícita.
- Sin framework de tests — verificación vía `node -c`, `curl`, y pruebas de lógica pura con Node para lo que no toca DOM (el agente no tiene navegador).

---

## Task 1: Backend — filtro `activo` y búsqueda de insumos

**Files:**
- Modify: `agencia/server.js` (endpoint `GET /api/productos`; nuevo endpoint antes de `GET /api/productos/:id`)

**Interfaces:**
- Produces: `GET /api/productos?activo=1` (filtro opcional, retrocompatible), `GET /api/productos/insumos?q=` (nuevo).

- [ ] **Step 1: Agregar el filtro `activo` a la lista existente**

En `server.js`, cambiar:

```js
app.get('/api/productos',(req,res)=>{
  const{q}=req.query; let sql='SELECT * FROM fichas_producto WHERE workspace_id=?'; const params=[req.wsId];
  if(q){sql+=' AND nombre LIKE ?';params.push(`%${q}%`)}
  sql+=' ORDER BY nombre';
  res.json(db.prepare(sql).all(...params).map(fichaCompleta));
});
```

por:

```js
app.get('/api/productos',(req,res)=>{
  const{q,activo}=req.query; let sql='SELECT * FROM fichas_producto WHERE workspace_id=?'; const params=[req.wsId];
  if(q){sql+=' AND nombre LIKE ?';params.push(`%${q}%`)}
  if(activo==='1'){sql+=' AND activo=1'}
  sql+=' ORDER BY nombre';
  res.json(db.prepare(sql).all(...params).map(fichaCompleta));
});
```

- [ ] **Step 2: Endpoint de búsqueda de insumos (antes de `/api/productos/:id` — el orden importa, si no Express trataría "insumos" como un `:id`)**

En `server.js`, cambiar:

```js
app.get('/api/productos/:id',(req,res)=>{
  const f=db.prepare('SELECT * FROM fichas_producto WHERE id=? AND workspace_id=?').get(req.params.id,req.wsId);
  if(!f)return res.status(404).json({error:'No encontrado'});
  res.json(fichaCompleta(f));
});
```

por:

```js
app.get('/api/productos/insumos',(req,res)=>{
  const{q}=req.query;
  let sql=`SELECT i.nombre_insumo,i.proveedor,i.costo_unitario_calc,i.es_variable
    FROM ficha_insumos i JOIN fichas_producto f ON f.id=i.ficha_id
    WHERE f.workspace_id=?`;
  const params=[req.wsId];
  if(q){sql+=' AND i.nombre_insumo LIKE ?';params.push(`%${q}%`)}
  sql+=' ORDER BY i.nombre_insumo LIMIT 8';
  res.json(db.prepare(sql).all(...params).map(r=>({...r,es_variable:!!r.es_variable})));
});

app.get('/api/productos/:id',(req,res)=>{
  const f=db.prepare('SELECT * FROM fichas_producto WHERE id=? AND workspace_id=?').get(req.params.id,req.wsId);
  if(!f)return res.status(404).json({error:'No encontrado'});
  res.json(fichaCompleta(f));
});
```

- [ ] **Step 3: Verificar sintaxis**

Run: `cd "i:/AGENCIA PEDIDOS/agencia" && node -c server.js && echo OK`
Expected: `OK`.

- [ ] **Step 4: Probar ambos endpoints con curl**

Run (verificar primero que el puerto 3000 está libre):
```bash
cd "i:/AGENCIA PEDIDOS/agencia"
npm start &
for i in 1 2 3 4 5 6 7 8 9 10; do curl -s -m 1 http://localhost:3000/ -o /dev/null && break; sleep 1; done
TOKEN=$(curl -s -m 5 -X POST http://localhost:3000/api/auth/login -H "Content-Type: application/json" -d '{"pin":"1234"}' | grep -o '"token":"[^"]*"' | cut -d'"' -f4)

echo "--- crear ficha activa y otra inactiva, ambas con 'Retablo' en el nombre ---"
curl -s -m 5 -X POST http://localhost:3000/api/productos -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{"nombre":"Retablo activo","activo":true}' -o /dev/null
curl -s -m 5 -X POST http://localhost:3000/api/productos -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{"nombre":"Retablo inactivo","activo":false,"insumos":[{"nombre_insumo":"Resina especial","costo_unitario":"3000","cantidad_usada":"1","es_variable":true}]}' -o /dev/null

echo "--- sin filtro: deben aparecer los dos ---"
curl -s -m 5 "http://localhost:3000/api/productos?q=Retablo" -H "Authorization: Bearer $TOKEN" | grep -o '"nombre":"Retablo[^"]*"'
echo "--- con activo=1: solo el activo ---"
curl -s -m 5 "http://localhost:3000/api/productos?q=Retablo&activo=1" -H "Authorization: Bearer $TOKEN" | grep -o '"nombre":"Retablo[^"]*"'

echo "--- buscar insumo 'Resina' (el insumo vive en la ficha INACTIVA, pero la busqueda de insumos no filtra por activo) ---"
curl -s -m 5 "http://localhost:3000/api/productos/insumos?q=Resina" -H "Authorization: Bearer $TOKEN"
echo

echo "--- limpieza ---"
for FID in $(curl -s -m 5 "http://localhost:3000/api/productos?q=Retablo" -H "Authorization: Bearer $TOKEN" | grep -o '"id":"[^"]*"' | cut -d'"' -f4); do
  curl -s -m 5 -X DELETE "http://localhost:3000/api/productos/$FID" -H "Authorization: Bearer $TOKEN" -o /dev/null
done
curl -s -m 5 "http://localhost:3000/api/productos?q=Retablo" -H "Authorization: Bearer $TOKEN"
echo

PID=$(netstat -ano | grep ':3000' | grep LISTENING | head -1 | awk '{print $NF}'); [ -n "$PID" ] && taskkill //F //PID "$PID"
```
Expected: el primer grep muestra ambos `"Retablo activo"` y `"Retablo inactivo"`; el segundo solo `"Retablo activo"`; la búsqueda de insumos devuelve `"nombre_insumo":"Resina especial"` con `"es_variable":true`; al final `[]` (ambas fichas de prueba borradas).

- [ ] **Step 5: Commit**

```bash
cd "i:/AGENCIA PEDIDOS/agencia"
git add server.js
git commit -m "[FEATURE] Autocompletado: filtro activo y busqueda de insumos (Fase 2C)"
```

---

## Task 2: Frontend — autocompletado en Encargos (precio al cliente)

**Files:**
- Modify: `agencia/public/index.html` (`renderItemsHTML`, `setItem`, nuevas `acItem`/`selItem`/`detectarPrecioEscalonado`, handler global de click-afuera)

**Interfaces:**
- Consumes: `api()`, `hoy()`, `fCOP()`, `displayMoneyVal()`, `fEnc`, `renderEncItems()`, `actualizarValorTotal()` (ya existentes).
- Produces: `_acItemResults` (objeto, indexado por `itemId`), `acItem(encId,itemId,q)`, `selItem(encId,itemId,idx)`, `detectarPrecioEscalonado(rangos,cantidad)` — usados también internamente por `setItem`.

- [ ] **Step 1: Generalizar el cierre de dropdown al hacer click afuera**

En `public/index.html`, cambiar:

```js
document.addEventListener('click',e=>{
  if(!e.target.closest('#f-nom')&&!e.target.closest('#ac-drop'))
    document.getElementById('ac-drop').style.display='none';
});
```

por:

```js
document.addEventListener('click',e=>{
  if(!e.target.closest('.ac-wrap'))
    document.querySelectorAll('.ac-drop').forEach(d=>d.style.display='none');
});
```

(El campo de cliente `#f-nom`/`#ac-drop` ya vive dentro de un `.ac-wrap` — este cambio es retrocompatible, no le cambia el comportamiento.)

- [ ] **Step 2: `detectarPrecioEscalonado`, `acItem` y `selItem`**

En `public/index.html`, inmediatamente después de la función `setItem` existente (la que sigue con `function renderEncs(){`), agregar:

```js
let _acItemResults={};
function detectarPrecioEscalonado(rangos,cantidad){
  for(const r of(rangos||[])){
    if(cantidad>=r.desde&&(r.hasta==null||cantidad<=r.hasta))return r.precio;
  }
  return null;
}
async function acItem(encId,itemId,q){
  const dr=document.getElementById('it-ac-drop-'+itemId);
  if(!dr)return;
  if(!q||q.trim().length<2){dr.style.display='none';return}
  const lista=await api('GET',`/productos?q=${encodeURIComponent(q.trim())}&activo=1`);
  const hoyStr=hoy();
  const vigentes=lista.filter(p=>{
    if(p.tipo_precio!=='promocional')return true;
    if(p.fecha_inicio&&hoyStr<p.fecha_inicio)return false;
    if(p.fecha_fin&&hoyStr>p.fecha_fin)return false;
    return true;
  });
  if(!vigentes.length){dr.style.display='none';return}
  _acItemResults[itemId]=vigentes.slice(0,6);
  const ICONOS={unitario:'ti-tag',escalonado:'ti-stairs',promocional:'ti-discount-2'};
  dr.innerHTML=_acItemResults[itemId].map((p,i)=>{
    const precioTxt=p.tipo_precio==='escalonado'?'según cantidad':fCOP(p.precio_oficial);
    return`<div class="ac-item" onclick="selItem('${encId}','${itemId}',${i})">
      <div class="ac-name"><i class="ti ${ICONOS[p.tipo_precio]||'ti-tag'}" style="margin-right:5px"></i>${p.nombre}</div>
      <div class="ac-sub">${precioTxt}</div>
    </div>`;
  }).join('');
  dr.style.display='block';
}
function selItem(encId,itemId,idx){
  const p=(_acItemResults[itemId]||[])[idx];
  if(!p)return;
  const e=fEnc.find(x=>x.id===encId);
  const it=e&&e.items.find(i=>i.id===itemId);
  if(!it)return;
  it.detalle=p.nombre;
  it._fichaSel=p;
  if(p.tipo_precio==='escalonado'){
    it._autoPrecio=true;
    const cantNum=parseInt(String(it.cantidad||0).replace(/\D/g,''))||0;
    it.valor_unitario=cantNum>0?String(detectarPrecioEscalonado(p.rangos,cantNum)||''):'';
  }else{
    it._autoPrecio=false;
    it.valor_unitario=String(p.precio_oficial);
  }
  const dr=document.getElementById('it-ac-drop-'+itemId);
  if(dr)dr.style.display='none';
  renderEncItems(encId);
  actualizarValorTotal();
}
```

- [ ] **Step 3: `setItem` apaga/usa el modo automático**

En `public/index.html`, cambiar:

```js
function setItem(encId,itemId,k,v){const e=fEnc.find(x=>x.id===encId);if(e){const it=e.items.find(i=>i.id===itemId);if(it)it[k]=v}if(k==='cantidad'||k==='valor_unitario')actualizarValorTotal()}
```

por:

```js
function setItem(encId,itemId,k,v){
  const e=fEnc.find(x=>x.id===encId);
  const it=e&&e.items.find(i=>i.id===itemId);
  if(it){
    it[k]=v;
    if(k==='valor_unitario')it._autoPrecio=false;
    if(k==='cantidad'&&it._autoPrecio&&it._fichaSel&&it._fichaSel.tipo_precio==='escalonado'){
      const cantNum=parseInt(String(v||0).replace(/\D/g,''))||0;
      const precio=detectarPrecioEscalonado(it._fichaSel.rangos,cantNum);
      if(precio!=null){
        it.valor_unitario=String(precio);
        const elU=document.getElementById('itval-'+itemId);
        if(elU)elU.value=displayMoneyVal(it.valor_unitario);
      }
    }
  }
  if(k==='cantidad'||k==='valor_unitario')actualizarValorTotal();
}
```

- [ ] **Step 4: Markup de `renderItemsHTML` — envolver Detalle en `.ac-wrap` y darle id al campo de Valor unitario**

En `public/index.html`, cambiar:

```js
function renderItemsHTML(enc){
  return(enc.items||[]).map((it,j)=>`
    <tr>
      <td style="width:70px"><input class="item-inp" type="text" value="${it.cantidad||''}" placeholder="Ej: 3" oninput="setItem('${enc.id}','${it.id}','cantidad',this.value)"></td>
      <td><textarea class="item-ta" rows="1" placeholder="Camiseta negra M, full color…" oninput="setItem('${enc.id}','${it.id}','detalle',this.value);autoTA(this)">${it.detalle||''}</textarea></td>
      <td style="width:100px"><input class="item-inp" type="text" value="${displayMoneyVal(it.valor_unitario)}" placeholder="$ 0" style="text-align:right" oninput="setItem('${enc.id}','${it.id}','valor_unitario',this.value);previewItemUnit('${it.id}',this.value)" onfocus="focusItemVal(this,'${enc.id}','${it.id}')" onblur="blurItemVal(this,'${enc.id}','${it.id}')"><div id="itprev-${it.id}" style="font-size:8.5px;font-weight:700;color:var(--teal-dk);text-align:right;margin-top:2px;display:none"></div></td>
      <td style="width:30px"><button class="item-del" onclick="remItem('${enc.id}','${it.id}')"><i class="ti ti-x"></i></button></td>
    </tr>`).join('');
}
```

por:

```js
function renderItemsHTML(enc){
  return(enc.items||[]).map((it,j)=>`
    <tr>
      <td style="width:70px"><input class="item-inp" type="text" value="${it.cantidad||''}" placeholder="Ej: 3" oninput="setItem('${enc.id}','${it.id}','cantidad',this.value)"></td>
      <td><div class="ac-wrap"><textarea class="item-ta" rows="1" placeholder="Camiseta negra M, full color…" oninput="setItem('${enc.id}','${it.id}','detalle',this.value);autoTA(this);acItem('${enc.id}','${it.id}',this.value)">${it.detalle||''}</textarea><div class="ac-drop" id="it-ac-drop-${it.id}"></div></div></td>
      <td style="width:100px"><input class="item-inp" id="itval-${it.id}" type="text" value="${displayMoneyVal(it.valor_unitario)}" placeholder="$ 0" style="text-align:right" oninput="setItem('${enc.id}','${it.id}','valor_unitario',this.value);previewItemUnit('${it.id}',this.value)" onfocus="focusItemVal(this,'${enc.id}','${it.id}')" onblur="blurItemVal(this,'${enc.id}','${it.id}')"><div id="itprev-${it.id}" style="font-size:8.5px;font-weight:700;color:var(--teal-dk);text-align:right;margin-top:2px;display:none"></div></td>
      <td style="width:30px"><button class="item-del" onclick="remItem('${enc.id}','${it.id}')"><i class="ti ti-x"></i></button></td>
    </tr>`).join('');
}
```

(`it._autoPrecio`/`it._fichaSel` son estado transitorio solo de esta sesión de edición — no se envían al backend, que solo lee `cantidad`/`detalle`/`valor_unitario` de cada item. Al reabrir un pedido ya guardado, esos dos campos no existen todavía, así que editar la Cantidad de un ítem ya guardado nunca dispara el recálculo automático — es el comportamiento esperado, el enganche solo aplica recién se elige algo del dropdown en la sesión actual.)

- [ ] **Step 5: Verificar sintaxis**

Run:
```bash
cd "i:/AGENCIA PEDIDOS/agencia"
SCRATCH="C:/Users/ADMIN/AppData/Local/Temp/claude/i--AGENCIA-PEDIDOS/8d8d31ac-5619-43aa-9270-0aa1f2328221/scratchpad"
awk '/<script>/{f=1;next}/<\/script>/{f=0}f' public/index.html > "$SCRATCH/check.js"
node -c "$SCRATCH/check.js" && echo OK
```
Expected: `OK`.

- [ ] **Step 6: Probar `detectarPrecioEscalonado` y el filtro de vigencia de promoción con Node, sin navegador**

Run:
```bash
SCRATCH="C:/Users/ADMIN/AppData/Local/Temp/claude/i--AGENCIA-PEDIDOS/8d8d31ac-5619-43aa-9270-0aa1f2328221/scratchpad"
cat > "$SCRATCH/test-autocompletado-pedido.js" <<'EOF'
function detectarPrecioEscalonado(rangos,cantidad){
  for(const r of(rangos||[])){
    if(cantidad>=r.desde&&(r.hasta==null||cantidad<=r.hasta))return r.precio;
  }
  return null;
}
function esVigente(p,hoyStr){
  if(p.tipo_precio!=='promocional')return true;
  if(p.fecha_inicio&&hoyStr<p.fecha_inicio)return false;
  if(p.fecha_fin&&hoyStr>p.fecha_fin)return false;
  return true;
}
function assertEq(a,e,l){if(a!==e){console.error('FAIL '+l+': got',a,'expected',e);process.exitCode=1}else console.log('OK   '+l+':',a)}

const rangosCamisetas=[{desde:1,hasta:11,precio:32000},{desde:12,hasta:23,precio:30000},{desde:24,hasta:35,precio:28000},{desde:36,hasta:null,precio:26000}];
assertEq(detectarPrecioEscalonado(rangosCamisetas,29),28000,'29 camisetas cae en el rango 24-35');
assertEq(detectarPrecioEscalonado(rangosCamisetas,5),32000,'5 camisetas cae en el rango 1-11');
assertEq(detectarPrecioEscalonado(rangosCamisetas,100),26000,'100 camisetas cae en el rango sin limite superior');
assertEq(detectarPrecioEscalonado(rangosCamisetas,0),null,'0 camisetas no cae en ningun rango');

assertEq(esVigente({tipo_precio:'unitario'},'2026-06-25'),true,'unitario siempre vigente');
assertEq(esVigente({tipo_precio:'promocional',fecha_inicio:'2026-06-20',fecha_fin:'2026-07-10'},'2026-06-25'),true,'promocional dentro del rango');
assertEq(esVigente({tipo_precio:'promocional',fecha_inicio:'2026-06-20',fecha_fin:'2026-07-10'},'2026-07-11'),false,'promocional ya vencida');
assertEq(esVigente({tipo_precio:'promocional',fecha_inicio:'2026-07-01',fecha_fin:'2026-07-10'},'2026-06-25'),false,'promocional todavia no empieza');
assertEq(esVigente({tipo_precio:'promocional',fecha_inicio:'',fecha_fin:''},'2026-06-25'),true,'promocional sin fechas configuradas: siempre vigente');
EOF
node "$SCRATCH/test-autocompletado-pedido.js"
```
Expected: 9 líneas `OK`.

- [ ] **Step 7: Verificación funcional — funciones nuevas presentes en el HTML servido + regresión del buscador de clientes**

Run:
```bash
cd "i:/AGENCIA PEDIDOS/agencia"
npm start &
for i in 1 2 3 4 5 6 7 8 9 10; do curl -s -m 1 http://localhost:3000/ -o /dev/null && break; sleep 1; done
curl -s -m 5 http://localhost:3000/ | grep -c 'function acItem\|function selItem\|function detectarPrecioEscalonado\|it-ac-drop-'
TOKEN=$(curl -s -m 5 -X POST http://localhost:3000/api/auth/login -H "Content-Type: application/json" -d '{"pin":"1234"}' | grep -o '"token":"[^"]*"' | cut -d'"' -f4)
curl -s -m 5 -o /dev/null -w "clientes HTTP %{http_code}\n" "http://localhost:3000/api/clientes?q=a" -H "Authorization: Bearer $TOKEN"
PID=$(netstat -ano | grep ':3000' | grep LISTENING | head -1 | awk '{print $NF}'); [ -n "$PID" ] && taskkill //F //PID "$PID"
```
Expected: el primer `grep -c` da al menos `3` (las 3 funciones; el `it-ac-drop-` aparece dentro del template, no como texto literal — si el conteo da menos de 3 revisar); `clientes` responde `HTTP 200` (confirma que el cambio al handler de click-afuera no rompió la búsqueda de cliente).

- [ ] **Step 8: Commit**

```bash
cd "i:/AGENCIA PEDIDOS/agencia"
git add public/index.html
git commit -m "[FEATURE] Autocompletado en Encargos: fichas de producto (Fase 2C)"
```

---

## Task 3: Frontend — autocompletado en Costos (insumos internos)

**Files:**
- Modify: `agencia/public/index.html` (`renderCostos`, nuevas `acCosto`/`selCosto`)

**Interfaces:**
- Consumes: `api()`, `fCOP()`, `recalcCostoTotal()`, `renderCostos()`, `fCostos` (ya existentes/Task 2 de Fase 2D).
- Produces: `_acCostoResults` (objeto, indexado por `costoId`), `acCosto(id,q)`, `selCosto(id,idx)`.

- [ ] **Step 1: `acCosto` y `selCosto`**

En `public/index.html`, inmediatamente después de la función `previewCosto` existente, agregar:

```js
let _acCostoResults={};
async function acCosto(id,q){
  const dr=document.getElementById('cost-ac-drop-'+id);
  if(!dr)return;
  if(!q||q.trim().length<2){dr.style.display='none';return}
  const lista=await api('GET',`/productos/insumos?q=${encodeURIComponent(q.trim())}`);
  if(!lista.length){dr.style.display='none';return}
  _acCostoResults[id]=lista;
  dr.innerHTML=lista.map((ins,i)=>`
    <div class="ac-item" onclick="selCosto('${id}',${i})">
      <div class="ac-name">${ins.nombre_insumo}${ins.es_variable?' <span class="b-pend" style="margin-left:4px">Variable</span>':''}</div>
      <div class="ac-sub">${ins.proveedor?ins.proveedor+' &middot; ':''}${fCOP(ins.costo_unitario_calc)}</div>
    </div>`).join('');
  dr.style.display='block';
}
function selCosto(id,idx){
  const ins=(_acCostoResults[id]||[])[idx];
  if(!ins)return;
  const c=fCostos.find(x=>x.id===id);
  if(!c)return;
  c.descripcion=ins.nombre_insumo;
  c.valor_unitario=String(ins.costo_unitario_calc||0);
  recalcCostoTotal(id);
  const dr=document.getElementById('cost-ac-drop-'+id);
  if(dr)dr.style.display='none';
  renderCostos();
}
```

- [ ] **Step 2: Markup de `renderCostos` — envolver Detalle en `.ac-wrap`**

En `public/index.html`, cambiar:

```js
      <input type="text" value="${c.descripcion||''}" placeholder="Descripción del costo…" oninput="setCostoVal('${c.id}','descripcion',this.value)">
```

por:

```js
      <div class="ac-wrap" style="flex:1"><input type="text" value="${c.descripcion||''}" placeholder="Descripción del costo…" oninput="setCostoVal('${c.id}','descripcion',this.value);acCosto('${c.id}',this.value)"><div class="ac-drop" id="cost-ac-drop-${c.id}"></div></div>
```

(`style="flex:1"` en el `.ac-wrap`: la regla `.costo-item input{flex:1}` ya existente apuntaba directo al `<input>` como hijo del contenedor flex `.costo-item`; al envolverlo en un `div`, ese `div` pasa a ser el hijo flex y necesita el `flex:1` él mismo para que la fila se siga viendo igual.)

- [ ] **Step 3: Verificar sintaxis**

Run: igual que Task 2 Step 5.
Expected: `OK`.

- [ ] **Step 4: Verificación funcional end-to-end — simular la selección de un insumo igual a como lo haría `selCosto`**

Run:
```bash
cd "i:/AGENCIA PEDIDOS/agencia"
npm start &
for i in 1 2 3 4 5 6 7 8 9 10; do curl -s -m 1 http://localhost:3000/ -o /dev/null && break; sleep 1; done
curl -s -m 5 http://localhost:3000/ | grep -c 'function acCosto\|function selCosto\|cost-ac-drop-'
TOKEN=$(curl -s -m 5 -X POST http://localhost:3000/api/auth/login -H "Content-Type: application/json" -d '{"pin":"1234"}' | grep -o '"token":"[^"]*"' | cut -d'"' -f4)

echo "--- crear ficha con insumo variable para buscar ---"
curl -s -m 5 -X POST http://localhost:3000/api/productos -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{"nombre":"Marco de madera","insumos":[{"nombre_insumo":"Tinte para madera","costo_unitario":"4500","cantidad_usada":"1","es_variable":true}]}' -o /dev/null

echo "--- buscar el insumo (igual a lo que haria acCosto) ---"
curl -s -m 5 "http://localhost:3000/api/productos/insumos?q=Tinte" -H "Authorization: Bearer $TOKEN"
echo

echo "--- crear un pedido cuyo costo ya viene con descripcion/valor_unitario/cantidad igual a como quedaria tras selCosto+recalcCostoTotal ---"
curl -s -m 5 -X POST http://localhost:3000/api/pedidos -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{"nombre":"Test autocompletado costos","costos":[{"descripcion":"Tinte para madera","cantidad":"2","valor_unitario":"4500","monto":"9000"}]}' | grep -o '"descripcion":"[^"]*"\|"monto":"[^"]*"'

echo "--- limpieza ---"
for FID in $(curl -s -m 5 "http://localhost:3000/api/productos?q=Marco" -H "Authorization: Bearer $TOKEN" | grep -o '"id":"[^"]*"' | cut -d'"' -f4); do
  curl -s -m 5 -X DELETE "http://localhost:3000/api/productos/$FID" -H "Authorization: Bearer $TOKEN" -o /dev/null
done
for PID2 in $(curl -s -m 5 "http://localhost:3000/api/pedidos?q=Test%20autocompletado" -H "Authorization: Bearer $TOKEN" | grep -o '"id":"[^"]*"' | cut -d'"' -f4); do
  curl -s -m 5 -X DELETE "http://localhost:3000/api/pedidos/$PID2" -H "Authorization: Bearer $TOKEN" -o /dev/null
done

PID=$(netstat -ano | grep ':3000' | grep LISTENING | head -1 | awk '{print $NF}'); [ -n "$PID" ] && taskkill //F //PID "$PID"
```
Expected: el primer `grep -c` da al menos `2`; la búsqueda de insumo devuelve `"nombre_insumo":"Tinte para madera"` con `"es_variable":true`; el pedido de prueba muestra `"descripcion":"Tinte para madera"` y `"monto":"9000"` (2×4.500, el mismo cálculo que ya hace `recalcCostoTotal` desde la Fase 2D).

- [ ] **Step 5: Commit**

```bash
cd "i:/AGENCIA PEDIDOS/agencia"
git add public/index.html
git commit -m "[FEATURE] Autocompletado en Costos: insumos de fichas de producto (Fase 2C)"
```

---

## Task 4: Verificación final

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

- [ ] **Step 2: Regresión completa**

Run (servidor levantado, mismo patrón de espera): repetir contra `/api/pedidos`, `/api/clientes`, `/api/stats`, `/api/configuracion`, `/api/productos`, `/api/productos/insumos?q=x` — confirmar `HTTP 200` en los 6. Confirmar `git status --short` sin cambios sin commitear y `git log --oneline -6` mostrando los 3 commits de feature de este plan.

- [ ] **Step 3: Checklist manual para el usuario (el agente no tiene navegador)**

Pedir al usuario que, en `npm start`, abra un pedido y confirme:
1. En un Encargo, escribir 2+ letras en Detalle de un ítem muestra el dropdown con productos activos, ícono por tipo.
2. Seleccionar un producto Unitario llena Detalle y Valor unitario con su precio.
3. Seleccionar un producto Escalonado (ej. "Camisetas DTF" del ejemplo del documento maestro) y luego escribir Cantidad 29 en esa fila: el Valor unitario se llena solo con $28.000 (rango 24-35).
4. Editar ese Valor unitario a mano (ej. $27.000) y después cambiar la Cantidad: el valor editado a mano NO se pierde (a diferencia de Costos, que sí se recalcula siempre).
5. Crear una ficha Promocional con fecha de fin ya vencida — no debe aparecer en el dropdown de Encargos.
6. En Costos, escribir el nombre de un insumo ya creado en alguna ficha de producto: aparece en el dropdown con su costo, y si es "variable" se ve la etiqueta. Seleccionarlo llena Detalle y Valor unitario, y si también hay Cantidad el Total se recalcula solo (igual que en la Fase 2D).
7. El buscador de cliente al crear un pedido nuevo sigue funcionando exactamente igual que siempre.

- [ ] **Step 4: Push (solo con confirmación explícita del usuario)**

No ejecutar automáticamente:
```bash
git push origin main
```
