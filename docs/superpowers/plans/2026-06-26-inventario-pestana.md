# Inventario como pestaña propia — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sacar "Stock actual"/"Stock mínimo" del modal de Producto a una pestaña nueva
del sidebar llamada Inventario, sin agregar tablas ni endpoints nuevos.

**Architecture:** 100% frontend, un solo archivo (`agencia/public/index.html`). La
pestaña Inventario reutiliza `GET /api/productos` (ya devuelve `stock_actual`/
`stock_minimo`) y `PUT /api/productos/:id` (ya los acepta y guarda) — ninguno de los dos
endpoints cambia. El modal de Producto deja de mostrar esos 2 campos pero sigue
conociéndolos en memoria para no borrarlos al guardar cambios no relacionados.

**Tech Stack:** HTML/CSS/JS vanilla (sin build step), `better-sqlite3` sin cambios.

## Global Constraints

- Ningún cambio en `agencia/server.js`.
- Ningún endpoint ni tabla nueva.
- El proyecto no tiene framework de tests ni el agente tiene navegador — verificar con
  `node -c` sobre el bloque `<script>` extraído tras cada cambio de JS, y con `node -e`
  para probar en aislamiento cualquier lógica pura (orden/filtro). El checklist visual
  final lo corre el usuario.
- Mantener el estilo de nombres ya usado: prefijo `fProd...` para variables de estado
  del modal de Producto, `cargarX`/`guardarX` para funciones de carga/guardado de vista.
- Commits frecuentes, uno por tarea. Push queda como última tarea explícita, después de
  que el resultado se revise — no autónomo en esta sesión (el usuario está presente
  dando feedback en vivo).

---

### Task 1: Pestaña Inventario — navegación + listado de solo lectura

**Files:**
- Modify: `agencia/public/index.html` (sidebar ~línea 462, modal "Más" ~línea 744,
  vista nueva ~línea 549, `showView` ~líneas 1562-1569, función nueva ~línea 1726)

**Interfaces:**
- Produces: `cargarInventario(q='')` — async, sin retorno; pinta filas de solo lectura
  en `#inv-body`. `grupoStock(p)` — pura, devuelve `0` (stock bajo) / `1` (con
  seguimiento, sano) / `2` (sin seguimiento), usada por Task 1 y reusada sin cambios en
  tareas futuras si hiciera falta.

- [ ] **Step 1: Agregar el ítem "Inventario" al sidebar**

En `agencia/public/index.html`, busca (línea ~462):

```html
    <button class="nav-item" data-view="productos" onclick="showView('productos')"><i class="ti ti-box"></i>Productos</button>
```

Reemplaza por:

```html
    <button class="nav-item" data-view="productos" onclick="showView('productos')"><i class="ti ti-box"></i>Productos</button>
    <button class="nav-item" data-view="inventario" onclick="showView('inventario')"><i class="ti ti-boxes"></i>Inventario</button>
```

- [ ] **Step 2: Agregar "Inventario" al modal "Más" del menú móvil**

Busca (línea ~744):

```html
    <button class="mas-item" onclick="irDesdeMas('productos')"><i class="ti ti-box"></i>Productos</button>
    <button class="mas-item" onclick="irDesdeMas('ayuda')"><i class="ti ti-help-circle"></i>Ayuda</button>
```

Reemplaza por:

```html
    <button class="mas-item" onclick="irDesdeMas('productos')"><i class="ti ti-box"></i>Productos</button>
    <button class="mas-item" onclick="irDesdeMas('inventario')"><i class="ti ti-boxes"></i>Inventario</button>
    <button class="mas-item" onclick="irDesdeMas('ayuda')"><i class="ti ti-help-circle"></i>Ayuda</button>
```

- [ ] **Step 3: Agregar el contenedor de la vista Inventario**

Busca (línea ~547-551):

```html
      <div class="cli-grid" id="lista-prod"></div>
    </div>

    <!-- CONFIGURACIÓN -->
```

Reemplaza por:

```html
      <div class="cli-grid" id="lista-prod"></div>
    </div>

    <!-- INVENTARIO -->
    <div id="view-inventario" class="view">
      <div class="toolbar">
        <div class="search-b" style="flex:1;max-width:300px"><i class="ti ti-search"></i>
          <input type="text" id="inv-s" placeholder="Buscar producto…" oninput="cargarInventario(this.value)" style="max-width:100%">
        </div>
      </div>
      <table class="items-table" id="inv-tabla">
        <thead><tr><th>Producto</th><th>Categoría</th><th style="width:120px">Stock actual</th><th style="width:120px">Stock mínimo</th><th style="width:90px"></th></tr></thead>
        <tbody id="inv-body"></tbody>
      </table>
      <div class="empty" id="inv-empty" style="display:none"><i class="ti ti-box-off"></i><p>Sin productos con seguimiento de inventario</p></div>
    </div>

    <!-- CONFIGURACIÓN -->
```

- [ ] **Step 4: Registrar el título y la activación de la pestaña en `showView`**

Busca (línea ~1562-1569):

```js
  const titles={pedidos:'Pedidos',clientes:'Clientes',registros:'Registros',configuracion:'Configuración',productos:'Productos',ayuda:'Ayuda y About'};
  document.getElementById('tb-title').textContent=titles[v]||'';
  document.querySelector(`.nav-item[data-view="${v}"]`)?.classList.add('active');
  document.querySelectorAll('.mob-btn')[{pedidos:0,clientes:2,registros:3,productos:4,ayuda:4,configuracion:4}[v]??0]?.classList.add('active');
  if(v==='clientes')cargarClientes();
  if(v==='registros'){renderRegistros();showReg('ingresos');}
  if(v==='configuracion')pintarConfiguracion();
  if(v==='productos')cargarProductos();
```

Reemplaza por:

```js
  const titles={pedidos:'Pedidos',clientes:'Clientes',registros:'Registros',configuracion:'Configuración',productos:'Productos',inventario:'Inventario',ayuda:'Ayuda y About'};
  document.getElementById('tb-title').textContent=titles[v]||'';
  document.querySelector(`.nav-item[data-view="${v}"]`)?.classList.add('active');
  document.querySelectorAll('.mob-btn')[{pedidos:0,clientes:2,registros:3,productos:4,inventario:4,ayuda:4,configuracion:4}[v]??0]?.classList.add('active');
  if(v==='clientes')cargarClientes();
  if(v==='registros'){renderRegistros();showReg('ingresos');}
  if(v==='configuracion')pintarConfiguracion();
  if(v==='productos')cargarProductos();
  if(v==='inventario')cargarInventario();
```

- [ ] **Step 5: Escribir `cargarInventario` (listado de solo lectura)**

Busca el final de `cargarProductos` (línea ~1724-1727):

```js
    </div>`;
  }).join('');
}

// Almacena cliente actual para el modal
```

Reemplaza por (agrega las 2 funciones nuevas entre `cargarProductos` y el comentario):

```js
    </div>`;
  }).join('');
}
function grupoStock(p){return (p.stock_actual!=null&&p.stock_minimo!=null&&p.stock_actual<=p.stock_minimo)?0:(p.stock_actual!=null?1:2)}
async function cargarInventario(q=''){
  const p=q?`?q=${encodeURIComponent(q)}`:'';
  productos=await api('GET',`/productos${p}`);
  const lista=productos.filter(x=>x.tipo_precio!=='combo'&&x.tipo_precio!=='promocional');
  lista.sort((a,b)=>grupoStock(a)-grupoStock(b)||a.nombre.localeCompare(b.nombre));
  const el=document.getElementById('inv-body');
  const vacio=document.getElementById('inv-empty');
  if(!lista.length){el.innerHTML='';vacio.style.display='block';return}
  vacio.style.display='none';
  el.innerHTML=lista.map(p=>{
    const cat=CATS.find(c=>c.id===p.categoria_id);
    const bajo=grupoStock(p)===0;
    return`<tr>
      <td>${p.nombre}</td>
      <td>${cat?`<span class="ttag ${cat.tc}">${cat.label}</span>`:'—'}</td>
      <td>${p.stock_actual??'Sin seguimiento'}</td>
      <td>${p.stock_minimo??'—'}</td>
      <td>${bajo?'<span class="b-pend">Stock bajo</span>':''}</td>
    </tr>`;
  }).join('');
}

// Almacena cliente actual para el modal
```

- [ ] **Step 6: Verificar sintaxis**

Extrae el bloque `<script>...</script>` de `agencia/public/index.html` a un archivo
temporal y corre:

```bash
node -c /tmp/script-extraido.js
```

(o, si tu editor ya marca errores de sintaxis en tiempo real dentro del `<script>`,
usa eso — el punto es confirmar que no quedó ninguna llave o paréntesis sin cerrar).
Expected: sin salida (sintaxis válida).

- [ ] **Step 7: Verificar en aislamiento la lógica de orden (`grupoStock`)**

No hay navegador disponible — se prueba la función pura con datos de ejemplo:

```bash
node -e "
function grupoStock(p){return (p.stock_actual!=null&&p.stock_minimo!=null&&p.stock_actual<=p.stock_minimo)?0:(p.stock_actual!=null?1:2)}
const productos=[
  {nombre:'Zeta',stock_actual:50,stock_minimo:10},
  {nombre:'Mug',stock_actual:2,stock_minimo:5},
  {nombre:'Avion',stock_actual:null,stock_minimo:null},
  {nombre:'Camiseta',stock_actual:3,stock_minimo:5}
];
productos.sort((a,b)=>grupoStock(a)-grupoStock(b)||a.nombre.localeCompare(b.nombre));
const orden=productos.map(p=>p.nombre).join(',');
console.log(orden);
if(orden!=='Camiseta,Mug,Zeta,Avion')throw new Error('Orden incorrecto: '+orden);
console.log('OK');
"
```

Expected: imprime `Camiseta,Mug,Zeta,Avion` y luego `OK` (los 2 de "stock bajo" primero,
alfabético entre ellos; después el sano; al final el "sin seguimiento").

- [ ] **Step 8: Commit**

```bash
cd "i:/AGENCIA PEDIDOS/agencia"
git add public/index.html
git commit -m "[FEATURE] Inventario: pestana propia con listado de solo lectura"
```

---

### Task 2: Edición de stock con guardado automático

**Files:**
- Modify: `agencia/public/index.html` (fila de `cargarInventario` ~línea 1741, función
  nueva ~línea 1747)

**Interfaces:**
- Consumes: `productos` (array global ya poblado por Task 1's `cargarInventario`),
  `api(m,p,b)` (ya existe, línea 1064), `toast(msg,ok)` (ya existe, línea 1293).
- Produces: `guardarStockInventario(fichaId,campo,valor)` — async, sin retorno.

- [ ] **Step 1: Reemplazar las 2 celdas de texto por inputs editables**

Busca (dentro de `cargarInventario`, agregada en Task 1):

```js
      <td>${p.stock_actual??'Sin seguimiento'}</td>
      <td>${p.stock_minimo??'—'}</td>
```

Reemplaza por:

```js
      <td><input class="item-inp" type="number" min="0" value="${p.stock_actual??''}" placeholder="Sin seguimiento" onblur="guardarStockInventario('${p.id}','stock_actual',this.value)"></td>
      <td><input class="item-inp" type="number" min="0" value="${p.stock_minimo??''}" placeholder="Opcional" onblur="guardarStockInventario('${p.id}','stock_minimo',this.value)"></td>
```

- [ ] **Step 2: Escribir `guardarStockInventario`**

Busca el cierre de `cargarInventario` (la función queda así tras el Step 1 de esta
tarea):

```js
  }).join('');
}

// Almacena cliente actual para el modal
```

Reemplaza por:

```js
  }).join('');
}
async function guardarStockInventario(fichaId,campo,valor){
  const p=productos.find(x=>x.id===fichaId);
  if(!p)return;
  const nuevo=valor===''?null:parseInt(valor,10);
  if(nuevo!=null&&(!Number.isInteger(nuevo)||nuevo<0)){
    toast('Stock no válido',false);
    cargarInventario(document.getElementById('inv-s').value);
    return;
  }
  try{
    await api('PUT',`/productos/${fichaId}`,{...p,[campo]:nuevo});
    toast('Stock actualizado ✓');
  }catch(e){toast(e.message,false)}
  cargarInventario(document.getElementById('inv-s').value);
}

// Almacena cliente actual para el modal
```

Nota: `{...p,[campo]:nuevo}` reenvía el objeto completo de la ficha (tal como lo
devuelve `GET /api/productos` — `fichaCompleta()` en el backend ya incluye todas las
columnas crudas más `insumos`/`componentes`/`rangos` con la forma exacta que
`PUT /api/productos/:id` espera), solo con el campo de stock tocado cambiado. Por eso no
hace falta transformar nada antes de reenviar.

- [ ] **Step 3: Verificar sintaxis**

Mismo procedimiento que Task 1 Step 6:

```bash
node -c /tmp/script-extraido.js
```

Expected: sin salida (sintaxis válida).

- [ ] **Step 4: Commit**

```bash
cd "i:/AGENCIA PEDIDOS/agencia"
git add public/index.html
git commit -m "[FEATURE] Inventario: edicion de stock con guardado automatico"
```

---

### Task 3: Quitar Stock del modal de Producto (sin perder datos ya guardados)

**Files:**
- Modify: `agencia/public/index.html` (HTML del modal ~línea 902-906, `resetProdForm`
  ~línea 2269, `abrirEditarProducto` ~línea 2309, `guardarProducto` ~línea 2363)

**Interfaces:**
- Produces: `fProdStockActual`, `fProdStockMinimo` — variables de módulo (mismo patrón
  que `fProdComboModo`/`fProdPrecioBaseRaw`), guardan el stock de la ficha en edición
  para reenviarlo sin tocar al guardar.
- Consumes: `editProdId` (ya existe) para distinguir crear vs editar.

**¿Por qué no se puede solo borrar los campos del HTML?** `PUT /api/productos/:id`
sobreescribe `stock_actual`/`stock_minimo` con lo que reciba en el body — si esos 2
campos faltan o vienen `undefined`, el backend los guarda como `null`. Si el modal de
Producto dejara de enviarlos, **cualquier edición de nombre/precio/categoría borraría el
stock ya cargado de ese producto en Inventario**. La solución es que el modal siga
sabiendo (en memoria, no en el DOM) cuál es el stock actual de la ficha que se edita, y
lo reenvíe sin cambios.

- [ ] **Step 1: Quitar la sección "Inventario (opcional)" del HTML del modal**

Busca (línea ~902-908):

```html
    <div class="msec"><span class="tri"></span>Inventario (opcional)</div>
    <div class="fr2 fg">
      <div><label>Stock actual</label><input type="number" id="prod-stock-actual" min="0" placeholder="Sin seguimiento"></div>
      <div><label>Stock mínimo (alerta)</label><input type="number" id="prod-stock-minimo" min="0" placeholder="Opcional"></div>
    </div>

    <div class="msec"><span class="tri"></span>Insumos (opcional)</div>
```

Reemplaza por:

```html
    <div class="msec"><span class="tri"></span>Insumos (opcional)</div>
```

- [ ] **Step 2: Declarar `fProdStockActual`/`fProdStockMinimo`**

Busca la línea de declaración de variables de estado del modal (línea ~2062):

```js
let fProdInsumos=[],fProdRangos=[],fProdComponentes=[],prodCatSel='',editProdId=null,fProdPrecioBaseRaw='',fProdPrecioSugeridoActual=null;
```

Reemplaza por:

```js
let fProdInsumos=[],fProdRangos=[],fProdComponentes=[],prodCatSel='',editProdId=null,fProdPrecioBaseRaw='',fProdPrecioSugeridoActual=null,fProdStockActual=null,fProdStockMinimo=null;
```

- [ ] **Step 3: Resetear el stock al abrir "Nuevo producto"**

Busca en `resetProdForm` (línea ~2281-2284):

```js
  document.getElementById('prod-activo').checked=true;
  document.getElementById('prod-stock-actual').value='';
  document.getElementById('prod-stock-minimo').value='';
  document.getElementById('prod-regla-lleva').value='';
```

Reemplaza por:

```js
  document.getElementById('prod-activo').checked=true;
  fProdStockActual=null;fProdStockMinimo=null;
  document.getElementById('prod-regla-lleva').value='';
```

- [ ] **Step 4: Cargar el stock existente al editar**

Busca en `abrirEditarProducto` (línea ~2322-2324):

```js
  document.getElementById('prod-activo').checked=!!p.activo;
  document.getElementById('prod-stock-actual').value=p.stock_actual??'';
  document.getElementById('prod-stock-minimo').value=p.stock_minimo??'';
  document.getElementById('prod-regla-lleva').value=p.regla_lleva??'';
```

Reemplaza por:

```js
  document.getElementById('prod-activo').checked=!!p.activo;
  fProdStockActual=p.stock_actual??null;
  fProdStockMinimo=p.stock_minimo??null;
  document.getElementById('prod-regla-lleva').value=p.regla_lleva??'';
```

- [ ] **Step 5: Reenviar el stock sin tocar al guardar**

Busca en `guardarProducto` (línea ~2374-2376):

```js
    activo:document.getElementById('prod-activo').checked,
    stock_actual:document.getElementById('prod-stock-actual').value===''?null:parseInt(document.getElementById('prod-stock-actual').value,10),
    stock_minimo:document.getElementById('prod-stock-minimo').value===''?null:parseInt(document.getElementById('prod-stock-minimo').value,10),
```

Reemplaza por:

```js
    activo:document.getElementById('prod-activo').checked,
    stock_actual:fProdStockActual,
    stock_minimo:fProdStockMinimo,
```

- [ ] **Step 6: Verificar sintaxis**

```bash
node -c /tmp/script-extraido.js
```

Expected: sin salida (sintaxis válida).

- [ ] **Step 7: Verificar en aislamiento que un producto nuevo parte en `null` y uno
  editado conserva su stock**

```bash
node -e "
let fProdStockActual=null,fProdStockMinimo=null;
function resetear(){fProdStockActual=null;fProdStockMinimo=null}
function cargarParaEditar(p){fProdStockActual=p.stock_actual??null;fProdStockMinimo=p.stock_minimo??null}
function bodyAEnviar(){return {stock_actual:fProdStockActual,stock_minimo:fProdStockMinimo}}

resetear();
const nuevo=bodyAEnviar();
if(nuevo.stock_actual!==null||nuevo.stock_minimo!==null)throw new Error('Producto nuevo deberia partir en null/null');
console.log('Nuevo producto: OK (null/null)');

cargarParaEditar({stock_actual:42,stock_minimo:5});
const editado=bodyAEnviar();
if(editado.stock_actual!==42||editado.stock_minimo!==5)throw new Error('Editar deberia conservar 42/5, dio '+JSON.stringify(editado));
console.log('Editar producto con stock: OK (conserva 42/5)');
"
```

Expected: imprime `Nuevo producto: OK (null/null)` y `Editar producto con stock: OK
(conserva 42/5)`.

- [ ] **Step 8: Commit**

```bash
cd "i:/AGENCIA PEDIDOS/agencia"
git add public/index.html
git commit -m "[FEATURE] Producto: quitar campos de stock del modal, se gestionan en Inventario"
```

---

### Task 4: Verificación final, checklist manual y push

**Files:** ninguno (solo verificación y publicación).

- [ ] **Step 1: Releer el archivo completo y confirmar que no quedó ninguna referencia
  muerta**

```bash
cd "i:/AGENCIA PEDIDOS/agencia"
grep -n "prod-stock-actual\|prod-stock-minimo" public/index.html
```

Expected: sin resultados (las 2 IDs ya no existen en ningún lado del archivo).

- [ ] **Step 2: `node -c` final sobre el archivo completo**

```bash
node -c public/index.html 2>&1 | head -5
```

(Si `node -c` se queja por ser HTML y no JS puro, extraer de nuevo el bloque
`<script>...</script>` a un archivo `.js` temporal y correr `node -c` sobre eso —
mismo procedimiento que las tareas anteriores.)

Expected: sin errores de sintaxis.

- [ ] **Step 3: Checklist manual para que el usuario pruebe en el navegador**

Avisar al usuario que confirme, tras el despliegue:
1. Abrir el modal de un producto cualquiera (nuevo o existente) y confirmar que la
   sección "Inventario (opcional)" ya no aparece.
2. Editar el nombre o precio de un producto que YA tenía stock cargado, guardar, y
   entrar a Inventario para confirmar que el stock sigue siendo el mismo (no se borró).
3. Entrar a la pestaña Inventario (sidebar en escritorio, botón "Más" en celular) y
   confirmar que aparecen los productos reales (no Combos ni Promociones).
4. Escribir un número en "Stock actual" de un producto, salir del campo (clic afuera) y
   confirmar el toast "Stock actualizado ✓".
5. Crear o ajustar un producto para que su stock quede en o por debajo del mínimo, y
   confirmar que aparece arriba de la lista con el badge "Stock bajo".
6. Buscar un producto por nombre en el buscador de Inventario y confirmar que filtra.

- [ ] **Step 4: Push**

Una vez confirmado lo anterior (o si Claude ya revisó el resultado y no quedan
pendientes de la sesión), publicar:

```bash
cd "i:/AGENCIA PEDIDOS/agencia"
git push origin main
```
