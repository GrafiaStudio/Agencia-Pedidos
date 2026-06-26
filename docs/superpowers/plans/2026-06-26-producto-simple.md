# Producto Simple Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Unificar Unitario+Escalonado+"Lleva N paga M" en una sola pantalla "Producto simple", con un paso inicial de 3 caminos (Producto simple/Combo/Promoción) al crear, sin desplegable mezclado de tipo de precio.

**Architecture:** `rangos` deja de ser obligatorio para `tipo_precio='escalonado'` — vacío significa "precio fijo" (lo que hoy es Unitario), porque `precioOficialFicha` ya resuelve igual para ambos tipos hoy. Se agrega un respaldo en frontend: si ningún rango coincide con la cantidad, se usa el precio oficial de la ficha. El modal de Producto gana un paso 1 (3 botones) que reemplaza al `<select>` de tipo de precio; "Producto simple" sigue escribiendo `tipo_precio='escalonado'` (o `'regla'` con el interruptor activo), nunca `'unitario'` de nuevo. Las fichas `'unitario'` ya guardadas no se tocan ni se migran — siguen funcionando exactamente igual hasta que alguien las edite y guarde.

**Tech Stack:** Node.js + Express + better-sqlite3 (backend), HTML/CSS/JS vanilla (frontend).

## Global Constraints

- Ninguna ficha `unitario` existente se reescribe ni se migra — sigue funcionando igual.
- El interruptor "Lleva N, paga M" y los "Tramos adicionales" son mutuamente excluyentes dentro de "Producto simple" — nunca los dos a la vez.
- No se toca Combo ni Promoción por dentro (eso es la mejora B) — solo se construye el punto de entrada de 3 botones que B reutilizará.
- `git push origin main` no requiere confirmación previa (autorización del usuario, ya extendida a esta ronda de mejoras: "subir ya esta" para D, mismo criterio aplica).

---

## Task 1: Backend — `rangos` vacío es válido para Escalonado

**Files:**
- Modify: `agencia/server.js`

- [ ] **Step 1: Quitar la validación "Escalonado necesita al menos un rango"**

Releer primero con `grep -n -A8 "if(b.tipo_precio==='escalonado'){" agencia/server.js` para confirmar el bloque completo exacto. Cambiar:

```js
  if(b.tipo_precio==='escalonado'){
    if(!Array.isArray(b.rangos)||!b.rangos.length)errores.push('Escalonado necesita al menos un rango de precio');
    else(b.rangos||[]).forEach((r,i)=>{
      if(!Number.isFinite(r.desde)||r.desde<0)errores.push(`Rango #${i+1}: "Desde" no es válido`);
      if(r.hasta!=null&&(!Number.isFinite(r.hasta)||r.hasta<r.desde))errores.push(`Rango #${i+1}: "Hasta" no es válido`);
      if(!Number.isFinite(r.precio)||r.precio<0)errores.push(`Rango #${i+1}: precio no es válido`);
    });
  }
```

por:

```js
  if(b.tipo_precio==='escalonado'){
    (b.rangos||[]).forEach((r,i)=>{
      if(!Number.isFinite(r.desde)||r.desde<0)errores.push(`Rango #${i+1}: "Desde" no es válido`);
      if(r.hasta!=null&&(!Number.isFinite(r.hasta)||r.hasta<r.desde))errores.push(`Rango #${i+1}: "Hasta" no es válido`);
      if(!Number.isFinite(r.precio)||r.precio<0)errores.push(`Rango #${i+1}: precio no es válido`);
    });
  }
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
RESP=$(curl -s -m 5 -X POST http://localhost:3000/api/productos -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{"nombre":"Test Simple","tipo_precio":"escalonado","precio_base":"15000","rangos":[]}')
echo "$RESP" | grep -o '"precio_oficial":[0-9]*\|"rangos":\[\]'
FID=$(echo "$RESP" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
curl -s -m 5 -X DELETE "http://localhost:3000/api/productos/$FID" -H "Authorization: Bearer $TOKEN" -o /dev/null
PID=$(netstat -ano | grep ':3000' | grep LISTENING | head -1 | awk '{print $NF}'); [ -n "$PID" ] && taskkill //F //PID "$PID"
```
Expected: `HTTP` implícito 200 (sin error), `"rangos":[]` y `"precio_oficial":15000` — confirma que un `escalonado` sin rangos guarda bien y resuelve el precio desde `precio_base`, igual que `unitario`.

- [ ] **Step 4: Commit**

```bash
cd "i:/AGENCIA PEDIDOS/agencia"
git add server.js
git commit -m "[FEATURE] Producto Simple: rangos vacio es valido para escalonado (precio fijo)"
```

---

## Task 2: Frontend — respaldo a precio oficial cuando no hay rango que coincida

**Files:**
- Modify: `agencia/public/index.html` (`selItem`; `setItem`; `acItem`)

- [ ] **Step 1: `selItem` cae a `precio_oficial` si `detectarPrecioEscalonado` no encuentra nada**

Releer primero con `grep -n -A11 "^function selItem" agencia/public/index.html` para confirmar el bloque completo exacto. Cambiar:

```js
  if(p.tipo_precio==='escalonado'){
    it._autoPrecio=true;
    const cantNum=parseInt(String(it.cantidad||0).replace(/\D/g,''))||0;
    it.valor_unitario=cantNum>0?String(detectarPrecioEscalonado(p.rangos,cantNum)||''):'';
  }else if(p.tipo_precio==='regla'){
```

por:

```js
  if(p.tipo_precio==='escalonado'){
    it._autoPrecio=true;
    const cantNum=parseInt(String(it.cantidad||0).replace(/\D/g,''))||0;
    const detectado=detectarPrecioEscalonado(p.rangos,cantNum);
    it.valor_unitario=cantNum>0?String(detectado!=null?detectado:p.precio_oficial):'';
  }else if(p.tipo_precio==='regla'){
```

- [ ] **Step 2: `setItem` cae a `precio_oficial` al cambiar Cantidad**

Releer primero con `grep -n -A9 "^function setItem(encId,itemId,k,v)" agencia/public/index.html` para confirmar el bloque completo exacto. Cambiar:

```js
    if(k==='cantidad'&&it._autoPrecio&&it._fichaSel&&it._fichaSel.tipo_precio==='escalonado'){
      const cantNum=parseInt(String(v||0).replace(/\D/g,''))||0;
      const precio=detectarPrecioEscalonado(it._fichaSel.rangos,cantNum);
      if(precio!=null){
        it.valor_unitario=String(precio);
        const elU=document.getElementById('itval-'+itemId);
        if(elU)elU.value=displayMoneyVal(it.valor_unitario);
      }
    }
```

por:

```js
    if(k==='cantidad'&&it._autoPrecio&&it._fichaSel&&it._fichaSel.tipo_precio==='escalonado'){
      const cantNum=parseInt(String(v||0).replace(/\D/g,''))||0;
      const precio=detectarPrecioEscalonado(it._fichaSel.rangos,cantNum);
      it.valor_unitario=String(precio!=null?precio:it._fichaSel.precio_oficial);
      const elU=document.getElementById('itval-'+itemId);
      if(elU)elU.value=displayMoneyVal(it.valor_unitario);
    }
```

- [ ] **Step 3: `acItem` muestra el precio real cuando no hay tramos**

Releer primero con `grep -n -A3 "const ICONOS=\{unitario" agencia/public/index.html` para confirmar el bloque exacto. Cambiar:

```js
  const ICONOS={unitario:'ti-tag',escalonado:'ti-stairs',regla:'ti-discount',combo:'ti-package',promocional:'ti-discount-2'};
  dr.innerHTML=_acItemResults[itemId].map((p,i)=>{
    const precioTxt=(p.tipo_precio==='escalonado'||p.tipo_precio==='regla')?'según cantidad':fCOP(p.precio_oficial);
```

por:

```js
  const ICONOS={unitario:'ti-tag',escalonado:'ti-stairs',regla:'ti-discount',combo:'ti-package',promocional:'ti-discount-2'};
  dr.innerHTML=_acItemResults[itemId].map((p,i)=>{
    const tieneTramos=p.tipo_precio==='escalonado'&&(p.rangos||[]).length>0;
    const precioTxt=(tieneTramos||p.tipo_precio==='regla')?'según cantidad':fCOP(p.precio_oficial);
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

- [ ] **Step 5: Prueba de lógica pura con Node (la regla de respaldo)**

Run:
```bash
node -e "
function detectarPrecioEscalonado(rangos,cantidad){
  for(const r of(rangos||[])){
    if(cantidad>=r.desde&&(r.hasta==null||cantidad<=r.hasta))return r.precio;
  }
  return null;
}
const precioOficial=15000;
const sinTramos=[];
const conTramos=[{desde:12,hasta:23,precio:13000}];
console.log('sin tramos, cant 5:', detectarPrecioEscalonado(sinTramos,5)!=null?detectarPrecioEscalonado(sinTramos,5):precioOficial);
console.log('con tramos, cant 5 (no matchea, cae a oficial):', detectarPrecioEscalonado(conTramos,5)!=null?detectarPrecioEscalonado(conTramos,5):precioOficial);
console.log('con tramos, cant 15 (matchea el tramo):', detectarPrecioEscalonado(conTramos,15)!=null?detectarPrecioEscalonado(conTramos,15):precioOficial);
"
```
Expected: `sin tramos, cant 5: 15000`; `con tramos, cant 5 (no matchea, cae a oficial): 15000`; `con tramos, cant 15 (matchea el tramo): 13000`.

- [ ] **Step 6: Commit**

```bash
cd "i:/AGENCIA PEDIDOS/agencia"
git add public/index.html
git commit -m "[FEATURE] Producto Simple: respaldo a precio oficial cuando no hay tramo que coincida"
```

---

## Task 3: Frontend — paso 1 (3 caminos) y reorganización del modal

**Files:**
- Modify: `agencia/public/index.html` (markup del modal; `showTipoPrecioSec` → `elegirCaminoProducto`)

**Interfaces:**
- Produces: `elegirCaminoProducto(camino)`, variable global `prodCaminoActual`.

- [ ] **Step 1: Quitar el desplegable de tipo de precio, agregar el paso 1**

Releer primero con `grep -n -A11 'class="fr2 fg"' agencia/public/index.html` para confirmar el bloque exacto (el primero de varios `fr2 fg` del archivo — este es el de Nombre/Tipo de precio, al inicio del modal de Producto). Cambiar:

```html
    <div class="fr2 fg">
      <div><label>Nombre del producto</label><input type="text" id="prod-nombre" placeholder="Ej: Retablo 10x15cm"></div>
      <div><label>Tipo de precio</label>
        <select id="prod-tipo-precio" onchange="showTipoPrecioSec(this.value)">
          <option value="unitario">Unitario</option>
          <option value="escalonado">Escalonado</option>
          <option value="regla">Lleva N, paga M</option>
          <option value="combo">Combo</option>
          <option value="promocional">Promocional</option>
        </select>
      </div>
    </div>
```

por:

```html
    <div id="prod-paso-tipo">
      <div class="msec"><span class="tri"></span>¿Qué quieres crear?</div>
      <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:8px">
        <button class="btn-add-row" style="padding:14px 18px;font-size:11px" onclick="elegirCaminoProducto('simple')"><i class="ti ti-tag"></i>Producto simple</button>
        <button class="btn-add-row" style="padding:14px 18px;font-size:11px" onclick="elegirCaminoProducto('combo')"><i class="ti ti-package"></i>Combo</button>
        <button class="btn-add-row" style="padding:14px 18px;font-size:11px" onclick="elegirCaminoProducto('promocional')"><i class="ti ti-discount-2"></i>Promoción</button>
      </div>
    </div>

    <div id="prod-paso-form" style="display:none">
    <button class="btn-ghost" id="prod-btn-cambiar-tipo" style="margin-bottom:10px" onclick="document.getElementById('prod-paso-tipo').style.display='block';document.getElementById('prod-paso-form').style.display='none'"><i class="ti ti-arrow-left"></i>Cambiar tipo</button>
    <div class="fr2 fg">
      <div><label>Nombre del producto</label><input type="text" id="prod-nombre" placeholder="Ej: Retablo 10x15cm"></div>
      <div></div>
    </div>
```

- [ ] **Step 2: Cerrar el `prod-paso-form` antes del final del cuerpo del modal**

Releer primero con `grep -n -B2 -A3 'id="prod-sec-promocional"' agencia/public/index.html` para confirmar dónde abre esa sección (la última del formulario) y `grep -n -A2 '</div>\s*$' agencia/public/index.html` no es necesario — en su lugar, releer con `grep -n -A10 'Cantidad mínima' agencia/public/index.html` para ver el cierre exacto de `prod-sec-promocional` y el `</div>` de `mbody` que sigue. Cambiar:

```html
    <div id="prod-sec-promocional" style="display:none">
      <div class="msec"><span class="tri"></span>Vigencia de la promoción</div>
      <div class="fr3 fg">
        <div><label>Fecha de inicio</label><input type="date" id="prod-fecha-inicio"></div>
        <div><label>Fecha de fin</label><input type="date" id="prod-fecha-fin"></div>
        <div><label>Cantidad mínima</label><input type="text" id="prod-cantidad-minima" placeholder="Ej: 10"></div>
      </div>
      <div class="fg"><label>Descripción</label><input type="text" id="prod-descripcion" placeholder="Ej: Promo vasos Colombia"></div>
    </div>

  </div>
```

por:

```html
    <div id="prod-sec-promocional" style="display:none">
      <div class="msec"><span class="tri"></span>Vigencia de la promoción</div>
      <div class="fr3 fg">
        <div><label>Fecha de inicio</label><input type="date" id="prod-fecha-inicio"></div>
        <div><label>Fecha de fin</label><input type="date" id="prod-fecha-fin"></div>
        <div><label>Cantidad mínima</label><input type="text" id="prod-cantidad-minima" placeholder="Ej: 10"></div>
      </div>
      <div class="fg"><label>Descripción</label><input type="text" id="prod-descripcion" placeholder="Ej: Promo vasos Colombia"></div>
    </div>

    </div>
  </div>
```

(El primer `</div>` nuevo cierra `prod-paso-form`; el segundo es el `</div>` de `mbody` que ya estaba ahí — quedan ambos, uno detrás del otro.)

- [ ] **Step 3: Renombrar la sección de rangos y agregar el interruptor de Lleva-N-paga-M dentro de "Producto simple"**

Releer primero con `grep -n -A8 'id="prod-sec-escalonado"' agencia/public/index.html` para confirmar el bloque exacto. Cambiar:

```html
    <div id="prod-sec-escalonado" style="display:none">
      <div class="msec"><span class="tri"></span>Rangos de precio</div>
      <table class="items-table" id="prod-rangos-tabla">
        <thead><tr><th style="width:80px">Desde</th><th style="width:80px">Hasta</th><th>Precio por unidad</th><th style="width:26px"></th></tr></thead>
        <tbody id="prod-rangos-body"></tbody>
      </table>
      <button class="btn-add-row" onclick="addRango()"><i class="ti ti-plus"></i>Agregar rango</button>
    </div>
```

por:

```html
    <div id="prod-sec-escalonado" style="display:none">
      <div class="ck-box" style="display:inline-flex;margin-bottom:10px"><input type="checkbox" id="prod-es-regla" onchange="onEsReglaChange()"><label for="prod-es-regla">Es una promoción "Lleva N, paga M"</label></div>
      <div id="prod-sec-tramos">
        <div class="msec"><span class="tri"></span>Tramos adicionales por cantidad (opcional)</div>
        <div style="font-size:10px;color:var(--muted);margin-bottom:8px">El "Precio base" de arriba cubre cualquier cantidad. Agrega un tramo solo si quieres un precio distinto para un rango específico de cantidad.</div>
        <table class="items-table" id="prod-rangos-tabla">
          <thead><tr><th style="width:80px">Desde</th><th style="width:80px">Hasta</th><th>Precio por unidad</th><th style="width:26px"></th></tr></thead>
          <tbody id="prod-rangos-body"></tbody>
        </table>
        <button class="btn-add-row" onclick="addRango()"><i class="ti ti-plus"></i>Agregar tramo</button>
      </div>
    </div>
```

- [ ] **Step 4: `elegirCaminoProducto` reemplaza a `showTipoPrecioSec`**

Releer primero con `grep -n -A5 "^function showTipoPrecioSec" agencia/public/index.html` para confirmar el bloque exacto. Cambiar:

```js
function showTipoPrecioSec(tipo){
  document.getElementById('prod-sec-escalonado').style.display=tipo==='escalonado'?'block':'none';
  document.getElementById('prod-sec-regla').style.display=tipo==='regla'?'block':'none';
  document.getElementById('prod-sec-combo').style.display=tipo==='combo'?'block':'none';
  document.getElementById('prod-sec-promocional').style.display=tipo==='promocional'?'block':'none';
}
```

por:

```js
let prodCaminoActual='simple';
function elegirCaminoProducto(camino){
  prodCaminoActual=camino;
  document.getElementById('prod-paso-tipo').style.display='none';
  document.getElementById('prod-paso-form').style.display='block';
  document.getElementById('prod-sec-escalonado').style.display=camino==='simple'?'block':'none';
  document.getElementById('prod-sec-combo').style.display=camino==='combo'?'block':'none';
  document.getElementById('prod-sec-promocional').style.display=camino==='promocional'?'block':'none';
  if(camino==='simple')onEsReglaChange();
}
function onEsReglaChange(){
  const esRegla=document.getElementById('prod-es-regla').checked;
  document.getElementById('prod-sec-tramos').style.display=esRegla?'none':'block';
  document.getElementById('prod-sec-regla').style.display=esRegla?'block':'none';
}
```

- [ ] **Step 5: Verificar sintaxis**

Run: igual que Task 2 Step 4.
Expected: `OK`.

- [ ] **Step 6: Commit**

```bash
cd "i:/AGENCIA PEDIDOS/agencia"
git add public/index.html
git commit -m "[FEATURE] Producto Simple: paso de 3 caminos al crear, sin desplegable de tipo de precio"
```

---

## Task 4: Frontend — abrir/cerrar/reset/guardar adaptados al nuevo flujo

**Files:**
- Modify: `agencia/public/index.html` (`resetProdForm`; `abrirNuevoProducto`; `abrirEditarProducto`; `guardarProducto`; `validarProductoBody`)

- [ ] **Step 1: `resetProdForm` arranca en el paso 1**

Releer primero con `grep -n -A22 "^function resetProdForm" agencia/public/index.html` para confirmar el bloque completo exacto. Cambiar:

```js
function resetProdForm(){
  fProdInsumos=[];fProdRangos=[];fProdComponentes=[];fProdPrecioBaseRaw='';prodCatSel='';
  document.getElementById('prod-nombre').value='';
  document.getElementById('prod-tipo-precio').value='unitario';
  document.getElementById('prod-margen-tipo').value='fijo';
  document.getElementById('prod-margen-valor').value='';
  document.getElementById('prod-precio-base').value='';
  document.getElementById('prod-activo').checked=true;
  document.getElementById('prod-stock-actual').value='';
  document.getElementById('prod-stock-minimo').value='';
  document.getElementById('prod-regla-lleva').value='';
  document.getElementById('prod-regla-paga').value='';
  document.getElementById('prod-fecha-inicio').value='';
  document.getElementById('prod-fecha-fin').value='';
  document.getElementById('prod-cantidad-minima').value='';
  document.getElementById('prod-descripcion').value='';
  renderProdCatRow();
  renderInsumos();
  renderRangos();
  renderComponentes();
  onMargenTipoChange();
  showTipoPrecioSec('unitario');
}
```

por:

```js
function resetProdForm(){
  fProdInsumos=[];fProdRangos=[];fProdComponentes=[];fProdPrecioBaseRaw='';prodCatSel='';
  prodCaminoActual='simple';
  document.getElementById('prod-nombre').value='';
  document.getElementById('prod-es-regla').checked=false;
  document.getElementById('prod-margen-tipo').value='fijo';
  document.getElementById('prod-margen-valor').value='';
  document.getElementById('prod-precio-base').value='';
  document.getElementById('prod-activo').checked=true;
  document.getElementById('prod-stock-actual').value='';
  document.getElementById('prod-stock-minimo').value='';
  document.getElementById('prod-regla-lleva').value='';
  document.getElementById('prod-regla-paga').value='';
  document.getElementById('prod-fecha-inicio').value='';
  document.getElementById('prod-fecha-fin').value='';
  document.getElementById('prod-cantidad-minima').value='';
  document.getElementById('prod-descripcion').value='';
  renderProdCatRow();
  renderInsumos();
  renderRangos();
  renderComponentes();
  onMargenTipoChange();
  document.getElementById('prod-paso-tipo').style.display='block';
  document.getElementById('prod-paso-form').style.display='none';
  document.getElementById('prod-sec-escalonado').style.display='none';
  document.getElementById('prod-sec-regla').style.display='none';
  document.getElementById('prod-sec-combo').style.display='none';
  document.getElementById('prod-sec-promocional').style.display='none';
}
```

- [ ] **Step 2: `abrirNuevoProducto` muestra el botón "Cambiar tipo"**

Releer primero con `grep -n -A5 "^function abrirNuevoProducto" agencia/public/index.html`. Cambiar:

```js
function abrirNuevoProducto(){
  editProdId=null;resetProdForm();
  document.getElementById('prod-tit').textContent='Nuevo producto';
  document.getElementById('prod-btn-del').style.display='none';
  document.getElementById('ovProd').classList.add('open');
  setTimeout(()=>document.getElementById('prod-nombre').focus(),180);
}
```

por:

```js
function abrirNuevoProducto(){
  editProdId=null;resetProdForm();
  document.getElementById('prod-tit').textContent='Nuevo producto';
  document.getElementById('prod-btn-del').style.display='none';
  document.getElementById('prod-btn-cambiar-tipo').style.display='inline-flex';
  document.getElementById('ovProd').classList.add('open');
}
```

(Se quita el `setTimeout` que enfocaba `prod-nombre` al abrir — ya no tiene sentido porque el primer paso visible es la elección de camino, no el campo de nombre.)

- [ ] **Step 3: `abrirEditarProducto` deduce el camino y salta al paso 2**

Releer primero con `grep -n -A31 "^async function abrirEditarProducto" agencia/public/index.html` para confirmar el bloque completo exacto. Cambiar:

```js
async function abrirEditarProducto(id){
  const p=await api('GET',`/productos/${id}`);
  editProdId=id;
  fProdInsumos=JSON.parse(JSON.stringify(p.insumos||[]));
  fProdComponentes=(p.componentes||[]).map(c=>({id:uid(),componente_ficha_id:c.componente_ficha_id,componente_nombre:c.componente_nombre||'',cantidad_consumida:String(c.cantidad_consumida)}));
  fProdRangos=(p.rangos||[]).map(r=>({id:uid(),desde:r.desde,hasta:r.hasta,precio:String(r.precio)}));
  prodCatSel=p.categoria_id||'';
  fProdPrecioBaseRaw=(p.precio_base!=null?p.precio_base:'');
  document.getElementById('prod-nombre').value=p.nombre;
  document.getElementById('prod-tipo-precio').value=p.tipo_precio;
  document.getElementById('prod-margen-tipo').value=p.margen_tipo;
  document.getElementById('prod-margen-valor').value=p.margen_valor||'';
  document.getElementById('prod-precio-base').value=displayMoneyVal(fProdPrecioBaseRaw);
  document.getElementById('prod-activo').checked=!!p.activo;
  document.getElementById('prod-stock-actual').value=p.stock_actual??'';
  document.getElementById('prod-stock-minimo').value=p.stock_minimo??'';
  document.getElementById('prod-regla-lleva').value=p.regla_lleva??'';
  document.getElementById('prod-regla-paga').value=p.regla_paga??'';
  document.getElementById('prod-fecha-inicio').value=p.fecha_inicio||'';
  document.getElementById('prod-fecha-fin').value=p.fecha_fin||'';
  document.getElementById('prod-cantidad-minima').value=p.cantidad_minima||'';
  document.getElementById('prod-descripcion').value=p.descripcion||'';
  document.getElementById('prod-tit').textContent=p.nombre;
  document.getElementById('prod-btn-del').style.display='inline-flex';
  renderProdCatRow();
  renderInsumos();
  renderRangos();
  renderComponentes();
  onMargenTipoChange();
  showTipoPrecioSec(p.tipo_precio);
  document.getElementById('ovProd').classList.add('open');
}
```

por:

```js
async function abrirEditarProducto(id){
  const p=await api('GET',`/productos/${id}`);
  editProdId=id;
  fProdInsumos=JSON.parse(JSON.stringify(p.insumos||[]));
  fProdComponentes=(p.componentes||[]).map(c=>({id:uid(),componente_ficha_id:c.componente_ficha_id,componente_nombre:c.componente_nombre||'',cantidad_consumida:String(c.cantidad_consumida)}));
  fProdRangos=(p.rangos||[]).map(r=>({id:uid(),desde:r.desde,hasta:r.hasta,precio:String(r.precio)}));
  prodCatSel=p.categoria_id||'';
  fProdPrecioBaseRaw=(p.precio_base!=null?p.precio_base:'');
  document.getElementById('prod-nombre').value=p.nombre;
  document.getElementById('prod-margen-tipo').value=p.margen_tipo;
  document.getElementById('prod-margen-valor').value=p.margen_valor||'';
  document.getElementById('prod-precio-base').value=displayMoneyVal(fProdPrecioBaseRaw);
  document.getElementById('prod-activo').checked=!!p.activo;
  document.getElementById('prod-stock-actual').value=p.stock_actual??'';
  document.getElementById('prod-stock-minimo').value=p.stock_minimo??'';
  document.getElementById('prod-regla-lleva').value=p.regla_lleva??'';
  document.getElementById('prod-regla-paga').value=p.regla_paga??'';
  document.getElementById('prod-fecha-inicio').value=p.fecha_inicio||'';
  document.getElementById('prod-fecha-fin').value=p.fecha_fin||'';
  document.getElementById('prod-cantidad-minima').value=p.cantidad_minima||'';
  document.getElementById('prod-descripcion').value=p.descripcion||'';
  document.getElementById('prod-tit').textContent=p.nombre;
  document.getElementById('prod-btn-del').style.display='inline-flex';
  document.getElementById('prod-btn-cambiar-tipo').style.display='none';
  renderProdCatRow();
  renderInsumos();
  renderRangos();
  renderComponentes();
  onMargenTipoChange();
  const camino=(p.tipo_precio==='combo')?'combo':(p.tipo_precio==='promocional')?'promocional':'simple';
  document.getElementById('prod-es-regla').checked=p.tipo_precio==='regla';
  elegirCaminoProducto(camino);
  document.getElementById('ovProd').classList.add('open');
}
```

(Se quita la línea `document.getElementById('prod-btn-cambiar-tipo').style.display='inline-flex'` — al editar no tiene sentido cambiar de camino, por eso se oculta explícitamente aquí. `elegirCaminoProducto` ya hace `style.display='none'`/`'block'` de los pasos, así que cubre también el salto directo al paso 2.)

- [ ] **Step 4: `guardarProducto` usa el camino en vez del desplegable**

Releer primero con `grep -n -A24 "^async function guardarProducto" agencia/public/index.html` para confirmar el bloque completo exacto. Cambiar:

```js
async function guardarProducto(){
  const nombre=document.getElementById('prod-nombre').value.trim();
  if(!nombre){document.getElementById('prod-nombre').focus();toast('Ingresa el nombre del producto',false);return}
  const tipoPrecio=document.getElementById('prod-tipo-precio').value;
  const body={
```

por:

```js
async function guardarProducto(){
  const nombre=document.getElementById('prod-nombre').value.trim();
  if(!nombre){document.getElementById('prod-nombre').focus();toast('Ingresa el nombre del producto',false);return}
  const tipoPrecio=prodCaminoActual==='simple'?(document.getElementById('prod-es-regla').checked?'regla':'escalonado'):prodCaminoActual;
  const body={
```

- [ ] **Step 5: Quitar la validación de frontend "Escalonado necesita al menos un rango"**

Releer primero con `grep -n -A12 "^function validarProductoBody" agencia/public/index.html` para confirmar el bloque completo exacto. Cambiar:

```js
function validarProductoBody(b){
  if(definidoFE(b.precio_base)&&evalExpr(b.precio_base)===null)return'El Precio base no es una expresión válida';
  for(let i=0;i<(b.insumos||[]).length;i++){
    if(definidoFE(b.insumos[i].costo_unitario)&&evalExpr(b.insumos[i].costo_unitario)===null)return`Costo unitario del insumo #${i+1} no es una expresión válida`;
  }
  if(b.tipo_precio==='escalonado'&&(!b.rangos||!b.rangos.length))return'Escalonado necesita al menos un rango de precio';
  if(b.tipo_precio==='combo'){
```

por:

```js
function validarProductoBody(b){
  if(definidoFE(b.precio_base)&&evalExpr(b.precio_base)===null)return'El Precio base no es una expresión válida';
  for(let i=0;i<(b.insumos||[]).length;i++){
    if(definidoFE(b.insumos[i].costo_unitario)&&evalExpr(b.insumos[i].costo_unitario)===null)return`Costo unitario del insumo #${i+1} no es una expresión válida`;
  }
  if(b.tipo_precio==='combo'){
```

- [ ] **Step 6: Verificar sintaxis**

Run: igual que Task 2 Step 4.
Expected: `OK`.

- [ ] **Step 7: Verificación funcional**

Run:
```bash
cd "i:/AGENCIA PEDIDOS/agencia"
npm start &
for i in 1 2 3 4 5 6 7 8 9 10; do curl -s -m 1 http://localhost:3000/ -o /dev/null && break; sleep 1; done
curl -s -m 5 http://localhost:3000/ | grep -c 'elegirCaminoProducto\|prod-paso-tipo\|prod-paso-form\|onEsReglaChange\|prod-sec-tramos'
TOKEN=$(curl -s -m 5 -X POST http://localhost:3000/api/auth/login -H "Content-Type: application/json" -d '{"pin":"1234"}' | grep -o '"token":"[^"]*"' | cut -d'"' -f4)
curl -s -m 5 -o /dev/null -w "productos HTTP %{http_code}\n" http://localhost:3000/api/productos -H "Authorization: Bearer $TOKEN"
PID=$(netstat -ano | grep ':3000' | grep LISTENING | head -1 | awk '{print $NF}'); [ -n "$PID" ] && taskkill //F //PID "$PID"
```
Expected: el `grep -c` da al menos `5`; `productos` responde `HTTP 200`.

- [ ] **Step 8: Commit**

```bash
cd "i:/AGENCIA PEDIDOS/agencia"
git add public/index.html
git commit -m "[FEATURE] Producto Simple: abrir/editar/guardar adaptados al flujo de 2 pasos"
```

---

## Task 5: Frontend — terminología consistente en la tarjeta de producto

**Files:**
- Modify: `agencia/public/index.html` (`TIPO_LABEL`)

- [ ] **Step 1: "Producto simple" para unitario y escalonado por igual**

Releer primero con `grep -n "const TIPO_LABEL=" agencia/public/index.html`. Cambiar:

```js
  const TIPO_LABEL={unitario:'Unitario',escalonado:'Escalonado',promocional:'Promocional'};
```

por:

```js
  const TIPO_LABEL={unitario:'Producto simple',escalonado:'Producto simple',regla:'Lleva N, paga M',combo:'Combo',promocional:'Promoción'};
```

- [ ] **Step 2: Verificar sintaxis**

Run: igual que Task 2 Step 4.
Expected: `OK`.

- [ ] **Step 3: Commit**

```bash
cd "i:/AGENCIA PEDIDOS/agencia"
git add public/index.html
git commit -m "[FEATURE] Producto Simple: terminologia consistente en la tarjeta de producto"
```

---

## Task 6: Verificación final

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

- [ ] **Step 2: Regresión — un producto `unitario` viejo sigue resolviendo su precio igual**

Run (servidor levantado, mismo patrón de espera):
```bash
TOKEN=$(curl -s -m 5 -X POST http://localhost:3000/api/auth/login -H "Content-Type: application/json" -d '{"pin":"1234"}' | grep -o '"token":"[^"]*"' | cut -d'"' -f4)
curl -s -m 5 http://localhost:3000/api/productos -H "Authorization: Bearer $TOKEN" | grep -o '"tipo_precio":"unitario"' | head -1
```
Expected: si hay al menos un producto `unitario` ya creado en la base local (de pruebas de fases anteriores), aparece — confirma que sigue existiendo sin que esta ronda lo haya tocado.

- [ ] **Step 3: Checklist manual para el usuario (el agente no tiene navegador)**

Pedir al usuario que, en `npm start`: dé "Nuevo producto" y confirme que ve primero los 3 botones (Producto simple/Combo/Promoción), sin ningún desplegable; elija "Producto simple", llene nombre y precio base, guarde sin agregar ningún tramo, y confirme que funciona igual que "Unitario" antes; agregue un tramo de cantidad y confirme que ahora se comporta como "Escalonado" antes; active el interruptor "Lleva N, paga M" y confirme que reemplaza la tabla de tramos por los campos Lleva/Paga; abra un producto `unitario` que ya tenía creado y confirme que se ve y se sigue comportando igual (cae directo al paso 2, en modo "Producto simple", sin el interruptor de regla activado).

- [ ] **Step 4: Push**

```bash
git push origin main
```
