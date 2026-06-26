# Ficha de Producto Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Agregar una sección "Productos" (fichas de producto con insumos, margen, y tipos de precio Unitario/Escalonado/Promocional) sin tocar el formulario de "Nuevo pedido" en absoluto.

**Architecture:** Dos tablas nuevas (`fichas_producto`, `ficha_insumos`) con su propio CRUD REST en `server.js`, mirroreando exactamente los patrones ya existentes (`pedidoCompleto`/`saveEncargos`/`validarPedido`/jerarquía de valores). En el frontend, una vista nueva tipo lista (mismo patrón visual que Clientes) + un modal de edición (mismo patrón que "Nuevo pedido"), con sub-listas dinámicas para insumos y rangos de precio (mismo patrón que los ítems de un encargo).

**Tech Stack:** Node.js + Express + better-sqlite3 (backend), HTML/CSS/JS vanilla en un solo archivo (frontend).

## Global Constraints

- Migraciones de esquema: `CREATE TABLE IF NOT EXISTS` no necesita `try/catch` (ya es idempotente); estas dos tablas son nuevas desde cero, así que no hace falta el patrón `ALTER TABLE` envuelto en `try/catch` que sí usan las tablas viejas.
- Toda request del frontend que no sea multipart pasa por `api()` (`public/index.html`, ya existente) — nunca `fetch()` directo.
- Nunca interpolar strings con comillas simples en `onclick`/`oninput` — usar ids, no el valor crudo de un campo de texto.
- Todo endpoint que toca tablas de negocio filtra por `req.wsId`.
- Nunca `git add -A` — agregar archivos por nombre explícito.
- `git push origin main` solo con confirmación explícita del usuario.
- Sin framework de tests — verificación vía `node -c`, `curl`, y donde la lógica es pura (sin DOM) pruebas directas con Node, porque el agente no tiene navegador en este entorno. El checklist final de UI lo corre el usuario.
- El formulario de "Nuevo pedido" (`abrirNuevo`, `guardar`, `resetForm`, etc.) **no se modifica en ningún task de este plan**.

---

## Task 1: Backend — tablas, constantes, helpers y validación

**Files:**
- Modify: `agencia/server.js` (después de la línea `)`);` que cierra el `CREATE TABLE configuracion_negocio`, antes de `const FORMATOS_FECHA=...`)
- Modify: `agencia/server.js` (antes de `// ── VALIDACIÓN DE PEDIDOS ──`)

**Interfaces:**
- Produces: `TIPOS_PRECIO_VALIDOS`, `MARGEN_TIPOS_VALIDOS` (arrays), `calcCostoTotalInsumos(insumos)`, `calcPrecioSugerido(ficha,costoTotal)`, `precioOficialFicha(ficha,precioSugerido)`, `fichaCompleta(f)`, `validarFicha(b)` — todas usadas por Task 2.
- Consumes: `toNum`, `definido`, `evalExpr`, `db` (ya existentes en `server.js`).

- [ ] **Step 1: Crear las tablas**

En `server.js`, inmediatamente después de esta línea existente (cierre del `CREATE TABLE configuracion_negocio`):

```js
  dias_anticipacion_entrega INTEGER DEFAULT 3
)`);
```

agregar:

```js

// ── FICHAS DE PRODUCTO (Fase 2A+2B del documento maestro, sin combos) ──
db.exec(`CREATE TABLE IF NOT EXISTS fichas_producto(
  id TEXT PRIMARY KEY,
  workspace_id TEXT,
  nombre TEXT NOT NULL,
  categoria_id TEXT DEFAULT '',
  tipo_precio TEXT NOT NULL DEFAULT 'unitario',
  margen_tipo TEXT NOT NULL DEFAULT 'fijo',
  margen_valor TEXT DEFAULT '',
  precio_base TEXT DEFAULT '',
  precio_base_calc TEXT,
  rangos TEXT DEFAULT '[]',
  fecha_inicio TEXT DEFAULT '',
  fecha_fin TEXT DEFAULT '',
  cantidad_minima TEXT DEFAULT '',
  descripcion TEXT DEFAULT '',
  activo INTEGER DEFAULT 1,
  creado TEXT DEFAULT(datetime('now','localtime'))
)`);
db.exec(`CREATE TABLE IF NOT EXISTS ficha_insumos(
  id TEXT PRIMARY KEY,
  ficha_id TEXT REFERENCES fichas_producto(id) ON DELETE CASCADE,
  nombre_insumo TEXT NOT NULL,
  proveedor TEXT DEFAULT '',
  costo_unitario TEXT DEFAULT '',
  costo_unitario_calc TEXT,
  cantidad_usada TEXT DEFAULT '',
  unidad_medida TEXT DEFAULT '',
  es_variable INTEGER DEFAULT 0,
  orden INTEGER DEFAULT 0
)`);
```

- [ ] **Step 2: Verificar sintaxis y arranque**

Run: `cd "i:/AGENCIA PEDIDOS/agencia" && node -c server.js && echo OK`
Expected: `OK`.

Run (verificar primero que el puerto 3000 está libre con `netstat -ano | grep ':3000'`):
```bash
npm start &
for i in 1 2 3 4 5 6 7 8 9 10; do curl -s -m 1 http://localhost:3000/ -o /dev/null && break; sleep 1; done
curl -s -m 5 -X POST http://localhost:3000/api/auth/login -H "Content-Type: application/json" -d '{"pin":"1234"}'
echo
PID=$(netstat -ano | grep ':3000' | grep LISTENING | head -1 | awk '{print $NF}'); [ -n "$PID" ] && taskkill //F //PID "$PID"
```
Expected: arranca sin error, login responde `{"token":"..."}`.

- [ ] **Step 3: Constantes, helpers y validación**

En `server.js`, inmediatamente antes de esta línea existente:

```js
// ── VALIDACIÓN DE PEDIDOS ──
function validarPedido(b){
```

agregar:

```js
// ── FICHAS DE PRODUCTO: helpers ──
const TIPOS_PRECIO_VALIDOS=['unitario','escalonado','promocional'];
const MARGEN_TIPOS_VALIDOS=['multiplicador','porcentaje','fijo'];

function calcCostoTotalInsumos(insumos){
  return(insumos||[]).reduce((a,it)=>{
    const cant=toNum(it.cantidad_usada),unit=toNum(it.costo_unitario_calc);
    return a+cant*unit;
  },0);
}
function calcPrecioSugerido(ficha,costoTotal){
  if(ficha.margen_tipo==='multiplicador'){
    const m=parseFloat(ficha.margen_valor);
    return isFinite(m)?Math.round(costoTotal*m):null;
  }
  if(ficha.margen_tipo==='porcentaje'){
    const m=parseFloat(ficha.margen_valor);
    return isFinite(m)?Math.round(costoTotal+costoTotal*(m/100)):null;
  }
  return null;
}
function precioOficialFicha(ficha,precioSugerido){
  return definido(ficha.precio_base)?toNum(ficha.precio_base_calc):(precioSugerido||0);
}
function fichaCompleta(f){
  if(!f)return null;
  f.insumos=db.prepare('SELECT * FROM ficha_insumos WHERE ficha_id=? ORDER BY orden').all(f.id);
  f.activo=!!f.activo;
  try{f.rangos=JSON.parse(f.rangos||'[]')}catch(e){f.rangos=[]}
  f.costo_total=calcCostoTotalInsumos(f.insumos);
  f.precio_sugerido=calcPrecioSugerido(f,f.costo_total);
  f.precio_oficial=precioOficialFicha(f,f.precio_sugerido);
  return f;
}
function validarFicha(b){
  const errores=[];
  if(!String(b.nombre||'').trim())errores.push('El nombre del producto no puede estar vacío');
  if(b.tipo_precio!==undefined&&!TIPOS_PRECIO_VALIDOS.includes(b.tipo_precio))errores.push('Tipo de precio no válido');
  if(b.margen_tipo!==undefined&&!MARGEN_TIPOS_VALIDOS.includes(b.margen_tipo))errores.push('Tipo de margen no válido');
  if(definido(b.margen_valor)&&!isFinite(parseFloat(b.margen_valor)))errores.push('El valor del margen no es un número válido');
  if(definido(b.precio_base)&&evalExpr(b.precio_base)===null)errores.push('El Precio base no es una expresión válida');
  (b.insumos||[]).forEach((it,i)=>{
    if(definido(it.costo_unitario)&&evalExpr(it.costo_unitario)===null)errores.push(`Costo unitario del insumo #${i+1} no es una expresión válida`);
  });
  if(b.tipo_precio==='escalonado'){
    if(!Array.isArray(b.rangos)||!b.rangos.length)errores.push('Escalonado necesita al menos un rango de precio');
    else(b.rangos||[]).forEach((r,i)=>{
      if(!Number.isFinite(r.desde)||r.desde<0)errores.push(`Rango #${i+1}: "Desde" no es válido`);
      if(r.hasta!=null&&(!Number.isFinite(r.hasta)||r.hasta<r.desde))errores.push(`Rango #${i+1}: "Hasta" no es válido`);
      if(!Number.isFinite(r.precio)||r.precio<0)errores.push(`Rango #${i+1}: precio no es válido`);
    });
  }
  return errores;
}

```

- [ ] **Step 4: Verificar sintaxis**

Run: `cd "i:/AGENCIA PEDIDOS/agencia" && node -c server.js && echo OK`
Expected: `OK`.

- [ ] **Step 5: Probar `validarFicha` y `calcPrecioSugerido` con un script Node aislado**

Run:
```bash
SCRATCH="C:/Users/ADMIN/AppData/Local/Temp/claude/i--AGENCIA-PEDIDOS/8d8d31ac-5619-43aa-9270-0aa1f2328221/scratchpad"
cat > "$SCRATCH/test-ficha-helpers.js" <<'EOF'
function toNum(s){return parseInt(String(s||0).replace(/\D/g,''))||0}
function definido(v){return v!=null&&String(v).trim()!==''}
function evalExpr(raw){
  if(raw==null)return null;
  let s=String(raw).trim();
  if(s==='')return null;
  s=s.replace(/[.,]/g,'').replace(/[xX]/g,'*');
  if(!/^[0-9+\-*/()\s]+$/.test(s)||!/[0-9]/.test(s))return null;
  try{const v=Function('"use strict";return('+s+')')();return(typeof v==='number'&&isFinite(v))?Math.round(v):null}catch(e){return null}
}
const TIPOS_PRECIO_VALIDOS=['unitario','escalonado','promocional'];
const MARGEN_TIPOS_VALIDOS=['multiplicador','porcentaje','fijo'];
function calcCostoTotalInsumos(insumos){
  return(insumos||[]).reduce((a,it)=>{const cant=toNum(it.cantidad_usada),unit=toNum(it.costo_unitario_calc);return a+cant*unit},0);
}
function calcPrecioSugerido(ficha,costoTotal){
  if(ficha.margen_tipo==='multiplicador'){const m=parseFloat(ficha.margen_valor);return isFinite(m)?Math.round(costoTotal*m):null}
  if(ficha.margen_tipo==='porcentaje'){const m=parseFloat(ficha.margen_valor);return isFinite(m)?Math.round(costoTotal+costoTotal*(m/100)):null}
  return null;
}
function precioOficialFicha(ficha,precioSugerido){return definido(ficha.precio_base)?toNum(ficha.precio_base_calc):(precioSugerido||0)}
function validarFicha(b){
  const errores=[];
  if(!String(b.nombre||'').trim())errores.push('El nombre del producto no puede estar vacío');
  if(b.tipo_precio!==undefined&&!TIPOS_PRECIO_VALIDOS.includes(b.tipo_precio))errores.push('Tipo de precio no válido');
  if(b.margen_tipo!==undefined&&!MARGEN_TIPOS_VALIDOS.includes(b.margen_tipo))errores.push('Tipo de margen no válido');
  if(definido(b.margen_valor)&&!isFinite(parseFloat(b.margen_valor)))errores.push('El valor del margen no es un número válido');
  if(definido(b.precio_base)&&evalExpr(b.precio_base)===null)errores.push('El Precio base no es una expresión válida');
  (b.insumos||[]).forEach((it,i)=>{if(definido(it.costo_unitario)&&evalExpr(it.costo_unitario)===null)errores.push(`Costo unitario del insumo #${i+1} no es una expresión válida`)});
  if(b.tipo_precio==='escalonado'){
    if(!Array.isArray(b.rangos)||!b.rangos.length)errores.push('Escalonado necesita al menos un rango de precio');
    else(b.rangos||[]).forEach((r,i)=>{
      if(!Number.isFinite(r.desde)||r.desde<0)errores.push(`Rango #${i+1}: "Desde" no es válido`);
      if(r.hasta!=null&&(!Number.isFinite(r.hasta)||r.hasta<r.desde))errores.push(`Rango #${i+1}: "Hasta" no es válido`);
      if(!Number.isFinite(r.precio)||r.precio<0)errores.push(`Rango #${i+1}: precio no es válido`);
    });
  }
  return errores;
}
function assertEq(a,e,l){if(JSON.stringify(a)!==JSON.stringify(e)){console.error('FAIL '+l+': got',a,'expected',e);process.exitCode=1}else console.log('OK   '+l)}

// Retablo del ejemplo del documento maestro: costo $11.000, multiplicador x2 -> sugerido $22.000
const costoRetablo=calcCostoTotalInsumos([
  {cantidad_usada:'1',costo_unitario_calc:'5000'},
  {cantidad_usada:'1',costo_unitario_calc:'1000'},
  {cantidad_usada:'1',costo_unitario_calc:'5000'}
]);
assertEq(costoRetablo,11000,'costo total insumos retablo');
assertEq(calcPrecioSugerido({margen_tipo:'multiplicador',margen_valor:'2'},costoRetablo),22000,'precio sugerido multiplicador x2');
assertEq(calcPrecioSugerido({margen_tipo:'porcentaje',margen_valor:'35'},10000),13500,'precio sugerido porcentaje 35%');
assertEq(calcPrecioSugerido({margen_tipo:'fijo',margen_valor:''},10000),null,'sin margen (fijo): sin sugerencia');
assertEq(precioOficialFicha({precio_base:null},22000),22000,'precio oficial sin override: usa sugerido');
assertEq(precioOficialFicha({precio_base:'25000',precio_base_calc:'25000'},22000),25000,'precio oficial con override: ignora sugerido');
assertEq(validarFicha({nombre:''}),['El nombre del producto no puede estar vacío'],'nombre vacio');
assertEq(validarFicha({nombre:'Retablo',tipo_precio:'escalonado',rangos:[]}),['Escalonado necesita al menos un rango de precio'],'escalonado sin rangos');
assertEq(validarFicha({nombre:'Retablo',tipo_precio:'escalonado',rangos:[{desde:1,hasta:11,precio:32000},{desde:12,hasta:null,precio:28000}]}),[],'escalonado con rangos validos (sin limite superior en el ultimo)');
assertEq(validarFicha({nombre:'X',margen_valor:'abc'}),['El valor del margen no es un número válido'],'margen no numerico');
EOF
node "$SCRATCH/test-ficha-helpers.js"
```
Expected: 10 líneas `OK`, sin ningún `FAIL`.

- [ ] **Step 6: Commit**

```bash
cd "i:/AGENCIA PEDIDOS/agencia"
git add server.js
git commit -m "[FEATURE] Ficha de producto: tablas, helpers y validacion (Fase 2A+2B)"
```

---

## Task 2: Backend — endpoints CRUD `/api/productos`

**Files:**
- Modify: `agencia/server.js` (antes de `app.get('*',...)`)

**Interfaces:**
- Consumes: `fichaCompleta`, `validarFicha`, `uid`, `normVF`, `normCalc`, `logError` (Task 1 y ya existentes).
- Produces: `GET /api/productos`, `GET /api/productos/:id`, `POST /api/productos`, `PUT /api/productos/:id`, `DELETE /api/productos/:id`, función `guardarInsumos(fichaId,insumos,wsId)`.

- [ ] **Step 1: Agregar los endpoints**

En `server.js`, inmediatamente antes de esta línea existente:

```js
app.get('*',(req,res)=>res.sendFile(path.join(__dirname,'public','index.html')));
```

agregar:

```js
// ── PRODUCTOS (fichas de producto) ──
app.get('/api/productos',(req,res)=>{
  const{q}=req.query; let sql='SELECT * FROM fichas_producto WHERE workspace_id=?'; const params=[req.wsId];
  if(q){sql+=' AND nombre LIKE ?';params.push(`%${q}%`)}
  sql+=' ORDER BY nombre';
  res.json(db.prepare(sql).all(...params).map(fichaCompleta));
});

app.get('/api/productos/:id',(req,res)=>{
  const f=db.prepare('SELECT * FROM fichas_producto WHERE id=? AND workspace_id=?').get(req.params.id,req.wsId);
  if(!f)return res.status(404).json({error:'No encontrado'});
  res.json(fichaCompleta(f));
});

function guardarInsumos(fichaId,insumos,wsId){
  db.prepare('DELETE FROM ficha_insumos WHERE ficha_id=?').run(fichaId);
  (insumos||[]).forEach((it,i)=>{
    db.prepare('INSERT INTO ficha_insumos(id,ficha_id,nombre_insumo,proveedor,costo_unitario,costo_unitario_calc,cantidad_usada,unidad_medida,es_variable,orden)VALUES(?,?,?,?,?,?,?,?,?,?)')
      .run(uid(),fichaId,it.nombre_insumo||'',it.proveedor||'',it.costo_unitario||'',normCalc(it.costo_unitario),it.cantidad_usada||'',it.unidad_medida||'',it.es_variable?1:0,i);
  });
}

app.post('/api/productos',(req,res)=>{
  try{
    const b=req.body;
    if(!b.nombre)return res.status(400).json({error:'Nombre requerido'});
    const errores=validarFicha(b);
    if(errores.length)return res.status(400).json({error:errores.join('. ')});
    const id=uid();
    db.prepare(`INSERT INTO fichas_producto(id,workspace_id,nombre,categoria_id,tipo_precio,margen_tipo,margen_valor,precio_base,precio_base_calc,rangos,fecha_inicio,fecha_fin,cantidad_minima,descripcion,activo)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
      .run(id,req.wsId,b.nombre.trim(),b.categoria_id||'',b.tipo_precio||'unitario',b.margen_tipo||'fijo',b.margen_valor||'',normVF(b.precio_base),normCalc(b.precio_base),JSON.stringify(b.rangos||[]),b.fecha_inicio||'',b.fecha_fin||'',b.cantidad_minima||'',b.descripcion||'',b.activo===false?0:1);
    guardarInsumos(id,b.insumos,req.wsId);
    res.json(fichaCompleta(db.prepare('SELECT * FROM fichas_producto WHERE id=?').get(id)));
  }catch(e){logError('POST /api/productos',e);res.status(500).json({error:e.message})}
});

app.put('/api/productos/:id',(req,res)=>{
  try{
    const b=req.body; const fid=req.params.id;
    const f=db.prepare('SELECT * FROM fichas_producto WHERE id=? AND workspace_id=?').get(fid,req.wsId);
    if(!f)return res.status(404).json({error:'No encontrado'});
    const errores=validarFicha(b);
    if(errores.length)return res.status(400).json({error:errores.join('. ')});
    db.prepare(`UPDATE fichas_producto SET nombre=?,categoria_id=?,tipo_precio=?,margen_tipo=?,margen_valor=?,precio_base=?,precio_base_calc=?,rangos=?,fecha_inicio=?,fecha_fin=?,cantidad_minima=?,descripcion=?,activo=? WHERE id=? AND workspace_id=?`)
      .run(b.nombre.trim(),b.categoria_id||'',b.tipo_precio||'unitario',b.margen_tipo||'fijo',b.margen_valor||'',normVF(b.precio_base),normCalc(b.precio_base),JSON.stringify(b.rangos||[]),b.fecha_inicio||'',b.fecha_fin||'',b.cantidad_minima||'',b.descripcion||'',b.activo===false?0:1,fid,req.wsId);
    if(b.insumos!==undefined)guardarInsumos(fid,b.insumos,req.wsId);
    res.json(fichaCompleta(db.prepare('SELECT * FROM fichas_producto WHERE id=?').get(fid)));
  }catch(e){logError('PUT /api/productos/:id',e);res.status(500).json({error:e.message})}
});

app.delete('/api/productos/:id',(req,res)=>{
  const r=db.prepare('DELETE FROM fichas_producto WHERE id=? AND workspace_id=?').run(req.params.id,req.wsId);
  if(r.changes===0)return res.status(404).json({error:'No encontrado'});
  res.json({ok:true});
});

```

- [ ] **Step 2: Verificar sintaxis**

Run: `cd "i:/AGENCIA PEDIDOS/agencia" && node -c server.js && echo OK`
Expected: `OK`.

- [ ] **Step 3: Probar el CRUD completo con curl**

Run (servidor levantado con el patrón de espera ya usado):
```bash
cd "i:/AGENCIA PEDIDOS/agencia"
npm start &
for i in 1 2 3 4 5 6 7 8 9 10; do curl -s -m 1 http://localhost:3000/ -o /dev/null && break; sleep 1; done
TOKEN=$(curl -s -m 5 -X POST http://localhost:3000/api/auth/login -H "Content-Type: application/json" -d '{"pin":"1234"}' | grep -o '"token":"[^"]*"' | cut -d'"' -f4)

echo "--- crear ficha con insumos y margen multiplicador (ejemplo Retablo del doc maestro) ---"
RESP=$(curl -s -m 5 -X POST http://localhost:3000/api/productos -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{
  "nombre":"Retablo 10x15cm","tipo_precio":"unitario","margen_tipo":"multiplicador","margen_valor":"2",
  "insumos":[{"nombre_insumo":"Madera","costo_unitario":"5000","cantidad_usada":"1"},{"nombre_insumo":"Pintura","costo_unitario":"1000","cantidad_usada":"1"},{"nombre_insumo":"Vinilo","costo_unitario":"5000","cantidad_usada":"1"}]
}')
echo "$RESP" | grep -o '"costo_total":[0-9]*\|"precio_sugerido":[0-9]*\|"precio_oficial":[0-9]*'
FID=$(echo "$RESP" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)

echo "--- override manual del precio base: precio_oficial debe ignorar el sugerido ---"
curl -s -m 5 -X PUT "http://localhost:3000/api/productos/$FID" -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{"nombre":"Retablo 10x15cm","tipo_precio":"unitario","margen_tipo":"multiplicador","margen_valor":"2","precio_base":"25000","insumos":[{"nombre_insumo":"Madera","costo_unitario":"5000","cantidad_usada":"1"}]}' | grep -o '"costo_total":[0-9]*\|"precio_sugerido":[0-9]*\|"precio_oficial":[0-9]*'

echo "--- escalonado sin rangos debe fallar 400 ---"
curl -s -m 5 -w "\nHTTP %{http_code}\n" -X POST http://localhost:3000/api/productos -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{"nombre":"Camisetas","tipo_precio":"escalonado","rangos":[]}'

echo "--- escalonado con rangos del ejemplo del doc maestro ---"
curl -s -m 5 -X POST http://localhost:3000/api/productos -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{
  "nombre":"Camisetas DTF","tipo_precio":"escalonado",
  "rangos":[{"desde":1,"hasta":11,"precio":32000},{"desde":12,"hasta":23,"precio":30000},{"desde":24,"hasta":35,"precio":28000},{"desde":36,"hasta":null,"precio":26000}]
}' | grep -o '"rangos":\[[^]]*\]'

echo "--- listar y buscar ---"
curl -s -m 5 "http://localhost:3000/api/productos?q=Retablo" -H "Authorization: Bearer $TOKEN" | grep -o '"nombre":"[^"]*"'

echo "--- eliminar ---"
curl -s -m 5 -X DELETE "http://localhost:3000/api/productos/$FID" -H "Authorization: Bearer $TOKEN"
curl -s -m 5 -w "\nHTTP %{http_code}\n" "http://localhost:3000/api/productos/$FID" -H "Authorization: Bearer $TOKEN"

PID=$(netstat -ano | grep ':3000' | grep LISTENING | head -1 | awk '{print $NF}'); [ -n "$PID" ] && taskkill //F //PID "$PID"
```
Expected, en orden:
1. `"costo_total":11000 "precio_sugerido":22000 "precio_oficial":22000`
2. `"costo_total":5000 "precio_sugerido":10000 "precio_oficial":25000` (precio_base manual gana, aunque el sugerido cambió a 10.000 por tener solo 1 insumo ahora)
3. `HTTP 400` con un error que menciona "rango de precio"
4. `"rangos":[{"desde":1,"hasta":11,"precio":32000},...,{"desde":36,"hasta":null,"precio":26000}]`
5. `"nombre":"Retablo 10x15cm"`
6. `{"ok":true}` seguido de `HTTP 404`

- [ ] **Step 4: Limpiar el producto de prueba "Camisetas DTF" que quedó en la base local**

Run:
```bash
cd "i:/AGENCIA PEDIDOS/agencia"
node -e "const Database=require('better-sqlite3');const db=new Database('db/agencia.db');console.log(db.prepare(\"DELETE FROM fichas_producto WHERE nombre='Camisetas DTF'\").run().changes,'fila(s) borrada(s)')"
```
Expected: `1 fila(s) borrada(s)`.

- [ ] **Step 5: Commit**

```bash
cd "i:/AGENCIA PEDIDOS/agencia"
git add server.js
git commit -m "[FEATURE] Ficha de producto: endpoints CRUD /api/productos (Fase 2A+2B)"
```

---

## Task 3: Frontend — nav, CSS y vista de lista (sin crear/editar todavía)

**Files:**
- Modify: `agencia/public/index.html` (CSS; sidebar; topbar; vista nueva `view-productos`; `showView`; estado global)

**Interfaces:**
- Produces: `productos` (array global), `cargarProductos(q)`, vista `view-productos` con id `lista-prod` — usados por Task 5/6.
- Consumes: `api()`, `fCOP()`, `CATS` (ya existentes).

- [ ] **Step 1: CSS — card de producto y badge de tipo**

En `public/index.html`, inmediatamente después de esta línea existente:

```css
.cli-card:hover{border-color:var(--teal-lt);box-shadow:var(--sh)}
```

agregar:

```css
.prod-card{background:var(--white);border-radius:var(--r);border:1.5px solid var(--line);padding:13px 15px;cursor:pointer;display:flex;align-items:center;justify-content:space-between;gap:11px;transition:all .13s}
.prod-card:hover{border-color:var(--teal-lt);box-shadow:var(--sh)}
.b-tipo{background:var(--teal-lt);color:var(--teal-dk);font-size:9px;font-weight:700;padding:2px 7px;border-radius:20px}
```

- [ ] **Step 2: Sidebar — ítem de nav**

En `public/index.html`, cambiar:

```html
    <button class="nav-item" data-view="registros" onclick="showView('registros')"><i class="ti ti-chart-bar"></i>Registros</button>
```

por:

```html
    <button class="nav-item" data-view="registros" onclick="showView('registros')"><i class="ti ti-chart-bar"></i>Registros</button>
    <button class="nav-item" data-view="productos" onclick="showView('productos')"><i class="ti ti-box"></i>Productos</button>
```

- [ ] **Step 3: Topbar — ícono para mobile**

En `public/index.html`, cambiar:

```html
      <button class="icon-btn" onclick="showView('configuracion')"><i class="ti ti-settings"></i></button>
```

por:

```html
      <button class="icon-btn" onclick="showView('productos')"><i class="ti ti-box"></i></button>
      <button class="icon-btn" onclick="showView('configuracion')"><i class="ti ti-settings"></i></button>
```

- [ ] **Step 4: Markup de la vista (solo lista, sin botón "Nuevo producto" todavía — llega en el Task 5 junto con el modal)**

En `public/index.html`, cambiar:

```html
      <div id="reg-saldos" class="reg-panel"></div>
    </div>

    <!-- CONFIGURACIÓN -->
```

por:

```html
      <div id="reg-saldos" class="reg-panel"></div>
    </div>

    <!-- PRODUCTOS -->
    <div id="view-productos" class="view">
      <div class="toolbar">
        <div class="search-b" style="flex:1;max-width:300px"><i class="ti ti-search"></i>
          <input type="text" id="prod-s" placeholder="Buscar producto…" oninput="cargarProductos(this.value)" style="max-width:100%">
        </div>
      </div>
      <div class="cli-grid" id="lista-prod"></div>
    </div>

    <!-- CONFIGURACIÓN -->
```

- [ ] **Step 5: Estado global y `cargarProductos`/render**

En `public/index.html`, cambiar:

```js
let pedidos=[],clientes=[];
```

por:

```js
let pedidos=[],clientes=[],productos=[];
```

Agregar, inmediatamente después de esta función existente (`cargarClientes` — anclar en el bloque exacto que sigue, único en el archivo por el ícono `ti-chevron-right`):

```js
async function cargarClientes(q=''){
  const p=q?`?q=${encodeURIComponent(q)}`:'';
  clientes=await api('GET',`/clientes${p}`);
  const el=document.getElementById('lista-cli');
  if(!clientes.length){el.innerHTML='<div class="empty"><i class="ti ti-user-off"></i><p>Sin clientes</p></div>';return}
  el.innerHTML=clientes.map(c=>`
    <div class="cli-card" onclick="verCli('${c.id}')">
      <div class="cli-av">${ini(c.nombre)}</div>
      <div style="flex:1"><div class="cli-name">${c.nombre}</div><div class="cli-sub">${c.tel||'—'} · ${(c.pedidos||[]).length} pedido${(c.pedidos||[]).length!==1?'s':''}</div></div>
      <i class="ti ti-chevron-right" style="color:var(--muted);font-size:14px"></i>
    </div>`).join('');
}
```

(esta función no se modifica — se deja exactamente igual; el bloque nuevo va justo después de su `}` de cierre):

```js
async function cargarProductos(q=''){
  const p=q?`?q=${encodeURIComponent(q)}`:'';
  productos=await api('GET',`/productos${p}`);
  const el=document.getElementById('lista-prod');
  if(!productos.length){el.innerHTML='<div class="empty"><i class="ti ti-box-off"></i><p>Sin productos</p></div>';return}
  const TIPO_LABEL={unitario:'Unitario',escalonado:'Escalonado',promocional:'Promocional'};
  el.innerHTML=productos.map(p=>{
    const cat=CATS.find(c=>c.id===p.categoria_id);
    return`<div class="prod-card" onclick="abrirEditarProducto('${p.id}')">
      <div style="flex:1;min-width:0">
        <div class="cli-name">${p.nombre}</div>
        <div class="cli-sub">${cat?`<span class="ttag ${cat.tc}">${cat.label}</span> `:''}<span class="b-tipo">${TIPO_LABEL[p.tipo_precio]||p.tipo_precio}</span> ${!p.activo?'<span class="b-canc">Inactivo</span>':''}</div>
      </div>
      <div style="font-weight:800;color:var(--navy);flex-shrink:0">${fCOP(p.precio_oficial)}</div>
    </div>`;
  }).join('');
}
```

(`abrirEditarProducto` se define en el Task 5 — hasta entonces, hacer click en una card dará error de consola; es esperado y se resuelve en ese task, dentro de la misma sesión de implementación.)

- [ ] **Step 6: Conectar la vista a `showView`**

En `public/index.html`, cambiar:

```js
  const titles={pedidos:'Pedidos',clientes:'Clientes',registros:'Registros',configuracion:'Configuración'};
  document.getElementById('tb-title').textContent=titles[v]||'';
  document.querySelector(`.nav-item[data-view="${v}"]`)?.classList.add('active');
  document.querySelectorAll('.mob-btn')[{pedidos:0,clientes:2,registros:3}[v]||0]?.classList.add('active');
  if(v==='clientes')cargarClientes();
  if(v==='registros'){renderRegistros();showReg('ingresos');}
  if(v==='configuracion')pintarConfiguracion();
}
```

por:

```js
  const titles={pedidos:'Pedidos',clientes:'Clientes',registros:'Registros',configuracion:'Configuración',productos:'Productos'};
  document.getElementById('tb-title').textContent=titles[v]||'';
  document.querySelector(`.nav-item[data-view="${v}"]`)?.classList.add('active');
  document.querySelectorAll('.mob-btn')[{pedidos:0,clientes:2,registros:3}[v]||0]?.classList.add('active');
  if(v==='clientes')cargarClientes();
  if(v==='registros'){renderRegistros();showReg('ingresos');}
  if(v==='configuracion')pintarConfiguracion();
  if(v==='productos')cargarProductos();
}
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

- [ ] **Step 8: Verificar que la lista carga (con los productos creados/eliminados en Task 2 ya limpios)**

Run:
```bash
cd "i:/AGENCIA PEDIDOS/agencia"
npm start &
for i in 1 2 3 4 5 6 7 8 9 10; do curl -s -m 1 http://localhost:3000/ -o /dev/null && break; sleep 1; done
curl -s -m 5 http://localhost:3000/ | grep -c 'view-productos\|function cargarProductos\|data-view="productos"'
TOKEN=$(curl -s -m 5 -X POST http://localhost:3000/api/auth/login -H "Content-Type: application/json" -d '{"pin":"1234"}' | grep -o '"token":"[^"]*"' | cut -d'"' -f4)
curl -s -m 5 "http://localhost:3000/api/productos" -H "Authorization: Bearer $TOKEN"
echo
PID=$(netstat -ano | grep ':3000' | grep LISTENING | head -1 | awk '{print $NF}'); [ -n "$PID" ] && taskkill //F //PID "$PID"
```
Expected: el primer `grep -c` da `3`; el `GET /api/productos` responde `[]` (vacío, ya limpio).

- [ ] **Step 9: Commit**

```bash
cd "i:/AGENCIA PEDIDOS/agencia"
git add public/index.html
git commit -m "[FEATURE] Ficha de producto: nav, CSS y vista de lista (Fase 2A+2B)"
```

---

## Task 4: Frontend — widgets del formulario (categoría, insumos, margen/precio sugerido, rangos)

Estos son los "bloques hoja" que el modal del Task 5 va a usar. Ninguno depende del modal todavía — se prueban con un script Node aislado (lógica pura) y con `node -c`.

**Files:**
- Modify: `agencia/public/index.html` (agregar bloque de funciones nuevo, después de `previewItemUnit`/`focusItemVal`/`blurItemVal` — el patrón de ítems de encargo que estas funciones mirrorean)

**Interfaces:**
- Consumes: `evalExpr`, `displayMoneyVal`, `esExpresion`, `previewExpr`, `fCOP`, `CATS`, `uid` (ya existentes).
- Produces: `fProdInsumos`, `fProdRangos`, `prodCatSel` (estado, usado por Task 5); `addInsumo`, `remInsumo`, `setInsumo`, `renderInsumos`, `previewInsumoUnit`, `focusInsumoUnit`, `blurInsumoUnit`, `calcCostoTotalInsumosFront`, `recalcPrecioSugerido`, `onMargenTipoChange`, `renderProdCatRow`, `setProdCat`, `showTipoPrecioSec`, `addRango`, `remRango`, `setRango`, `renderRangos`, `focusRangoPrecio`, `blurRangoPrecio` — todas usadas por Task 5/6.

- [ ] **Step 1: Estado global y selector de categoría**

En `public/index.html`, buscar la función `blurItemVal` (cierra el patrón de "Valor unitario" de los ítems de encargo) e inmediatamente después de su cierre `}` agregar:

```js
/* ══ FICHA DE PRODUCTO: widgets ══ */
let fProdInsumos=[],fProdRangos=[],prodCatSel='',editProdId=null,fProdPrecioBaseRaw='';

function renderProdCatRow(){
  document.getElementById('prod-cat-row').innerHTML=CATS.map(c=>`<button type="button" class="cat-btn${prodCatSel===c.id?' sel':''}" onclick="setProdCat('${c.id}')">${c.label}</button>`).join('');
}
function setProdCat(catId){prodCatSel=catId;renderProdCatRow()}
```

- [ ] **Step 2: Insumos**

Inmediatamente después del bloque anterior, agregar:

```js
function addInsumo(){fProdInsumos.push({id:uid(),nombre_insumo:'',proveedor:'',costo_unitario:'',cantidad_usada:'',unidad_medida:'',es_variable:false});renderInsumos()}
function remInsumo(id){fProdInsumos=fProdInsumos.filter(x=>x.id!==id);renderInsumos()}
function setInsumo(id,k,v){
  const it=fProdInsumos.find(x=>x.id===id);
  if(it)it[k]=v;
  if(k==='cantidad_usada'||k==='costo_unitario'){
    const cant=parseInt(String(it.cantidad_usada||0).replace(/\D/g,''))||0;
    const unit=evalExpr(it.costo_unitario)||0;
    const subEl=document.getElementById('inssub-'+id);
    if(subEl)subEl.textContent=fCOP(cant*unit);
    recalcPrecioSugerido();
  }
}
function previewInsumoUnit(id,v){
  const el=document.getElementById('insprev-'+id);
  if(!el)return;
  const show=esExpresion(v);
  el.style.display=show?'block':'none';
  if(show)el.innerHTML=previewExpr(v);
}
function focusInsumoUnit(el,id){
  const it=fProdInsumos.find(x=>x.id===id);
  el.value=(it&&it.costo_unitario)||'';
  previewInsumoUnit(id,el.value);
}
function blurInsumoUnit(el,id){
  const it=fProdInsumos.find(x=>x.id===id);
  el.value=displayMoneyVal(it&&it.costo_unitario);
  const elp=document.getElementById('insprev-'+id);
  if(elp)elp.style.display='none';
}
function renderInsumos(){
  document.getElementById('prod-insumos-body').innerHTML=fProdInsumos.map(it=>{
    const cant=parseInt(String(it.cantidad_usada||0).replace(/\D/g,''))||0;
    const unit=evalExpr(it.costo_unitario)||0;
    const subtotal=cant*unit;
    return`<tr>
      <td><input class="item-inp" type="text" value="${it.nombre_insumo||''}" placeholder="Ej: Madera" oninput="setInsumo('${it.id}','nombre_insumo',this.value)"></td>
      <td><input class="item-inp" type="text" value="${it.proveedor||''}" placeholder="Opcional" oninput="setInsumo('${it.id}','proveedor',this.value)"></td>
      <td><input class="item-inp" type="text" value="${it.cantidad_usada||''}" placeholder="1" oninput="setInsumo('${it.id}','cantidad_usada',this.value)"></td>
      <td><input class="item-inp" type="text" value="${it.unidad_medida||''}" placeholder="unidad" oninput="setInsumo('${it.id}','unidad_medida',this.value)"></td>
      <td><input class="item-inp" type="text" value="${displayMoneyVal(it.costo_unitario)}" placeholder="$ 0" oninput="setInsumo('${it.id}','costo_unitario',this.value);previewInsumoUnit('${it.id}',this.value)" onfocus="focusInsumoUnit(this,'${it.id}')" onblur="blurInsumoUnit(this,'${it.id}')"><div id="insprev-${it.id}" style="font-size:8.5px;font-weight:700;color:var(--teal-dk);display:none"></div></td>
      <td id="inssub-${it.id}" style="text-align:right;font-weight:700;color:var(--navy);white-space:nowrap">${fCOP(subtotal)}</td>
      <td style="text-align:center"><input type="checkbox" ${it.es_variable?'checked':''} onchange="setInsumo('${it.id}','es_variable',this.checked)"></td>
      <td style="width:26px"><button class="item-del" onclick="remInsumo('${it.id}')"><i class="ti ti-x"></i></button></td>
    </tr>`;
  }).join('');
  recalcPrecioSugerido();
}
```

- [ ] **Step 3: Margen y Precio sugerido**

Inmediatamente después, agregar:

```js
function calcCostoTotalInsumosFront(){
  return fProdInsumos.reduce((a,it)=>{
    const cant=parseInt(String(it.cantidad_usada||0).replace(/\D/g,''))||0;
    const unit=evalExpr(it.costo_unitario)||0;
    return a+cant*unit;
  },0);
}
function recalcPrecioSugerido(){
  const costoTotal=calcCostoTotalInsumosFront();
  const capCosto=document.getElementById('prod-costo-total-cap');
  if(capCosto)capCosto.textContent='Costo total: '+fCOP(costoTotal);
  const tipo=document.getElementById('prod-margen-tipo').value;
  const margenValor=parseFloat(document.getElementById('prod-margen-valor').value);
  let sugerido=null;
  if(tipo==='multiplicador'&&isFinite(margenValor))sugerido=Math.round(costoTotal*margenValor);
  else if(tipo==='porcentaje'&&isFinite(margenValor))sugerido=Math.round(costoTotal+costoTotal*(margenValor/100));
  const cap=document.getElementById('prod-precio-sugerido-cap');
  if(!cap)return;
  if(sugerido!=null){cap.style.display='block';cap.textContent='Precio sugerido: '+fCOP(sugerido)}
  else{cap.style.display='none'}
}
function onMargenTipoChange(){
  const tipo=document.getElementById('prod-margen-tipo').value;
  document.getElementById('prod-margen-valor-wrap').style.display=tipo==='fijo'?'none':'block';
  recalcPrecioSugerido();
}
function focusProdPrecioBase(el){el.value=fProdPrecioBaseRaw||''}
function blurProdPrecioBase(el){el.value=displayMoneyVal(fProdPrecioBaseRaw)}
```

- [ ] **Step 4: Tipo de precio condicional y Rangos (Escalonado)**

Inmediatamente después, agregar:

```js
function showTipoPrecioSec(tipo){
  document.getElementById('prod-sec-escalonado').style.display=tipo==='escalonado'?'block':'none';
  document.getElementById('prod-sec-promocional').style.display=tipo==='promocional'?'block':'none';
}
function addRango(){fProdRangos.push({id:uid(),desde:'',hasta:'',precio:''});renderRangos()}
function remRango(id){fProdRangos=fProdRangos.filter(x=>x.id!==id);renderRangos()}
function setRango(id,k,v){const r=fProdRangos.find(x=>x.id===id);if(r)r[k]=v}
function focusRangoPrecio(el,id){
  const r=fProdRangos.find(x=>x.id===id);
  el.value=(r&&r.precio)||'';
}
function blurRangoPrecio(el,id){
  const r=fProdRangos.find(x=>x.id===id);
  el.value=displayMoneyVal(r&&r.precio);
}
function renderRangos(){
  document.getElementById('prod-rangos-body').innerHTML=fProdRangos.map(r=>`
    <tr>
      <td><input class="item-inp" type="text" value="${r.desde||''}" placeholder="1" oninput="setRango('${r.id}','desde',this.value)"></td>
      <td><input class="item-inp" type="text" value="${r.hasta||''}" placeholder="Sin límite" oninput="setRango('${r.id}','hasta',this.value)"></td>
      <td><input class="item-inp" type="text" value="${displayMoneyVal(r.precio)}" placeholder="$ 0" oninput="setRango('${r.id}','precio',this.value)" onfocus="focusRangoPrecio(this,'${r.id}')" onblur="blurRangoPrecio(this,'${r.id}')"></td>
      <td style="width:26px"><button class="item-del" onclick="remRango('${r.id}')"><i class="ti ti-x"></i></button></td>
    </tr>`).join('');
}
```

- [ ] **Step 5: Verificar sintaxis**

Run: igual que Task 3 Step 7.
Expected: `OK`. (Es normal que referencien ids de DOM que todavía no existen en el HTML — Task 5 los crea. `node -c` solo valida sintaxis, no ejecuta el código.)

- [ ] **Step 6: Probar la lógica pura de `recalcPrecioSugerido`/`calcCostoTotalInsumosFront` con Node (simulando el DOM con un stub mínimo)**

Run:
```bash
SCRATCH="C:/Users/ADMIN/AppData/Local/Temp/claude/i--AGENCIA-PEDIDOS/8d8d31ac-5619-43aa-9270-0aa1f2328221/scratchpad"
cat > "$SCRATCH/test-recalc-sugerido.js" <<'EOF'
function evalExpr(raw){
  if(raw==null)return null;
  let s=String(raw).trim();
  if(s==='')return null;
  s=s.replace(/[.,]/g,'').replace(/[xX]/g,'*');
  if(!/^[0-9+\-*/()\s]+$/.test(s)||!/[0-9]/.test(s))return null;
  try{const v=Function('"use strict";return('+s+')')();return(typeof v==='number'&&isFinite(v))?Math.round(v):null}catch(e){return null}
}
function fCOP(n){const v=parseInt(String(n||0).replace(/\D/g,''))||0;return'$'+v.toLocaleString('es-CO')}
let fProdInsumos=[];
function calcCostoTotalInsumosFront(){
  return fProdInsumos.reduce((a,it)=>{
    const cant=parseInt(String(it.cantidad_usada||0).replace(/\D/g,''))||0;
    const unit=evalExpr(it.costo_unitario)||0;
    return a+cant*unit;
  },0);
}
function calcularSugerido(tipo,margenValorRaw,costoTotal){
  const margenValor=parseFloat(margenValorRaw);
  if(tipo==='multiplicador'&&isFinite(margenValor))return Math.round(costoTotal*margenValor);
  if(tipo==='porcentaje'&&isFinite(margenValor))return Math.round(costoTotal+costoTotal*(margenValor/100));
  return null;
}
function assertEq(a,e,l){if(a!==e){console.error('FAIL '+l+': got',a,'expected',e);process.exitCode=1}else console.log('OK   '+l+':',a)}

fProdInsumos=[{cantidad_usada:'1',costo_unitario:'5000'},{cantidad_usada:'1',costo_unitario:'1000'},{cantidad_usada:'1',costo_unitario:'5000'}];
assertEq(calcCostoTotalInsumosFront(),11000,'costo total retablo (3 insumos)');
assertEq(calcularSugerido('multiplicador','2',11000),22000,'sugerido multiplicador x2');
assertEq(calcularSugerido('porcentaje','35',10000),13500,'sugerido porcentaje 35%');
assertEq(calcularSugerido('fijo','',10000),null,'fijo: sin sugerencia');
assertEq(fCOP(22000),'$22.000','formato del sugerido');

fProdInsumos=[{cantidad_usada:'3',costo_unitario:'1000+500'}];
assertEq(calcCostoTotalInsumosFront(),4500,'costo con expresion en costo_unitario: 3 x (1000+500)');
EOF
node "$SCRATCH/test-recalc-sugerido.js"
```
Expected: 6 líneas `OK`.

- [ ] **Step 7: Commit**

```bash
cd "i:/AGENCIA PEDIDOS/agencia"
git add public/index.html
git commit -m "[FEATURE] Ficha de producto: widgets de categoria, insumos, margen y rangos (Fase 2A+2B)"
```

---

## Task 5: Frontend — modal completo (HTML + ciclo de vida)

**Files:**
- Modify: `agencia/public/index.html` (HTML: nuevo overlay `ovProd`; botón "Nuevo producto" en la vista de lista; array de overlays con click-fuera-para-cerrar; JS: `resetProdForm`, `abrirNuevoProducto`, `abrirEditarProducto`, `cerrarProducto`)

**Interfaces:**
- Consumes: todas las funciones del Task 4 (`renderProdCatRow`, `renderInsumos`, `renderRangos`, `onMargenTipoChange`, `showTipoPrecioSec`), `api()`, `displayMoneyVal()`, `uid()`, `cargarProductos()` (Task 3).
- Produces: `resetProdForm()`, `abrirNuevoProducto()`, `abrirEditarProducto(id)`, `cerrarProducto()` — usadas por Task 6 (`guardarProducto`/`eliminarProducto`) y por el botón de la card (Task 3).

- [ ] **Step 1: Botón "Nuevo producto" en la vista de lista**

En `public/index.html`, cambiar:

```html
      <div class="toolbar">
        <div class="search-b" style="flex:1;max-width:300px"><i class="ti ti-search"></i>
          <input type="text" id="prod-s" placeholder="Buscar producto…" oninput="cargarProductos(this.value)" style="max-width:100%">
        </div>
      </div>
      <div class="cli-grid" id="lista-prod"></div>
```

por:

```html
      <div class="toolbar">
        <div class="search-b" style="flex:1;max-width:300px"><i class="ti ti-search"></i>
          <input type="text" id="prod-s" placeholder="Buscar producto…" oninput="cargarProductos(this.value)" style="max-width:100%">
        </div>
        <button class="btn-new" onclick="abrirNuevoProducto()"><span class="tri"></span> Nuevo producto</button>
      </div>
      <div class="cli-grid" id="lista-prod"></div>
```

- [ ] **Step 2: Markup del modal**

En `public/index.html`, el overlay de Configuración cierra con un patrón conocido — agregar el overlay nuevo inmediatamente después del cierre del overlay `ovExp` (buscar el texto exacto):

```html
<!-- MODAL EXPORT -->
<div class="overlay" id="ovExp">
<div class="modal" style="max-width:360px">
  <div class="mhead"><div class="mhead-l"><div class="mtitle">Exportar</div></div><button class="mclose" onclick="cerrarExp()"><i class="ti ti-x"></i></button></div>
  <div class="mbody">
    <div class="fg"><label>Filtrar por</label>
      <select id="exp-est"><option value="todos">Todos</option><option value="activo">Activos</option><option value="entregado">Entregados</option><option value="cancelado">Cancelados</option></select>
    </div>
    <button class="btn-pri" style="width:100%;justify-content:center" onclick="exportar()"><i class="ti ti-file-spreadsheet"></i>Descargar CSV</button>
  </div>
</div>
</div>
```

agregar inmediatamente después (antes del `<div class="toast"...`):

```html

<!-- MODAL PRODUCTO -->
<div class="overlay" id="ovProd">
<div class="modal">
  <div class="mhead">
    <div class="mhead-l"><div class="mtitle" id="prod-tit">Nuevo producto</div></div>
    <button class="mclose" onclick="cerrarProducto()"><i class="ti ti-x"></i></button>
  </div>
  <div class="mbody">

    <div class="fr2 fg">
      <div><label>Nombre del producto</label><input type="text" id="prod-nombre" placeholder="Ej: Retablo 10x15cm"></div>
      <div><label>Tipo de precio</label>
        <select id="prod-tipo-precio" onchange="showTipoPrecioSec(this.value)">
          <option value="unitario">Unitario</option>
          <option value="escalonado">Escalonado</option>
          <option value="promocional">Promocional</option>
        </select>
      </div>
    </div>

    <div class="msec"><span class="tri"></span>Categoría</div>
    <div class="cat-row" id="prod-cat-row" style="margin-bottom:0"></div>

    <div class="ck-box" style="display:inline-flex;margin:12px 0"><input type="checkbox" id="prod-activo" checked><label for="prod-activo">Activo</label></div>

    <div class="msec"><span class="tri"></span>Insumos (opcional)</div>
    <table class="items-table" id="prod-insumos-tabla">
      <thead><tr><th>Nombre</th><th>Proveedor</th><th style="width:55px">Cant.</th><th style="width:70px">Unidad</th><th style="width:90px">Costo unit.</th><th style="width:80px">Subtotal</th><th style="width:55px">Variable</th><th style="width:26px"></th></tr></thead>
      <tbody id="prod-insumos-body"></tbody>
    </table>
    <button class="btn-add-row" onclick="addInsumo()"><i class="ti ti-plus"></i>Agregar insumo</button>
    <div style="font-size:11px;color:var(--muted);margin:8px 0" id="prod-costo-total-cap">Costo total: $0</div>

    <div class="msec"><span class="tri"></span>Margen y precio</div>
    <div class="fr3 fg">
      <div><label>Margen</label>
        <select id="prod-margen-tipo" onchange="onMargenTipoChange()">
          <option value="fijo">Sin margen (precio directo)</option>
          <option value="multiplicador">Multiplicador (×)</option>
          <option value="porcentaje">Porcentaje (%)</option>
        </select>
      </div>
      <div id="prod-margen-valor-wrap" style="display:none"><label>Valor del margen</label><input type="text" id="prod-margen-valor" placeholder="Ej: 2" oninput="recalcPrecioSugerido()"></div>
      <div>
        <label>Precio base</label>
        <input type="text" id="prod-precio-base" placeholder="= sugerido" oninput="fProdPrecioBaseRaw=this.value" onfocus="focusProdPrecioBase(this)" onblur="blurProdPrecioBase(this)" style="font-size:14px;font-weight:800;color:var(--navy)">
        <div id="prod-precio-sugerido-cap" style="font-size:10px;color:var(--muted);font-weight:600;margin-top:4px;display:none">Precio sugerido: $0</div>
      </div>
    </div>

    <div id="prod-sec-escalonado" style="display:none">
      <div class="msec"><span class="tri"></span>Rangos de precio</div>
      <table class="items-table" id="prod-rangos-tabla">
        <thead><tr><th style="width:80px">Desde</th><th style="width:80px">Hasta</th><th>Precio por unidad</th><th style="width:26px"></th></tr></thead>
        <tbody id="prod-rangos-body"></tbody>
      </table>
      <button class="btn-add-row" onclick="addRango()"><i class="ti ti-plus"></i>Agregar rango</button>
    </div>

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
  <div class="mfoot">
    <button class="btn-danger" id="prod-btn-del" style="display:none" onclick="eliminarProducto()"><i class="ti ti-trash"></i>Eliminar</button>
    <div style="display:flex;gap:7px;margin-left:auto">
      <button class="btn-ghost" onclick="cerrarProducto()">Cancelar</button>
      <button class="btn-pri" onclick="guardarProducto()"><i class="ti ti-device-floppy"></i>Guardar</button>
    </div>
  </div>
</div>
</div>
```

(`guardarProducto()` y `eliminarProducto()`, referenciados en el `mfoot` de arriba, se definen en el Task 6 — hasta entonces esos dos botones del modal dan error de consola si se hace click; es el mismo tipo de referencia hacia adelante ya aceptado en el Task 3 para `abrirEditarProducto`, esperado dentro de la misma sesión de implementación.)

- [ ] **Step 3: Agregar `ovProd` al array de overlays que cierran al hacer click afuera**

En `public/index.html`, cambiar:

```js
['ovP','ovCli','ovExp'].forEach(id=>{
  document.getElementById(id).addEventListener('click',function(e){
    if(e.target===this){if(id==='ovP')cerrar();else if(id==='ovCli')cerrarCli();else cerrarExp()}
  });
```

por:

```js
['ovP','ovCli','ovExp','ovProd'].forEach(id=>{
  document.getElementById(id).addEventListener('click',function(e){
    if(e.target===this){if(id==='ovP')cerrar();else if(id==='ovCli')cerrarCli();else if(id==='ovExp')cerrarExp();else cerrarProducto()}
  });
```

- [ ] **Step 4: Ciclo de vida del modal**

En `public/index.html`, inmediatamente después del cierre de la función `renderRangos` (agregada en el Task 4 Step 4), agregar:

```js
function resetProdForm(){
  fProdInsumos=[];fProdRangos=[];fProdPrecioBaseRaw='';prodCatSel='';
  document.getElementById('prod-nombre').value='';
  document.getElementById('prod-tipo-precio').value='unitario';
  document.getElementById('prod-margen-tipo').value='fijo';
  document.getElementById('prod-margen-valor').value='';
  document.getElementById('prod-precio-base').value='';
  document.getElementById('prod-activo').checked=true;
  document.getElementById('prod-fecha-inicio').value='';
  document.getElementById('prod-fecha-fin').value='';
  document.getElementById('prod-cantidad-minima').value='';
  document.getElementById('prod-descripcion').value='';
  renderProdCatRow();
  renderInsumos();
  renderRangos();
  onMargenTipoChange();
  showTipoPrecioSec('unitario');
}
function abrirNuevoProducto(){
  editProdId=null;resetProdForm();
  document.getElementById('prod-tit').textContent='Nuevo producto';
  document.getElementById('prod-btn-del').style.display='none';
  document.getElementById('ovProd').classList.add('open');
  setTimeout(()=>document.getElementById('prod-nombre').focus(),180);
}
async function abrirEditarProducto(id){
  const p=await api('GET',`/productos/${id}`);
  editProdId=id;
  fProdInsumos=JSON.parse(JSON.stringify(p.insumos||[]));
  fProdRangos=(p.rangos||[]).map(r=>({id:uid(),desde:r.desde,hasta:r.hasta,precio:String(r.precio)}));
  prodCatSel=p.categoria_id||'';
  fProdPrecioBaseRaw=(p.precio_base!=null?p.precio_base:'');
  document.getElementById('prod-nombre').value=p.nombre;
  document.getElementById('prod-tipo-precio').value=p.tipo_precio;
  document.getElementById('prod-margen-tipo').value=p.margen_tipo;
  document.getElementById('prod-margen-valor').value=p.margen_valor||'';
  document.getElementById('prod-precio-base').value=displayMoneyVal(fProdPrecioBaseRaw);
  document.getElementById('prod-activo').checked=!!p.activo;
  document.getElementById('prod-fecha-inicio').value=p.fecha_inicio||'';
  document.getElementById('prod-fecha-fin').value=p.fecha_fin||'';
  document.getElementById('prod-cantidad-minima').value=p.cantidad_minima||'';
  document.getElementById('prod-descripcion').value=p.descripcion||'';
  document.getElementById('prod-tit').textContent=p.nombre;
  document.getElementById('prod-btn-del').style.display='inline-flex';
  renderProdCatRow();
  renderInsumos();
  renderRangos();
  onMargenTipoChange();
  showTipoPrecioSec(p.tipo_precio);
  document.getElementById('ovProd').classList.add('open');
}
function cerrarProducto(){document.getElementById('ovProd').classList.remove('open')}
```

- [ ] **Step 5: Verificar sintaxis**

Run: igual que Task 3 Step 7.
Expected: `OK`.

- [ ] **Step 6: Verificación funcional combinada (HTML servido + regresión de endpoints existentes)**

Run:
```bash
cd "i:/AGENCIA PEDIDOS/agencia"
npm start &
for i in 1 2 3 4 5 6 7 8 9 10; do curl -s -m 1 http://localhost:3000/ -o /dev/null && break; sleep 1; done
echo "--- funciones del modal presentes en el HTML servido ---"
curl -s -m 5 http://localhost:3000/ | grep -c 'id="ovProd"\|function abrirNuevoProducto\|function abrirEditarProducto\|function resetProdForm\|function cerrarProducto'
TOKEN=$(curl -s -m 5 -X POST http://localhost:3000/api/auth/login -H "Content-Type: application/json" -d '{"pin":"1234"}' | grep -o '"token":"[^"]*"' | cut -d'"' -f4)
echo "--- regresion: pedidos, clientes, configuracion siguen 200 ---"
curl -s -m 5 -o /dev/null -w "pedidos HTTP %{http_code}\n" http://localhost:3000/api/pedidos -H "Authorization: Bearer $TOKEN"
curl -s -m 5 -o /dev/null -w "clientes HTTP %{http_code}\n" http://localhost:3000/api/clientes -H "Authorization: Bearer $TOKEN"
curl -s -m 5 -o /dev/null -w "configuracion HTTP %{http_code}\n" http://localhost:3000/api/configuracion -H "Authorization: Bearer $TOKEN"
PID=$(netstat -ano | grep ':3000' | grep LISTENING | head -1 | awk '{print $NF}'); [ -n "$PID" ] && taskkill //F //PID "$PID"
```
Expected: el primer `grep -c` da `5`; los 3 endpoints de regresión responden `HTTP 200`.

- [ ] **Step 7: Commit**

```bash
cd "i:/AGENCIA PEDIDOS/agencia"
git add public/index.html
git commit -m "[FEATURE] Ficha de producto: modal completo y ciclo de vida (Fase 2A+2B)"
```

---

## Task 6: Frontend — guardar, eliminar y validación cliente

**Files:**
- Modify: `agencia/public/index.html` (agregar `validarProductoBody`, `guardarProducto`, `eliminarProducto`)

**Interfaces:**
- Consumes: `definidoFE`, `evalExpr`, `api`, `toast`, `cerrarProducto`, `cargarProductos`, `prodCatSel`, `fProdInsumos`, `fProdRangos`, `fProdPrecioBaseRaw`, `editProdId` (Tasks 4-5).
- Produces: `validarProductoBody(b)`, `guardarProducto()`, `eliminarProducto()` — cierran el ciclo CRUD del frontend.

- [ ] **Step 1: Agregar las 3 funciones**

En `public/index.html`, inmediatamente después del cierre de la función `cerrarProducto` (Task 5 Step 4), agregar:

```js
function validarProductoBody(b){
  if(definidoFE(b.precio_base)&&evalExpr(b.precio_base)===null)return'El Precio base no es una expresión válida';
  for(let i=0;i<(b.insumos||[]).length;i++){
    if(definidoFE(b.insumos[i].costo_unitario)&&evalExpr(b.insumos[i].costo_unitario)===null)return`Costo unitario del insumo #${i+1} no es una expresión válida`;
  }
  if(b.tipo_precio==='escalonado'&&(!b.rangos||!b.rangos.length))return'Escalonado necesita al menos un rango de precio';
  return null;
}
async function guardarProducto(){
  const nombre=document.getElementById('prod-nombre').value.trim();
  if(!nombre){document.getElementById('prod-nombre').focus();toast('Ingresa el nombre del producto',false);return}
  const tipoPrecio=document.getElementById('prod-tipo-precio').value;
  const body={
    nombre,
    categoria_id:prodCatSel,
    tipo_precio:tipoPrecio,
    margen_tipo:document.getElementById('prod-margen-tipo').value,
    margen_valor:document.getElementById('prod-margen-valor').value.trim(),
    precio_base:(fProdPrecioBaseRaw||'').trim(),
    activo:document.getElementById('prod-activo').checked,
    insumos:fProdInsumos,
    rangos:tipoPrecio==='escalonado'?fProdRangos.map(r=>({desde:parseInt(r.desde,10)||0,hasta:(r.hasta===''||r.hasta==null)?null:parseInt(r.hasta,10),precio:evalExpr(r.precio)||0})):[],
    fecha_inicio:document.getElementById('prod-fecha-inicio').value,
    fecha_fin:document.getElementById('prod-fecha-fin').value,
    cantidad_minima:document.getElementById('prod-cantidad-minima').value.trim(),
    descripcion:document.getElementById('prod-descripcion').value.trim()
  };
  const errExpr=validarProductoBody(body);
  if(errExpr){toast(errExpr,false);return}
  try{
    if(editProdId){await api('PUT',`/productos/${editProdId}`,body);toast('Producto actualizado ✓')}
    else{await api('POST','/productos',body);toast('Producto creado ✓')}
    cerrarProducto();
    await cargarProductos();
  }catch(e){toast('Error: '+e.message,false)}
}
async function eliminarProducto(){
  if(!editProdId||!confirm('¿Eliminar este producto?'))return;
  try{
    await api('DELETE',`/productos/${editProdId}`);
    toast('Producto eliminado');
    cerrarProducto();
    await cargarProductos();
  }catch(e){toast('Error: '+e.message,false)}
}
```

- [ ] **Step 2: Verificar sintaxis**

Run: igual que Task 3 Step 7.
Expected: `OK`.

- [ ] **Step 3: Verificación funcional end-to-end por la API (simulando exactamente lo que hace `guardarProducto`)**

Run:
```bash
cd "i:/AGENCIA PEDIDOS/agencia"
npm start &
for i in 1 2 3 4 5 6 7 8 9 10; do curl -s -m 1 http://localhost:3000/ -o /dev/null && break; sleep 1; done
TOKEN=$(curl -s -m 5 -X POST http://localhost:3000/api/auth/login -H "Content-Type: application/json" -d '{"pin":"1234"}' | grep -o '"token":"[^"]*"' | cut -d'"' -f4)

echo "--- crear (igual al payload que armaria guardarProducto para un producto Promocional) ---"
RESP=$(curl -s -m 5 -X POST http://localhost:3000/api/productos -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{
  "nombre":"Promo vasos Colombia","categoria_id":"estampados","tipo_precio":"promocional","margen_tipo":"fijo","margen_valor":"","precio_base":"100000","activo":true,"insumos":[],"rangos":[],
  "fecha_inicio":"2026-06-20","fecha_fin":"2026-07-10","cantidad_minima":"10","descripcion":"Promo vasos Colombia"
}')
echo "$RESP" | grep -o '"nombre":"[^"]*"\|"fecha_fin":"[^"]*"\|"precio_oficial":[0-9]*'
FID=$(echo "$RESP" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)

echo "--- listar: el producto aparece ---"
curl -s -m 5 "http://localhost:3000/api/productos" -H "Authorization: Bearer $TOKEN" | grep -o '"nombre":"Promo vasos Colombia"'

echo "--- eliminar y confirmar que ya no aparece ---"
curl -s -m 5 -X DELETE "http://localhost:3000/api/productos/$FID" -H "Authorization: Bearer $TOKEN"
echo
curl -s -m 5 "http://localhost:3000/api/productos" -H "Authorization: Bearer $TOKEN"
echo
PID=$(netstat -ano | grep ':3000' | grep LISTENING | head -1 | awk '{print $NF}'); [ -n "$PID" ] && taskkill //F //PID "$PID"
```
Expected: el primer grep muestra nombre/fecha_fin/precio_oficial correctos; el segundo confirma que aparece en la lista; tras eliminar, `GET /api/productos` responde `[]`.

- [ ] **Step 4: Commit**

```bash
cd "i:/AGENCIA PEDIDOS/agencia"
git add public/index.html
git commit -m "[FEATURE] Ficha de producto: guardar, eliminar y validacion cliente (Fase 2A+2B)"
```

---

## Task 7: Verificación final

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

- [ ] **Step 2: Regresión completa de toda la API existente**

Run (servidor levantado, mismo patrón de espera de tareas anteriores): repetir contra `/api/pedidos`, `/api/clientes`, `/api/stats`, `/api/registros/utilidades`, `/api/export/csv`, `/api/configuracion` — confirmar `HTTP 200` en los 6. Confirmar también `git status --short` sin cambios sin commitear y `git log --oneline -8` mostrando los 6 commits de feature de este plan.

- [ ] **Step 3: Checklist manual para el usuario (el agente no tiene navegador)**

Pedir al usuario que, en `npm start`, abra "Productos" y confirme:
1. La lista está vacía la primera vez ("Sin productos").
2. "Nuevo producto" abre el modal; las 3 opciones de Tipo de precio muestran/ocultan correctamente la sección de Rangos o de Vigencia.
3. Crear el producto "Retablo 10x15cm" del ejemplo del documento maestro: 3 insumos (Madera $5.000, Pintura $1.000, Vinilo $5.000), margen Multiplicador ×2 — el "Costo total" muestra $11.000 y el "Precio sugerido" $22.000 en vivo, sin guardar todavía.
4. Escribir un Precio base distinto a mano (ej. $20.000), guardar. Reabrir el producto: el Precio base sigue en $20.000, no se lo pisó el sugerido.
5. Editar el costo de un insumo: el "Precio sugerido" cambia en vivo, pero el Precio base (ya definido) no se mueve solo.
6. Crear un producto Escalonado con los 4 rangos del ejemplo de camisetas del documento maestro (1-11 a $32.000, 12-23 a $30.000, 24-35 a $28.000, 36 en adelante a $26.000, este último con "Hasta" vacío).
7. Marcar un producto como "Inactivo" — la card de la lista muestra el badge correspondiente.
8. Buscar por nombre en la barra de búsqueda de Productos — filtra correctamente.
9. Confirmar que el formulario de "Nuevo pedido" (Pedidos → Nuevo pedido) se ve y funciona exactamente igual que antes de este cambio — no debió tocarse en ningún task.

- [ ] **Step 4: Push (solo con confirmación explícita del usuario)**

No ejecutar automáticamente:
```bash
git push origin main
```
