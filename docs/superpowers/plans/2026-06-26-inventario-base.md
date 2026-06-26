# Inventario Base Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stock opcional por ficha de producto, descontado automáticamente una sola vez por pedido (al crearlo como no-cotización o al confirmar una cotización), restaurado al cancelar/eliminar, con alerta visual de stock bajo.

**Architecture:** Tres columnas nuevas (`fichas_producto.stock_actual`/`stock_minimo`, `enc_items.ficha_id`, `pedidos.stock_consumido`). El vínculo ficha↔ítem lo establece el autocompletado de la Fase 2C (`selItem`). El descuento/restauración vive en dos funciones puras de backend (`descontarStock`/`restaurarStock`) invocadas en las transiciones de estado exactas del pedido — nunca en ediciones que no cambian esas transiciones, porque `saveEncargos` borra y recrea los ítems en cada guardado y no hay continuidad de id para diferenciar qué cambió.

**Tech Stack:** Node.js + Express + better-sqlite3 (backend), HTML/CSS/JS vanilla (frontend).

## Global Constraints

- Toda columna nueva en una tabla que ya existe necesita `ALTER TABLE ... ADD COLUMN` envuelto en `try/catch` — `CREATE TABLE IF NOT EXISTS` no le agrega columnas a una tabla ya creada (lección de la Fase 3, documentada en memoria).
- El descuento de stock ocurre **una sola vez por pedido**, nunca se recalcula en ediciones posteriores que no cambien `es_cotizacion`/`cancelado`.
- Productos sin `stock_actual` configurado (`NULL`) nunca participan de nada de esto — ni descuentan ni alertan.
- Sin validación de "stock suficiente" en este sub-proyecto — restar puede dejar stock negativo, es una señal de sobreventa, no un error que bloquee el guardado.
- Toda request del frontend pasa por `api()` ya existente. Nunca interpolar comillas simples crudas en `onclick`/`oninput`.
- Sin framework de tests — `node -c`, `curl`, y pruebas de lógica pura con Node donde aplique.
- `git push origin main` no requiere confirmación previa (autorización del usuario, 2026-06-25) — va al final, después de toda la verificación.

---

## Task 1: Backend — columnas de stock en fichas de producto + validación

**Files:**
- Modify: `agencia/server.js` (migraciones; `validarFicha`; `POST`/`PUT /api/productos`)

**Interfaces:**
- Produces: columnas `fichas_producto.stock_actual`/`stock_minimo` (INTEGER, nullable). `fichaCompleta(f)` ya las devuelve sin cambios (vía `SELECT *`).

- [ ] **Step 1: Migración**

En `server.js`, inmediatamente después de las 3 líneas de `ALTER TABLE configuracion_negocio` que ya agregaron las columnas de IVA (Fase 3), agregar:

```js
try { db.exec("ALTER TABLE fichas_producto ADD COLUMN stock_actual INTEGER"); } catch(e){}
try { db.exec("ALTER TABLE fichas_producto ADD COLUMN stock_minimo INTEGER"); } catch(e){}
```

(Verificar primero con `grep -n "ALTER TABLE configuracion_negocio ADD COLUMN iva_desglosado" agencia/server.js` cuál es el bloque exacto antes de editar — ese `try` es único en el archivo.)

- [ ] **Step 2: Validación en `validarFicha`**

En `server.js`, cambiar:

```js
  if(definido(b.precio_base)&&evalExpr(b.precio_base)===null)errores.push('El Precio base no es una expresión válida');
  (b.insumos||[]).forEach((it,i)=>{
```

por:

```js
  if(definido(b.precio_base)&&evalExpr(b.precio_base)===null)errores.push('El Precio base no es una expresión válida');
  if(definido(b.stock_actual)&&(!Number.isInteger(b.stock_actual)||b.stock_actual<0))errores.push('Stock actual no es un número válido');
  if(definido(b.stock_minimo)&&(!Number.isInteger(b.stock_minimo)||b.stock_minimo<0))errores.push('Stock mínimo no es un número válido');
  (b.insumos||[]).forEach((it,i)=>{
```

- [ ] **Step 3: Persistir en `POST /api/productos`**

Cambiar:

```js
    db.prepare(`INSERT INTO fichas_producto(id,workspace_id,nombre,categoria_id,tipo_precio,margen_tipo,margen_valor,precio_base,precio_base_calc,rangos,fecha_inicio,fecha_fin,cantidad_minima,descripcion,activo)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
      .run(id,req.wsId,b.nombre.trim(),b.categoria_id||'',b.tipo_precio||'unitario',b.margen_tipo||'fijo',b.margen_valor||'',normVF(b.precio_base),normCalc(b.precio_base),JSON.stringify(b.rangos||[]),b.fecha_inicio||'',b.fecha_fin||'',b.cantidad_minima||'',b.descripcion||'',b.activo===false?0:1);
```

por:

```js
    db.prepare(`INSERT INTO fichas_producto(id,workspace_id,nombre,categoria_id,tipo_precio,margen_tipo,margen_valor,precio_base,precio_base_calc,rangos,fecha_inicio,fecha_fin,cantidad_minima,descripcion,activo,stock_actual,stock_minimo)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
      .run(id,req.wsId,b.nombre.trim(),b.categoria_id||'',b.tipo_precio||'unitario',b.margen_tipo||'fijo',b.margen_valor||'',normVF(b.precio_base),normCalc(b.precio_base),JSON.stringify(b.rangos||[]),b.fecha_inicio||'',b.fecha_fin||'',b.cantidad_minima||'',b.descripcion||'',b.activo===false?0:1,Number.isInteger(b.stock_actual)?b.stock_actual:null,Number.isInteger(b.stock_minimo)?b.stock_minimo:null);
```

- [ ] **Step 4: Persistir en `PUT /api/productos/:id`**

Cambiar:

```js
    db.prepare(`UPDATE fichas_producto SET nombre=?,categoria_id=?,tipo_precio=?,margen_tipo=?,margen_valor=?,precio_base=?,precio_base_calc=?,rangos=?,fecha_inicio=?,fecha_fin=?,cantidad_minima=?,descripcion=?,activo=? WHERE id=? AND workspace_id=?`)
      .run(b.nombre.trim(),b.categoria_id||'',b.tipo_precio||'unitario',b.margen_tipo||'fijo',b.margen_valor||'',normVF(b.precio_base),normCalc(b.precio_base),JSON.stringify(b.rangos||[]),b.fecha_inicio||'',b.fecha_fin||'',b.cantidad_minima||'',b.descripcion||'',b.activo===false?0:1,fid,req.wsId);
```

por:

```js
    db.prepare(`UPDATE fichas_producto SET nombre=?,categoria_id=?,tipo_precio=?,margen_tipo=?,margen_valor=?,precio_base=?,precio_base_calc=?,rangos=?,fecha_inicio=?,fecha_fin=?,cantidad_minima=?,descripcion=?,activo=?,stock_actual=?,stock_minimo=? WHERE id=? AND workspace_id=?`)
      .run(b.nombre.trim(),b.categoria_id||'',b.tipo_precio||'unitario',b.margen_tipo||'fijo',b.margen_valor||'',normVF(b.precio_base),normCalc(b.precio_base),JSON.stringify(b.rangos||[]),b.fecha_inicio||'',b.fecha_fin||'',b.cantidad_minima||'',b.descripcion||'',b.activo===false?0:1,Number.isInteger(b.stock_actual)?b.stock_actual:null,Number.isInteger(b.stock_minimo)?b.stock_minimo:null,fid,req.wsId);
```

- [ ] **Step 5: Verificar sintaxis**

Run: `cd "i:/AGENCIA PEDIDOS/agencia" && node -c server.js && echo OK`
Expected: `OK`.

- [ ] **Step 6: Probar con curl**

Run (verificar primero que el puerto 3000 está libre):
```bash
cd "i:/AGENCIA PEDIDOS/agencia"
npm start &
for i in 1 2 3 4 5 6 7 8 9 10; do curl -s -m 1 http://localhost:3000/ -o /dev/null && break; sleep 1; done
TOKEN=$(curl -s -m 5 -X POST http://localhost:3000/api/auth/login -H "Content-Type: application/json" -d '{"pin":"1234"}' | grep -o '"token":"[^"]*"' | cut -d'"' -f4)

echo "--- crear ficha con stock ---"
RESP=$(curl -s -m 5 -X POST http://localhost:3000/api/productos -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{"nombre":"Vaso termico","stock_actual":20,"stock_minimo":5}')
echo "$RESP" | grep -o '"stock_actual":[0-9]*\|"stock_minimo":[0-9]*'
FID=$(echo "$RESP" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)

echo "--- stock invalido debe fallar 400 ---"
curl -s -m 5 -w "\nHTTP %{http_code}\n" -X PUT "http://localhost:3000/api/productos/$FID" -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{"nombre":"Vaso termico","stock_actual":-5}'

echo "--- limpieza ---"
curl -s -m 5 -X DELETE "http://localhost:3000/api/productos/$FID" -H "Authorization: Bearer $TOKEN" -o /dev/null

PID=$(netstat -ano | grep ':3000' | grep LISTENING | head -1 | awk '{print $NF}'); [ -n "$PID" ] && taskkill //F //PID "$PID"
```
Expected: `"stock_actual":20 "stock_minimo":5`; el PUT con stock negativo da `HTTP 400`.

- [ ] **Step 7: Commit**

```bash
cd "i:/AGENCIA PEDIDOS/agencia"
git add server.js
git commit -m "[FEATURE] Inventario: stock_actual/stock_minimo en fichas de producto (Fase 4-A)"
```

---

## Task 2: Backend — vínculo ficha↔ítem, descuento y restauración automática

**Files:**
- Modify: `agencia/server.js` (migraciones; `saveEncargos`; nuevas `descontarStock`/`restaurarStock`; `POST`/`PUT`/`DELETE /api/pedidos`)

**Interfaces:**
- Produces: columna `enc_items.ficha_id` (TEXT, nullable); columna `pedidos.stock_consumido` (TEXT JSON, nullable); `descontarStock(pid,wsId)` (lee los ítems ya guardados del pedido, resta de `fichas_producto.stock_actual`, devuelve `[{ficha_id,cantidad},...]`); `restaurarStock(stockConsumidoJSON,wsId)` (inverso).

- [ ] **Step 1: Migraciones**

En `server.js`, en el mismo bloque de migraciones de la Task 1, agregar:

```js
try { db.exec("ALTER TABLE enc_items ADD COLUMN ficha_id TEXT"); } catch(e){}
try { db.exec("ALTER TABLE pedidos ADD COLUMN stock_consumido TEXT"); } catch(e){}
```

- [ ] **Step 2: `saveEncargos` persiste `ficha_id`**

Cambiar:

```js
    (enc.items||[]).forEach((it,j)=>{
      db.prepare('INSERT INTO enc_items(id,encargo_id,cantidad,detalle,valor_unitario,valor_unitario_calc,orden,workspace_id)VALUES(?,?,?,?,?,?,?,?)').run(uid(),eid,it.cantidad||'',it.detalle||'',it.valor_unitario||'0',normCalc(it.valor_unitario)||'0',j,wsId);
    });
```

por:

```js
    (enc.items||[]).forEach((it,j)=>{
      db.prepare('INSERT INTO enc_items(id,encargo_id,cantidad,detalle,valor_unitario,valor_unitario_calc,ficha_id,orden,workspace_id)VALUES(?,?,?,?,?,?,?,?,?)').run(uid(),eid,it.cantidad||'',it.detalle||'',it.valor_unitario||'0',normCalc(it.valor_unitario)||'0',it.ficha_id||null,j,wsId);
    });
```

- [ ] **Step 3: `descontarStock`/`restaurarStock`**

Inmediatamente después del cierre de `saveEncargos` (la función completa termina con `}\n}` justo antes de `function asegurarCliente`), agregar:

```js
function descontarStock(pid,wsId){
  const encargos=db.prepare('SELECT id FROM encargos WHERE pedido_id=?').all(pid);
  const consumo={};
  encargos.forEach(enc=>{
    const items=db.prepare('SELECT cantidad,ficha_id FROM enc_items WHERE encargo_id=? AND ficha_id IS NOT NULL').all(enc.id);
    items.forEach(it=>{
      consumo[it.ficha_id]=(consumo[it.ficha_id]||0)+toNum(it.cantidad);
    });
  });
  const resultado=[];
  Object.entries(consumo).forEach(([fichaId,cantidad])=>{
    const ficha=db.prepare('SELECT stock_actual FROM fichas_producto WHERE id=? AND workspace_id=?').get(fichaId,wsId);
    if(!ficha||ficha.stock_actual==null)return;
    db.prepare('UPDATE fichas_producto SET stock_actual=stock_actual-? WHERE id=?').run(cantidad,fichaId);
    resultado.push({ficha_id:fichaId,cantidad});
  });
  return resultado;
}
function restaurarStock(stockConsumidoJSON,wsId){
  let lista=[];
  try{lista=JSON.parse(stockConsumidoJSON||'[]')}catch(e){lista=[]}
  lista.forEach(item=>{
    db.prepare('UPDATE fichas_producto SET stock_actual=stock_actual+? WHERE id=? AND workspace_id=?').run(item.cantidad,item.ficha_id,wsId);
  });
}
```

- [ ] **Step 4: Verificar sintaxis**

Run: `cd "i:/AGENCIA PEDIDOS/agencia" && node -c server.js && echo OK`
Expected: `OK`.

- [ ] **Step 5: `POST /api/pedidos` descuenta si no es cotización**

Cambiar:

```js
    saveEncargos(id,b.encargos,req.wsId);
    (b.pagos||[]).forEach(pg=>db.prepare('INSERT INTO pagos(id,pedido_id,monto,monto_calc,fecha,tipo,nota,workspace_id)VALUES(?,?,?,?,?,?,?,?)').run(uid(),id,pg.monto||'',normCalc(pg.monto),pg.fecha||hoy(req.wsId),pg.tipo||'efectivo',pg.nota||'',req.wsId));
    (b.costos||[]).forEach(c=>db.prepare('INSERT INTO costos(id,pedido_id,encargo_id,descripcion,cantidad,valor_unitario,valor_unitario_calc,monto,monto_calc,workspace_id)VALUES(?,?,?,?,?,?,?,?,?,?)').run(uid(),id,c.encargo_id||'',c.descripcion||'',c.cantidad||'',c.valor_unitario||'',normCalc(c.valor_unitario),c.monto||'',normCalc(c.monto),req.wsId));
    addHist(id,'Pedido creado',req.wsId);
```

por:

```js
    saveEncargos(id,b.encargos,req.wsId);
    (b.pagos||[]).forEach(pg=>db.prepare('INSERT INTO pagos(id,pedido_id,monto,monto_calc,fecha,tipo,nota,workspace_id)VALUES(?,?,?,?,?,?,?,?)').run(uid(),id,pg.monto||'',normCalc(pg.monto),pg.fecha||hoy(req.wsId),pg.tipo||'efectivo',pg.nota||'',req.wsId));
    (b.costos||[]).forEach(c=>db.prepare('INSERT INTO costos(id,pedido_id,encargo_id,descripcion,cantidad,valor_unitario,valor_unitario_calc,monto,monto_calc,workspace_id)VALUES(?,?,?,?,?,?,?,?,?,?)').run(uid(),id,c.encargo_id||'',c.descripcion||'',c.cantidad||'',c.valor_unitario||'',normCalc(c.valor_unitario),c.monto||'',normCalc(c.monto),req.wsId));
    if(!b.es_cotizacion){
      const consumo=descontarStock(id,req.wsId);
      db.prepare('UPDATE pedidos SET stock_consumido=? WHERE id=?').run(JSON.stringify(consumo),id);
    }
    addHist(id,'Pedido creado',req.wsId);
```

- [ ] **Step 6: `PUT /api/pedidos/:id` descuenta al confirmar cotización, restaura al cancelar**

Cambiar:

```js
    if(b.encargos!==undefined)saveEncargos(pid,b.encargos,req.wsId);
    if(b.pagos!==undefined){db.prepare('DELETE FROM pagos WHERE pedido_id=? AND workspace_id=?').run(pid,req.wsId);(b.pagos||[]).forEach(pg=>db.prepare('INSERT INTO pagos(id,pedido_id,monto,monto_calc,fecha,tipo,nota,workspace_id)VALUES(?,?,?,?,?,?,?,?)').run(uid(),pid,pg.monto||'',normCalc(pg.monto),pg.fecha||hoy(req.wsId),pg.tipo||'efectivo',pg.nota||'',req.wsId));}
    if(b.costos!==undefined){db.prepare('DELETE FROM costos WHERE pedido_id=? AND workspace_id=?').run(pid,req.wsId);(b.costos||[]).forEach(c=>db.prepare('INSERT INTO costos(id,pedido_id,encargo_id,descripcion,cantidad,valor_unitario,valor_unitario_calc,monto,monto_calc,workspace_id)VALUES(?,?,?,?,?,?,?,?,?,?)').run(uid(),pid,c.encargo_id||'',c.descripcion||'',c.cantidad||'',c.valor_unitario||'',normCalc(c.valor_unitario),c.monto||'',normCalc(c.monto),req.wsId));}
    res.json(pedidoCompleto(db.prepare('SELECT * FROM pedidos WHERE id=?').get(pid)));
```

por:

```js
    if(b.encargos!==undefined)saveEncargos(pid,b.encargos,req.wsId);
    if(b.pagos!==undefined){db.prepare('DELETE FROM pagos WHERE pedido_id=? AND workspace_id=?').run(pid,req.wsId);(b.pagos||[]).forEach(pg=>db.prepare('INSERT INTO pagos(id,pedido_id,monto,monto_calc,fecha,tipo,nota,workspace_id)VALUES(?,?,?,?,?,?,?,?)').run(uid(),pid,pg.monto||'',normCalc(pg.monto),pg.fecha||hoy(req.wsId),pg.tipo||'efectivo',pg.nota||'',req.wsId));}
    if(b.costos!==undefined){db.prepare('DELETE FROM costos WHERE pedido_id=? AND workspace_id=?').run(pid,req.wsId);(b.costos||[]).forEach(c=>db.prepare('INSERT INTO costos(id,pedido_id,encargo_id,descripcion,cantidad,valor_unitario,valor_unitario_calc,monto,monto_calc,workspace_id)VALUES(?,?,?,?,?,?,?,?,?,?)').run(uid(),pid,c.encargo_id||'',c.descripcion||'',c.cantidad||'',c.valor_unitario||'',normCalc(c.valor_unitario),c.monto||'',normCalc(c.monto),req.wsId));}
    let stockConsumidoActual=p.stock_consumido;
    if(!b.es_cotizacion&&p.es_cotizacion&&!stockConsumidoActual){
      const consumo=descontarStock(pid,req.wsId);
      stockConsumidoActual=JSON.stringify(consumo);
      db.prepare('UPDATE pedidos SET stock_consumido=? WHERE id=?').run(stockConsumidoActual,pid);
    }
    if(b.cancelado&&!p.cancelado&&stockConsumidoActual){
      restaurarStock(stockConsumidoActual,req.wsId);
      db.prepare('UPDATE pedidos SET stock_consumido=NULL WHERE id=?').run(pid);
    }
    res.json(pedidoCompleto(db.prepare('SELECT * FROM pedidos WHERE id=?').get(pid)));
```

(El orden importa: si en la misma edición una cotización se confirma Y se cancela a la vez, primero se descuenta y enseguida se restaura — el stock queda sin cambio neto, que es lo correcto: nunca llegó a ser un compromiso real.)

- [ ] **Step 7: `DELETE /api/pedidos/:id` restaura si había consumido stock**

Cambiar:

```js
app.delete('/api/pedidos/:id',(req,res)=>{
  const r=db.prepare('DELETE FROM pedidos WHERE id=? AND workspace_id=?').run(req.params.id,req.wsId);
  if(r.changes===0)return res.status(404).json({error:'No encontrado'});
  res.json({ok:true});
});
```

por:

```js
app.delete('/api/pedidos/:id',(req,res)=>{
  const p=db.prepare('SELECT stock_consumido FROM pedidos WHERE id=? AND workspace_id=?').get(req.params.id,req.wsId);
  if(!p)return res.status(404).json({error:'No encontrado'});
  if(p.stock_consumido)restaurarStock(p.stock_consumido,req.wsId);
  db.prepare('DELETE FROM pedidos WHERE id=? AND workspace_id=?').run(req.params.id,req.wsId);
  res.json({ok:true});
});
```

- [ ] **Step 8: Verificar sintaxis**

Run: igual que Step 4.
Expected: `OK`.

- [ ] **Step 9: Probar el flujo completo con curl**

Run (verificar primero que el puerto 3000 está libre):
```bash
cd "i:/AGENCIA PEDIDOS/agencia"
npm start &
for i in 1 2 3 4 5 6 7 8 9 10; do curl -s -m 1 http://localhost:3000/ -o /dev/null && break; sleep 1; done
TOKEN=$(curl -s -m 5 -X POST http://localhost:3000/api/auth/login -H "Content-Type: application/json" -d '{"pin":"1234"}' | grep -o '"token":"[^"]*"' | cut -d'"' -f4)

echo "--- ficha con stock 20 ---"
FID=$(curl -s -m 5 -X POST http://localhost:3000/api/productos -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{"nombre":"Vaso termico","stock_actual":20}' | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)

echo "--- crear COTIZACION con 5 unidades: el stock NO debe tocarse ---"
PID1=$(curl -s -m 5 -X POST http://localhost:3000/api/pedidos -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d "{\"nombre\":\"Test Inventario\",\"es_cotizacion\":true,\"encargos\":[{\"items\":[{\"cantidad\":\"5\",\"detalle\":\"Vaso termico\",\"ficha_id\":\"$FID\"}]}]}" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
curl -s -m 5 "http://localhost:3000/api/productos/$FID" -H "Authorization: Bearer $TOKEN" | grep -o '"stock_actual":[0-9-]*'

echo "--- convertir esa cotizacion en pedido real: el stock SI debe bajar a 15 ---"
curl -s -m 5 -X PUT "http://localhost:3000/api/pedidos/$PID1" -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d "{\"es_cotizacion\":false,\"encargos\":[{\"items\":[{\"cantidad\":\"5\",\"detalle\":\"Vaso termico\",\"ficha_id\":\"$FID\"}]}]}" -o /dev/null
curl -s -m 5 "http://localhost:3000/api/productos/$FID" -H "Authorization: Bearer $TOKEN" | grep -o '"stock_actual":[0-9-]*'

echo "--- volver a editar SIN tocar es_cotizacion/cancelado (ej. solo cambiar cantidad a 8): el stock NO se vuelve a tocar ---"
curl -s -m 5 -X PUT "http://localhost:3000/api/pedidos/$PID1" -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d "{\"encargos\":[{\"items\":[{\"cantidad\":\"8\",\"detalle\":\"Vaso termico\",\"ficha_id\":\"$FID\"}]}]}" -o /dev/null
curl -s -m 5 "http://localhost:3000/api/productos/$FID" -H "Authorization: Bearer $TOKEN" | grep -o '"stock_actual":[0-9-]*'

echo "--- cancelar: debe restaurar +5 (lo que se desconto originalmente, NO los 8 actuales) -> vuelve a 20 ---"
curl -s -m 5 -X PUT "http://localhost:3000/api/pedidos/$PID1" -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{"cancelado":true}' -o /dev/null
curl -s -m 5 "http://localhost:3000/api/productos/$FID" -H "Authorization: Bearer $TOKEN" | grep -o '"stock_actual":[0-9-]*'

echo "--- crear un pedido real directo (no cotizacion) con 3 unidades: stock pasa a 17 ---"
PID2=$(curl -s -m 5 -X POST http://localhost:3000/api/pedidos -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d "{\"nombre\":\"Test Inventario 2\",\"encargos\":[{\"items\":[{\"cantidad\":\"3\",\"detalle\":\"Vaso termico\",\"ficha_id\":\"$FID\"}]}]}" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
curl -s -m 5 "http://localhost:3000/api/productos/$FID" -H "Authorization: Bearer $TOKEN" | grep -o '"stock_actual":[0-9-]*'

echo "--- eliminarlo (DELETE, no cancelar): debe restaurar +3 -> vuelve a 20 ---"
curl -s -m 5 -X DELETE "http://localhost:3000/api/pedidos/$PID2" -H "Authorization: Bearer $TOKEN" -o /dev/null
curl -s -m 5 "http://localhost:3000/api/productos/$FID" -H "Authorization: Bearer $TOKEN" | grep -o '"stock_actual":[0-9-]*'

echo "--- limpieza ---"
curl -s -m 5 -X DELETE "http://localhost:3000/api/pedidos/$PID1" -H "Authorization: Bearer $TOKEN" -o /dev/null
curl -s -m 5 -X DELETE "http://localhost:3000/api/productos/$FID" -H "Authorization: Bearer $TOKEN" -o /dev/null

PID=$(netstat -ano | grep ':3000' | grep LISTENING | head -1 | awk '{print $NF}'); [ -n "$PID" ] && taskkill //F //PID "$PID"
```
Expected, en orden: `"stock_actual":20` (cotización no toca nada) → `"stock_actual":15` (confirmar sí descuenta) → `"stock_actual":15` (editar cantidad sin tocar es_cotizacion/cancelado no vuelve a tocar el stock, aunque la cantidad ya guardada sea 8) → `"stock_actual":20` (cancelar restaura los 5 originales, no los 8 actuales) → `"stock_actual":17` (pedido real directo descuenta 3) → `"stock_actual":20` (eliminarlo restaura).

- [ ] **Step 10: Commit**

```bash
cd "i:/AGENCIA PEDIDOS/agencia"
git add server.js
git commit -m "[FEATURE] Inventario: descuento y restauracion automatica de stock (Fase 4-A)"
```

---

## Task 3: Frontend — campos de stock en la ficha de producto y alerta de stock bajo

**Files:**
- Modify: `agencia/public/index.html` (markup del modal de Producto; `resetProdForm`; `abrirEditarProducto`; `guardarProducto`; `cargarProductos`)

**Interfaces:**
- Consumes: nada nuevo, solo extiende funciones ya existentes de la Fase 2A+2B.

- [ ] **Step 1: Markup — campos de Stock**

En `public/index.html`, cambiar:

```html
    <div class="ck-box" style="display:inline-flex;margin:12px 0"><input type="checkbox" id="prod-activo" checked><label for="prod-activo">Activo</label></div>

    <div class="msec"><span class="tri"></span>Insumos (opcional)</div>
```

por:

```html
    <div class="ck-box" style="display:inline-flex;margin:12px 0"><input type="checkbox" id="prod-activo" checked><label for="prod-activo">Activo</label></div>

    <div class="msec"><span class="tri"></span>Inventario (opcional)</div>
    <div class="fr2 fg">
      <div><label>Stock actual</label><input type="number" id="prod-stock-actual" min="0" placeholder="Sin seguimiento"></div>
      <div><label>Stock mínimo (alerta)</label><input type="number" id="prod-stock-minimo" min="0" placeholder="Opcional"></div>
    </div>

    <div class="msec"><span class="tri"></span>Insumos (opcional)</div>
```

- [ ] **Step 2: `resetProdForm` limpia los campos nuevos**

Cambiar:

```js
  document.getElementById('prod-activo').checked=true;
  document.getElementById('prod-fecha-inicio').value='';
```

por:

```js
  document.getElementById('prod-activo').checked=true;
  document.getElementById('prod-stock-actual').value='';
  document.getElementById('prod-stock-minimo').value='';
  document.getElementById('prod-fecha-inicio').value='';
```

- [ ] **Step 3: `abrirEditarProducto` pinta los campos nuevos**

Cambiar:

```js
  document.getElementById('prod-activo').checked=!!p.activo;
  document.getElementById('prod-fecha-inicio').value=p.fecha_inicio||'';
```

por:

```js
  document.getElementById('prod-activo').checked=!!p.activo;
  document.getElementById('prod-stock-actual').value=p.stock_actual??'';
  document.getElementById('prod-stock-minimo').value=p.stock_minimo??'';
  document.getElementById('prod-fecha-inicio').value=p.fecha_inicio||'';
```

- [ ] **Step 4: `guardarProducto` manda los campos nuevos**

Cambiar:

```js
    activo:document.getElementById('prod-activo').checked,
    insumos:fProdInsumos,
```

por:

```js
    activo:document.getElementById('prod-activo').checked,
    stock_actual:document.getElementById('prod-stock-actual').value===''?null:parseInt(document.getElementById('prod-stock-actual').value,10),
    stock_minimo:document.getElementById('prod-stock-minimo').value===''?null:parseInt(document.getElementById('prod-stock-minimo').value,10),
    insumos:fProdInsumos,
```

- [ ] **Step 5: Badge "Stock bajo" en la lista**

Cambiar:

```js
        <div class="cli-sub">${cat?`<span class="ttag ${cat.tc}">${cat.label}</span> `:''}<span class="b-tipo">${TIPO_LABEL[p.tipo_precio]||p.tipo_precio}</span> ${!p.activo?'<span class="b-canc">Inactivo</span>':''}</div>
```

por:

```js
        <div class="cli-sub">${cat?`<span class="ttag ${cat.tc}">${cat.label}</span> `:''}<span class="b-tipo">${TIPO_LABEL[p.tipo_precio]||p.tipo_precio}</span> ${!p.activo?'<span class="b-canc">Inactivo</span>':''} ${(p.stock_actual!=null&&p.stock_minimo!=null&&p.stock_actual<=p.stock_minimo)?'<span class="b-pend">Stock bajo</span>':''}</div>
```

- [ ] **Step 6: Verificar sintaxis**

Run:
```bash
cd "i:/AGENCIA PEDIDOS/agencia"
SCRATCH="C:/Users/ADMIN/AppData/Local/Temp/claude/i--AGENCIA-PEDIDOS/8d8d31ac-5619-43aa-9270-0aa1f2328221/scratchpad"
awk '/<script>/{f=1;next}/<\/script>/{f=0}f' public/index.html > "$SCRATCH/check.js"
node -c "$SCRATCH/check.js" && echo OK
```
Expected: `OK`.

- [ ] **Step 7: Verificación funcional**

Run:
```bash
cd "i:/AGENCIA PEDIDOS/agencia"
npm start &
for i in 1 2 3 4 5 6 7 8 9 10; do curl -s -m 1 http://localhost:3000/ -o /dev/null && break; sleep 1; done
curl -s -m 5 http://localhost:3000/ | grep -c 'prod-stock-actual\|prod-stock-minimo\|Stock bajo'
PID=$(netstat -ano | grep ':3000' | grep LISTENING | head -1 | awk '{print $NF}'); [ -n "$PID" ] && taskkill //F //PID "$PID"
```
Expected: al menos `3`.

- [ ] **Step 8: Commit**

```bash
cd "i:/AGENCIA PEDIDOS/agencia"
git add public/index.html
git commit -m "[FEATURE] Inventario: campos de stock en la ficha y alerta de stock bajo (Fase 4-A)"
```

---

## Task 4: Frontend — el autocompletado de Encargos guarda el vínculo `ficha_id`

**Files:**
- Modify: `agencia/public/index.html` (`selItem`, Fase 2C)

**Interfaces:**
- Modifica `it.ficha_id` además de lo que `selItem` ya hace — el resto del flujo (envío del payload en `guardar()`) ya manda `encargos:fEnc` completo sin cambios.

- [ ] **Step 1: `selItem` guarda `ficha_id`**

Cambiar:

```js
  it.detalle=p.nombre;
  it._fichaSel=p;
```

por:

```js
  it.detalle=p.nombre;
  it._fichaSel=p;
  it.ficha_id=p.id;
```

- [ ] **Step 2: Verificar sintaxis**

Run: igual que Task 3 Step 6.
Expected: `OK`.

- [ ] **Step 3: Commit**

```bash
cd "i:/AGENCIA PEDIDOS/agencia"
git add public/index.html
git commit -m "[FEATURE] Inventario: el autocompletado de Encargos vincula ficha_id (Fase 4-A)"
```

---

## Task 5: Verificación final

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

- [ ] **Step 2: Regresión completa + estado del repo**

Run (servidor levantado, mismo patrón de espera): repetir contra `/api/pedidos`, `/api/clientes`, `/api/configuracion`, `/api/productos` — confirmar `HTTP 200` en los 4. Confirmar `git status --short` sin cambios sin commitear y `git log --oneline -6` mostrando los 4 commits de feature de este plan.

- [ ] **Step 3: Checklist manual para el usuario (el agente no tiene navegador)**

Pedir al usuario que, en `npm start`, confirme:
1. En un producto, configurar Stock actual y Stock mínimo, guardar, reabrir: los valores persisten.
2. Dejar el stock por debajo del mínimo (ej. actual 3, mínimo 5): la card del producto muestra el badge "Stock bajo".
3. Crear un pedido (no cotización) seleccionando ese producto vía autocompletado en un encargo con cierta cantidad: el stock del producto baja exactamente esa cantidad.
4. Cancelar ese pedido: el stock vuelve al valor original.
5. Crear una Cotización con ese producto: el stock NO se mueve. Confirmarla (desmarcar "Cotización" y guardar): ahí sí baja.
6. Un producto sin Stock actual configurado (vacío) nunca muestra el badge ni se ve afectado por ningún pedido.

- [ ] **Step 4: Push**

```bash
git push origin main
```
