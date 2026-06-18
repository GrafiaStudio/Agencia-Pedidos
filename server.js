require('dotenv').config();
const express=require('express');
const Database=require('better-sqlite3');
const multer=require('multer');
const cors=require('cors');
const path=require('path');
const fs=require('fs');
const jwt=require('jsonwebtoken');

const app=express();
const PORT=process.env.PORT||3000;

const DB_DIR=path.join(__dirname,'db');
const UP_DIR=path.join(__dirname,'public','uploads');
[DB_DIR,UP_DIR].forEach(d=>{if(!fs.existsSync(d))fs.mkdirSync(d,{recursive:true})});

const APP_PIN=process.env.APP_PIN||'1234';
const JWT_SECRET=process.env.JWT_SECRET||'grafia-dev-secret-cambiar-en-railway';
if(!process.env.APP_PIN||!process.env.JWT_SECRET){
  console.warn('⚠️  Usando APP_PIN/JWT_SECRET por defecto. Configura las variables de entorno APP_PIN y JWT_SECRET en Railway antes de producción.');
}

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
try { db.exec("ALTER TABLE pedidos ADD COLUMN es_cotizacion INTEGER DEFAULT 0"); } catch(e){}
try { db.exec("ALTER TABLE enc_items ADD COLUMN valor_unitario TEXT DEFAULT '0'"); } catch(e){}
try { db.exec("ALTER TABLE pedidos ADD COLUMN valor_final TEXT"); } catch(e){}
try { db.exec("ALTER TABLE encargos ADD COLUMN valor_calc TEXT"); } catch(e){}
try { db.exec("ALTER TABLE enc_items ADD COLUMN valor_unitario_calc TEXT"); } catch(e){}
try { db.exec("ALTER TABLE pedidos ADD COLUMN valor_final_calc TEXT"); } catch(e){}
try { db.exec("ALTER TABLE pagos ADD COLUMN monto_calc TEXT"); } catch(e){}
try { db.exec("ALTER TABLE costos ADD COLUMN monto_calc TEXT"); } catch(e){}
// Migración única de datos: el viejo default '0' en encargos.valor nunca fue una decisión
// deliberada (la UI siempre partía en '0'); lo convertimos a NULL para poder distinguir
// "Valor Encargo vacío" de "Valor Encargo puesto en 0 a propósito" de aquí en adelante.
try {
  db.exec("CREATE TABLE IF NOT EXISTS migraciones(nombre TEXT PRIMARY KEY)");
  const yaCorrida=db.prepare("SELECT 1 FROM migraciones WHERE nombre=?").get('encargo_valor_cero_a_null');
  if(!yaCorrida){
    db.exec("UPDATE encargos SET valor=NULL WHERE valor='0'");
    db.prepare("INSERT INTO migraciones(nombre) VALUES(?)").run('encargo_valor_cero_a_null');
  }
} catch(e){}
// Migración única: backfill de las nuevas columnas _calc para datos que ya existían
// antes de soportar expresiones matemáticas (siempre fueron números planos, así que
// evalExpr los calcula trivialmente sin cambiar su significado).
try {
  const yaCorridaCalc=db.prepare("SELECT 1 FROM migraciones WHERE nombre=?").get('backfill_valor_calc_v1');
  if(!yaCorridaCalc){
    db.prepare('SELECT id,valor FROM encargos').all().forEach(r=>db.prepare('UPDATE encargos SET valor_calc=? WHERE id=?').run(normCalc(r.valor),r.id));
    db.prepare('SELECT id,valor_unitario FROM enc_items').all().forEach(r=>db.prepare('UPDATE enc_items SET valor_unitario_calc=? WHERE id=?').run(normCalc(r.valor_unitario),r.id));
    db.prepare('SELECT id,valor_final FROM pedidos').all().forEach(r=>db.prepare('UPDATE pedidos SET valor_final_calc=? WHERE id=?').run(normCalc(r.valor_final),r.id));
    db.prepare('SELECT id,monto FROM pagos').all().forEach(r=>db.prepare('UPDATE pagos SET monto_calc=? WHERE id=?').run(normCalc(r.monto),r.id));
    db.prepare('SELECT id,monto FROM costos').all().forEach(r=>db.prepare('UPDATE costos SET monto_calc=? WHERE id=?').run(normCalc(r.monto),r.id));
    db.prepare("INSERT INTO migraciones(nombre) VALUES(?)").run('backfill_valor_calc_v1');
  }
} catch(e){}

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
function definido(v){return v!=null&&String(v).trim()!==''}
function normVF(v){return definido(v)?String(v):null}

// Evaluador seguro de expresiones matemáticas para campos de valor monetario.
// Sólo deja pasar dígitos, + - * / ( ) y espacios (tras quitar separadores de
// miles y normalizar x/X a *), así que Function() no puede ejecutar nada que
// no sea aritmética pura.
function evalExpr(raw){
  if(raw==null)return null;
  let s=String(raw).trim();
  if(s==='')return null;
  s=s.replace(/[.,]/g,'').replace(/[xX]/g,'*');
  if(!/^[0-9+\-*/()\s]+$/.test(s)||!/[0-9]/.test(s))return null;
  try{
    const v=Function('"use strict";return('+s+')')();
    return(typeof v==='number'&&isFinite(v))?Math.round(v):null;
  }catch(e){return null}
}
function normCalc(raw){const v=evalExpr(raw);return v==null?null:String(v)}

// Jerarquía de valores (de abajo hacia arriba):
// Items (cantidad×valor_unitario) -> Referencial del Encargo -> Valor Encargo (si está definido, reemplaza
// al referencial) -> Valor Sugerido del Pedido (suma de los valores EFECTIVOS de los encargos) -> Valor Final
// del Pedido (si está definido, reemplaza al sugerido). El "valor oficial" para todo lo financiero es siempre
// valor_total = valor_final ?? valor_sugerido — nunca los referenciales, que son solo ayuda visual.
function calcReferencialEncargo(enc){
  return(enc.items||[]).reduce((a,it)=>{
    const cant=toNum(it.cantidad),unit=toNum(it.valor_unitario_calc);
    return(cant>0&&unit>0)?a+cant*unit:a;
  },0);
}
function calcValorEncargoEfectivo(enc){
  return definido(enc.valor)?toNum(enc.valor_calc):calcReferencialEncargo(enc);
}
function calcValorSugerido(encargos){
  return(encargos||[]).reduce((a,e)=>a+calcValorEncargoEfectivo(e),0);
}
function valorOficialPedido(p,valorSugerido){
  return definido(p.valor_final)?toNum(p.valor_final_calc):valorSugerido;
}

function pedidoCompleto(p){
  if(!p)return null;
  const encargos=db.prepare('SELECT * FROM encargos WHERE pedido_id=? ORDER BY orden').all(p.id);
  encargos.forEach(enc=>{enc.items=db.prepare('SELECT * FROM enc_items WHERE encargo_id=? ORDER BY orden').all(enc.id)});
  p.encargos=encargos;
  p.pagos   =db.prepare('SELECT * FROM pagos WHERE pedido_id=? ORDER BY creado').all(p.id);
  p.costos  =db.prepare('SELECT * FROM costos WHERE pedido_id=? ORDER BY creado').all(p.id);
  p.historial=db.prepare('SELECT * FROM historial WHERE pedido_id=? ORDER BY creado DESC').all(p.id);
  p.archivos =db.prepare('SELECT * FROM archivos WHERE pedido_id=? ORDER BY creado').all(p.id);
  p.urgente=!!p.urgente; p.entregado=!!p.entregado; p.cancelado=!!p.cancelado; p.pendiente_pago=!!p.pendiente_pago; p.es_cotizacion=!!p.es_cotizacion;
  encargos.forEach(enc=>{
    enc.valor_referencial=calcReferencialEncargo(enc);
    enc.valor_efectivo=calcValorEncargoEfectivo(enc);
  });
  p.valor_sugerido=calcValorSugerido(encargos);
  p.valor_total=valorOficialPedido(p,p.valor_sugerido);
  return p;
}

function addHist(pid,txt){
  db.prepare('INSERT INTO historial(id,pedido_id,texto,fecha,hora)VALUES(?,?,?,?,?)').run(uid(),pid,txt,hoy(),ahora());
}

function saveEncargos(pid,encargos){
  db.prepare('DELETE FROM encargos WHERE pedido_id=?').run(pid);
  (encargos||[]).forEach((enc,i)=>{
    const eid=enc.id||uid();
    db.prepare('INSERT INTO encargos(id,pedido_id,numero,categoria,subcategoria,estado,valor,valor_calc,anotacion,orden)VALUES(?,?,?,?,?,?,?,?,?,?)')
      .run(eid,pid,enc.numero||i+1,enc.categoria||'',enc.subcategoria||'',enc.estado||'Nuevo',enc.valor||'',normCalc(enc.valor),enc.anotacion||'',i);
    db.prepare('DELETE FROM enc_items WHERE encargo_id=?').run(eid);
    (enc.items||[]).forEach((it,j)=>{
      db.prepare('INSERT INTO enc_items(id,encargo_id,cantidad,detalle,valor_unitario,valor_unitario_calc,orden)VALUES(?,?,?,?,?,?,?)').run(uid(),eid,it.cantidad||'',it.detalle||'',it.valor_unitario||'0',normCalc(it.valor_unitario)||'0',j);
    });
  });
}

function asegurarCliente(nombre,tel,cid){
  if(cid){
    if(nombre)db.prepare('UPDATE clientes SET nombre=? WHERE id=?').run(nombre.trim(),cid);
    if(tel)db.prepare('UPDATE clientes SET tel=? WHERE id=?').run(tel,cid);
    return cid;
  }
  const ex=db.prepare('SELECT id FROM clientes WHERE lower(nombre)=lower(?)').get(nombre.trim());
  if(ex){if(tel)db.prepare('UPDATE clientes SET tel=? WHERE id=?').run(tel,ex.id);return ex.id}
  const id=uid(); db.prepare('INSERT INTO clientes(id,nombre,tel)VALUES(?,?,?)').run(id,nombre.trim(),tel||''); return id;
}

// ── LOGGING DE ERRORES (persistente, sobrevive reinicios de Railway) ──
const LOG_FILE=path.join(DB_DIR,'error.log');
function logError(contexto,err){
  console.error(contexto,err);
  try{
    const linea=`[${new Date().toISOString()}] ${contexto}: ${err.message}\n`;
    fs.appendFileSync(LOG_FILE,linea);
  }catch(e){/* si falla el log a archivo, no bloquear la respuesta */}
}

// ── VALIDACIÓN DE PEDIDOS ──
function validarPedido(b){
  const errores=[];
  if(b.nombre!==undefined&&!String(b.nombre).trim())errores.push('El nombre del cliente no puede estar vacío');
  if(b.nombre&&String(b.nombre).trim().length>120)errores.push('El nombre es demasiado largo');
  if(b.tel&&!/^[0-9+\-\s()]{0,20}$/.test(b.tel))errores.push('El teléfono tiene caracteres no válidos');
  if(b.fecha_entrega&&!/^\d{4}-\d{2}-\d{2}$/.test(b.fecha_entrega))errores.push('La fecha de entrega no es válida');
  if(b.encargos!==undefined&&!Array.isArray(b.encargos))errores.push('Los encargos no tienen el formato correcto');
  if(b.pagos!==undefined&&!Array.isArray(b.pagos))errores.push('Los pagos no tienen el formato correcto');
  if(b.costos!==undefined&&!Array.isArray(b.costos))errores.push('Los costos no tienen el formato correcto');
  if(definido(b.valor_final)&&evalExpr(b.valor_final)===null)errores.push('El Valor Final del Pedido no es una expresión válida');
  (b.encargos||[]).forEach((enc,i)=>{
    if(definido(enc.valor)&&evalExpr(enc.valor)===null)errores.push(`Valor Encargo del encargo #${i+1} no es una expresión válida`);
    (enc.items||[]).forEach((it,j)=>{
      if(definido(it.valor_unitario)&&evalExpr(it.valor_unitario)===null)errores.push(`V. Unitario (encargo #${i+1}, fila ${j+1}) no es una expresión válida`);
    });
  });
  (b.pagos||[]).forEach((pg,i)=>{
    if(definido(pg.monto)&&evalExpr(pg.monto)===null)errores.push(`Monto del pago #${i+1} no es una expresión válida`);
  });
  (b.costos||[]).forEach((c,i)=>{
    if(definido(c.monto)&&evalExpr(c.monto)===null)errores.push(`Monto del costo #${i+1} no es una expresión válida`);
  });
  return errores;
}

// ── AUTENTICACIÓN (PIN simple) ──
app.post('/api/auth/login',(req,res)=>{
  const{pin}=req.body||{};
  if(!pin||String(pin)!==String(APP_PIN)){
    return res.status(401).json({error:'PIN incorrecto'});
  }
  const token=jwt.sign({auth:true},JWT_SECRET,{expiresIn:'90d'});
  res.json({token});
});

app.use('/api',(req,res,next)=>{
  if(req.path==='/auth/login')return next();
  const header=req.headers.authorization||'';
  const token=header.startsWith('Bearer ')?header.slice(7):null;
  if(!token)return res.status(401).json({error:'No autorizado, ingresa el PIN'});
  try{
    jwt.verify(token,JWT_SECRET);
    next();
  }catch(e){
    res.status(401).json({error:'Sesión expirada, ingresa el PIN de nuevo'});
  }
});

// ── PEDIDOS ──
app.get('/api/pedidos',(req,res)=>{
  const{estado,urgente,q}=req.query;
  let sql='SELECT * FROM pedidos WHERE 1=1'; const params=[];
  if(urgente==='1'){sql+=' AND urgente=1 AND entregado=0 AND cancelado=0 AND es_cotizacion=0'}
  else if(estado==='cotizacion'){sql+=' AND es_cotizacion=1'}
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
    const errores=validarPedido(b);
    if(errores.length)return res.status(400).json({error:errores.join('. ')});
    const id=uid(); const ref=nextRef();
    const cid=asegurarCliente(b.nombre,b.tel,b.cliente_id||null);
    db.prepare(`INSERT INTO pedidos(id,ref,cliente_id,nombre,tel,urgente,entregado,cancelado,pendiente_pago,es_cotizacion,valor_final,valor_final_calc,fecha_pedido,fecha_entrega,notas)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
      .run(id,ref,cid,b.nombre.trim(),b.tel||'',b.urgente?1:0,b.entregado?1:0,b.cancelado?1:0,b.pendiente_pago?1:0,b.es_cotizacion?1:0,normVF(b.valor_final),normCalc(b.valor_final),hoy(),b.fecha_entrega||'',b.notas||'');
    saveEncargos(id,b.encargos);
    (b.pagos||[]).forEach(pg=>db.prepare('INSERT INTO pagos(id,pedido_id,monto,monto_calc,fecha,tipo,nota)VALUES(?,?,?,?,?,?,?)').run(uid(),id,pg.monto||'',normCalc(pg.monto),pg.fecha||hoy(),pg.tipo||'efectivo',pg.nota||''));
    (b.costos||[]).forEach(c=>db.prepare('INSERT INTO costos(id,pedido_id,encargo_id,descripcion,monto,monto_calc)VALUES(?,?,?,?,?,?)').run(uid(),id,c.encargo_id||'',c.descripcion||'',c.monto||'',normCalc(c.monto)));
    addHist(id,'Pedido creado');
    res.json(pedidoCompleto(db.prepare('SELECT * FROM pedidos WHERE id=?').get(id)));
  }catch(e){logError('POST /api/pedidos',e);res.status(500).json({error:e.message})}
});

app.put('/api/pedidos/:id',(req,res)=>{
  try{
    const b=req.body; const pid=req.params.id;
    const p=db.prepare('SELECT * FROM pedidos WHERE id=?').get(pid);
    if(!p)return res.status(404).json({error:'No encontrado'});
    const errores=validarPedido(b);
    if(errores.length)return res.status(400).json({error:errores.join('. ')});
    const cid=asegurarCliente(b.nombre||p.nombre,b.tel,b.cliente_id||p.cliente_id);
    // Log cambios de estado checkboxes
    if(b.entregado&&!p.entregado)addHist(pid,'Pedido marcado como entregado');
    if(b.cancelado&&!p.cancelado)addHist(pid,'Pedido cancelado');
    db.prepare(`UPDATE pedidos SET nombre=?,tel=?,cliente_id=?,urgente=?,entregado=?,cancelado=?,pendiente_pago=?,es_cotizacion=?,valor_final=?,valor_final_calc=?,fecha_entrega=?,notas=?,modificado=datetime('now','localtime') WHERE id=?`)
      .run(b.nombre||p.nombre,(b.tel!==undefined?b.tel:p.tel),cid,b.urgente?1:0,b.entregado?1:0,b.cancelado?1:0,b.pendiente_pago?1:0,b.es_cotizacion?1:0,(b.valor_final!==undefined?normVF(b.valor_final):p.valor_final),(b.valor_final!==undefined?normCalc(b.valor_final):p.valor_final_calc),(b.fecha_entrega!==undefined?b.fecha_entrega:p.fecha_entrega),b.notas!==undefined?b.notas:p.notas,pid);
    if(b.encargos!==undefined)saveEncargos(pid,b.encargos);
    if(b.pagos!==undefined){db.prepare('DELETE FROM pagos WHERE pedido_id=?').run(pid);(b.pagos||[]).forEach(pg=>db.prepare('INSERT INTO pagos(id,pedido_id,monto,monto_calc,fecha,tipo,nota)VALUES(?,?,?,?,?,?,?)').run(uid(),pid,pg.monto||'',normCalc(pg.monto),pg.fecha||hoy(),pg.tipo||'efectivo',pg.nota||''));}
    if(b.costos!==undefined){db.prepare('DELETE FROM costos WHERE pedido_id=?').run(pid);(b.costos||[]).forEach(c=>db.prepare('INSERT INTO costos(id,pedido_id,encargo_id,descripcion,monto,monto_calc)VALUES(?,?,?,?,?,?)').run(uid(),pid,c.encargo_id||'',c.descripcion||'',c.monto||'',normCalc(c.monto)));}
    res.json(pedidoCompleto(db.prepare('SELECT * FROM pedidos WHERE id=?').get(pid)));
  }catch(e){logError('PUT /api/pedidos/:id',e);res.status(500).json({error:e.message})}
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
  const peds=db.prepare('SELECT id,ref,entregado,cancelado,urgente,es_cotizacion,valor_final,valor_final_calc,fecha_pedido,fecha_entrega FROM pedidos WHERE cliente_id=? ORDER BY creado DESC').all(c.id);
  c.pedidos=peds.map(p=>{
    p.es_cotizacion=!!p.es_cotizacion;
    const encs=db.prepare('SELECT id,categoria,subcategoria,valor,valor_calc FROM encargos WHERE pedido_id=? ORDER BY orden').all(p.id);
    encs.forEach(e=>{e.items=db.prepare('SELECT cantidad,valor_unitario,valor_unitario_calc FROM enc_items WHERE encargo_id=?').all(e.id)});
    p.valor_sugerido=calcValorSugerido(encs);
    p.valor_total=valorOficialPedido(p,p.valor_sugerido);
    p.encargosResumen=encs.map(e=>({categoria:e.categoria,subcategoria:e.subcategoria}));
    return p;
  });
  res.json(c);
});

// Stats
app.get('/api/stats',(req,res)=>{
  const activos=db.prepare("SELECT COUNT(*) as n FROM pedidos WHERE entregado=0 AND cancelado=0 AND es_cotizacion=0").get().n;
  const urgentes=db.prepare("SELECT COUNT(*) as n FROM pedidos WHERE urgente=1 AND entregado=0 AND cancelado=0 AND es_cotizacion=0").get().n;
  // Listo: todos sus encargos en Listo/Entregado y pedido no entregado/cancelado/cotización
  const candidatos=db.prepare("SELECT id FROM pedidos WHERE entregado=0 AND cancelado=0 AND es_cotizacion=0").all();
  let listos=0;
  candidatos.forEach(p=>{
    const encs=db.prepare('SELECT estado FROM encargos WHERE pedido_id=?').all(p.id);
    if(encs.length&&encs.every(e=>e.estado==='Listo'||e.estado==='Entregado'))listos++;
  });
  const clientes=db.prepare('SELECT COUNT(*) as n FROM clientes').get().n;
  const pendPago=db.prepare("SELECT COUNT(*) as n FROM pedidos WHERE pendiente_pago=1 AND entregado=0 AND cancelado=0 AND es_cotizacion=0").get().n;
  const cotizaciones=db.prepare("SELECT COUNT(*) as n FROM pedidos WHERE es_cotizacion=1").get().n;
  res.json({activos,urgentes,listos,clientes,pendPago,cotizaciones});
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
    const pag=(p.pagos||[]).reduce((a,x)=>a+toNum(x.monto_calc),0);
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
    const cos=(p.costos||[]).reduce((a,c)=>a+toNum(c.monto_calc),0);
    const pag=(p.pagos||[]).reduce((a,x)=>a+toNum(x.monto_calc),0);
    return{ref:p.ref,nombre:p.nombre,ing,cos,gan:ing-cos,pag,saldo:Math.max(0,ing-pag)};
  }).filter(r=>r.ing||r.cos);
  res.json(rows);
});

app.get('*',(req,res)=>res.sendFile(path.join(__dirname,'public','index.html')));
app.listen(PORT,()=>console.log(`✅ GRAFÍA Studio en http://localhost:${PORT}`));
