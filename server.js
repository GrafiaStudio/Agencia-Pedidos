const express = require('express');
const Database = require('better-sqlite3');
const multer = require('multer');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

const DB_DIR = path.join(__dirname, 'db');
const UPLOADS_DIR = path.join(__dirname, 'public', 'uploads');
[DB_DIR, UPLOADS_DIR].forEach(d => { if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true }); });

const db = new Database(path.join(DB_DIR, 'agencia.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS clientes (
    id TEXT PRIMARY KEY, nombre TEXT NOT NULL, tel TEXT, email TEXT, notas TEXT,
    creado TEXT DEFAULT (datetime('now','localtime'))
  );
  CREATE TABLE IF NOT EXISTS pedidos (
    id TEXT PRIMARY KEY, ref TEXT UNIQUE NOT NULL, cliente_id TEXT REFERENCES clientes(id),
    nombre TEXT NOT NULL, tel TEXT, estado TEXT DEFAULT 'nuevo', urgente INTEGER DEFAULT 0,
    fecha_pedido TEXT, fecha_entrega TEXT, valor TEXT, notas TEXT,
    creado TEXT DEFAULT (datetime('now','localtime')),
    modificado TEXT DEFAULT (datetime('now','localtime'))
  );
  CREATE TABLE IF NOT EXISTS encargos (
    id TEXT PRIMARY KEY, pedido_id TEXT REFERENCES pedidos(id) ON DELETE CASCADE,
    tipo TEXT, cantidad TEXT, detalle TEXT, material TEXT, anotacion TEXT, orden INTEGER DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS pagos (
    id TEXT PRIMARY KEY, pedido_id TEXT REFERENCES pedidos(id) ON DELETE CASCADE,
    monto TEXT, fecha TEXT, tipo TEXT DEFAULT 'efectivo', nota TEXT,
    creado TEXT DEFAULT (datetime('now','localtime'))
  );
  CREATE TABLE IF NOT EXISTS archivos (
    id TEXT PRIMARY KEY, pedido_id TEXT REFERENCES pedidos(id) ON DELETE CASCADE,
    nombre TEXT, tipo TEXT, ruta TEXT, creado TEXT DEFAULT (datetime('now','localtime'))
  );
  CREATE TABLE IF NOT EXISTS counter (id INTEGER PRIMARY KEY CHECK (id=1), valor INTEGER DEFAULT 1);
  INSERT OR IGNORE INTO counter (id, valor) VALUES (1, 1);
`);

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(UPLOADS_DIR));

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOADS_DIR),
  filename: (req, file, cb) => { const ext = path.extname(file.originalname); cb(null, `${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`); }
});
const upload = multer({ storage, limits: { fileSize: 8*1024*1024 } });

function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2); }
function hoy() { return new Date().toISOString().split('T')[0]; }
function nextRef() {
  const row = db.prepare('SELECT valor FROM counter WHERE id=1').get();
  const ref = String(row.valor).padStart(4,'0');
  db.prepare('UPDATE counter SET valor=valor+1 WHERE id=1').run();
  return ref;
}
function pedidoCompleto(p) {
  if (!p) return null;
  p.encargos = db.prepare('SELECT * FROM encargos WHERE pedido_id=? ORDER BY orden').all(p.id);
  p.pagos    = db.prepare('SELECT * FROM pagos WHERE pedido_id=? ORDER BY creado').all(p.id);
  p.archivos = db.prepare('SELECT * FROM archivos WHERE pedido_id=? ORDER BY creado').all(p.id);
  p.urgente  = !!p.urgente;
  return p;
}

// PEDIDOS
app.get('/api/pedidos', (req, res) => {
  const { estado, q } = req.query;
  let sql = 'SELECT * FROM pedidos WHERE 1=1';
  const params = [];
  if (estado && estado !== 'todos') { sql += ' AND estado=?'; params.push(estado); }
  if (q) { sql += ' AND (nombre LIKE ? OR ref LIKE ? OR tel LIKE ?)'; params.push(`%${q}%`,`%${q}%`,`%${q}%`); }
  sql += ' ORDER BY urgente DESC, creado DESC';
  res.json(db.prepare(sql).all(...params).map(pedidoCompleto));
});

app.get('/api/pedidos/:id', (req, res) => {
  const p = db.prepare('SELECT * FROM pedidos WHERE id=?').get(req.params.id);
  if (!p) return res.status(404).json({ error: 'No encontrado' });
  res.json(pedidoCompleto(p));
});

app.post('/api/pedidos', (req, res) => {
  const { nombre, tel, cliente_id, estado, urgente, fecha_entrega, valor, notas, encargos, pagos } = req.body;
  if (!nombre) return res.status(400).json({ error: 'Nombre requerido' });
  const id = uid(); const ref = nextRef();
  let cid = cliente_id;
  if (!cid) {
    const ex = db.prepare('SELECT id FROM clientes WHERE lower(nombre)=lower(?)').get(nombre);
    if (ex) { cid = ex.id; if (tel) db.prepare('UPDATE clientes SET tel=? WHERE id=?').run(tel, cid); }
    else { cid = uid(); db.prepare('INSERT INTO clientes (id,nombre,tel) VALUES (?,?,?)').run(cid, nombre, tel||''); }
  } else if (tel) { db.prepare('UPDATE clientes SET tel=? WHERE id=?').run(tel, cid); }
  db.prepare('INSERT INTO pedidos (id,ref,cliente_id,nombre,tel,estado,urgente,fecha_pedido,fecha_entrega,valor,notas) VALUES (?,?,?,?,?,?,?,?,?,?,?)')
    .run(id, ref, cid, nombre, tel||'', estado||'nuevo', urgente?1:0, hoy(), fecha_entrega||'', valor||'', notas||'');
  (encargos||[]).forEach((e,i) => db.prepare('INSERT INTO encargos (id,pedido_id,tipo,cantidad,detalle,material,anotacion,orden) VALUES (?,?,?,?,?,?,?,?)').run(uid(),id,e.tipo||'',e.cantidad||'',e.detalle||'',e.material||'',e.anotacion||'',i));
  (pagos||[]).forEach(pg => db.prepare('INSERT INTO pagos (id,pedido_id,monto,fecha,tipo,nota) VALUES (?,?,?,?,?,?)').run(uid(),id,pg.monto||'',pg.fecha||hoy(),pg.tipo||'efectivo',pg.nota||''));
  res.json(pedidoCompleto(db.prepare('SELECT * FROM pedidos WHERE id=?').get(id)));
});

app.put('/api/pedidos/:id', (req, res) => {
  const { nombre, tel, cliente_id, estado, urgente, fecha_entrega, valor, notas, encargos, pagos } = req.body;
  const pid = req.params.id;
  const p = db.prepare('SELECT * FROM pedidos WHERE id=?').get(pid);
  if (!p) return res.status(404).json({ error: 'No encontrado' });
  let cid = cliente_id || p.cliente_id;
  if (!cid && nombre) {
    const ex = db.prepare('SELECT id FROM clientes WHERE lower(nombre)=lower(?)').get(nombre);
    if (ex) cid = ex.id;
    else { cid = uid(); db.prepare('INSERT INTO clientes (id,nombre,tel) VALUES (?,?,?)').run(cid, nombre||p.nombre, tel||''); }
  }
  if (tel && cid) db.prepare('UPDATE clientes SET tel=? WHERE id=?').run(tel, cid);
  db.prepare("UPDATE pedidos SET nombre=?,tel=?,cliente_id=?,estado=?,urgente=?,fecha_entrega=?,valor=?,notas=?,modificado=datetime('now','localtime') WHERE id=?")
    .run(nombre||p.nombre, tel!==undefined?tel:p.tel, cid, estado||p.estado, urgente!==undefined?(urgente?1:0):p.urgente, fecha_entrega!==undefined?fecha_entrega:p.fecha_entrega, valor!==undefined?valor:p.valor, notas!==undefined?notas:p.notas, pid);
  if (encargos !== undefined) {
    db.prepare('DELETE FROM encargos WHERE pedido_id=?').run(pid);
    (encargos||[]).forEach((e,i) => db.prepare('INSERT INTO encargos (id,pedido_id,tipo,cantidad,detalle,material,anotacion,orden) VALUES (?,?,?,?,?,?,?,?)').run(uid(),pid,e.tipo||'',e.cantidad||'',e.detalle||'',e.material||'',e.anotacion||'',i));
  }
  if (pagos !== undefined) {
    db.prepare('DELETE FROM pagos WHERE pedido_id=?').run(pid);
    (pagos||[]).forEach(pg => db.prepare('INSERT INTO pagos (id,pedido_id,monto,fecha,tipo,nota) VALUES (?,?,?,?,?,?)').run(uid(),pid,pg.monto||'',pg.fecha||hoy(),pg.tipo||'efectivo',pg.nota||''));
  }
  res.json(pedidoCompleto(db.prepare('SELECT * FROM pedidos WHERE id=?').get(pid)));
});

app.patch('/api/pedidos/:id/estado', (req, res) => {
  const { estado } = req.body;
  db.prepare("UPDATE pedidos SET estado=?,modificado=datetime('now','localtime') WHERE id=?").run(estado, req.params.id);
  res.json({ ok: true });
});

app.delete('/api/pedidos/:id', (req, res) => {
  db.prepare('DELETE FROM pedidos WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

// ARCHIVOS
app.post('/api/pedidos/:id/archivos', upload.array('files', 10), (req, res) => {
  const pid = req.params.id; const inserted = [];
  (req.files||[]).forEach(f => {
    const id = uid();
    db.prepare('INSERT INTO archivos (id,pedido_id,nombre,tipo,ruta) VALUES (?,?,?,?,?)').run(id, pid, f.originalname, f.mimetype, '/uploads/'+f.filename);
    inserted.push({ id, nombre: f.originalname, tipo: f.mimetype, ruta: '/uploads/'+f.filename });
  });
  res.json(inserted);
});

app.delete('/api/archivos/:id', (req, res) => {
  const arch = db.prepare('SELECT * FROM archivos WHERE id=?').get(req.params.id);
  if (arch) {
    const fp = path.join(UPLOADS_DIR, path.basename(arch.ruta));
    if (fs.existsSync(fp)) fs.unlinkSync(fp);
    db.prepare('DELETE FROM archivos WHERE id=?').run(req.params.id);
  }
  res.json({ ok: true });
});

// CLIENTES
app.get('/api/clientes', (req, res) => {
  const { q } = req.query;
  let sql = 'SELECT * FROM clientes WHERE 1=1';
  const params = [];
  if (q) { sql += ' AND (nombre LIKE ? OR tel LIKE ?)'; params.push(`%${q}%`,`%${q}%`); }
  sql += ' ORDER BY nombre';
  const clientes = db.prepare(sql).all(...params);
  clientes.forEach(c => { c.pedidos = db.prepare('SELECT id,ref,estado,fecha_pedido,valor FROM pedidos WHERE cliente_id=? ORDER BY creado DESC').all(c.id); });
  res.json(clientes);
});

app.get('/api/clientes/:id', (req, res) => {
  const c = db.prepare('SELECT * FROM clientes WHERE id=?').get(req.params.id);
  if (!c) return res.status(404).json({ error: 'No encontrado' });
  c.pedidos = db.prepare('SELECT id,ref,estado,fecha_pedido,fecha_entrega,valor,urgente FROM pedidos WHERE cliente_id=? ORDER BY creado DESC').all(c.id);
  res.json(c);
});

app.put('/api/clientes/:id', (req, res) => {
  const { nombre, tel, email, notas } = req.body;
  db.prepare('UPDATE clientes SET nombre=?,tel=?,email=?,notas=? WHERE id=?').run(nombre,tel||'',email||'',notas||'',req.params.id);
  res.json({ ok: true });
});

// STATS
app.get('/api/stats', (req, res) => {
  const total    = db.prepare("SELECT COUNT(*) as n FROM pedidos WHERE estado!='entregado'").get().n;
  const listos   = db.prepare("SELECT COUNT(*) as n FROM pedidos WHERE estado='listo'").get().n;
  const urgentes = db.prepare("SELECT COUNT(*) as n FROM pedidos WHERE urgente=1 AND estado!='entregado'").get().n;
  const clientes = db.prepare('SELECT COUNT(*) as n FROM clientes').get().n;
  const mes = new Date().toISOString().slice(0,7);
  const ingresos = db.prepare("SELECT COALESCE(SUM(CAST(REPLACE(REPLACE(REPLACE(monto,'$',''),'.',''),',','') AS INTEGER)),0) as t FROM pagos WHERE fecha LIKE ?").get(mes+'%').t;
  res.json({ total, listos, urgentes, clientes, ingresos });
});

// EXPORT CSV
app.get('/api/export/csv', (req, res) => {
  const { estado } = req.query;
  let sql = 'SELECT * FROM pedidos WHERE 1=1';
  const params = [];
  if (estado && estado !== 'todos') { sql += ' AND estado=?'; params.push(estado); }
  const pedidos = db.prepare(sql+' ORDER BY creado DESC').all(...params).map(pedidoCompleto);
  const rows = [['Ref','Cliente','Tel','Estado','Urgente','Tipos','Valor','Pagado','Saldo','F.Pedido','F.Entrega','Notas']];
  const EL = {nuevo:'Nuevo',diseno:'En diseño',aprobacion:'Aprobación',produccion:'En producción',listo:'Listo',entregado:'Entregado'};
  const TL = {estampado:'Estampado',impresion:'Impresión',diseno:'Diseño',publicidad:'Publicidad',rotulacion:'Rotulación',otro:'Otro'};
  pedidos.forEach(p => {
    const tipos = [...new Set(p.encargos.map(e=>e.tipo))].map(t=>TL[t]||t).join(' / ');
    const val = parseInt((p.valor||'').replace(/\D/g,''))||0;
    const pag = p.pagos.reduce((a,x)=>a+(parseInt((x.monto||'').replace(/\D/g,''))||0),0);
    rows.push([p.ref,p.nombre,p.tel||'',EL[p.estado]||p.estado,p.urgente?'Sí':'No',tipos,val,pag,Math.max(0,val-pag),p.fecha_pedido||'',p.fecha_entrega||'',p.notas||'']);
  });
  const csv = '\uFEFF' + rows.map(r=>r.map(c=>'"'+String(c).replace(/"/g,'""')+'"').join(',')).join('\n');
  res.setHeader('Content-Type','text/csv; charset=utf-8');
  res.setHeader('Content-Disposition','attachment; filename="pedidos_agencia.csv"');
  res.send(csv);
});

app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

app.listen(PORT, () => console.log(`✅ Servidor corriendo en http://localhost:${PORT}`));
