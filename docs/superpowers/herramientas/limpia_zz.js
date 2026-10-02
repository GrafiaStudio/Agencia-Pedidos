// Borra de la BD LOCAL los datos de prueba «ZZ …» y los usuarios «zz…» (y nada más)
const db = new (require('I:/PROYECTOS CLAUDE/AGENCIA PEDIDOS/agencia/node_modules/better-sqlite3'))('I:/PROYECTOS CLAUDE/AGENCIA PEDIDOS/agencia/db/agencia.db');
const tablas = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(r => r.name);
const con = col => tablas.filter(t => db.prepare(`PRAGMA table_info(${t})`).all().some(c => c.name === col));
const peds = db.prepare("SELECT id FROM pedidos WHERE nombre LIKE 'ZZ %'").all().map(r => r.id);
const encs = peds.length ? db.prepare(`SELECT id FROM encargos WHERE pedido_id IN (${peds.map(() => '?').join(',')})`).all(...peds).map(r => r.id) : [];
const borra = db.transaction(() => { let n = 0;
  for (const t of con('encargo_id')) for (const e of encs) n += db.prepare(`DELETE FROM ${t} WHERE encargo_id=?`).run(e).changes;
  for (const t of con('pedido_id')) for (const p of peds) n += db.prepare(`DELETE FROM ${t} WHERE pedido_id=?`).run(p).changes;
  for (const p of peds) n += db.prepare('DELETE FROM pedidos WHERE id=?').run(p).changes;
  n += db.prepare("DELETE FROM clientes WHERE nombre LIKE 'ZZ %'").run().changes;
  n += db.prepare("DELETE FROM usuarios WHERE usuario LIKE 'zzpiel%'").run().changes; return n; });
console.log('filas de prueba borradas:', borra(), '| quedan ZZ:', db.prepare("SELECT (SELECT COUNT(*) FROM pedidos WHERE nombre LIKE 'ZZ %')+(SELECT COUNT(*) FROM clientes WHERE nombre LIKE 'ZZ %')+(SELECT COUNT(*) FROM usuarios WHERE usuario LIKE 'zzpiel%') n").get().n);
