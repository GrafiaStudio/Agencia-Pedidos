# Combo/Promoción rediseñado Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Combo y Promoción comparten la misma composición de productos (real o libre), con un modo de precio Global/Por producto, y el inventario/documento ya no distinguen por tipo sino por si la ficha tiene composición.

**Architecture:** 3 columnas nuevas (`fichas_producto.combo_precio_modo`; `combo_composicion.componente_nombre`/`precio_unitario`/`precio_unitario_calc`). Los ítems libres de Promoción usan `componente_ficha_id=''` (string vacío, no `NULL`) para evitar tocar la restricción `NOT NULL` de la columna en una tabla con datos reales. `descontarStock` deja de mirar `tipo_precio`, expande cualquier ficha con filas en `combo_composicion`. El modal de Producto comparte la sección de composición entre los caminos Combo y Promoción.

**Tech Stack:** Node.js + Express + better-sqlite3 (backend), HTML/CSS/JS vanilla (frontend).

## Global Constraints

- Combo exige al menos un componente, siempre productos reales. Promoción puede quedar sin composición (se comporta como antes) o tener varios componentes, reales y/o libres.
- Sin combos/promociones anidados — un componente nunca puede ser otro combo o promoción.
- Modo de precio todo-o-nada: si es `'individual'`, todos los componentes necesitan su propio precio; si es `'global'`, ninguno.
- Ninguna Promoción vieja (sin composición) se toca ni se migra.
- `git push origin main` no requiere confirmación previa (autorización del usuario).

---

## Task 1: Backend — modelo de datos

**Files:**
- Modify: `agencia/server.js`

- [ ] **Step 1: Migración**

Releer primero con `grep -n -A1 'ALTER TABLE fichas_producto ADD COLUMN regla_paga' agencia/server.js`. Cambiar:

```js
try { db.exec("ALTER TABLE fichas_producto ADD COLUMN regla_paga INTEGER"); } catch(e){}
try { db.exec("ALTER TABLE enc_items ADD COLUMN ficha_id TEXT"); } catch(e){}
```

por:

```js
try { db.exec("ALTER TABLE fichas_producto ADD COLUMN regla_paga INTEGER"); } catch(e){}
try { db.exec("ALTER TABLE fichas_producto ADD COLUMN combo_precio_modo TEXT DEFAULT 'global'"); } catch(e){}
try { db.exec("ALTER TABLE combo_composicion ADD COLUMN componente_nombre TEXT DEFAULT ''"); } catch(e){}
try { db.exec("ALTER TABLE combo_composicion ADD COLUMN precio_unitario TEXT DEFAULT ''"); } catch(e){}
try { db.exec("ALTER TABLE combo_composicion ADD COLUMN precio_unitario_calc TEXT"); } catch(e){}
try { db.exec("ALTER TABLE enc_items ADD COLUMN ficha_id TEXT"); } catch(e){}
```

- [ ] **Step 2: Verificar sintaxis**

Run: `cd "i:/AGENCIA PEDIDOS/agencia" && node -c server.js && echo OK`
Expected: `OK`.

- [ ] **Step 3: Commit**

```bash
cd "i:/AGENCIA PEDIDOS/agencia"
git add server.js
git commit -m "[FEATURE] Combo/Promocion: modelo de datos (modo de precio, items libres)"
```

---

## Task 2: Backend — validación compartida combo/promocional

**Files:**
- Modify: `agencia/server.js` (`validarFicha`)

- [ ] **Step 1: Generalizar el bloque de validación de `'combo'` a `'combo'||'promocional'`**

Releer primero con `grep -n -A13 "if(b.tipo_precio==='combo'){" agencia/server.js` para confirmar el bloque completo exacto. Cambiar:

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
```

por:

```js
  if(b.tipo_precio==='combo'||b.tipo_precio==='promocional'){
    if(b.combo_precio_modo!==undefined&&!['global','individual'].includes(b.combo_precio_modo))errores.push('Modo de precio no válido');
    const modoIndividual=b.combo_precio_modo==='individual';
    if(b.tipo_precio==='combo'&&(!Array.isArray(b.componentes)||!b.componentes.length))errores.push('Combo necesita al menos un componente');
    (b.componentes||[]).forEach((c,i)=>{
      const esLibre=!c.componente_ficha_id;
      if(esLibre){
        if(b.tipo_precio==='combo')errores.push(`Componente #${i+1}: Combo solo admite productos reales, no ítems libres`);
        else if(!String(c.componente_nombre||'').trim())errores.push(`Componente #${i+1}: escribe un nombre para este ítem libre`);
      }else{
        if(fid&&c.componente_ficha_id===fid)errores.push(`Componente #${i+1}: no puede tenerse a sí mismo como componente`);
        const comp=db.prepare('SELECT tipo_precio FROM fichas_producto WHERE id=? AND workspace_id=?').get(c.componente_ficha_id,wsId);
        if(!comp)errores.push(`Componente #${i+1}: el producto seleccionado no existe`);
        else if(comp.tipo_precio==='combo'||comp.tipo_precio==='promocional')errores.push(`Componente #${i+1}: no puede ser otro combo o promoción`);
      }
      if(!Number.isInteger(c.cantidad_consumida)||c.cantidad_consumida<=0)errores.push(`Componente #${i+1}: la cantidad debe ser un número entero mayor a 0`);
      if(modoIndividual&&(!definido(c.precio_unitario)||evalExpr(c.precio_unitario)===null))errores.push(`Componente #${i+1}: necesita un precio válido (modo "por producto")`);
    });
  }
```

- [ ] **Step 2: Verificar sintaxis**

Run: igual que Task 1 Step 2.
Expected: `OK`.

- [ ] **Step 3: Commit**

```bash
cd "i:/AGENCIA PEDIDOS/agencia"
git add server.js
git commit -m "[FEATURE] Combo/Promocion: validacion compartida (items libres, modo de precio)"
```

---

## Task 3: Backend — guardar composición, precio_oficial, endpoints

**Files:**
- Modify: `agencia/server.js` (`guardarComposicion`; `fichaCompleta`; `POST`/`PUT /api/productos`)

- [ ] **Step 1: `guardarComposicion` persiste los campos nuevos**

Releer primero con `grep -n -A5 "^function guardarComposicion" agencia/server.js`. Cambiar:

```js
function guardarComposicion(fichaId,componentes,wsId){
  db.prepare('DELETE FROM combo_composicion WHERE ficha_id=?').run(fichaId);
  (componentes||[]).forEach((c,i)=>{
    db.prepare('INSERT INTO combo_composicion(id,ficha_id,componente_ficha_id,cantidad_consumida,orden,workspace_id)VALUES(?,?,?,?,?,?)').run(uid(),fichaId,c.componente_ficha_id,c.cantidad_consumida,i,wsId);
  });
}
```

por:

```js
function guardarComposicion(fichaId,componentes,wsId){
  db.prepare('DELETE FROM combo_composicion WHERE ficha_id=?').run(fichaId);
  (componentes||[]).forEach((c,i)=>{
    db.prepare('INSERT INTO combo_composicion(id,ficha_id,componente_ficha_id,componente_nombre,cantidad_consumida,precio_unitario,precio_unitario_calc,orden,workspace_id)VALUES(?,?,?,?,?,?,?,?,?)')
      .run(uid(),fichaId,c.componente_ficha_id||'',c.componente_nombre||'',c.cantidad_consumida,c.precio_unitario||'',normCalc(c.precio_unitario),i,wsId);
  });
}
```

- [ ] **Step 2: `fichaCompleta` calcula `precio_oficial` distinto en modo individual**

Releer primero con `grep -n -A10 "^function fichaCompleta" agencia/server.js`. Cambiar:

```js
function fichaCompleta(f){
  if(!f)return null;
  f.insumos=db.prepare('SELECT * FROM ficha_insumos WHERE ficha_id=? ORDER BY orden').all(f.id);
  f.componentes=db.prepare('SELECT * FROM combo_composicion WHERE ficha_id=? ORDER BY orden').all(f.id);
  f.activo=!!f.activo;
  try{f.rangos=JSON.parse(f.rangos||'[]')}catch(e){f.rangos=[]}
  f.costo_total=calcCostoTotalInsumos(f.insumos);
  f.precio_sugerido=calcPrecioSugerido(f,f.costo_total);
  f.precio_oficial=precioOficialFicha(f,f.precio_sugerido);
  return f;
}
```

por:

```js
function fichaCompleta(f){
  if(!f)return null;
  f.insumos=db.prepare('SELECT * FROM ficha_insumos WHERE ficha_id=? ORDER BY orden').all(f.id);
  f.componentes=db.prepare('SELECT * FROM combo_composicion WHERE ficha_id=? ORDER BY orden').all(f.id);
  f.activo=!!f.activo;
  try{f.rangos=JSON.parse(f.rangos||'[]')}catch(e){f.rangos=[]}
  f.costo_total=calcCostoTotalInsumos(f.insumos);
  f.precio_sugerido=calcPrecioSugerido(f,f.costo_total);
  if((f.tipo_precio==='combo'||f.tipo_precio==='promocional')&&f.combo_precio_modo==='individual'&&f.componentes.length){
    f.precio_oficial=f.componentes.reduce((a,c)=>a+c.cantidad_consumida*toNum(c.precio_unitario_calc),0);
  }else{
    f.precio_oficial=precioOficialFicha(f,f.precio_sugerido);
  }
  return f;
}
```

- [ ] **Step 3: `POST /api/productos` persiste `combo_precio_modo`**

Releer primero con `grep -n -A10 "^app.post('/api/productos'" agencia/server.js` para confirmar el bloque completo exacto. Cambiar:

```js
    db.prepare(`INSERT INTO fichas_producto(id,workspace_id,nombre,categoria_id,tipo_precio,margen_tipo,margen_valor,precio_base,precio_base_calc,rangos,fecha_inicio,fecha_fin,cantidad_minima,descripcion,activo,stock_actual,stock_minimo,regla_lleva,regla_paga)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
      .run(id,req.wsId,b.nombre.trim(),b.categoria_id||'',b.tipo_precio||'unitario',b.margen_tipo||'fijo',b.margen_valor||'',normVF(b.precio_base),normCalc(b.precio_base),JSON.stringify(b.rangos||[]),b.fecha_inicio||'',b.fecha_fin||'',b.cantidad_minima||'',b.descripcion||'',b.activo===false?0:1,Number.isInteger(b.stock_actual)?b.stock_actual:null,Number.isInteger(b.stock_minimo)?b.stock_minimo:null,Number.isInteger(b.regla_lleva)?b.regla_lleva:null,Number.isInteger(b.regla_paga)?b.regla_paga:null);
```

por:

```js
    db.prepare(`INSERT INTO fichas_producto(id,workspace_id,nombre,categoria_id,tipo_precio,margen_tipo,margen_valor,precio_base,precio_base_calc,rangos,fecha_inicio,fecha_fin,cantidad_minima,descripcion,activo,stock_actual,stock_minimo,regla_lleva,regla_paga,combo_precio_modo)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
      .run(id,req.wsId,b.nombre.trim(),b.categoria_id||'',b.tipo_precio||'unitario',b.margen_tipo||'fijo',b.margen_valor||'',normVF(b.precio_base),normCalc(b.precio_base),JSON.stringify(b.rangos||[]),b.fecha_inicio||'',b.fecha_fin||'',b.cantidad_minima||'',b.descripcion||'',b.activo===false?0:1,Number.isInteger(b.stock_actual)?b.stock_actual:null,Number.isInteger(b.stock_minimo)?b.stock_minimo:null,Number.isInteger(b.regla_lleva)?b.regla_lleva:null,Number.isInteger(b.regla_paga)?b.regla_paga:null,b.combo_precio_modo||'global');
```

- [ ] **Step 4: `PUT /api/productos/:id` persiste `combo_precio_modo`**

Releer primero con `grep -n -A10 "^app.put('/api/productos/:id'" agencia/server.js` para confirmar el bloque completo exacto. Cambiar:

```js
    db.prepare(`UPDATE fichas_producto SET nombre=?,categoria_id=?,tipo_precio=?,margen_tipo=?,margen_valor=?,precio_base=?,precio_base_calc=?,rangos=?,fecha_inicio=?,fecha_fin=?,cantidad_minima=?,descripcion=?,activo=?,stock_actual=?,stock_minimo=?,regla_lleva=?,regla_paga=? WHERE id=? AND workspace_id=?`)
      .run(b.nombre.trim(),b.categoria_id||'',b.tipo_precio||'unitario',b.margen_tipo||'fijo',b.margen_valor||'',normVF(b.precio_base),normCalc(b.precio_base),JSON.stringify(b.rangos||[]),b.fecha_inicio||'',b.fecha_fin||'',b.cantidad_minima||'',b.descripcion||'',b.activo===false?0:1,Number.isInteger(b.stock_actual)?b.stock_actual:null,Number.isInteger(b.stock_minimo)?b.stock_minimo:null,Number.isInteger(b.regla_lleva)?b.regla_lleva:null,Number.isInteger(b.regla_paga)?b.regla_paga:null,fid,req.wsId);
```

por:

```js
    db.prepare(`UPDATE fichas_producto SET nombre=?,categoria_id=?,tipo_precio=?,margen_tipo=?,margen_valor=?,precio_base=?,precio_base_calc=?,rangos=?,fecha_inicio=?,fecha_fin=?,cantidad_minima=?,descripcion=?,activo=?,stock_actual=?,stock_minimo=?,regla_lleva=?,regla_paga=?,combo_precio_modo=? WHERE id=? AND workspace_id=?`)
      .run(b.nombre.trim(),b.categoria_id||'',b.tipo_precio||'unitario',b.margen_tipo||'fijo',b.margen_valor||'',normVF(b.precio_base),normCalc(b.precio_base),JSON.stringify(b.rangos||[]),b.fecha_inicio||'',b.fecha_fin||'',b.cantidad_minima||'',b.descripcion||'',b.activo===false?0:1,Number.isInteger(b.stock_actual)?b.stock_actual:null,Number.isInteger(b.stock_minimo)?b.stock_minimo:null,Number.isInteger(b.regla_lleva)?b.regla_lleva:null,Number.isInteger(b.regla_paga)?b.regla_paga:null,b.combo_precio_modo||'global',fid,req.wsId);
```

- [ ] **Step 5: Verificar sintaxis**

Run: igual que Task 1 Step 2.
Expected: `OK`.

- [ ] **Step 6: Probar con curl**

Run:
```bash
cd "i:/AGENCIA PEDIDOS/agencia"
npm start &
for i in 1 2 3 4 5 6 7 8 9 10; do curl -s -m 1 http://localhost:3000/ -o /dev/null && break; sleep 1; done
TOKEN=$(curl -s -m 5 -X POST http://localhost:3000/api/auth/login -H "Content-Type: application/json" -d '{"pin":"1234"}' | grep -o '"token":"[^"]*"' | cut -d'"' -f4)

echo "--- ficha base 'Vaso' ---"
VID=$(curl -s -m 5 -X POST http://localhost:3000/api/productos -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{"nombre":"Vaso"}' | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)

echo "--- promocion SIN composicion (estilo viejo, sigue valida) ---"
curl -s -m 5 -w "\nHTTP %{http_code}\n" -X POST http://localhost:3000/api/productos -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{"nombre":"Promo simple","tipo_precio":"promocional","precio_base":"10000"}'

echo "--- promocion con item libre + un producto real, modo individual ---"
RESP=$(curl -s -m 5 -X POST http://localhost:3000/api/productos -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d "{\"nombre\":\"Fiesta del arbol\",\"tipo_precio\":\"promocional\",\"combo_precio_modo\":\"individual\",\"fecha_inicio\":\"2026-12-01\",\"fecha_fin\":\"2026-12-24\",\"componentes\":[{\"componente_ficha_id\":\"$VID\",\"cantidad_consumida\":5,\"precio_unitario\":\"2000\"},{\"componente_ficha_id\":\"\",\"componente_nombre\":\"Tarjeta navideña\",\"cantidad_consumida\":1,\"precio_unitario\":\"3000\"}]}")
echo "$RESP" | grep -o '"precio_oficial":[0-9]*\|"combo_precio_modo":"individual"\|"componente_nombre":"Tarjeta navideña"'
PID1=$(echo "$RESP" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)

echo "--- combo NO admite items libres: debe fallar 400 ---"
curl -s -m 5 -w "\nHTTP %{http_code}\n" -X POST http://localhost:3000/api/productos -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d "{\"nombre\":\"Combo malo\",\"tipo_precio\":\"combo\",\"precio_base\":\"1000\",\"componentes\":[{\"componente_ficha_id\":\"\",\"componente_nombre\":\"Algo\",\"cantidad_consumida\":1}]}"

echo "--- limpieza ---"
curl -s -m 5 -X DELETE "http://localhost:3000/api/productos/$PID1" -H "Authorization: Bearer $TOKEN" -o /dev/null
curl -s -m 5 -X DELETE "http://localhost:3000/api/productos/$VID" -H "Authorization: Bearer $TOKEN" -o /dev/null
PID=$(netstat -ano | grep ':3000' | grep LISTENING | head -1 | awk '{print $NF}'); [ -n "$PID" ] && taskkill //F //PID "$PID"
```
Expected: `HTTP 200` implícito en la promo simple sin composición; `"precio_oficial":13000` (5×2000 + 1×3000), `"combo_precio_modo":"individual"`, `"componente_nombre":"Tarjeta navideña"` en la promo con ítem libre; `HTTP 400` en el combo con ítem libre.

- [ ] **Step 7: Commit**

```bash
cd "i:/AGENCIA PEDIDOS/agencia"
git add server.js
git commit -m "[FEATURE] Combo/Promocion: guardar composicion con precio individual y endpoints"
```

---

## Task 4: Backend — inventario expande por composición, no por tipo

**Files:**
- Modify: `agencia/server.js` (`descontarStock`)

- [ ] **Step 1: `acumular` deja de mirar `tipo_precio`**

Releer primero con `grep -n -A14 "^function descontarStock" agencia/server.js` para confirmar el bloque completo exacto. Cambiar:

```js
function descontarStock(pid,wsId){
  const encargos=db.prepare('SELECT id FROM encargos WHERE pedido_id=?').all(pid);
  const consumo={};
  function acumular(fichaId,cantidad){
    const ficha=db.prepare('SELECT tipo_precio,stock_actual FROM fichas_producto WHERE id=? AND workspace_id=?').get(fichaId,wsId);
    if(!ficha)return;
    if(ficha.tipo_precio==='combo'){
      const comps=db.prepare('SELECT componente_ficha_id,cantidad_consumida FROM combo_composicion WHERE ficha_id=?').all(fichaId);
      comps.forEach(c=>acumular(c.componente_ficha_id,cantidad*c.cantidad_consumida));
      return;
    }
    if(ficha.stock_actual==null)return;
    consumo[fichaId]=(consumo[fichaId]||0)+cantidad;
  }
```

por:

```js
function descontarStock(pid,wsId){
  const encargos=db.prepare('SELECT id FROM encargos WHERE pedido_id=?').all(pid);
  const consumo={};
  function acumular(fichaId,cantidad){
    const ficha=db.prepare('SELECT stock_actual FROM fichas_producto WHERE id=? AND workspace_id=?').get(fichaId,wsId);
    if(!ficha)return;
    const comps=db.prepare('SELECT componente_ficha_id,cantidad_consumida FROM combo_composicion WHERE ficha_id=?').all(fichaId);
    if(comps.length){
      comps.forEach(c=>{
        if(!c.componente_ficha_id)return;
        acumular(c.componente_ficha_id,cantidad*c.cantidad_consumida);
      });
      return;
    }
    if(ficha.stock_actual==null)return;
    consumo[fichaId]=(consumo[fichaId]||0)+cantidad;
  }
```

- [ ] **Step 2: Verificar sintaxis**

Run: igual que Task 1 Step 2.
Expected: `OK`.

- [ ] **Step 3: Regresión — la secuencia de stock de la Fase 4-A/Combos sigue igual + caso nuevo de Promoción con composición**

Run:
```bash
cd "i:/AGENCIA PEDIDOS/agencia"
npm start &
for i in 1 2 3 4 5 6 7 8 9 10; do curl -s -m 1 http://localhost:3000/ -o /dev/null && break; sleep 1; done
TOKEN=$(curl -s -m 5 -X POST http://localhost:3000/api/auth/login -H "Content-Type: application/json" -d '{"pin":"1234"}' | grep -o '"token":"[^"]*"' | cut -d'"' -f4)
FID=$(curl -s -m 5 -X POST http://localhost:3000/api/productos -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{"nombre":"Vaso termico","stock_actual":20}' | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)

echo "--- regresion combo: 2 combos de 6 vasos descuenta 12 ---"
RESP=$(curl -s -m 5 -X POST http://localhost:3000/api/productos -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d "{\"nombre\":\"Combo 6 vasos\",\"tipo_precio\":\"combo\",\"precio_base\":\"108000\",\"componentes\":[{\"componente_ficha_id\":\"$FID\",\"cantidad_consumida\":6}]}")
CID=$(echo "$RESP" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
PID2=$(curl -s -m 5 -X POST http://localhost:3000/api/pedidos -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d "{\"nombre\":\"Test Combo\",\"encargos\":[{\"items\":[{\"cantidad\":\"2\",\"detalle\":\"Combo 6 vasos\",\"ficha_id\":\"$CID\"}]}]}" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
curl -s -m 5 "http://localhost:3000/api/productos/$FID" -H "Authorization: Bearer $TOKEN" | grep -o '"stock_actual":[0-9-]*'
curl -s -m 5 -X DELETE "http://localhost:3000/api/pedidos/$PID2" -H "Authorization: Bearer $TOKEN" -o /dev/null
curl -s -m 5 "http://localhost:3000/api/productos/$FID" -H "Authorization: Bearer $TOKEN" | grep -o '"stock_actual":[0-9-]*'

echo "--- caso nuevo: promocion con 3 vasos, vendida 2 veces descuenta 6 ---"
RESP2=$(curl -s -m 5 -X POST http://localhost:3000/api/productos -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d "{\"nombre\":\"Promo 3 vasos\",\"tipo_precio\":\"promocional\",\"precio_base\":\"50000\",\"componentes\":[{\"componente_ficha_id\":\"$FID\",\"cantidad_consumida\":3}]}")
PROMOID=$(echo "$RESP2" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
PID3=$(curl -s -m 5 -X POST http://localhost:3000/api/pedidos -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d "{\"nombre\":\"Test Promo\",\"encargos\":[{\"items\":[{\"cantidad\":\"2\",\"detalle\":\"Promo 3 vasos\",\"ficha_id\":\"$PROMOID\"}]}]}" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
curl -s -m 5 "http://localhost:3000/api/productos/$FID" -H "Authorization: Bearer $TOKEN" | grep -o '"stock_actual":[0-9-]*'

echo "--- limpieza ---"
curl -s -m 5 -X DELETE "http://localhost:3000/api/pedidos/$PID3" -H "Authorization: Bearer $TOKEN" -o /dev/null
curl -s -m 5 -X DELETE "http://localhost:3000/api/productos/$PROMOID" -H "Authorization: Bearer $TOKEN" -o /dev/null
curl -s -m 5 -X DELETE "http://localhost:3000/api/productos/$CID" -H "Authorization: Bearer $TOKEN" -o /dev/null
curl -s -m 5 -X DELETE "http://localhost:3000/api/productos/$FID" -H "Authorization: Bearer $TOKEN" -o /dev/null
PID=$(netstat -ano | grep ':3000' | grep LISTENING | head -1 | awk '{print $NF}'); [ -n "$PID" ] && taskkill //F //PID "$PID"
```
Expected, en orden: `8` (20−12 por los 2 combos); `20` (al eliminar el pedido del combo, restaura los 12); `14` (20−6 por las 2 promociones de 3 vasos cada una).

- [ ] **Step 4: Commit**

```bash
cd "i:/AGENCIA PEDIDOS/agencia"
git add server.js
git commit -m "[FEATURE] Combo/Promocion: inventario expande por composicion, no por tipo"
```

---

## Task 5: Frontend — sección de composición compartida con modo de precio e ítems libres

**Files:**
- Modify: `agencia/public/index.html` (markup de `prod-sec-combo`; `fProdComponentes`/funciones; `acCombo`)

- [ ] **Step 1: Markup — modo de precio + columna de precio + botón de ítem libre**

Releer primero con `grep -n -A8 'id="prod-sec-combo"' agencia/public/index.html` para confirmar el bloque completo exacto. Cambiar:

```html
    <div id="prod-sec-combo" style="display:none">
      <div class="msec"><span class="tri"></span>Composición del combo</div>
      <table class="items-table" id="prod-combo-tabla">
        <thead><tr><th>Producto componente</th><th style="width:90px">Cantidad</th><th style="width:26px"></th></tr></thead>
        <tbody id="prod-combo-body"></tbody>
      </table>
      <button class="btn-add-row" onclick="addComponente()"><i class="ti ti-plus"></i>Agregar componente</button>
    </div>
```

por:

```html
    <div id="prod-sec-combo" style="display:none">
      <div class="msec"><span class="tri"></span>Modo de precio</div>
      <div class="fr2 fg" style="margin-bottom:12px">
        <div class="ck-box" style="display:inline-flex"><input type="radio" name="combo-modo" id="combo-modo-global" checked onchange="setComboModo('global')"><label for="combo-modo-global">Un precio total para todo el paquete</label></div>
        <div class="ck-box" style="display:inline-flex"><input type="radio" name="combo-modo" id="combo-modo-individual" onchange="setComboModo('individual')"><label for="combo-modo-individual">Un precio por cada producto (se suman)</label></div>
      </div>
      <div class="msec"><span class="tri"></span>Composición</div>
      <table class="items-table" id="prod-combo-tabla">
        <thead><tr><th>Producto componente</th><th style="width:90px">Cantidad</th><th id="prod-combo-th-precio" style="width:100px;display:none">Precio c/u</th><th style="width:26px"></th></tr></thead>
        <tbody id="prod-combo-body"></tbody>
      </table>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button class="btn-add-row" onclick="addComponente()"><i class="ti ti-plus"></i>Agregar componente</button>
        <button class="btn-add-row" id="prod-btn-item-libre" style="display:none" onclick="addComponenteLibre()"><i class="ti ti-plus"></i>Agregar ítem libre</button>
      </div>
    </div>
```

- [ ] **Step 2: `fProdComboModo` + funciones del repetidor (ítems libres, precio por componente)**

Releer primero con `grep -n -A24 "^let fProdInsumos=" agencia/public/index.html` para confirmar el bloque completo exacto (incluye `addComponente`/`remComponente`/`setComponente`/`renderComponentes`/`acCombo`/`selCombo`). Cambiar:

```js
let fProdInsumos=[],fProdRangos=[],fProdComponentes=[],prodCatSel='',editProdId=null,fProdPrecioBaseRaw='';
let _acComboResults={};
function addComponente(){fProdComponentes.push({id:uid(),componente_ficha_id:'',componente_nombre:'',cantidad_consumida:''});renderComponentes()}
function remComponente(id){fProdComponentes=fProdComponentes.filter(x=>x.id!==id);renderComponentes()}
function setComponente(id,k,v){const it=fProdComponentes.find(x=>x.id===id);if(it)it[k]=v}
function renderComponentes(){
  document.getElementById('prod-combo-body').innerHTML=fProdComponentes.map(it=>`<tr>
    <td><div class="ac-wrap"><input class="item-inp" type="text" value="${it.componente_nombre||''}" placeholder="Buscar producto…" oninput="setComponente('${it.id}','componente_nombre',this.value);acCombo('${it.id}',this.value)"><div class="ac-drop" id="combo-ac-drop-${it.id}"></div></div></td>
    <td><input class="item-inp" type="text" value="${it.cantidad_consumida||''}" placeholder="Ej: 6" oninput="setComponente('${it.id}','cantidad_consumida',this.value)"></td>
    <td style="width:26px"><button class="item-del" onclick="remComponente('${it.id}')"><i class="ti ti-x"></i></button></td>
  </tr>`).join('');
}
async function acCombo(rowId,q){
  const dr=document.getElementById('combo-ac-drop-'+rowId);
  if(!dr)return;
  if(!q||q.trim().length<2){dr.style.display='none';return}
  const lista=await api('GET',`/productos?q=${encodeURIComponent(q.trim())}&activo=1`);
  const validos=lista.filter(p=>p.tipo_precio!=='combo'&&p.id!==editProdId);
  if(!validos.length){dr.style.display='none';return}
  _acComboResults[rowId]=validos.slice(0,6);
  dr.innerHTML=_acComboResults[rowId].map((p,i)=>`<div class="ac-item" onclick="selCombo('${rowId}',${i})">
    <div class="ac-name">${p.nombre}</div>
  </div>`).join('');
  dr.style.display='block';
}
function selCombo(rowId,idx){
  const p=(_acComboResults[rowId]||[])[idx];
  if(!p)return;
  const it=fProdComponentes.find(x=>x.id===rowId);
  if(!it)return;
  it.componente_ficha_id=p.id;
  it.componente_nombre=p.nombre;
  const dr=document.getElementById('combo-ac-drop-'+rowId);
  if(dr)dr.style.display='none';
  renderComponentes();
}
```

por:

```js
let fProdInsumos=[],fProdRangos=[],fProdComponentes=[],prodCatSel='',editProdId=null,fProdPrecioBaseRaw='';
let _acComboResults={};
let fProdComboModo='global';
function setComboModo(modo){
  fProdComboModo=modo;
  document.getElementById('prod-combo-th-precio').style.display=modo==='individual'?'table-cell':'none';
  renderComponentes();
}
function addComponente(){fProdComponentes.push({id:uid(),componente_ficha_id:'',componente_nombre:'',cantidad_consumida:'',precio_unitario:''});renderComponentes()}
function addComponenteLibre(){fProdComponentes.push({id:uid(),componente_ficha_id:'',componente_nombre:'',cantidad_consumida:'',precio_unitario:'',_libre:true});renderComponentes()}
function remComponente(id){fProdComponentes=fProdComponentes.filter(x=>x.id!==id);renderComponentes()}
function setComponente(id,k,v){const it=fProdComponentes.find(x=>x.id===id);if(it)it[k]=v}
function renderComponentes(){
  const mostrarPrecio=fProdComboModo==='individual';
  document.getElementById('prod-combo-body').innerHTML=fProdComponentes.map(it=>{
    const campoNombre=it._libre
      ?`<input class="item-inp" type="text" value="${it.componente_nombre||''}" placeholder="Nombre del ítem libre" oninput="setComponente('${it.id}','componente_nombre',this.value)">`
      :`<div class="ac-wrap"><input class="item-inp" type="text" value="${it.componente_nombre||''}" placeholder="Buscar producto…" oninput="setComponente('${it.id}','componente_nombre',this.value);acCombo('${it.id}',this.value)"><div class="ac-drop" id="combo-ac-drop-${it.id}"></div></div>`;
    return`<tr>
    <td>${campoNombre}</td>
    <td><input class="item-inp" type="text" value="${it.cantidad_consumida||''}" placeholder="Ej: 6" oninput="setComponente('${it.id}','cantidad_consumida',this.value)"></td>
    <td style="width:100px;display:${mostrarPrecio?'table-cell':'none'}"><input class="item-inp" type="text" value="${displayMoneyVal(it.precio_unitario)}" placeholder="$ 0" oninput="setComponente('${it.id}','precio_unitario',this.value)"></td>
    <td style="width:26px"><button class="item-del" onclick="remComponente('${it.id}')"><i class="ti ti-x"></i></button></td>
  </tr>`;
  }).join('');
}
async function acCombo(rowId,q){
  const dr=document.getElementById('combo-ac-drop-'+rowId);
  if(!dr)return;
  if(!q||q.trim().length<2){dr.style.display='none';return}
  const lista=await api('GET',`/productos?q=${encodeURIComponent(q.trim())}&activo=1`);
  const validos=lista.filter(p=>p.tipo_precio!=='combo'&&p.tipo_precio!=='promocional'&&p.id!==editProdId);
  if(!validos.length){dr.style.display='none';return}
  _acComboResults[rowId]=validos.slice(0,6);
  dr.innerHTML=_acComboResults[rowId].map((p,i)=>`<div class="ac-item" onclick="selCombo('${rowId}',${i})">
    <div class="ac-name">${p.nombre}</div>
  </div>`).join('');
  dr.style.display='block';
}
function selCombo(rowId,idx){
  const p=(_acComboResults[rowId]||[])[idx];
  if(!p)return;
  const it=fProdComponentes.find(x=>x.id===rowId);
  if(!it)return;
  it.componente_ficha_id=p.id;
  it.componente_nombre=p.nombre;
  const dr=document.getElementById('combo-ac-drop-'+rowId);
  if(dr)dr.style.display='none';
  renderComponentes();
}
```

- [ ] **Step 3: Verificar sintaxis**

Run:
```bash
cd "i:/AGENCIA PEDIDOS/agencia"
SCRATCH="C:/Users/ADMIN/AppData/Local/Temp/claude/i--AGENCIA-PEDIDOS/8d8d31ac-5619-43aa-9270-0aa1f2328221/scratchpad"
awk '/<script>/{f=1;next}/<\/script>/{f=0}f' public/index.html > "$SCRATCH/check.js"
node -c "$SCRATCH/check.js" && echo OK
```
Expected: `OK`.

- [ ] **Step 4: Commit**

```bash
cd "i:/AGENCIA PEDIDOS/agencia"
git add public/index.html
git commit -m "[FEATURE] Combo/Promocion: composicion compartida con modo de precio e items libres"
```

---

## Task 6: Frontend — caminos, reset y carga adaptados

**Files:**
- Modify: `agencia/public/index.html` (`elegirCaminoProducto`; `resetProdForm`; `abrirEditarProducto`)

- [ ] **Step 1: `elegirCaminoProducto` muestra composición para Combo Y Promoción, controla el botón de ítem libre**

Releer primero con `grep -n -A8 "^function elegirCaminoProducto" agencia/public/index.html`. Cambiar:

```js
function elegirCaminoProducto(camino){
  prodCaminoActual=camino;
  document.getElementById('prod-paso-tipo').style.display='none';
  document.getElementById('prod-paso-form').style.display='block';
  document.getElementById('prod-sec-escalonado').style.display=camino==='simple'?'block':'none';
  document.getElementById('prod-sec-combo').style.display=camino==='combo'?'block':'none';
  document.getElementById('prod-sec-promocional').style.display=camino==='promocional'?'block':'none';
  if(camino==='simple')onEsReglaChange();
}
```

por:

```js
function elegirCaminoProducto(camino){
  prodCaminoActual=camino;
  document.getElementById('prod-paso-tipo').style.display='none';
  document.getElementById('prod-paso-form').style.display='block';
  document.getElementById('prod-sec-escalonado').style.display=camino==='simple'?'block':'none';
  document.getElementById('prod-sec-combo').style.display=(camino==='combo'||camino==='promocional')?'block':'none';
  document.getElementById('prod-sec-promocional').style.display=camino==='promocional'?'block':'none';
  document.getElementById('prod-btn-item-libre').style.display=camino==='promocional'?'inline-flex':'none';
  if(camino==='simple')onEsReglaChange();
}
```

- [ ] **Step 2: `resetProdForm` resetea el modo de precio**

Releer primero con `grep -n -A2 "^function resetProdForm" agencia/public/index.html`. Cambiar:

```js
function resetProdForm(){
  fProdInsumos=[];fProdRangos=[];fProdComponentes=[];fProdPrecioBaseRaw='';prodCatSel='';
  prodCaminoActual='simple';
```

por:

```js
function resetProdForm(){
  fProdInsumos=[];fProdRangos=[];fProdComponentes=[];fProdPrecioBaseRaw='';prodCatSel='';
  fProdComboModo='global';
  prodCaminoActual='simple';
```

Y, releer con `grep -n -A2 "document.getElementById('prod-es-regla').checked=false;" agencia/public/index.html` para confirmar el ancla. Cambiar:

```js
  document.getElementById('prod-nombre').value='';
  document.getElementById('prod-es-regla').checked=false;
```

por:

```js
  document.getElementById('prod-nombre').value='';
  document.getElementById('prod-es-regla').checked=false;
  document.getElementById('combo-modo-global').checked=true;
  document.getElementById('combo-modo-individual').checked=false;
  document.getElementById('prod-combo-th-precio').style.display='none';
```

- [ ] **Step 3: `abrirEditarProducto` carga el modo de precio y los componentes con sus campos nuevos**

Releer primero con `grep -n -A2 "^async function abrirEditarProducto" agencia/public/index.html`. Cambiar:

```js
async function abrirEditarProducto(id){
  const p=await api('GET',`/productos/${id}`);
  editProdId=id;
  fProdInsumos=JSON.parse(JSON.stringify(p.insumos||[]));
  fProdComponentes=(p.componentes||[]).map(c=>({id:uid(),componente_ficha_id:c.componente_ficha_id,componente_nombre:c.componente_nombre||'',cantidad_consumida:String(c.cantidad_consumida)}));
```

por:

```js
async function abrirEditarProducto(id){
  const p=await api('GET',`/productos/${id}`);
  editProdId=id;
  fProdInsumos=JSON.parse(JSON.stringify(p.insumos||[]));
  fProdComboModo=p.combo_precio_modo||'global';
  fProdComponentes=(p.componentes||[]).map(c=>({id:uid(),componente_ficha_id:c.componente_ficha_id||'',componente_nombre:c.componente_nombre||'',cantidad_consumida:String(c.cantidad_consumida),precio_unitario:c.precio_unitario||'',_libre:!c.componente_ficha_id}));
```

Y, releer con `grep -n -A2 "document.getElementById('prod-btn-cambiar-tipo').style.display='none';" agencia/public/index.html` para confirmar el ancla. Cambiar:

```js
  document.getElementById('prod-btn-cambiar-tipo').style.display='none';
  renderProdCatRow();
```

por:

```js
  document.getElementById('prod-btn-cambiar-tipo').style.display='none';
  document.getElementById('combo-modo-global').checked=fProdComboModo==='global';
  document.getElementById('combo-modo-individual').checked=fProdComboModo==='individual';
  document.getElementById('prod-combo-th-precio').style.display=fProdComboModo==='individual'?'table-cell':'none';
  renderProdCatRow();
```

- [ ] **Step 4: Verificar sintaxis**

Run: igual que Task 5 Step 3.
Expected: `OK`.

- [ ] **Step 5: Commit**

```bash
cd "i:/AGENCIA PEDIDOS/agencia"
git add public/index.html
git commit -m "[FEATURE] Combo/Promocion: caminos, reset y carga adaptados al modo de precio"
```

---

## Task 7: Frontend — guardar y validar

**Files:**
- Modify: `agencia/public/index.html` (`guardarProducto`; `validarProductoBody`)

- [ ] **Step 1: `guardarProducto` manda `combo_precio_modo` y componentes con precio**

Releer primero con `grep -n -A19 "^async function guardarProducto" agencia/public/index.html` para confirmar el bloque completo exacto. Cambiar:

```js
    insumos:fProdInsumos,
    componentes:tipoPrecio==='combo'?fProdComponentes.map(c=>({componente_ficha_id:c.componente_ficha_id,cantidad_consumida:parseInt(c.cantidad_consumida,10)||0})):[],
    rangos:tipoPrecio==='escalonado'?fProdRangos.map(r=>({desde:parseInt(r.desde,10)||0,hasta:(r.hasta===''||r.hasta==null)?null:parseInt(r.hasta,10),precio:evalExpr(r.precio)||0})):[],
```

por:

```js
    insumos:fProdInsumos,
    combo_precio_modo:fProdComboModo,
    componentes:(tipoPrecio==='combo'||tipoPrecio==='promocional')?fProdComponentes.map(c=>({componente_ficha_id:c.componente_ficha_id||'',componente_nombre:(c.componente_nombre||'').trim(),cantidad_consumida:parseInt(c.cantidad_consumida,10)||0,precio_unitario:(c.precio_unitario||'').toString().trim()})):[],
    rangos:tipoPrecio==='escalonado'?fProdRangos.map(r=>({desde:parseInt(r.desde,10)||0,hasta:(r.hasta===''||r.hasta==null)?null:parseInt(r.hasta,10),precio:evalExpr(r.precio)||0})):[],
```

- [ ] **Step 2: `validarProductoBody` cubre Promoción y el modo de precio**

Releer primero con `grep -n -A9 "^function validarProductoBody" agencia/public/index.html` para confirmar el bloque completo exacto. Cambiar:

```js
  if(b.tipo_precio==='combo'){
    if(!b.componentes||!b.componentes.length)return'Combo necesita al menos un componente';
    for(let i=0;i<b.componentes.length;i++){
      if(!b.componentes[i].componente_ficha_id)return`Componente #${i+1}: selecciona un producto`;
    }
  }
  return null;
```

por:

```js
  if(b.tipo_precio==='combo'||b.tipo_precio==='promocional'){
    if(b.tipo_precio==='combo'&&(!b.componentes||!b.componentes.length))return'Combo necesita al menos un componente';
    for(let i=0;i<(b.componentes||[]).length;i++){
      const c=b.componentes[i];
      if(!c.componente_ficha_id&&!c.componente_nombre)return`Componente #${i+1}: selecciona un producto o escribe un nombre`;
      if(b.combo_precio_modo==='individual'&&definidoFE(c.precio_unitario)&&evalExpr(c.precio_unitario)===null)return`Componente #${i+1}: el precio no es una expresión válida`;
    }
  }
  return null;
```

- [ ] **Step 3: Verificar sintaxis**

Run: igual que Task 5 Step 3.
Expected: `OK`.

- [ ] **Step 4: Verificación funcional**

Run:
```bash
cd "i:/AGENCIA PEDIDOS/agencia"
npm start &
for i in 1 2 3 4 5 6 7 8 9 10; do curl -s -m 1 http://localhost:3000/ -o /dev/null && break; sleep 1; done
curl -s -m 5 http://localhost:3000/ | grep -c 'setComboModo\|addComponenteLibre\|combo-modo-global\|combo-modo-individual'
TOKEN=$(curl -s -m 5 -X POST http://localhost:3000/api/auth/login -H "Content-Type: application/json" -d '{"pin":"1234"}' | grep -o '"token":"[^"]*"' | cut -d'"' -f4)
curl -s -m 5 -o /dev/null -w "productos HTTP %{http_code}\n" http://localhost:3000/api/productos -H "Authorization: Bearer $TOKEN"
PID=$(netstat -ano | grep ':3000' | grep LISTENING | head -1 | awk '{print $NF}'); [ -n "$PID" ] && taskkill //F //PID "$PID"
```
Expected: el `grep -c` da al menos `4`; `productos` responde `HTTP 200`.

- [ ] **Step 5: Commit**

```bash
cd "i:/AGENCIA PEDIDOS/agencia"
git add public/index.html
git commit -m "[FEATURE] Combo/Promocion: guardar y validar el modo de precio e items libres"
```

---

## Task 8: Frontend — desglose en el documento del pedido

**Files:**
- Modify: `agencia/public/index.html` (`lineasDocumento`; `generarPdfPedido`)

- [ ] **Step 1: `lineasDocumento` desglosa combos/promociones con composición**

Releer primero con `grep -n -A5 "^function lineasDocumento" agencia/public/index.html` para confirmar el bloque completo exacto. Cambiar:

```js
function lineasDocumento(p){
  return(p.encargos||[]).map(enc=>{
    const desc=(enc.items||[]).map(it=>`${(it.cantidad||'').trim()} ${(it.detalle||'').trim()}`.trim()).filter(Boolean).join('; ')||'(sin detalle)';
    return{descripcion:desc,monto:calcValorEncargoEfectivo(enc)};
  });
}
```

por:

```js
function lineasDocumento(p,fichasPorId){
  fichasPorId=fichasPorId||{};
  return(p.encargos||[]).map(enc=>{
    const partes=(enc.items||[]).map(it=>{
      const base=`${(it.cantidad||'').trim()} ${(it.detalle||'').trim()}`.trim();
      const ficha=it.ficha_id?fichasPorId[it.ficha_id]:null;
      if(!ficha||(ficha.tipo_precio!=='combo'&&ficha.tipo_precio!=='promocional')||!(ficha.componentes||[]).length)return base;
      const cantItem=parseInt(String(it.cantidad||0).replace(/\D/g,''))||1;
      const titulo=ficha.tipo_precio==='promocional'?`Promoción: ${ficha.nombre}`:ficha.nombre;
      const sub=ficha.componentes.map(c=>{
        const nombreComp=c.componente_ficha_id?(fichasPorId[c.componente_ficha_id]?.nombre||'(producto)'):(c.componente_nombre||'(ítem libre)');
        const cantTotal=cantItem*c.cantidad_consumida;
        const precioUnit=parseInt(String(c.precio_unitario_calc||0).replace(/\D/g,''))||0;
        const precioTxt=ficha.combo_precio_modo==='individual'?` — ${fCOP(precioUnit)} c/u`:'';
        return `   • ${cantTotal} ${nombreComp}${precioTxt}`;
      }).join('\n');
      return `${(it.cantidad||'').trim()} ${titulo}\n${sub}`;
    }).filter(Boolean);
    return{descripcion:partes.join('\n')||'(sin detalle)',monto:calcValorEncargoEfectivo(enc)};
  });
}
```

- [ ] **Step 2: `generarPdfPedido` resuelve las fichas antes de armar el documento**

Releer primero con `grep -n -A6 "^function generarPdfPedido" agencia/public/index.html` para confirmar el bloque completo exacto. Cambiar:

```js
function generarPdfPedido(){
  const p=window._pedidoActualDoc;
  if(!p)return;
  const tipo=tipoDocumento(p);
  if(!tipo){toast('No se puede generar un documento de un pedido cancelado',false);return}
  const{jsPDF}=window.jspdf;
```

por:

```js
async function generarPdfPedido(){
  const p=window._pedidoActualDoc;
  if(!p)return;
  const tipo=tipoDocumento(p);
  if(!tipo){toast('No se puede generar un documento de un pedido cancelado',false);return}
  const fichaIds=[...new Set((p.encargos||[]).flatMap(e=>(e.items||[]).map(it=>it.ficha_id).filter(Boolean)))];
  const fichasPorId={};
  if(fichaIds.length){
    const fichas=await Promise.all(fichaIds.map(fid=>api('GET',`/productos/${fid}`).catch(()=>null)));
    fichas.forEach(f=>{if(f)fichasPorId[f.id]=f});
  }
  const{jsPDF}=window.jspdf;
```

- [ ] **Step 3: La tabla de ítems usa las fichas resueltas**

Releer primero con `grep -n "body:lineasDocumento(p)" agencia/public/index.html`. Cambiar:

```js
    body:lineasDocumento(p).map(l=>[l.descripcion,fCOP(l.monto)]),
```

por:

```js
    body:lineasDocumento(p,fichasPorId).map(l=>[l.descripcion,fCOP(l.monto)]),
```

- [ ] **Step 4: Verificar sintaxis**

Run: igual que Task 5 Step 3.
Expected: `OK`.

- [ ] **Step 5: Verificación funcional**

Run:
```bash
cd "i:/AGENCIA PEDIDOS/agencia"
npm start &
for i in 1 2 3 4 5 6 7 8 9 10; do curl -s -m 1 http://localhost:3000/ -o /dev/null && break; sleep 1; done
curl -s -m 5 http://localhost:3000/ | grep -c 'async function generarPdfPedido\|fichasPorId'
TOKEN=$(curl -s -m 5 -X POST http://localhost:3000/api/auth/login -H "Content-Type: application/json" -d '{"pin":"1234"}' | grep -o '"token":"[^"]*"' | cut -d'"' -f4)
curl -s -m 5 -o /dev/null -w "pedidos HTTP %{http_code}\n" http://localhost:3000/api/pedidos -H "Authorization: Bearer $TOKEN"
PID=$(netstat -ano | grep ':3000' | grep LISTENING | head -1 | awk '{print $NF}'); [ -n "$PID" ] && taskkill //F //PID "$PID"
```
Expected: el `grep -c` da al menos `2`; `pedidos` responde `HTTP 200`.

- [ ] **Step 6: Commit**

```bash
cd "i:/AGENCIA PEDIDOS/agencia"
git add public/index.html
git commit -m "[FEATURE] Combo/Promocion: desglose de items en el documento del pedido"
```

---

## Task 9: Verificación final

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

- [ ] **Step 2: Regresión de endpoints existentes**

Run (servidor levantado, mismo patrón de espera): repetir contra `/api/pedidos`, `/api/clientes`, `/api/configuracion`, `/api/productos`, `/api/app-info`, `/api/etiquetas` — confirmar `HTTP 200` en los 6. Confirmar `git status --short` sin cambios sin commitear.

- [ ] **Step 3: Checklist manual para el usuario (el agente no tiene navegador, no puede ver el PDF real)**

Pedir al usuario que: cree un Combo con 2 productos en modo "Por producto" y confirme que cada fila pide su propio precio y el precio oficial del combo es la suma; cree una Promoción con fecha de vigencia, un producto real y un ítem libre, en modo "Un precio total"; confirme que una Promoción vieja (de antes de este cambio, sin composición) sigue abriendo y guardando igual que siempre; genere el PDF de un pedido que use el combo o la promoción y confirme que se ve el desglose de productos debajo del título, con precios solo si el modo era "Por producto".

- [ ] **Step 4: Push**

```bash
git push origin main
```
