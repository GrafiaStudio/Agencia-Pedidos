# Promoción "Lleva N, paga M" Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tipo de precio "regla" (Lleva N, paga M) en fichas de producto, con precio efectivo calculado en el frontend según cantidad — mismo mecanismo que Escalonado.

**Architecture:** Réplica del patrón ya existente de Escalonado (`detectarPrecioEscalonado` + `it._autoPrecio` en `selItem`/`setItem`) con una fórmula distinta (`calcularPrecioRegla`). Sin tablas nuevas — solo dos columnas (`regla_lleva`, `regla_paga`) en `fichas_producto`, igual patrón que `stock_actual`/`stock_minimo`.

**Tech Stack:** Node.js + Express + better-sqlite3 (backend), HTML/CSS/JS vanilla (frontend).

## Global Constraints

- La regla nunca cobra de más: si la cantidad es menor a `regla_lleva`, se cobra el precio base completo, sin descuento.
- `regla_paga` siempre debe ser menor que `regla_lleva` en la validación — si no, no es una promoción real.
- Una ficha tipo `regla` se trata exactamente igual que Unitario para inventario (stock propio, sin composición) — no toca `descontarStock`/`restaurarStock`.
- `git push origin main` no requiere confirmación previa (autorización del usuario).

---

## Task 1: Backend — modelo de datos y validación

**Files:**
- Modify: `agencia/server.js`

- [ ] **Step 1: Migración**

Releer primero con `grep -n -A1 'ALTER TABLE fichas_producto ADD COLUMN stock_minimo' agencia/server.js`. Cambiar:

```js
try { db.exec("ALTER TABLE fichas_producto ADD COLUMN stock_minimo INTEGER"); } catch(e){}
try { db.exec("ALTER TABLE enc_items ADD COLUMN ficha_id TEXT"); } catch(e){}
```

por:

```js
try { db.exec("ALTER TABLE fichas_producto ADD COLUMN stock_minimo INTEGER"); } catch(e){}
try { db.exec("ALTER TABLE fichas_producto ADD COLUMN regla_lleva INTEGER"); } catch(e){}
try { db.exec("ALTER TABLE fichas_producto ADD COLUMN regla_paga INTEGER"); } catch(e){}
try { db.exec("ALTER TABLE enc_items ADD COLUMN ficha_id TEXT"); } catch(e){}
```

- [ ] **Step 2: `TIPOS_PRECIO_VALIDOS` gana `'regla'`**

Releer primero con `grep -n "const TIPOS_PRECIO_VALIDOS=" agencia/server.js`. Cambiar:

```js
const TIPOS_PRECIO_VALIDOS=['unitario','escalonado','promocional','combo'];
```

por:

```js
const TIPOS_PRECIO_VALIDOS=['unitario','escalonado','promocional','combo','regla'];
```

- [ ] **Step 3: `validarFicha` valida la regla**

Releer primero con `grep -n -A34 "^function validarFicha(b,wsId,fid){" agencia/server.js` para confirmar el bloque completo exacto (incluye ya la validación de combos de la entrega anterior). Cambiar:

```js
  if(b.tipo_precio==='combo'){
    if(!Array.isArray(b.componentes)||!b.componentes.length)errores.push('Combo necesita al menos un componente');
    else b.componentes.forEach((c,i)=>{
      if(!c.componente_ficha_id)errores.push(`Componente #${i+1}: selecciona un producto`);
      else{
        if(fid&&c.componente_ficha_id===fid)errores.push(`Componente #${i+1}: un combo no puede tenerse a sí mismo como componente`);
        const comp=db.prepare('SELECT tipo_precio FROM fichas_producto WHERE id=? AND workspace_id=?').get(c.componente_ficha_id,wsId);
        if(!comp)errores.push(`Componente #${i+1}: el producto seleccionado no existe`);
        else if(comp.tipo_precio==='combo')errores.push(`Componente #${i+1}: un combo no puede tener otro combo como componente`);
      }
      if(!Number.isInteger(c.cantidad_consumida)||c.cantidad_consumida<=0)errores.push(`Componente #${i+1}: la cantidad debe ser un número entero mayor a 0`);
    });
  }
  return errores;
```

por:

```js
  if(b.tipo_precio==='combo'){
    if(!Array.isArray(b.componentes)||!b.componentes.length)errores.push('Combo necesita al menos un componente');
    else b.componentes.forEach((c,i)=>{
      if(!c.componente_ficha_id)errores.push(`Componente #${i+1}: selecciona un producto`);
      else{
        if(fid&&c.componente_ficha_id===fid)errores.push(`Componente #${i+1}: un combo no puede tenerse a sí mismo como componente`);
        const comp=db.prepare('SELECT tipo_precio FROM fichas_producto WHERE id=? AND workspace_id=?').get(c.componente_ficha_id,wsId);
        if(!comp)errores.push(`Componente #${i+1}: el producto seleccionado no existe`);
        else if(comp.tipo_precio==='combo')errores.push(`Componente #${i+1}: un combo no puede tener otro combo como componente`);
      }
      if(!Number.isInteger(c.cantidad_consumida)||c.cantidad_consumida<=0)errores.push(`Componente #${i+1}: la cantidad debe ser un número entero mayor a 0`);
    });
  }
  if(b.tipo_precio==='regla'){
    if(!Number.isInteger(b.regla_lleva)||b.regla_lleva<=0)errores.push('"Lleva" debe ser un número entero mayor a 0');
    if(!Number.isInteger(b.regla_paga)||b.regla_paga<=0)errores.push('"Paga" debe ser un número entero mayor a 0');
    if(Number.isInteger(b.regla_lleva)&&Number.isInteger(b.regla_paga)&&b.regla_paga>=b.regla_lleva)errores.push('"Paga" debe ser menor que "Lleva" para que sea una promoción real');
  }
  return errores;
```

- [ ] **Step 4: `POST /api/productos` persiste `regla_lleva`/`regla_paga`**

Releer primero con `grep -n -A12 "^app.post('/api/productos'" agencia/server.js`. Cambiar:

```js
    db.prepare(`INSERT INTO fichas_producto(id,workspace_id,nombre,categoria_id,tipo_precio,margen_tipo,margen_valor,precio_base,precio_base_calc,rangos,fecha_inicio,fecha_fin,cantidad_minima,descripcion,activo,stock_actual,stock_minimo)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
      .run(id,req.wsId,b.nombre.trim(),b.categoria_id||'',b.tipo_precio||'unitario',b.margen_tipo||'fijo',b.margen_valor||'',normVF(b.precio_base),normCalc(b.precio_base),JSON.stringify(b.rangos||[]),b.fecha_inicio||'',b.fecha_fin||'',b.cantidad_minima||'',b.descripcion||'',b.activo===false?0:1,Number.isInteger(b.stock_actual)?b.stock_actual:null,Number.isInteger(b.stock_minimo)?b.stock_minimo:null);
```

por:

```js
    db.prepare(`INSERT INTO fichas_producto(id,workspace_id,nombre,categoria_id,tipo_precio,margen_tipo,margen_valor,precio_base,precio_base_calc,rangos,fecha_inicio,fecha_fin,cantidad_minima,descripcion,activo,stock_actual,stock_minimo,regla_lleva,regla_paga)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
      .run(id,req.wsId,b.nombre.trim(),b.categoria_id||'',b.tipo_precio||'unitario',b.margen_tipo||'fijo',b.margen_valor||'',normVF(b.precio_base),normCalc(b.precio_base),JSON.stringify(b.rangos||[]),b.fecha_inicio||'',b.fecha_fin||'',b.cantidad_minima||'',b.descripcion||'',b.activo===false?0:1,Number.isInteger(b.stock_actual)?b.stock_actual:null,Number.isInteger(b.stock_minimo)?b.stock_minimo:null,Number.isInteger(b.regla_lleva)?b.regla_lleva:null,Number.isInteger(b.regla_paga)?b.regla_paga:null);
```

- [ ] **Step 5: `PUT /api/productos/:id` persiste `regla_lleva`/`regla_paga`**

Releer primero con `grep -n -A11 "^app.put('/api/productos/:id'" agencia/server.js`. Cambiar:

```js
    db.prepare(`UPDATE fichas_producto SET nombre=?,categoria_id=?,tipo_precio=?,margen_tipo=?,margen_valor=?,precio_base=?,precio_base_calc=?,rangos=?,fecha_inicio=?,fecha_fin=?,cantidad_minima=?,descripcion=?,activo=?,stock_actual=?,stock_minimo=? WHERE id=? AND workspace_id=?`)
      .run(b.nombre.trim(),b.categoria_id||'',b.tipo_precio||'unitario',b.margen_tipo||'fijo',b.margen_valor||'',normVF(b.precio_base),normCalc(b.precio_base),JSON.stringify(b.rangos||[]),b.fecha_inicio||'',b.fecha_fin||'',b.cantidad_minima||'',b.descripcion||'',b.activo===false?0:1,Number.isInteger(b.stock_actual)?b.stock_actual:null,Number.isInteger(b.stock_minimo)?b.stock_minimo:null,fid,req.wsId);
```

por:

```js
    db.prepare(`UPDATE fichas_producto SET nombre=?,categoria_id=?,tipo_precio=?,margen_tipo=?,margen_valor=?,precio_base=?,precio_base_calc=?,rangos=?,fecha_inicio=?,fecha_fin=?,cantidad_minima=?,descripcion=?,activo=?,stock_actual=?,stock_minimo=?,regla_lleva=?,regla_paga=? WHERE id=? AND workspace_id=?`)
      .run(b.nombre.trim(),b.categoria_id||'',b.tipo_precio||'unitario',b.margen_tipo||'fijo',b.margen_valor||'',normVF(b.precio_base),normCalc(b.precio_base),JSON.stringify(b.rangos||[]),b.fecha_inicio||'',b.fecha_fin||'',b.cantidad_minima||'',b.descripcion||'',b.activo===false?0:1,Number.isInteger(b.stock_actual)?b.stock_actual:null,Number.isInteger(b.stock_minimo)?b.stock_minimo:null,Number.isInteger(b.regla_lleva)?b.regla_lleva:null,Number.isInteger(b.regla_paga)?b.regla_paga:null,fid,req.wsId);
```

- [ ] **Step 6: Verificar sintaxis**

Run: `cd "i:/AGENCIA PEDIDOS/agencia" && node -c server.js && echo OK`
Expected: `OK`.

- [ ] **Step 7: Probar con curl**

Run:
```bash
cd "i:/AGENCIA PEDIDOS/agencia"
npm start &
for i in 1 2 3 4 5 6 7 8 9 10; do curl -s -m 1 http://localhost:3000/ -o /dev/null && break; sleep 1; done
TOKEN=$(curl -s -m 5 -X POST http://localhost:3000/api/auth/login -H "Content-Type: application/json" -d '{"pin":"1234"}' | grep -o '"token":"[^"]*"' | cut -d'"' -f4)

echo "--- regla invalida: paga >= lleva debe fallar 400 ---"
curl -s -m 5 -w "\nHTTP %{http_code}\n" -X POST http://localhost:3000/api/productos -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{"nombre":"Promo mala","tipo_precio":"regla","precio_base":"30000","regla_lleva":3,"regla_paga":3}'

echo "--- regla valida: lleva 3 paga 2 ---"
RESP=$(curl -s -m 5 -X POST http://localhost:3000/api/productos -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{"nombre":"Promo vasos","tipo_precio":"regla","precio_base":"30000","regla_lleva":3,"regla_paga":2}')
echo "$RESP" | grep -o '"regla_lleva":[0-9]*\|"regla_paga":[0-9]*'
RID=$(echo "$RESP" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)

echo "--- limpieza ---"
curl -s -m 5 -X DELETE "http://localhost:3000/api/productos/$RID" -H "Authorization: Bearer $TOKEN" -o /dev/null
PID=$(netstat -ano | grep ':3000' | grep LISTENING | head -1 | awk '{print $NF}'); [ -n "$PID" ] && taskkill //F //PID "$PID"
```
Expected: `HTTP 400` (paga>=lleva); `"regla_lleva":3 "regla_paga":2` (creación válida).

- [ ] **Step 8: Commit**

```bash
cd "i:/AGENCIA PEDIDOS/agencia"
git add server.js
git commit -m "[FEATURE] Promocion Lleva N paga M: tipo de precio regla y validacion (Fase 2)"
```

---

## Task 2: Frontend — modal de Producto: campos de la regla

**Files:**
- Modify: `agencia/public/index.html` (selector de tipo; nueva sección; `showTipoPrecioSec`; `resetProdForm`; `abrirEditarProducto`; `guardarProducto`)

- [ ] **Step 1: Opción en el selector**

Releer primero con `grep -n -A5 'id="prod-tipo-precio"' agencia/public/index.html`. Cambiar:

```html
        <select id="prod-tipo-precio" onchange="showTipoPrecioSec(this.value)">
          <option value="unitario">Unitario</option>
          <option value="escalonado">Escalonado</option>
          <option value="combo">Combo</option>
          <option value="promocional">Promocional</option>
        </select>
```

por:

```html
        <select id="prod-tipo-precio" onchange="showTipoPrecioSec(this.value)">
          <option value="unitario">Unitario</option>
          <option value="escalonado">Escalonado</option>
          <option value="regla">Lleva N, paga M</option>
          <option value="combo">Combo</option>
          <option value="promocional">Promocional</option>
        </select>
```

- [ ] **Step 2: Nueva sección "Lleva N, paga M"**

Releer primero con `grep -n -B1 'id="prod-sec-combo"' agencia/public/index.html` para confirmar el ancla exacta (justo después del cierre de `prod-sec-escalonado`). Inmediatamente antes de `<div id="prod-sec-combo" style="display:none">`, agregar:

```html
    <div id="prod-sec-regla" style="display:none">
      <div class="msec"><span class="tri"></span>Regla de la promoción</div>
      <div class="fr2 fg">
        <div><label>Lleva (unidades)</label><input type="number" id="prod-regla-lleva" min="1" placeholder="Ej: 3"></div>
        <div><label>Paga (unidades)</label><input type="number" id="prod-regla-paga" min="1" placeholder="Ej: 2"></div>
      </div>
      <div style="font-size:10px;color:var(--muted)">El "Precio base" de arriba es el precio normal por unidad. Esta regla baja el promedio cuando la cantidad alcanza "Lleva".</div>
    </div>

```

- [ ] **Step 3: `showTipoPrecioSec` reconoce `regla`**

Releer primero con `grep -n -A4 "^function showTipoPrecioSec" agencia/public/index.html`. Cambiar:

```js
function showTipoPrecioSec(tipo){
  document.getElementById('prod-sec-escalonado').style.display=tipo==='escalonado'?'block':'none';
  document.getElementById('prod-sec-combo').style.display=tipo==='combo'?'block':'none';
  document.getElementById('prod-sec-promocional').style.display=tipo==='promocional'?'block':'none';
}
```

por:

```js
function showTipoPrecioSec(tipo){
  document.getElementById('prod-sec-escalonado').style.display=tipo==='escalonado'?'block':'none';
  document.getElementById('prod-sec-regla').style.display=tipo==='regla'?'block':'none';
  document.getElementById('prod-sec-combo').style.display=tipo==='combo'?'block':'none';
  document.getElementById('prod-sec-promocional').style.display=tipo==='promocional'?'block':'none';
}
```

- [ ] **Step 4: `resetProdForm` limpia los campos**

Releer primero con `grep -n -A2 "prod-stock-minimo'\).value=''" agencia/public/index.html` para confirmar que esta es la ocurrencia dentro de `resetProdForm` (única en el archivo, a diferencia de otros bloques compartidos). Cambiar:

```js
  document.getElementById('prod-stock-actual').value='';
  document.getElementById('prod-stock-minimo').value='';
```

por:

```js
  document.getElementById('prod-stock-actual').value='';
  document.getElementById('prod-stock-minimo').value='';
  document.getElementById('prod-regla-lleva').value='';
  document.getElementById('prod-regla-paga').value='';
```

- [ ] **Step 5: `abrirEditarProducto` carga los campos**

Releer primero con `grep -n -A2 "prod-stock-minimo'\).value=p\." agencia/public/index.html`. Cambiar:

```js
  document.getElementById('prod-stock-actual').value=p.stock_actual??'';
  document.getElementById('prod-stock-minimo').value=p.stock_minimo??'';
```

por:

```js
  document.getElementById('prod-stock-actual').value=p.stock_actual??'';
  document.getElementById('prod-stock-minimo').value=p.stock_minimo??'';
  document.getElementById('prod-regla-lleva').value=p.regla_lleva??'';
  document.getElementById('prod-regla-paga').value=p.regla_paga??'';
```

- [ ] **Step 6: `guardarProducto` manda los campos**

Releer primero con `grep -n -A1 "stock_minimo:document.getElementById" agencia/public/index.html`. Cambiar:

```js
    stock_actual:document.getElementById('prod-stock-actual').value===''?null:parseInt(document.getElementById('prod-stock-actual').value,10),
    stock_minimo:document.getElementById('prod-stock-minimo').value===''?null:parseInt(document.getElementById('prod-stock-minimo').value,10),
```

por:

```js
    stock_actual:document.getElementById('prod-stock-actual').value===''?null:parseInt(document.getElementById('prod-stock-actual').value,10),
    stock_minimo:document.getElementById('prod-stock-minimo').value===''?null:parseInt(document.getElementById('prod-stock-minimo').value,10),
    regla_lleva:document.getElementById('prod-regla-lleva').value===''?null:parseInt(document.getElementById('prod-regla-lleva').value,10),
    regla_paga:document.getElementById('prod-regla-paga').value===''?null:parseInt(document.getElementById('prod-regla-paga').value,10),
```

- [ ] **Step 7: Verificar sintaxis**

Run:
```bash
cd "i:/AGENCIA PEDIDOS/agencia"
SCRATCH="C:/Users/ADMIN/AppData/Local/Temp/claude/i--AGENCIA-PEDIDOS/8d8d31ac-5619-43aa-9270-0aa1f2328221/scratchpad"
awk '/<script>/{f=1;next}/<\/script>/{f=0}f' public/index.html > "$SCRATCH/check.js"
node -c "$SCRATCH/check.js" && echo OK
```
Expected: `OK`.

- [ ] **Step 8: Commit**

```bash
cd "i:/AGENCIA PEDIDOS/agencia"
git add public/index.html
git commit -m "[FEATURE] Promocion Lleva N paga M: campos en el modal de Producto (Fase 2)"
```

---

## Task 3: Frontend — cálculo de precio en el autocompletado de Encargos

**Files:**
- Modify: `agencia/public/index.html` (`calcularPrecioRegla` nueva; `selItem`; `setItem`; `acItem`)

**Interfaces:**
- Produces: `calcularPrecioRegla(lleva,paga,precioUnitario,cantidad)`.

- [ ] **Step 1: `calcularPrecioRegla`**

Releer primero con `grep -n -A5 "^function detectarPrecioEscalonado" agencia/public/index.html`. Inmediatamente después de su cierre, agregar:

```js
function calcularPrecioRegla(lleva,paga,precioUnitario,cantidad){
  if(!lleva||!paga||cantidad<lleva)return precioUnitario;
  const grupos=Math.floor(cantidad/lleva);
  const resto=cantidad%lleva;
  const unidadesPagadas=grupos*paga+resto;
  return Math.round((unidadesPagadas*precioUnitario)/cantidad);
}
```

- [ ] **Step 2: `selItem` reconoce `regla`**

Releer primero con `grep -n -A8 "^function selItem" agencia/public/index.html` para confirmar el bloque exacto. Cambiar:

```js
  if(p.tipo_precio==='escalonado'){
    it._autoPrecio=true;
    const cantNum=parseInt(String(it.cantidad||0).replace(/\D/g,''))||0;
    it.valor_unitario=cantNum>0?String(detectarPrecioEscalonado(p.rangos,cantNum)||''):'';
  }else{
    it._autoPrecio=false;
    it.valor_unitario=String(p.precio_oficial);
  }
```

por:

```js
  if(p.tipo_precio==='escalonado'){
    it._autoPrecio=true;
    const cantNum=parseInt(String(it.cantidad||0).replace(/\D/g,''))||0;
    it.valor_unitario=cantNum>0?String(detectarPrecioEscalonado(p.rangos,cantNum)||''):'';
  }else if(p.tipo_precio==='regla'){
    it._autoPrecio=true;
    const cantNum=parseInt(String(it.cantidad||0).replace(/\D/g,''))||0;
    it.valor_unitario=cantNum>0?String(calcularPrecioRegla(p.regla_lleva,p.regla_paga,p.precio_oficial,cantNum)):'';
  }else{
    it._autoPrecio=false;
    it.valor_unitario=String(p.precio_oficial);
  }
```

- [ ] **Step 3: `setItem` recalcula al cambiar Cantidad**

Releer primero con `grep -n -A9 "^function setItem(encId,itemId,k,v)" agencia/public/index.html`. Cambiar:

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
      if(precio!=null){
        it.valor_unitario=String(precio);
        const elU=document.getElementById('itval-'+itemId);
        if(elU)elU.value=displayMoneyVal(it.valor_unitario);
      }
    }
    if(k==='cantidad'&&it._autoPrecio&&it._fichaSel&&it._fichaSel.tipo_precio==='regla'){
      const cantNum=parseInt(String(v||0).replace(/\D/g,''))||0;
      if(cantNum>0){
        const precio=calcularPrecioRegla(it._fichaSel.regla_lleva,it._fichaSel.regla_paga,it._fichaSel.precio_oficial,cantNum);
        it.valor_unitario=String(precio);
        const elU=document.getElementById('itval-'+itemId);
        if(elU)elU.value=displayMoneyVal(it.valor_unitario);
      }
    }
```

- [ ] **Step 4: `acItem` muestra ícono y texto "según cantidad" para `regla`**

Releer primero con `grep -n -A7 "const ICONOS=" agencia/public/index.html`. Cambiar:

```js
  const ICONOS={unitario:'ti-tag',escalonado:'ti-stairs',combo:'ti-package',promocional:'ti-discount-2'};
  dr.innerHTML=_acItemResults[itemId].map((p,i)=>{
    const precioTxt=p.tipo_precio==='escalonado'?'según cantidad':fCOP(p.precio_oficial);
```

por:

```js
  const ICONOS={unitario:'ti-tag',escalonado:'ti-stairs',regla:'ti-discount',combo:'ti-package',promocional:'ti-discount-2'};
  dr.innerHTML=_acItemResults[itemId].map((p,i)=>{
    const precioTxt=(p.tipo_precio==='escalonado'||p.tipo_precio==='regla')?'según cantidad':fCOP(p.precio_oficial);
```

- [ ] **Step 5: Verificar sintaxis**

Run: igual que Task 2 Step 7.
Expected: `OK`.

- [ ] **Step 6: Prueba de lógica pura con Node**

Run:
```bash
cd "i:/AGENCIA PEDIDOS/agencia"
node -e "
function calcularPrecioRegla(lleva,paga,precioUnitario,cantidad){
  if(!lleva||!paga||cantidad<lleva)return precioUnitario;
  const grupos=Math.floor(cantidad/lleva);
  const resto=cantidad%lleva;
  const unidadesPagadas=grupos*paga+resto;
  return Math.round((unidadesPagadas*precioUnitario)/cantidad);
}
console.log('cant 2 (no activa):', calcularPrecioRegla(3,2,30000,2));
console.log('cant 3 (1 grupo exacto):', calcularPrecioRegla(3,2,30000,3));
console.log('cant 9 (3 grupos exactos):', calcularPrecioRegla(3,2,30000,9));
console.log('cant 7 (2 grupos + 1 suelta):', calcularPrecioRegla(3,2,30000,7));
"
```
Expected: `cant 2 (no activa): 30000` (regla no se activa, precio normal); `cant 3 (1 grupo exacto): 20000` (paga 2 de 3, 60000/3); `cant 9 (3 grupos exactos): 20000` (paga 6 de 9, 180000/9); `cant 7 (2 grupos + 1 suelta): 21429` (paga 5 de 7, 150000/7 redondeado).

- [ ] **Step 7: Commit**

```bash
cd "i:/AGENCIA PEDIDOS/agencia"
git add public/index.html
git commit -m "[FEATURE] Promocion Lleva N paga M: calculo de precio en Encargos (Fase 2)"
```

---

## Task 4: Verificación final

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

Pedir al usuario que cree un producto tipo "Lleva N, paga M" (ej. Lleva 3 paga 2, precio base $30.000), lo seleccione en Encargos con cantidad 9, y confirme que el Valor unitario se llena solo en $20.000 — y que al cambiar la cantidad a 7 se actualiza solo a $21.429 (o el redondeo que corresponda).

- [ ] **Step 4: Push**

```bash
git push origin main
```
