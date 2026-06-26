# Visibilidad de Stock al Capturar el Pedido Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mostrar el stock disponible en el autocompletado de Encargos y avisar (sin bloquear) cuando la cantidad pedida supera el stock disponible.

**Architecture:** Cambios 100% frontend, sobre el autocompletado ya existente de la Fase 2C (`acItem`/`selItem`/`renderItemsHTML`/`setItem`). Sin cambios de backend ni de la lógica de descuento/restauración de la Fase 4-A.

**Tech Stack:** HTML/CSS/JS vanilla (frontend).

## Global Constraints

- No bloquea guardar un pedido con stock insuficiente — es informativo, no validación.
- No toca `descontarStock`/`restaurarStock` ni ningún endpoint de `server.js`.
- Toda request del frontend pasa por `api()` ya existente.
- Sin framework de tests — `node -c` y verificación funcional vía curl/grep (el agente no tiene navegador).
- `git push origin main` no requiere confirmación previa (autorización del usuario).

---

## Task 1: Frontend — stock en el dropdown, aviso al escribir cantidad

**Files:**
- Modify: `agencia/public/index.html` (`acItem`; `renderItemsHTML`; `setItem`)

**Interfaces:**
- No produce funciones nuevas — extiende `acItem`/`renderItemsHTML`/`setItem` ya existentes de la Fase 2C.

- [ ] **Step 1: Stock visible en el dropdown de `acItem`**

Releer primero el bloque real con `grep -n "precioTxt=p.tipo_precio" agencia/public/index.html` para confirmar el texto exacto antes de editar. Cambiar:

```js
    const precioTxt=p.tipo_precio==='escalonado'?'según cantidad':fCOP(p.precio_oficial);
    return`<div class="ac-item" onclick="selItem('${encId}','${itemId}',${i})">
      <div class="ac-name"><i class="ti ${ICONOS[p.tipo_precio]||'ti-tag'}" style="margin-right:5px"></i>${p.nombre}</div>
      <div class="ac-sub">${precioTxt}</div>
    </div>`;
```

por:

```js
    const precioTxt=p.tipo_precio==='escalonado'?'según cantidad':fCOP(p.precio_oficial);
    const stockTxt=p.stock_actual!=null?` · Stock: ${p.stock_actual}`:'';
    return`<div class="ac-item" onclick="selItem('${encId}','${itemId}',${i})">
      <div class="ac-name"><i class="ti ${ICONOS[p.tipo_precio]||'ti-tag'}" style="margin-right:5px"></i>${p.nombre}</div>
      <div class="ac-sub">${precioTxt}${stockTxt}</div>
    </div>`;
```

- [ ] **Step 2: Markup — `div` de aviso bajo el campo Cantidad, con valor inicial calculado**

Releer primero el bloque real con `grep -n "function renderItemsHTML" agencia/public/index.html` para confirmar el texto exacto (incluida la línea completa de Valor unitario que el plan omite por ser muy larga — copiarla tal cual está en el archivo real al hacer el cambio, no truncarla). Cambiar:

```js
function renderItemsHTML(enc){
  return(enc.items||[]).map((it,j)=>`
    <tr>
      <td style="width:70px"><input class="item-inp" type="text" value="${it.cantidad||''}" placeholder="Ej: 3" oninput="setItem('${enc.id}','${it.id}','cantidad',this.value)"></td>
      <td><div class="ac-wrap"><textarea class="item-ta" rows="1" placeholder="Camiseta negra M, full color…" oninput="setItem('${enc.id}','${it.id}','detalle',this.value);autoTA(this);acItem('${enc.id}','${it.id}',this.value)">${it.detalle||''}</textarea><div class="ac-drop" id="it-ac-drop-${it.id}"></div></div></td>
```

por:

```js
function renderItemsHTML(enc){
  return(enc.items||[]).map((it,j)=>{
    const stockDisp=(it._fichaSel&&it._fichaSel.stock_actual!=null)?it._fichaSel.stock_actual:null;
    const cantNum=parseInt(String(it.cantidad||0).replace(/\D/g,''))||0;
    const stockWarn=(stockDisp!=null&&cantNum>stockDisp)?`Stock insuficiente (quedan ${stockDisp})`:'';
    return`
    <tr>
      <td style="width:70px"><input class="item-inp" type="text" value="${it.cantidad||''}" placeholder="Ej: 3" oninput="setItem('${enc.id}','${it.id}','cantidad',this.value)"><div id="itstock-${it.id}" style="font-size:8px;font-weight:700;color:var(--red);margin-top:2px;display:${stockWarn?'block':'none'}">${stockWarn}</div></td>
      <td><div class="ac-wrap"><textarea class="item-ta" rows="1" placeholder="Camiseta negra M, full color…" oninput="setItem('${enc.id}','${it.id}','detalle',this.value);autoTA(this);acItem('${enc.id}','${it.id}',this.value)">${it.detalle||''}</textarea><div class="ac-drop" id="it-ac-drop-${it.id}"></div></div></td>
```

Y al final de la misma función, cambiar el cierre (la plantilla pasa de template-literal-de-arrow-function-implícito a función con `return` explícito, así que el `.join('')` final y el cierre de llaves también cambian):

```js
      <td style="width:30px"><button class="item-del" onclick="remItem('${enc.id}','${it.id}')"><i class="ti ti-x"></i></button></td>
    </tr>`).join('');
}
```

por:

```js
      <td style="width:30px"><button class="item-del" onclick="remItem('${enc.id}','${it.id}')"><i class="ti ti-x"></i></button></td>
    </tr>`;
  }).join('');
}
```

(El resto del cuerpo de la función — la celda de Valor unitario entre Detalle y el botón de borrar — no cambia, solo se copia tal cual está en el archivo real entre estos dos bloques.)

- [ ] **Step 3: `setItem` actualiza el aviso en vivo al escribir Cantidad**

Releer primero el bloque real con `grep -n "function setItem(encId,itemId,k,v)" agencia/public/index.html`. Cambiar:

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
  if(k==='cantidad'||k==='valor_unitario')actualizarValorTotal();
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

- [ ] **Step 5: Verificación funcional**

Run:
```bash
cd "i:/AGENCIA PEDIDOS/agencia"
npm start &
for i in 1 2 3 4 5 6 7 8 9 10; do curl -s -m 1 http://localhost:3000/ -o /dev/null && break; sleep 1; done
curl -s -m 5 http://localhost:3000/ | grep -c 'stockTxt\|itstock-\|Stock insuficiente'
TOKEN=$(curl -s -m 5 -X POST http://localhost:3000/api/auth/login -H "Content-Type: application/json" -d '{"pin":"1234"}' | grep -o '"token":"[^"]*"' | cut -d'"' -f4)
curl -s -m 5 -o /dev/null -w "pedidos HTTP %{http_code}\n" http://localhost:3000/api/pedidos -H "Authorization: Bearer $TOKEN"
PID=$(netstat -ano | grep ':3000' | grep LISTENING | head -1 | awk '{print $NF}'); [ -n "$PID" ] && taskkill //F //PID "$PID"
```
Expected: el `grep -c` da al menos `3`; `pedidos` responde `HTTP 200` (confirma que `renderItemsHTML` sigue funcionando para pedidos sin ningún ítem con ficha — el caso normal de siempre).

- [ ] **Step 6: Commit**

```bash
cd "i:/AGENCIA PEDIDOS/agencia"
git add public/index.html
git commit -m "[FEATURE] Inventario: mostrar stock y avisar si no alcanza al capturar el pedido (Fase 4-B)"
```

---

## Task 2: Verificación final

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

Pedir al usuario que, en `npm start`, en un pedido, en Encargos, busque un producto con stock configurado en el autocompletado: el dropdown debe mostrar "Stock: N". Al seleccionarlo y escribir una Cantidad mayor a N, debe aparecer "Stock insuficiente (quedan N)" en rojo bajo el campo — y debe poder guardar el pedido igual, sin que nada lo bloquee.

- [ ] **Step 3: Push**

```bash
git push origin main
```
