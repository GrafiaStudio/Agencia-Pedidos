# Etiquetas personalizables por negocio Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reemplazar `CATS` (constante hardcodeada compartida por todos los workspaces) por una tabla `etiquetas_negocio` por workspace, con un CRUD propio y una sub-pestaña de gestión en Configuración — sin tocar ninguno de los 6 sitios del frontend que ya consumen `CATS` hoy.

**Architecture:** El backend siembra perezosamente las 6 categorías actuales (mismos slugs) la primera vez que un workspace pide sus etiquetas, y devuelve cada fila con la misma forma que `CATS` ya tenía (`{id,label,tc,subs}`) — así `renderLista`/`cargarProductos`/`verCli`/`renderEncs`/`renderEncSubcats`/`renderProdCatRow` no cambian. `CATS` pasa de `const` a `let`, poblada por un fetch al iniciar sesión, igual patrón que `CFG`.

**Tech Stack:** Node.js + Express + better-sqlite3 (backend), HTML/CSS/JS vanilla (frontend).

## Global Constraints

- Ningún dato existente se reescribe — la siembra usa los mismos slugs (`estampados`, `publicidad`, `diseno`, `papeleria`, `artesanias`, `servicios`) que ya están guardados en `encargos`/`fichas_producto`.
- Solo 6 colores de paleta fija (`purple, amber, orange, teal, green, slate`) — sin color libre/hex.
- Eliminar una etiqueta es una acción real, sin deshacer — mismo nivel de fricción que otras eliminaciones de la app (confirmación con `confirm()`).
- `git push origin main` no requiere confirmación previa (autorización del usuario).

---

## Task 1: Backend — tabla, siembra perezosa y CRUD

**Files:**
- Modify: `agencia/server.js`

**Interfaces:**
- Produces: `getEtiquetas(wsId)` → `[{id,label,color,tc,subs,activo},...]`; endpoints `GET/POST/PUT/DELETE /api/etiquetas[/:id]`.

- [ ] **Step 1: Tabla `etiquetas_negocio`**

Releer primero con `grep -n -A8 "CREATE TABLE IF NOT EXISTS combo_composicion" agencia/server.js` para confirmar el ancla exacta. Inmediatamente después de su cierre (`)\`);`), agregar:

```js
db.exec(`CREATE TABLE IF NOT EXISTS etiquetas_negocio(
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  nombre TEXT NOT NULL,
  color TEXT DEFAULT 'slate',
  subs TEXT DEFAULT '[]',
  activo INTEGER DEFAULT 1,
  orden INTEGER DEFAULT 0
)`);
```

- [ ] **Step 2: Paleta, semilla y `getEtiquetas`/`validarEtiqueta`**

Releer primero con `grep -n "// ── CONFIGURACIÓN DEL NEGOCIO ──" agencia/server.js` (el comentario que antecede a `app.get('/api/configuracion'...`, no la migración — son dos bloques distintos con el mismo título; usar el que está cerca de `app.get`). Inmediatamente antes de ese comentario, agregar:

```js
// ── ETIQUETAS DEL NEGOCIO (categorías y subcategorías personalizables) ──
const PALETA_ETIQUETAS=['purple','amber','orange','teal','green','slate'];
const ETIQUETAS_DEFAULT=[
  {id:'estampados', nombre:'Estampados', color:'purple', subs:['Camisetas','Vasos','Gorras','Accesorios','Sublimación','DTF']},
  {id:'publicidad', nombre:'Publicidad', color:'amber',  subs:['Volantes','Tarjetas','Avisos','Pendones','Material POP','Etiquetas']},
  {id:'diseno',     nombre:'Diseño',     color:'orange', subs:['Diseño digital','Diseño publicitario','Branding','Edición']},
  {id:'papeleria',  nombre:'Papelería',  color:'teal',   subs:['Documentos','Impresiones','Fotocopias']},
  {id:'artesanias', nombre:'Artesanías', color:'green',  subs:['Resina','Llaveros','Regalos','Otros']},
  {id:'servicios',  nombre:'Servicios',  color:'slate',  subs:['Consultas','Trabajo en PC','Asesorías']},
];
function sembrarEtiquetas(wsId){
  ETIQUETAS_DEFAULT.forEach((e,i)=>{
    db.prepare('INSERT INTO etiquetas_negocio(id,workspace_id,nombre,color,subs,activo,orden)VALUES(?,?,?,?,?,1,?)')
      .run(e.id,wsId,e.nombre,e.color,JSON.stringify(e.subs),i);
  });
}
function getEtiquetas(wsId){
  let filas=db.prepare('SELECT * FROM etiquetas_negocio WHERE workspace_id=? ORDER BY orden').all(wsId);
  if(!filas.length){
    sembrarEtiquetas(wsId);
    filas=db.prepare('SELECT * FROM etiquetas_negocio WHERE workspace_id=? ORDER BY orden').all(wsId);
  }
  return filas.map(f=>({id:f.id,label:f.nombre,color:f.color,tc:'tc-'+f.color,subs:JSON.parse(f.subs||'[]'),activo:!!f.activo}));
}
function validarEtiqueta(b){
  const errores=[];
  if(!String(b.nombre||'').trim())errores.push('El nombre de la etiqueta no puede estar vacío');
  if(b.color!==undefined&&!PALETA_ETIQUETAS.includes(b.color))errores.push('Color no válido');
  if(b.subs!==undefined&&(!Array.isArray(b.subs)||b.subs.some(s=>!String(s||'').trim())))errores.push('Las subcategorías no pueden estar vacías');
  return errores;
}

// ── CONFIGURACIÓN DEL NEGOCIO ──
```

- [ ] **Step 3: Endpoints CRUD**

Releer primero con `grep -n -A2 "app.post('/api/configuracion/logo'" agencia/server.js` para confirmar dónde cierra ese endpoint, justo antes del comentario `// ── PRODUCTOS`. Inmediatamente después de su cierre (`});`), agregar:

```js
// ── ETIQUETAS DEL NEGOCIO ──
app.get('/api/etiquetas',(req,res)=>{
  res.json(getEtiquetas(req.wsId));
});
app.post('/api/etiquetas',(req,res)=>{
  try{
    const b=req.body;
    const errores=validarEtiqueta(b);
    if(errores.length)return res.status(400).json({error:errores.join('. ')});
    const id=uid();
    const max=db.prepare('SELECT MAX(orden) AS m FROM etiquetas_negocio WHERE workspace_id=?').get(req.wsId).m;
    db.prepare('INSERT INTO etiquetas_negocio(id,workspace_id,nombre,color,subs,activo,orden)VALUES(?,?,?,?,?,1,?)')
      .run(id,req.wsId,b.nombre.trim(),b.color||'slate',JSON.stringify((b.subs||[]).map(s=>String(s).trim())),(max??-1)+1);
    res.json(getEtiquetas(req.wsId).find(e=>e.id===id));
  }catch(e){logError('POST /api/etiquetas',e);res.status(500).json({error:e.message})}
});
app.put('/api/etiquetas/:id',(req,res)=>{
  try{
    const b=req.body; const eid=req.params.id;
    const f=db.prepare('SELECT * FROM etiquetas_negocio WHERE id=? AND workspace_id=?').get(eid,req.wsId);
    if(!f)return res.status(404).json({error:'No encontrada'});
    const errores=validarEtiqueta(b);
    if(errores.length)return res.status(400).json({error:errores.join('. ')});
    db.prepare('UPDATE etiquetas_negocio SET nombre=?,color=?,subs=?,activo=? WHERE id=? AND workspace_id=?')
      .run(b.nombre.trim(),b.color||'slate',JSON.stringify((b.subs||[]).map(s=>String(s).trim())),b.activo===false?0:1,eid,req.wsId);
    res.json(getEtiquetas(req.wsId).find(e=>e.id===eid));
  }catch(e){logError('PUT /api/etiquetas/:id',e);res.status(500).json({error:e.message})}
});
app.delete('/api/etiquetas/:id',(req,res)=>{
  const r=db.prepare('DELETE FROM etiquetas_negocio WHERE id=? AND workspace_id=?').run(req.params.id,req.wsId);
  if(r.changes===0)return res.status(404).json({error:'No encontrada'});
  res.json({ok:true});
});

```

- [ ] **Step 4: Verificar sintaxis**

Run: `cd "i:/AGENCIA PEDIDOS/agencia" && node -c server.js && echo OK`
Expected: `OK`.

- [ ] **Step 5: Probar con curl**

Run:
```bash
cd "i:/AGENCIA PEDIDOS/agencia"
npm start &
for i in 1 2 3 4 5 6 7 8 9 10; do curl -s -m 1 http://localhost:3000/ -o /dev/null && break; sleep 1; done
TOKEN=$(curl -s -m 5 -X POST http://localhost:3000/api/auth/login -H "Content-Type: application/json" -d '{"pin":"1234"}' | grep -o '"token":"[^"]*"' | cut -d'"' -f4)

echo "--- primera llamada: debe sembrar las 6 etiquetas con los slugs actuales ---"
curl -s -m 5 http://localhost:3000/api/etiquetas -H "Authorization: Bearer $TOKEN" | grep -o '"id":"estampados"\|"id":"servicios"' | sort -u

echo "--- crear etiqueta nueva ---"
RESP=$(curl -s -m 5 -X POST http://localhost:3000/api/etiquetas -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{"nombre":"Bordados","color":"purple","subs":["Gorras bordadas","Camisas bordadas"]}')
echo "$RESP" | grep -o '"label":"Bordados"\|"tc":"tc-purple"'
NID=$(echo "$RESP" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)

echo "--- color invalido debe fallar 400 ---"
curl -s -m 5 -w "\nHTTP %{http_code}\n" -X POST http://localhost:3000/api/etiquetas -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{"nombre":"Mala","color":"rojo-invalido"}'

echo "--- editar la etiqueta nueva ---"
curl -s -m 5 -X PUT "http://localhost:3000/api/etiquetas/$NID" -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{"nombre":"Bordados premium","color":"amber","subs":["Gorras"]}' | grep -o '"label":"Bordados premium"\|"tc":"tc-amber"'

echo "--- eliminar ---"
curl -s -m 5 -X DELETE "http://localhost:3000/api/etiquetas/$NID" -H "Authorization: Bearer $TOKEN" -o /dev/null
curl -s -m 5 http://localhost:3000/api/etiquetas -H "Authorization: Bearer $TOKEN" | grep -c 'Bordados premium'

PID=$(netstat -ano | grep ':3000' | grep LISTENING | head -1 | awk '{print $NF}'); [ -n "$PID" ] && taskkill //F //PID "$PID"
```
Expected: ambos slugs (`estampados`, `servicios`) presentes en la primera llamada (siembra); `"label":"Bordados"`/`"tc":"tc-purple"` en la creación; `HTTP 400` en color inválido; `"label":"Bordados premium"`/`"tc":"tc-amber"` tras editar; `0` después de eliminar (ya no aparece).

- [ ] **Step 6: Commit**

```bash
cd "i:/AGENCIA PEDIDOS/agencia"
git add server.js
git commit -m "[FEATURE] Etiquetas personalizables por negocio: tabla, siembra y CRUD (Fase 2E)"
```

---

## Task 2: Frontend — `CATS` dinámico, sin tocar sus consumidores

**Files:**
- Modify: `agencia/public/index.html` (CSS de paleta; declaración de `CATS`; `init()`)

**Interfaces:**
- Produces: `cargarEtiquetas()`.

- [ ] **Step 1: Renombrar las 6 clases CSS de la paleta**

Releer primero con `grep -n -B1 -A6 "\.tc-estampados{" agencia/public/index.html`. Cambiar:

```css
.ttag{font-size:8px;font-weight:800;padding:2px 7px;border-radius:20px;text-transform:uppercase;letter-spacing:.05em}
.tc-estampados{background:var(--purple-lt);color:#4A3CB8}
.tc-publicidad{background:var(--amber-lt);color:#9B6500}
.tc-diseno{background:var(--orange-lt);color:#C24A1A}
.tc-papeleria{background:var(--teal-lt);color:var(--teal-dk)}
.tc-artesanias{background:var(--green-lt);color:#1A6B45}
.tc-servicios{background:var(--line-lt);color:var(--slate)}
```

por:

```css
.ttag{font-size:8px;font-weight:800;padding:2px 7px;border-radius:20px;text-transform:uppercase;letter-spacing:.05em}
.tc-purple{background:var(--purple-lt);color:#4A3CB8}
.tc-amber{background:var(--amber-lt);color:#9B6500}
.tc-orange{background:var(--orange-lt);color:#C24A1A}
.tc-teal{background:var(--teal-lt);color:var(--teal-dk)}
.tc-green{background:var(--green-lt);color:#1A6B45}
.tc-slate{background:var(--line-lt);color:var(--slate)}
```

- [ ] **Step 2: `CATS` pasa de constante hardcodeada a variable poblada por API**

Releer primero con `grep -n -A14 "^const CATS=\[" agencia/public/index.html` para confirmar el bloque completo exacto. Cambiar:

```js
const CATS=[
  {id:'estampados', label:'Estampados', tc:'tc-estampados',
   subs:['Camisetas','Vasos','Gorras','Accesorios','Sublimación','DTF']},
  {id:'publicidad', label:'Publicidad', tc:'tc-publicidad',
   subs:['Volantes','Tarjetas','Avisos','Pendones','Material POP','Etiquetas']},
  {id:'diseno',     label:'Diseño',    tc:'tc-diseno',
   subs:['Diseño digital','Diseño publicitario','Branding','Edición']},
  {id:'papeleria',  label:'Papelería', tc:'tc-papeleria',
   subs:['Documentos','Impresiones','Fotocopias']},
  {id:'artesanias', label:'Artesanías',tc:'tc-artesanias',
   subs:['Resina','Llaveros','Regalos','Otros']},
  {id:'servicios',  label:'Servicios', tc:'tc-servicios',
   subs:['Consultas','Trabajo en PC','Asesorías']},
];
```

por:

```js
const PALETA_ETIQUETAS=['purple','amber','orange','teal','green','slate'];
let CATS=[];
async function cargarEtiquetas(){
  try{
    CATS=await api('GET','/etiquetas');
  }catch(e){
    console.warn('Etiquetas:',e.message);
  }
}
```

(Las funciones que ya leen `CATS.find(...)`/`CATS.map(...)` en `renderLista`, `cargarProductos`, `verCli`, `renderEncs`, `renderEncSubcats` y `renderProdCatRow` no se tocan — siguen funcionando igual, ahora contra un array poblado dinámicamente en vez de uno hardcodeado.)

- [ ] **Step 3: `init()` carga las etiquetas antes de pintar pedidos**

Releer primero con `grep -n -A6 "^async function init()" agencia/public/index.html`. Cambiar:

```js
  try{await cargarConfiguracion()}catch(e){console.warn('Configuración:',e.message)}
  try{await cargarStats()}catch(e){console.warn('Stats:',e.message)}
```

por:

```js
  try{await cargarConfiguracion()}catch(e){console.warn('Configuración:',e.message)}
  try{await cargarEtiquetas()}catch(e){console.warn('Etiquetas:',e.message)}
  try{await cargarStats()}catch(e){console.warn('Stats:',e.message)}
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
git commit -m "[FEATURE] Etiquetas personalizables: CATS dinamico desde la API (Fase 2E)"
```

---

## Task 3: Frontend — sub-pestaña "Etiquetas" en Configuración

**Files:**
- Modify: `agencia/public/index.html` (`cfg-tabs`; `showCfgTab`; nuevo panel `cfg-etiquetas`; botón "Guardar configuración"; funciones de gestión)

**Interfaces:**
- Produces: `renderEtiquetas()`, `abrirNuevaEtiqueta()`, `setEtiquetaColor(id,color)`, `setEtiquetaNombre(id,v)`, `setEtiquetaSubs(id,v)`, `guardarEtiqueta(id)`, `eliminarEtiqueta(id)`.

- [ ] **Step 1: Botón de sub-pestaña**

Releer primero con `grep -n -A5 'class="cfg-tabs"' agencia/public/index.html`. Cambiar:

```html
      <div class="cfg-tabs">
        <button class="cfgtab active" onclick="showCfgTab('perfil')">Perfil del negocio</button>
        <button class="cfgtab" onclick="showCfgTab('preferencias')">Preferencias</button>
        <button class="cfgtab" onclick="showCfgTab('pedidos')">Pedidos</button>
        <button class="cfgtab" onclick="showCfgTab('notificaciones')">Notificaciones</button>
        <button class="cfgtab" onclick="showCfgTab('impuestos')">Impuestos</button>
      </div>
```

por:

```html
      <div class="cfg-tabs">
        <button class="cfgtab active" onclick="showCfgTab('perfil')">Perfil del negocio</button>
        <button class="cfgtab" onclick="showCfgTab('preferencias')">Preferencias</button>
        <button class="cfgtab" onclick="showCfgTab('pedidos')">Pedidos</button>
        <button class="cfgtab" onclick="showCfgTab('notificaciones')">Notificaciones</button>
        <button class="cfgtab" onclick="showCfgTab('impuestos')">Impuestos</button>
        <button class="cfgtab" onclick="showCfgTab('etiquetas')">Etiquetas</button>
      </div>
```

- [ ] **Step 2: Panel nuevo + id en el botón "Guardar configuración"**

Releer primero con `grep -n -A14 'id="cfg-impuestos"' agencia/public/index.html` para confirmar el bloque completo exacto (incluye ya el botón de guardar, que hoy no tiene `id`). Cambiar:

```html
      <div id="cfg-impuestos" class="cfg-panel">
        <div class="msec"><span class="tri"></span>IVA</div>
        <div class="ck-box" style="display:inline-flex;margin-bottom:12px"><input type="checkbox" id="cfg-iva-activo" onchange="onIvaActivoChange()"><label for="cfg-iva-activo">Aplicar IVA</label></div>
        <div id="cfg-iva-detalle-wrap" style="display:none">
          <div class="fr2 fg">
            <div><label>Porcentaje</label><input type="number" id="cfg-iva-porcentaje" min="0" max="100" placeholder="19"></div>
            <div style="display:flex;align-items:flex-end;padding-bottom:8px">
              <div class="ck-box"><input type="checkbox" id="cfg-iva-desglosado"><label for="cfg-iva-desglosado">Mostrar desglosado en el documento</label></div>
            </div>
          </div>
        </div>
      </div>

      <button class="btn-pri" style="margin-top:18px" onclick="guardarConfiguracion()"><i class="ti ti-device-floppy"></i> Guardar configuración</button>
    </div>
```

por:

```html
      <div id="cfg-impuestos" class="cfg-panel">
        <div class="msec"><span class="tri"></span>IVA</div>
        <div class="ck-box" style="display:inline-flex;margin-bottom:12px"><input type="checkbox" id="cfg-iva-activo" onchange="onIvaActivoChange()"><label for="cfg-iva-activo">Aplicar IVA</label></div>
        <div id="cfg-iva-detalle-wrap" style="display:none">
          <div class="fr2 fg">
            <div><label>Porcentaje</label><input type="number" id="cfg-iva-porcentaje" min="0" max="100" placeholder="19"></div>
            <div style="display:flex;align-items:flex-end;padding-bottom:8px">
              <div class="ck-box"><input type="checkbox" id="cfg-iva-desglosado"><label for="cfg-iva-desglosado">Mostrar desglosado en el documento</label></div>
            </div>
          </div>
        </div>
      </div>

      <div id="cfg-etiquetas" class="cfg-panel">
        <div class="msec"><span class="tri"></span>Etiquetas y categorías</div>
        <div id="etiquetas-lista"></div>
        <button class="btn-add-row" onclick="abrirNuevaEtiqueta()"><i class="ti ti-plus"></i>Agregar etiqueta</button>
      </div>

      <button class="btn-pri" id="btn-guardar-config" style="margin-top:18px" onclick="guardarConfiguracion()"><i class="ti ti-device-floppy"></i> Guardar configuración</button>
    </div>
```

- [ ] **Step 3: `showCfgTab` reconoce `etiquetas` y oculta el botón de guardar ahí**

Releer primero con `grep -n -A5 "^function showCfgTab" agencia/public/index.html`. Cambiar:

```js
function showCfgTab(tab){
  document.querySelectorAll('.cfg-panel').forEach(x=>x.classList.remove('active'));
  document.querySelectorAll('.cfgtab').forEach(x=>x.classList.remove('active'));
  document.getElementById('cfg-'+tab).classList.add('active');
  ['perfil','preferencias','pedidos','notificaciones','impuestos'].forEach((t,i)=>{if(t===tab)document.querySelectorAll('.cfgtab')[i].classList.add('active')});
}
```

por:

```js
function showCfgTab(tab){
  document.querySelectorAll('.cfg-panel').forEach(x=>x.classList.remove('active'));
  document.querySelectorAll('.cfgtab').forEach(x=>x.classList.remove('active'));
  document.getElementById('cfg-'+tab).classList.add('active');
  ['perfil','preferencias','pedidos','notificaciones','impuestos','etiquetas'].forEach((t,i)=>{if(t===tab)document.querySelectorAll('.cfgtab')[i].classList.add('active')});
  document.getElementById('btn-guardar-config').style.display=tab==='etiquetas'?'none':'inline-flex';
  if(tab==='etiquetas')renderEtiquetas();
}
```

(El botón "Guardar configuración" guarda los campos de las otras 5 sub-pestañas — las etiquetas se guardan una por una con su propio botón, mostrarlo en esa pestaña sería engañoso.)

- [ ] **Step 4: Funciones de gestión de etiquetas**

Releer primero con `grep -n -A6 "^function showCfgTab" agencia/public/index.html` (ya con el cambio del Step 3 aplicado) para anclar justo después de su cierre. Agregar inmediatamente después:

```js
let etqNuevaTmp=null;
function abrirNuevaEtiqueta(){
  if(etqNuevaTmp)return;
  etqNuevaTmp={id:'_nueva',label:'',color:'slate',tc:'tc-slate',subs:[],_subsRaw:''};
  renderEtiquetas();
}
function buscarEtq(id){return id==='_nueva'?etqNuevaTmp:CATS.find(x=>x.id===id)}
function setEtiquetaColor(id,color){const c=buscarEtq(id);if(c){c.color=color;c.tc='tc-'+color;renderEtiquetas()}}
function setEtiquetaNombre(id,v){const c=buscarEtq(id);if(c)c.label=v}
function setEtiquetaSubs(id,v){const c=buscarEtq(id);if(c)c._subsRaw=v}
function subsDesdeTexto(c){return(c._subsRaw!=null?c._subsRaw:(c.subs||[]).join(', ')).split(',').map(s=>s.trim()).filter(Boolean)}
async function guardarEtiqueta(id){
  const c=buscarEtq(id); if(!c)return;
  if(!c.label||!c.label.trim()){toast('Ingresa un nombre',false);return}
  const subs=subsDesdeTexto(c);
  try{
    if(id==='_nueva'){
      await api('POST','/etiquetas',{nombre:c.label.trim(),color:c.color,subs});
      etqNuevaTmp=null;
    }else{
      await api('PUT',`/etiquetas/${id}`,{nombre:c.label.trim(),color:c.color,subs});
    }
    await cargarEtiquetas();
    renderEtiquetas();
    toast('Etiqueta guardada ✓');
  }catch(e){toast('Error: '+e.message,false)}
}
async function eliminarEtiqueta(id){
  if(!confirm('¿Eliminar esta etiqueta? Los pedidos que ya la usan quedarán sin esa categoría visible.'))return;
  try{
    await api('DELETE',`/etiquetas/${id}`);
    await cargarEtiquetas();
    renderEtiquetas();
  }catch(e){toast('Error: '+e.message,false)}
}
function renderEtiquetas(){
  const filas=etqNuevaTmp?[...CATS,etqNuevaTmp]:CATS;
  document.getElementById('etiquetas-lista').innerHTML=filas.map(c=>`
    <div class="etq-row" style="display:flex;align-items:center;gap:8px;padding:10px;border:1.5px solid var(--line);border-radius:var(--r);margin-bottom:8px;flex-wrap:wrap">
      <div style="display:flex;gap:4px">${PALETA_ETIQUETAS.map(p=>`<span onclick="setEtiquetaColor('${c.id}','${p}')" style="width:16px;height:16px;border-radius:50%;cursor:pointer;display:inline-block;border:2px solid ${c.color===p?'var(--navy)':'transparent'}" class="tc-${p}"></span>`).join('')}</div>
      <input class="item-inp" style="flex:1;min-width:120px" type="text" value="${c.label}" placeholder="Nombre" oninput="setEtiquetaNombre('${c.id}',this.value)">
      <input class="item-inp" style="flex:2;min-width:160px" type="text" value="${c._subsRaw!=null?c._subsRaw:(c.subs||[]).join(', ')}" placeholder="Subcategorías separadas por coma" oninput="setEtiquetaSubs('${c.id}',this.value)">
      <button class="btn-add-row" style="padding:6px 10px" onclick="guardarEtiqueta('${c.id}')"><i class="ti ti-check"></i></button>
      ${c.id==='_nueva'?'':`<button class="item-del" onclick="eliminarEtiqueta('${c.id}')"><i class="ti ti-trash"></i></button>`}
    </div>`).join('');
}
```

- [ ] **Step 5: Verificar sintaxis**

Run: igual que Task 2 Step 4.
Expected: `OK`.

- [ ] **Step 6: Verificación funcional**

Run:
```bash
cd "i:/AGENCIA PEDIDOS/agencia"
npm start &
for i in 1 2 3 4 5 6 7 8 9 10; do curl -s -m 1 http://localhost:3000/ -o /dev/null && break; sleep 1; done
curl -s -m 5 http://localhost:3000/ | grep -c 'cfg-etiquetas\|renderEtiquetas\|abrirNuevaEtiqueta\|guardarEtiqueta\|eliminarEtiqueta'
TOKEN=$(curl -s -m 5 -X POST http://localhost:3000/api/auth/login -H "Content-Type: application/json" -d '{"pin":"1234"}' | grep -o '"token":"[^"]*"' | cut -d'"' -f4)
curl -s -m 5 -o /dev/null -w "etiquetas HTTP %{http_code}\n" http://localhost:3000/api/etiquetas -H "Authorization: Bearer $TOKEN"
PID=$(netstat -ano | grep ':3000' | grep LISTENING | head -1 | awk '{print $NF}'); [ -n "$PID" ] && taskkill //F //PID "$PID"
```
Expected: el `grep -c` da al menos `5`; `etiquetas` responde `HTTP 200`.

- [ ] **Step 7: Commit**

```bash
cd "i:/AGENCIA PEDIDOS/agencia"
git add public/index.html
git commit -m "[FEATURE] Etiquetas personalizables: sub-pestana de gestion en Configuracion (Fase 2E)"
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

Run (servidor levantado, mismo patrón de espera): repetir contra `/api/pedidos`, `/api/clientes`, `/api/configuracion`, `/api/productos`, `/api/app-info`, `/api/etiquetas` — confirmar `HTTP 200` en los 6. Confirmar `git status --short` sin cambios sin commitear.

- [ ] **Step 3: Checklist manual para el usuario (el agente no tiene navegador)**

Pedir al usuario que, en `npm start`, confirme: en Configuración → Etiquetas, ve las 6 categorías de siempre con sus colores ya correctos (deben verse IGUAL que antes — el cambio es interno); puede crear una etiqueta nueva, elegirle color, escribirle subcategorías separadas por coma, guardarla, y que aparezca de inmediato disponible al elegir categoría en un Encargo nuevo; puede editar y eliminar una etiqueta. Confirmar también que un pedido viejo con una categoría ya asignada sigue mostrando su badge de color igual que antes (sin tocarlo).

- [ ] **Step 4: Push**

```bash
git push origin main
```