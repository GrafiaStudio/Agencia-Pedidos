const express=require('express');
const Database=require('better-sqlite3');
const multer=require('multer');
const cors=require('cors');
const path=require('path');
const fs=require('fs');

const app=express();
const PORT=process.env.PORT||3000;

const DB_DIR=path.join(__dirname,'db');
const UP_DIR=path.join(__dirname,'public','uploads');
[DB_DIR,UP_DIR].forEach(d=>{if(!fs.existsSync(d))fs.mkdirSync(d,{recursive:true})});

const db=new Database(path.join(DB_DIR,'agencia.db'));
db.pragma('journal_mode=WAL');
db.pragma('foreign_keys=ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS clientes(
    id TEXT PRIMARY KEY,nombre TEXT NOT NULL,tel TEXT,email TEXT,notas TEXT,
    creado TEXT DEFAULT(datetime('now','localtime'))
  );
  CREATE TABLE IF NOT EXISTS pedidos(
    id TEXT PRIMARY KEY,ref TEXT UNIQUE NOT NULL,cliente_id TEXT REFERENCES clientes(id),
    nombre TEXT NOT NULL,tel TEXT,
    urgente INTEGER DEFAULT 0,
    entregado INTEGER DEFAULT 0,
    cancelado INTEGER DEFAULT 0,
    pendiente_pago INTEGER DEFAULT 0,
    fecha_pedido TEXT,fecha_entrega TEXT,
    notas TEXT,
    valor_total TEXT DEFAULT '0',
    creado TEXT DEFAULT(datetime('now','localtime')),
    modificado TEXT DEFAULT(datetime('now','localtime'))
  );
  CREATE TABLE IF NOT EXISTS encargos(
    id TEXT PRIMARY KEY,
    pedido_id TEXT REFERENCES pedidos(id) ON DELETE CASCADE,
    numero INTEGER DEFAULT 1,
    categoria TEXT DEFAULT '',
    subcategoria TEXT DEFAULT '',
    estado TEXT DEFAULT 'Nuevo',
    valor TEXT DEFAULT '0',
    anotacion TEXT DEFAULT '',
    orden INTEGER DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS enc_items(
    id TEXT PRIMARY KEY,
    encargo_id TEXT REFERENCES encargos(id) ON DELETE CASCADE,
    cantidad TEXT DEFAULT '',
    detalle TEXT DEFAULT '',
    orden INTEGER DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS pagos(
    id TEXT PRIMARY KEY,pedido_id TEXT REFERENCES pedidos(id) ON DELETE CASCADE,
    monto TEXT,fecha TEXT,tipo TEXT DEFAULT 'efectivo',nota TEXT,
    creado TEXT DEFAULT(datetime('now','localtime'))
  );
  CREATE TABLE IF NOT EXISTS costos(
    id TEXT PRIMARY KEY,pedido_id TEXT REFERENCES pedidos(id) ON DELETE CASCADE,
    encargo_id TEXT,
    descripcion TEXT,monto TEXT,
    creado TEXT DEFAULT(datetime('now','localtime'))
  );
  CREATE TABLE IF NOT EXISTS historial(
    id TEXT PRIMARY KEY,pedido_id TEXT REFERENCES pedidos(id) ON DELETE CASCADE,
    texto TEXT,fecha TEXT,hora TEXT,
    creado TEXT DEFAULT(datetime('now','localtime'))
  );
  CREATE TABLE IF NOT EXISTS archivos(
    id TEXT PRIMARY KEY,pedido_id TEXT REFERENCES pedidos(id) ON DELETE CASCADE,
    nombre TEXT,tipo TEXT,ruta TEXT,
    creado TEXT DEFAULT(datetime('now','localtime'))
  );
  CREATE TABLE IF NOT EXISTS counter(id INTEGER PRIMARY KEY CHECK(id=1),valor INTEGER DEFAULT 1);
  INSERT OR IGNORE INTO counter(id,valor)VALUES(1,1);
`);

// Migrations - add columns if missing
try { db.exec("ALTER TABLE pedidos ADD COLUMN entregado INTEGER DEFAULT 0"); } catch(e){}
try { db.exec("ALTER TABLE pedidos ADD COLUMN cancelado INTEGER DEFAULT 0"); } catch(e){}
try { db.exec("ALTER TABLE pedidos ADD COLUMN pendiente_pago INTEGER DEFAULT 0"); } catch(e){}
try { db.exec("ALTER TABLE pedidos ADD COLUMN valor_total TEXT DEFAULT '0'"); } catch(e){}
try { db.exec("ALTER TABLE encargos ADD COLUMN valor TEXT DEFAULT '0'"); } catch(e){}
try { db.exec("ALTER TABLE encargos ADD COLUMN anotacion TEXT DEFAULT ''"); } catch(e){}
try { db.exec("ALTER TABLE encargos ADD COLUMN numero INTEGER DEFAULT 1"); } catch(e){}
try { db.exec("ALTER TABLE costos ADD COLUMN descripcion TEXT DEFAULT ''"); } catch(e){}
try { db.exec("ALTER TABLE costos ADD COLUMN encargo_id TEXT DEFAULT ''"); } catch(e){}
try { db.exec("CREATE TABLE IF NOT EXISTS enc_items(id TEXT PRIMARY KEY,encargo_id TEXT REFERENCES encargos(id) ON DELETE CASCADE,cantidad TEXT DEFAULT '',detalle TEXT DEFAULT '',orden INTEGER DEFAULT 0)"); } catch(e){}

app.use(cors());
app.use(express.json({limit:'10mb'}));
app.use(express.static(path.join(__dirname,'public')));
app.use('/uploads',express.static(UP_DIR));

const storage=multer.diskStorage({
  destination:(req,file,cb)=>cb(null,UP_DIR),
  filename:(req,file,cb)=>{const ext=path.extname(file.originalname);cb(null,`${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`)}
});
const upload=multer({storage,limits:{fileSize:8*1024*1024}});

function uid(){return Date.now().toString(36)+Math.random().toString(36).slice(2)}
function hoy(){return new Date().toISOString().split('T')[0]}
function ahora(){return new Date().toLocaleTimeString('es-CO',{hour:'2-digit',minute:'2-digit'})}
function nextRef(){
  const row=db.prepare('SELECT valor FROM counter WHERE id=1').get();
  const ref=String(row.valor).padStart(4,'0');
  db.prepare('UPDATE counter SET valor=valor+1 WHERE id=1').run();
  return ref;
}
function toNum(s){return parseInt(String(s||0).replace(/\D/g,''))||0}

function pedidoCompleto(p){
  if(!p)return null;
  const encargos=db.prepare('SELECT * FROM encargos WHERE pedido_id=? ORDER BY orden').all(p.id);
  encargos.forEach(enc=>{enc.items=db.prepare('SELECT * FROM enc_items WHERE encargo_id=? ORDER BY orden').all(enc.id)});
  p.encargos=encargos;
  p.pagos   =db.prepare('SELECT * FROM pagos WHERE pedido_id=? ORDER BY creado').all(p.id);
  p.costos  =db.prepare('SELECT * FROM costos WHERE pedido_id=? ORDER BY creado').all(p.id);
  p.historial=db.prepare('SELECT * FROM historial WHERE pedido_id=? ORDER BY creado DESC').all(p.id);
  p.archivos =db.prepare('SELECT * FROM archivos WHERE pedido_id=? ORDER BY creado').all(p.id);
  p.urgente=!!p.urgente; p.entregado=!!p.entregado; p.cancelado=!!p.cancelado; p.pendiente_pago=!!p.pendiente_pago;
  // Calcular valor total desde encargos
  p.valor_total=encargos.reduce((a,e)=>a+toNum(e.valor),0);
  return p;
}

function addHist(pid,txt){
  db.prepare('INSERT INTO historial(id,pedido_id,texto,fecha,hora)VALUES(?,?,?,?,?)').run(uid(),pid,txt,hoy(),ahora());
}

function saveEncargos(pid,encargos){
  db.prepare('DELETE FROM encargos WHERE pedido_id=?').run(pid);
  (encargos||[]).forEach((enc,i)=>{
    const eid=enc.id||uid();
    db.prepare('INSERT INTO encargos(id,pedido_id,numero,categoria,subcategoria,estado,valor,anotacion,orden)VALUES(?,?,?,?,?,?,?,?,?)')
      .run(eid,pid,enc.numero||i+1,enc.categoria||'',enc.subcategoria||'',enc.estado||'Nuevo',enc.valor||'0',enc.anotacion||'',i);
    db.prepare('DELETE FROM enc_items WHERE encargo_id=?').run(eid);
    (enc.items||[]).forEach((it,j)=>{
      db.prepare('INSERT INTO enc_items(id,encargo_id,cantidad,detalle,orden)VALUES(?,?,?,?,?)').run(uid(),eid,it.cantidad||'',it.detalle||'',j);
    });
  });
}

function asegurarCliente(nombre,tel,cid){
  if(cid){if(tel)db.prepare('UPDATE clientes SET tel=? WHERE id=?').run(tel,cid);return cid}
  const ex=db.prepare('SELECT id FROM clientes WHERE lower(nombre)=lower(?)').get(nombre.trim());
  if(ex){if(tel)db.prepare('UPDATE clientes SET tel=? WHERE id=?').run(tel,ex.id);return ex.id}
  const id=uid(); db.prepare('INSERT INTO clientes(id,nombre,tel)VALUES(?,?,?)').run(id,nombre.trim(),tel||''); return id;
}

// ── PEDIDOS ──
app.get('/api/pedidos',(req,res)=>{
  const{estado,urgente,q}=req.query;
  let sql='SELECT * FROM pedidos WHERE 1=1'; const params=[];
  if(urgente==='1'){sql+=' AND urgente=1 AND entregado=0 AND cancelado=0'}
  else if(estado==='entregado'){sql+=' AND entregado=1'}
  else if(estado==='cancelado'){sql+=' AND cancelado=1'}
  else if(estado==='listo'){sql+=' AND entregado=0 AND cancelado=0'}
  else if(estado&&estado!=='todos'){sql+=' AND entregado=0 AND cancelado=0'}
  else if(!estado||estado==='todos'){/* all */}
  if(q){sql+=' AND(nombre LIKE ? OR ref LIKE ? OR tel LIKE ?)';params.push(`%${q}%`,`%${q}%`,`%${q}%`)}
  sql+=' ORDER BY urgente DESC,creado DESC';
  res.json(db.prepare(sql).all(...params).map(pedidoCompleto));
});

app.get('/api/pedidos/:id',(req,res)=>{
  const p=db.prepare('SELECT * FROM pedidos WHERE id=?').get(req.params.id);
  if(!p)return res.status(404).json({error:'No encontrado'});
  res.json(pedidoCompleto(p));
});

app.post('/api/pedidos',(req,res)=>{
  try{
    const b=req.body;
    if(!b.nombre)return res.status(400).json({error:'Nombre requerido'});
    const id=uid(); const ref=nextRef();
    const cid=asegurarCliente(b.nombre,b.tel,b.cliente_id||null);
    db.prepare(`INSERT INTO pedidos(id,ref,cliente_id,nombre,tel,urgente,entregado,cancelado,pendiente_pago,fecha_pedido,fecha_entrega,notas)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`)
      .run(id,ref,cid,b.nombre.trim(),b.tel||'',b.urgente?1:0,b.entregado?1:0,b.cancelado?1:0,b.pendiente_pago?1:0,hoy(),b.fecha_entrega||'',b.notas||'');
    saveEncargos(id,b.encargos);
    (b.pagos||[]).forEach(pg=>db.prepare('INSERT INTO pagos(id,pedido_id,monto,fecha,tipo,nota)VALUES(?,?,?,?,?,?)').run(uid(),id,pg.monto||'',pg.fecha||hoy(),pg.tipo||'efectivo',pg.nota||''));
    (b.costos||[]).forEach(c=>db.prepare('INSERT INTO costos(id,pedido_id,encargo_id,descripcion,monto)VALUES(?,?,?,?,?)').run(uid(),id,c.encargo_id||'',c.descripcion||'',c.monto||''));
    addHist(id,'Pedido creado');
    res.json(pedidoCompleto(db.prepare('SELECT * FROM pedidos WHERE id=?').get(id)));
  }catch(e){console.error(e);res.status(500).json({error:e.message})}
});

app.put('/api/pedidos/:id',(req,res)=>{
  try{
    const b=req.body; const pid=req.params.id;
    const p=db.prepare('SELECT * FROM pedidos WHERE id=?').get(pid);
    if(!p)return res.status(404).json({error:'No encontrado'});
    const cid=asegurarCliente(b.nombre||p.nombre,b.tel,b.cliente_id||p.cliente_id);
    // Log cambios de estado checkboxes
    if(b.entregado&&!p.entregado)addHist(pid,'Pedido marcado como entregado');
    if(b.cancelado&&!p.cancelado)addHist(pid,'Pedido cancelado');
    db.prepare(`UPDATE pedidos SET nombre=?,tel=?,cliente_id=?,urgente=?,entregado=?,cancelado=?,pendiente_pago=?,fecha_entrega=?,notas=?,modificado=datetime('now','localtime') WHERE id=?`)
      .run(b.nombre||p.nombre,(b.tel!==undefined?b.tel:p.tel),cid,b.urgente?1:0,b.entregado?1:0,b.cancelado?1:0,b.pendiente_pago?1:0,(b.fecha_entrega!==undefined?b.fecha_entrega:p.fecha_entrega),b.notas!==undefined?b.notas:p.notas,pid);
    if(b.encargos!==undefined)saveEncargos(pid,b.encargos);
    if(b.pagos!==undefined){db.prepare('DELETE FROM pagos WHERE pedido_id=?').run(pid);(b.pagos||[]).forEach(pg=>db.prepare('INSERT INTO pagos(id,pedido_id,monto,fecha,tipo,nota)VALUES(?,?,?,?,?,?)').run(uid(),pid,pg.monto||'',pg.fecha||hoy(),pg.tipo||'efectivo',pg.nota||''));}
    if(b.costos!==undefined){db.prepare('DELETE FROM costos WHERE pedido_id=?').run(pid);(b.costos||[]).forEach(c=>db.prepare('INSERT INTO costos(id,pedido_id,encargo_id,descripcion,monto)VALUES(?,?,?,?,?)').run(uid(),pid,c.encargo_id||'',c.descripcion||'',c.monto||''));}
    res.json(pedidoCompleto(db.prepare('SELECT * FROM pedidos WHERE id=?').get(pid)));
  }catch(e){console.error(e);res.status(500).json({error:e.message})}
});

app.delete('/api/pedidos/:id',(req,res)=>{
  db.prepare('DELETE FROM pedidos WHERE id=?').run(req.params.id);
  res.json({ok:true});
});

// Archivos
app.post('/api/pedidos/:id/archivos',upload.array('files',10),(req,res)=>{
  const pid=req.params.id; const inserted=[];
  (req.files||[]).forEach(f=>{
    const id=uid();
    db.prepare('INSERT INTO archivos(id,pedido_id,nombre,tipo,ruta)VALUES(?,?,?,?,?)').run(id,pid,f.originalname,f.mimetype,'/uploads/'+f.filename);
    inserted.push({id,nombre:f.originalname,tipo:f.mimetype,ruta:'/uploads/'+f.filename});
  });
  if(req.files.length) addHist(pid,`${req.files.length} archivo(s) adjuntado(s)`);
  res.json(inserted);
});
app.delete('/api/archivos/:id',(req,res)=>{
  const a=db.prepare('SELECT * FROM archivos WHERE id=?').get(req.params.id);
  if(a){const fp=path.join(UP_DIR,path.basename(a.ruta));if(fs.existsSync(fp))fs.unlinkSync(fp);db.prepare('DELETE FROM archivos WHERE id=?').run(req.params.id);}
  res.json({ok:true});
});

// Clientes
app.get('/api/clientes',(req,res)=>{
  const{q}=req.query; let sql='SELECT * FROM clientes WHERE 1=1'; const params=[];
  if(q){sql+=' AND(nombre LIKE ? OR tel LIKE ?)';params.push(`%${q}%`,`%${q}%`)}
  sql+=' ORDER BY nombre';
  const clientes=db.prepare(sql).all(...params);
  clientes.forEach(c=>{c.pedidos=db.prepare('SELECT id,ref,entregado,cancelado,fecha_pedido,fecha_entrega FROM pedidos WHERE cliente_id=? ORDER BY creado DESC').all(c.id)});
  res.json(clientes);
});
app.get('/api/clientes/:id',(req,res)=>{
  const c=db.prepare('SELECT * FROM clientes WHERE id=?').get(req.params.id);
  if(!c)return res.status(404).json({error:'No encontrado'});
  const peds=db.prepare('SELECT id,ref,entregado,cancelado,urgente,fecha_pedido,fecha_entrega FROM pedidos WHERE cliente_id=? ORDER BY creado DESC').all(c.id);
  c.pedidos=peds.map(p=>{p.valor_total=db.prepare('SELECT COALESCE(SUM(CAST(REPLACE(valor,"$","") AS INTEGER)),0) as t FROM encargos WHERE pedido_id=?').get(p.id)?.t||0;return p});
  res.json(c);
});

// Stats
app.get('/api/stats',(req,res)=>{
  const activos=db.prepare("SELECT COUNT(*) as n FROM pedidos WHERE entregado=0 AND cancelado=0").get().n;
  const urgentes=db.prepare("SELECT COUNT(*) as n FROM pedidos WHERE urgente=1 AND entregado=0 AND cancelado=0").get().n;
  // Listo: todos sus encargos en Listo/Entregado y pedido no entregado/cancelado
  const candidatos=db.prepare("SELECT id FROM pedidos WHERE entregado=0 AND cancelado=0").all();
  let listos=0;
  candidatos.forEach(p=>{
    const encs=db.prepare('SELECT estado FROM encargos WHERE pedido_id=?').all(p.id);
    if(encs.length&&encs.every(e=>e.estado==='Listo'||e.estado==='Entregado'))listos++;
  });
  const clientes=db.prepare('SELECT COUNT(*) as n FROM clientes').get().n;
  const pendPago=db.prepare("SELECT COUNT(*) as n FROM pedidos WHERE pendiente_pago=1 AND entregado=0 AND cancelado=0").get().n;
  res.json({activos,urgentes,listos,clientes,pendPago});
});

// Export CSV
app.get('/api/export/csv',(req,res)=>{
  const{estado}=req.query;
  let sql='SELECT * FROM pedidos WHERE 1=1'; const params=[];
  if(estado==='entregado')sql+=' AND entregado=1';
  else if(estado==='cancelado')sql+=' AND cancelado=1';
  else if(estado&&estado!=='todos')sql+=' AND entregado=0 AND cancelado=0';
  const pedidos=db.prepare(sql+' ORDER BY creado DESC').all(...params).map(pedidoCompleto);
  const rows=[['Ref','Cliente','Tel','Estado','Urgente','Encargos','Valor Total','Pagado','Saldo','F.Pedido','F.Entrega','Notas']];
  pedidos.forEach(p=>{
    const encRes=(p.encargos||[]).map(e=>`[${e.categoria||''}] ${(e.items||[]).map(i=>`${i.cantidad} ${i.detalle}`).join(', ')}`).join(' | ');
    const pag=(p.pagos||[]).reduce((a,x)=>a+toNum(x.monto),0);
    const val=p.valor_total||0;
    const estado=p.entregado?'Entregado':p.cancelado?'Cancelado':p.urgente?'Urgente':'Activo';
    rows.push([p.ref,p.nombre,p.tel||'',estado,p.urgente?'Sí':'No',encRes,val,pag,Math.max(0,val-pag),p.fecha_pedido||'',p.fecha_entrega||'',p.notas||'']);
  });
  const csv='\uFEFF'+rows.map(r=>r.map(c=>'"'+String(c).replace(/"/g,'""')+'"').join(',')).join('\n');
  res.setHeader('Content-Type','text/csv; charset=utf-8');
  res.setHeader('Content-Disposition','attachment; filename="pedidos_grafia.csv"');
  res.send(csv);
});

// Registros financieros
app.get('/api/registros/utilidades',(req,res)=>{
  const pedidos=db.prepare('SELECT * FROM pedidos').all().map(pedidoCompleto);
  const rows=pedidos.map(p=>{
    const ing=p.valor_total||0;
    const cos=(p.costos||[]).reduce((a,c)=>a+toNum(c.monto),0);
    const pag=(p.pagos||[]).reduce((a,x)=>a+toNum(x.monto),0);
    return{ref:p.ref,nombre:p.nombre,ing,cos,gan:ing-cos,pag,saldo:Math.max(0,ing-pag)};
  }).filter(r=>r.ing||r.cos);
  res.json(rows);
});

app.get('*',(req,res)=>res.sendFile(path.join(__dirname,'public','index.html')));
app.listen(PORT,()=>console.log(`✅ GRAFÍA Studio en http://localhost:${PORT}`));
