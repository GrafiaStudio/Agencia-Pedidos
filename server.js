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
try { db.exec("ALTER TABLE enc_items ADD COLUMN suministrado INTEGER DEFAULT 0"); } catch(e){}
try { db.exec("ALTER TABLE encargos ADD COLUMN categorias TEXT DEFAULT '[]'"); } catch(e){}
try { db.exec("ALTER TABLE encargos ADD COLUMN subcategorias TEXT DEFAULT '[]'"); } catch(e){}
try { db.exec("ALTER TABLE pedidos ADD COLUMN valor_final_calc TEXT"); } catch(e){}
try { db.exec("ALTER TABLE pagos ADD COLUMN monto_calc TEXT"); } catch(e){}
try { db.exec("ALTER TABLE costos ADD COLUMN monto_calc TEXT"); } catch(e){}
try { db.exec("ALTER TABLE costos ADD COLUMN cantidad TEXT DEFAULT ''"); } catch(e){}
try { db.exec("ALTER TABLE costos ADD COLUMN valor_unitario TEXT DEFAULT ''"); } catch(e){}
try { db.exec("ALTER TABLE costos ADD COLUMN valor_unitario_calc TEXT"); } catch(e){}
// ── WORKSPACES (aislamiento multi-tenant) ──
// Cada PIN mapea a un workspace independiente. 'main' es el negocio real (PIN=APP_PIN);
// los 'prueba-N' son accesos temporales para testers, con su propio espacio aislado.
// Sin FK hacia workspaces (consistente con el resto del esquema, que tampoco usa FKs
// estrictas en todos los campos) y sin separar el contador de refs (ver nextRef): el
// aislamiento pedido es sobre los datos, no sobre la numeración de referencia.
db.exec(`CREATE TABLE IF NOT EXISTS workspaces(
  id TEXT PRIMARY KEY, nombre TEXT NOT NULL, pin TEXT UNIQUE NOT NULL,
  tipo TEXT DEFAULT 'prueba', creado TEXT DEFAULT(datetime('now','localtime')))`);
const seedWs=db.prepare(`INSERT INTO workspaces(id,nombre,pin,tipo) VALUES(?,?,?,?)
  ON CONFLICT(id) DO UPDATE SET pin=excluded.pin`);
seedWs.run('main','GRAFÍA Studio',APP_PIN,'real');
[['prueba-1','0010'],['prueba-2','0021'],['prueba-3','0032'],['prueba-4','0043'],['prueba-5','0054']]
  .forEach(([id,pin])=>{ try{ seedWs.run(id,`Workspace de prueba ${id.split('-')[1]}`,pin,'prueba'); }
  catch(e){ console.error('Seed workspace falló:',id,e.message); } });

// ── CONFIGURACIÓN DEL NEGOCIO (una fila por workspace) ──
db.exec(`CREATE TABLE IF NOT EXISTS configuracion_negocio(
  workspace_id TEXT PRIMARY KEY,
  nombre_negocio TEXT DEFAULT '',
  logo_ruta TEXT DEFAULT '',
  direccion TEXT DEFAULT '',
  telefono TEXT DEFAULT '',
  email TEXT DEFAULT '',
  nit TEXT DEFAULT '',
  moneda_prefijo TEXT DEFAULT '$',
  decimales INTEGER DEFAULT 0,
  separador_miles TEXT DEFAULT '.',
  formato_fecha TEXT DEFAULT 'DD/MM/AAAA',
  zona_horaria TEXT DEFAULT 'America/Bogota',
  dias_validez_cotizacion INTEGER DEFAULT 15,
  estado_default_cotizacion INTEGER DEFAULT 0,
  metodos_pago TEXT DEFAULT '["efectivo","transferencia","nequi","daviplata","otro"]',
  alertas_entrega INTEGER DEFAULT 1,
  dias_anticipacion_entrega INTEGER DEFAULT 3,
  iva_activo INTEGER DEFAULT 0,
  iva_porcentaje INTEGER DEFAULT 19,
  iva_desglosado INTEGER DEFAULT 0
)`);
try { db.exec("ALTER TABLE configuracion_negocio ADD COLUMN iva_activo INTEGER DEFAULT 0"); } catch(e){}
try { db.exec("ALTER TABLE configuracion_negocio ADD COLUMN iva_porcentaje INTEGER DEFAULT 19"); } catch(e){}
try { db.exec("ALTER TABLE configuracion_negocio ADD COLUMN iva_desglosado INTEGER DEFAULT 0"); } catch(e){}
try { db.exec("ALTER TABLE fichas_producto ADD COLUMN stock_actual INTEGER"); } catch(e){}
try { db.exec("ALTER TABLE fichas_producto ADD COLUMN stock_minimo INTEGER"); } catch(e){}
try { db.exec("ALTER TABLE fichas_producto ADD COLUMN regla_lleva INTEGER"); } catch(e){}
try { db.exec("ALTER TABLE fichas_producto ADD COLUMN regla_paga INTEGER"); } catch(e){}
try { db.exec("ALTER TABLE fichas_producto ADD COLUMN combo_precio_modo TEXT DEFAULT 'global'"); } catch(e){}
try { db.exec("ALTER TABLE combo_composicion ADD COLUMN componente_nombre TEXT DEFAULT ''"); } catch(e){}
try { db.exec("ALTER TABLE combo_composicion ADD COLUMN precio_unitario TEXT DEFAULT ''"); } catch(e){}
try { db.exec("ALTER TABLE combo_composicion ADD COLUMN precio_unitario_calc TEXT"); } catch(e){}
try { db.exec("ALTER TABLE enc_items ADD COLUMN ficha_id TEXT"); } catch(e){}
try { db.exec("ALTER TABLE pedidos ADD COLUMN stock_consumido TEXT"); } catch(e){}

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
db.exec(`CREATE TABLE IF NOT EXISTS combo_composicion(
  id TEXT PRIMARY KEY,
  ficha_id TEXT REFERENCES fichas_producto(id) ON DELETE CASCADE,
  componente_ficha_id TEXT NOT NULL,
  cantidad_consumida INTEGER NOT NULL,
  orden INTEGER DEFAULT 0,
  workspace_id TEXT
)`);
db.exec(`CREATE TABLE IF NOT EXISTS etiquetas_negocio(
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  nombre TEXT NOT NULL,
  color TEXT DEFAULT 'slate',
  subs TEXT DEFAULT '[]',
  activo INTEGER DEFAULT 1,
  orden INTEGER DEFAULT 0
)`);

const FORMATOS_FECHA=['DD/MM/AAAA','MM/DD/AAAA','AAAA-MM-DD'];
const SEPARADORES_MILES=['.',','];
const METODOS_PAGO_VALIDOS=['efectivo','transferencia','nequi','daviplata','contraentrega','otro'];
const ZONAS_HORARIAS=typeof Intl.supportedValuesOf==='function'
  ?new Set(Intl.supportedValuesOf('timeZone'))
  :new Set(['America/Bogota']);
const CFG_DEFAULTS={
  nombre_negocio:'',logo_ruta:'',direccion:'',telefono:'',email:'',nit:'',
  moneda_prefijo:'$',decimales:0,separador_miles:'.',formato_fecha:'DD/MM/AAAA',
  zona_horaria:'America/Bogota',dias_validez_cotizacion:15,estado_default_cotizacion:0,
  metodos_pago:['efectivo','transferencia','nequi','daviplata','otro'],
  alertas_entrega:1,dias_anticipacion_entrega:3,
  iva_activo:0,iva_porcentaje:19,iva_desglosado:0
};
function getConfiguracion(wsId){
  const row=db.prepare('SELECT * FROM configuracion_negocio WHERE workspace_id=?').get(wsId);
  if(!row)return{...CFG_DEFAULTS};
  let metodos;
  try{const a=JSON.parse(row.metodos_pago);metodos=Array.isArray(a)?a:CFG_DEFAULTS.metodos_pago}
  catch(e){metodos=CFG_DEFAULTS.metodos_pago}
  return{
    nombre_negocio:row.nombre_negocio||'',
    logo_ruta:row.logo_ruta||'',
    direccion:row.direccion||'',
    telefono:row.telefono||'',
    email:row.email||'',
    nit:row.nit||'',
    moneda_prefijo:row.moneda_prefijo||CFG_DEFAULTS.moneda_prefijo,
    decimales:row.decimales?1:0,
    separador_miles:row.separador_miles||CFG_DEFAULTS.separador_miles,
    formato_fecha:row.formato_fecha||CFG_DEFAULTS.formato_fecha,
    zona_horaria:row.zona_horaria||CFG_DEFAULTS.zona_horaria,
    dias_validez_cotizacion:row.dias_validez_cotizacion??CFG_DEFAULTS.dias_validez_cotizacion,
    estado_default_cotizacion:row.estado_default_cotizacion?1:0,
    metodos_pago:metodos,
    alertas_entrega:row.alertas_entrega?1:0,
    dias_anticipacion_entrega:row.dias_anticipacion_entrega??CFG_DEFAULTS.dias_anticipacion_entrega,
    iva_activo:row.iva_activo?1:0,
    iva_porcentaje:row.iva_porcentaje??CFG_DEFAULTS.iva_porcentaje,
    iva_desglosado:row.iva_desglosado?1:0
  };
}

['clientes','pedidos','encargos','enc_items','pagos','costos','historial','archivos'].forEach(t=>{
  try { db.exec(`ALTER TABLE ${t} ADD COLUMN workspace_id TEXT`); } catch(e){}
});
try { db.exec(`CREATE INDEX IF NOT EXISTS idx_pedidos_workspace ON pedidos(workspace_id)`); } catch(e){}
try { db.exec(`CREATE INDEX IF NOT EXISTS idx_clientes_workspace ON clientes(workspace_id)`); } catch(e){}

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
// Migración única: asigna workspace_id='main' a todos los datos creados antes de existir
// el concepto de workspace (todo lo real de GRAFÍA Studio hasta hoy).
try {
  const yaCorridaWs=db.prepare("SELECT 1 FROM migraciones WHERE nombre=?").get('backfill_workspace_main_v1');
  if(!yaCorridaWs){
    ['clientes','pedidos','encargos','enc_items','pagos','costos','historial','archivos'].forEach(t=>{
      db.exec(`UPDATE ${t} SET workspace_id='main' WHERE workspace_id IS NULL`);
    });
    db.prepare("INSERT INTO migraciones(nombre) VALUES(?)").run('backfill_workspace_main_v1');
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
function hoy(wsId){
  const tz=wsId?getConfiguracion(wsId).zona_horaria:CFG_DEFAULTS.zona_horaria;
  try{return new Date().toLocaleDateString('en-CA',{timeZone:tz})}
  catch(e){return new Date().toISOString().split('T')[0]}
}
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

function resolverCategoriasEncargo(enc){
  let cats=[]; try{cats=JSON.parse(enc.categorias||'[]')}catch(e){cats=[]}
  if(!cats.length&&enc.categoria)cats=[enc.categoria];
  let subs=[]; try{subs=JSON.parse(enc.subcategorias||'[]')}catch(e){subs=[]}
  if(!subs.length&&enc.subcategoria)subs=[enc.subcategoria];
  enc.categorias=cats;
  enc.subcategorias=subs;
}
function pedidoCompleto(p){
  if(!p)return null;
  const encargos=db.prepare('SELECT * FROM encargos WHERE pedido_id=? ORDER BY orden').all(p.id);
  encargos.forEach(enc=>{enc.items=db.prepare('SELECT * FROM enc_items WHERE encargo_id=? ORDER BY orden').all(enc.id);resolverCategoriasEncargo(enc)});
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

function addHist(pid,txt,wsId){
  db.prepare('INSERT INTO historial(id,pedido_id,texto,fecha,hora,workspace_id)VALUES(?,?,?,?,?,?)').run(uid(),pid,txt,hoy(wsId),ahora(),wsId);
}

function saveEncargos(pid,encargos,wsId){
  db.prepare('DELETE FROM encargos WHERE pedido_id=? AND workspace_id=?').run(pid,wsId);
  (encargos||[]).forEach((enc,i)=>{
    const eid=enc.id||uid();
    db.prepare('INSERT INTO encargos(id,pedido_id,numero,categoria,subcategoria,categorias,subcategorias,estado,valor,valor_calc,anotacion,orden,workspace_id)VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)')
      .run(eid,pid,enc.numero||i+1,'','',JSON.stringify(enc.categorias||[]),JSON.stringify(enc.subcategorias||[]),enc.estado||'Nuevo',enc.valor||'',normCalc(enc.valor),enc.anotacion||'',i,wsId);
    db.prepare('DELETE FROM enc_items WHERE encargo_id=?').run(eid);
    (enc.items||[]).forEach((it,j)=>{
      db.prepare('INSERT INTO enc_items(id,encargo_id,cantidad,detalle,valor_unitario,valor_unitario_calc,ficha_id,suministrado,orden,workspace_id)VALUES(?,?,?,?,?,?,?,?,?,?)').run(uid(),eid,it.cantidad||'',it.detalle||'',it.valor_unitario||'0',normCalc(it.valor_unitario)||'0',it.ficha_id||null,it.suministrado?1:0,j,wsId);
    });
  });
}
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
  encargos.forEach(enc=>{
    const items=db.prepare('SELECT cantidad,ficha_id FROM enc_items WHERE encargo_id=? AND ficha_id IS NOT NULL').all(enc.id);
    items.forEach(it=>acumular(it.ficha_id,toNum(it.cantidad)));
  });
  const resultado=[];
  Object.entries(consumo).forEach(([fichaId,cantidad])=>{
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

function asegurarCliente(nombre,tel,cid,wsId){
  if(cid){
    const existe=db.prepare('SELECT id FROM clientes WHERE id=? AND workspace_id=?').get(cid,wsId);
    if(!existe)cid=null; // cliente_id de otro workspace (o inexistente): se ignora, no se usa a ciegas
  }
  if(cid){
    if(nombre)db.prepare('UPDATE clientes SET nombre=? WHERE id=? AND workspace_id=?').run(nombre.trim(),cid,wsId);
    if(tel)db.prepare('UPDATE clientes SET tel=? WHERE id=? AND workspace_id=?').run(tel,cid,wsId);
    return cid;
  }
  const ex=db.prepare('SELECT id FROM clientes WHERE lower(nombre)=lower(?) AND workspace_id=?').get(nombre.trim(),wsId);
  if(ex){if(tel)db.prepare('UPDATE clientes SET tel=? WHERE id=? AND workspace_id=?').run(tel,ex.id,wsId);return ex.id}
  const id=uid(); db.prepare('INSERT INTO clientes(id,nombre,tel,workspace_id)VALUES(?,?,?,?)').run(id,nombre.trim(),tel||'',wsId); return id;
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

// ── FICHAS DE PRODUCTO: helpers ──
const TIPOS_PRECIO_VALIDOS=['unitario','escalonado','promocional','combo','regla'];
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
function validarFicha(b,wsId,fid){
  const errores=[];
  if(!String(b.nombre||'').trim())errores.push('El nombre del producto no puede estar vacío');
  if(b.tipo_precio!==undefined&&!TIPOS_PRECIO_VALIDOS.includes(b.tipo_precio))errores.push('Tipo de precio no válido');
  if(b.margen_tipo!==undefined&&!MARGEN_TIPOS_VALIDOS.includes(b.margen_tipo))errores.push('Tipo de margen no válido');
  if(definido(b.margen_valor)&&!isFinite(parseFloat(b.margen_valor)))errores.push('El valor del margen no es un número válido');
  if(definido(b.precio_base)&&evalExpr(b.precio_base)===null)errores.push('El Precio base no es una expresión válida');
  if(definido(b.stock_actual)&&(!Number.isInteger(b.stock_actual)||b.stock_actual<0))errores.push('Stock actual no es un número válido');
  if(definido(b.stock_minimo)&&(!Number.isInteger(b.stock_minimo)||b.stock_minimo<0))errores.push('Stock mínimo no es un número válido');
  (b.insumos||[]).forEach((it,i)=>{
    if(definido(it.costo_unitario)&&evalExpr(it.costo_unitario)===null)errores.push(`Costo unitario del insumo #${i+1} no es una expresión válida`);
  });
  if(b.tipo_precio==='escalonado'){
    (b.rangos||[]).forEach((r,i)=>{
      if(!Number.isFinite(r.desde)||r.desde<0)errores.push(`Rango #${i+1}: "Desde" no es válido`);
      if(r.hasta!=null&&(!Number.isFinite(r.hasta)||r.hasta<r.desde))errores.push(`Rango #${i+1}: "Hasta" no es válido`);
      if(!Number.isFinite(r.precio)||r.precio<0)errores.push(`Rango #${i+1}: precio no es válido`);
    });
  }
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
  if(b.tipo_precio==='regla'){
    if(!Number.isInteger(b.regla_lleva)||b.regla_lleva<=0)errores.push('"Lleva" debe ser un número entero mayor a 0');
    if(!Number.isInteger(b.regla_paga)||b.regla_paga<=0)errores.push('"Paga" debe ser un número entero mayor a 0');
    if(Number.isInteger(b.regla_lleva)&&Number.isInteger(b.regla_paga)&&b.regla_paga>=b.regla_lleva)errores.push('"Paga" debe ser menor que "Lleva" para que sea una promoción real');
  }
  return errores;
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
    if(definido(c.valor_unitario)&&evalExpr(c.valor_unitario)===null)errores.push(`Valor unitario del costo #${i+1} no es una expresión válida`);
  });
  return errores;
}

// ── AUTENTICACIÓN (PIN simple) ──
app.post('/api/auth/login',(req,res)=>{
  const{pin}=req.body||{};
  const ws=pin?db.prepare('SELECT id FROM workspaces WHERE pin=?').get(String(pin)):null;
  if(!ws){
    return res.status(401).json({error:'PIN incorrecto'});
  }
  const token=jwt.sign({wsId:ws.id},JWT_SECRET,{expiresIn:'90d'});
  res.json({token});
});

app.use('/api',(req,res,next)=>{
  if(req.path==='/auth/login')return next();
  const header=req.headers.authorization||'';
  const token=header.startsWith('Bearer ')?header.slice(7):null;
  if(!token)return res.status(401).json({error:'No autorizado, ingresa el PIN'});
  try{
    const payload=jwt.verify(token,JWT_SECRET);
    if(!payload.wsId)return res.status(401).json({error:'Sesión expirada, ingresa el PIN de nuevo'});
    req.wsId=payload.wsId;
    next();
  }catch(e){
    res.status(401).json({error:'Sesión expirada, ingresa el PIN de nuevo'});
  }
});

// ── PEDIDOS ──
app.get('/api/pedidos',(req,res)=>{
  const{estado,urgente,q}=req.query;
  let sql='SELECT * FROM pedidos WHERE workspace_id=?'; const params=[req.wsId];
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
  const p=db.prepare('SELECT * FROM pedidos WHERE id=? AND workspace_id=?').get(req.params.id,req.wsId);
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
    const cid=asegurarCliente(b.nombre,b.tel,b.cliente_id||null,req.wsId);
    db.prepare(`INSERT INTO pedidos(id,ref,cliente_id,nombre,tel,urgente,entregado,cancelado,pendiente_pago,es_cotizacion,valor_final,valor_final_calc,fecha_pedido,fecha_entrega,notas,workspace_id)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
      .run(id,ref,cid,b.nombre.trim(),b.tel||'',b.urgente?1:0,b.entregado?1:0,b.cancelado?1:0,b.pendiente_pago?1:0,b.es_cotizacion?1:0,normVF(b.valor_final),normCalc(b.valor_final),hoy(req.wsId),b.fecha_entrega||'',b.notas||'',req.wsId);
    saveEncargos(id,b.encargos,req.wsId);
    (b.pagos||[]).forEach(pg=>db.prepare('INSERT INTO pagos(id,pedido_id,monto,monto_calc,fecha,tipo,nota,workspace_id)VALUES(?,?,?,?,?,?,?,?)').run(uid(),id,pg.monto||'',normCalc(pg.monto),pg.fecha||hoy(req.wsId),pg.tipo||'efectivo',pg.nota||'',req.wsId));
    (b.costos||[]).forEach(c=>db.prepare('INSERT INTO costos(id,pedido_id,encargo_id,descripcion,cantidad,valor_unitario,valor_unitario_calc,monto,monto_calc,workspace_id)VALUES(?,?,?,?,?,?,?,?,?,?)').run(uid(),id,c.encargo_id||'',c.descripcion||'',c.cantidad||'',c.valor_unitario||'',normCalc(c.valor_unitario),c.monto||'',normCalc(c.monto),req.wsId));
    if(!b.es_cotizacion){
      const consumo=descontarStock(id,req.wsId);
      db.prepare('UPDATE pedidos SET stock_consumido=? WHERE id=?').run(JSON.stringify(consumo),id);
    }
    addHist(id,'Pedido creado',req.wsId);
    res.json(pedidoCompleto(db.prepare('SELECT * FROM pedidos WHERE id=?').get(id)));
  }catch(e){logError('POST /api/pedidos',e);res.status(500).json({error:e.message})}
});

app.put('/api/pedidos/:id',(req,res)=>{
  try{
    const b=req.body; const pid=req.params.id;
    const p=db.prepare('SELECT * FROM pedidos WHERE id=? AND workspace_id=?').get(pid,req.wsId);
    if(!p)return res.status(404).json({error:'No encontrado'});
    const errores=validarPedido(b);
    if(errores.length)return res.status(400).json({error:errores.join('. ')});
    const cid=asegurarCliente(b.nombre||p.nombre,b.tel,b.cliente_id||p.cliente_id,req.wsId);
    // Log cambios de estado checkboxes
    if(b.entregado&&!p.entregado)addHist(pid,'Pedido marcado como entregado',req.wsId);
    if(b.cancelado&&!p.cancelado)addHist(pid,'Pedido cancelado',req.wsId);
    db.prepare(`UPDATE pedidos SET nombre=?,tel=?,cliente_id=?,urgente=?,entregado=?,cancelado=?,pendiente_pago=?,es_cotizacion=?,valor_final=?,valor_final_calc=?,fecha_entrega=?,notas=?,modificado=datetime('now','localtime') WHERE id=? AND workspace_id=?`)
      .run(b.nombre||p.nombre,(b.tel!==undefined?b.tel:p.tel),cid,b.urgente?1:0,b.entregado?1:0,b.cancelado?1:0,b.pendiente_pago?1:0,b.es_cotizacion?1:0,(b.valor_final!==undefined?normVF(b.valor_final):p.valor_final),(b.valor_final!==undefined?normCalc(b.valor_final):p.valor_final_calc),(b.fecha_entrega!==undefined?b.fecha_entrega:p.fecha_entrega),b.notas!==undefined?b.notas:p.notas,pid,req.wsId);
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
  }catch(e){logError('PUT /api/pedidos/:id',e);res.status(500).json({error:e.message})}
});

app.delete('/api/pedidos/:id',(req,res)=>{
  const p=db.prepare('SELECT stock_consumido FROM pedidos WHERE id=? AND workspace_id=?').get(req.params.id,req.wsId);
  if(!p)return res.status(404).json({error:'No encontrado'});
  if(p.stock_consumido)restaurarStock(p.stock_consumido,req.wsId);
  db.prepare('DELETE FROM pedidos WHERE id=? AND workspace_id=?').run(req.params.id,req.wsId);
  res.json({ok:true});
});

// Archivos
app.post('/api/pedidos/:id/archivos',(req,res,next)=>{
  const p=db.prepare('SELECT id FROM pedidos WHERE id=? AND workspace_id=?').get(req.params.id,req.wsId);
  if(!p)return res.status(404).json({error:'No encontrado'});
  next();
},upload.array('files',10),(req,res)=>{
  const pid=req.params.id; const inserted=[];
  (req.files||[]).forEach(f=>{
    const id=uid();
    db.prepare('INSERT INTO archivos(id,pedido_id,nombre,tipo,ruta,workspace_id)VALUES(?,?,?,?,?,?)').run(id,pid,f.originalname,f.mimetype,'/uploads/'+f.filename,req.wsId);
    inserted.push({id,nombre:f.originalname,tipo:f.mimetype,ruta:'/uploads/'+f.filename});
  });
  if(req.files.length) addHist(pid,`${req.files.length} archivo(s) adjuntado(s)`,req.wsId);
  res.json(inserted);
});
app.delete('/api/archivos/:id',(req,res)=>{
  const a=db.prepare('SELECT * FROM archivos WHERE id=? AND workspace_id=?').get(req.params.id,req.wsId);
  if(!a)return res.status(404).json({error:'No encontrado'});
  const fp=path.join(UP_DIR,path.basename(a.ruta));if(fs.existsSync(fp))fs.unlinkSync(fp);
  db.prepare('DELETE FROM archivos WHERE id=?').run(req.params.id);
  res.json({ok:true});
});

// Clientes
app.get('/api/clientes',(req,res)=>{
  const{q}=req.query; let sql='SELECT * FROM clientes WHERE workspace_id=?'; const params=[req.wsId];
  if(q){sql+=' AND(nombre LIKE ? OR tel LIKE ?)';params.push(`%${q}%`,`%${q}%`)}
  sql+=' ORDER BY nombre';
  const clientes=db.prepare(sql).all(...params);
  clientes.forEach(c=>{c.pedidos=db.prepare('SELECT id,ref,entregado,cancelado,fecha_pedido,fecha_entrega FROM pedidos WHERE cliente_id=? ORDER BY creado DESC').all(c.id)});
  res.json(clientes);
});
app.get('/api/clientes/:id',(req,res)=>{
  const c=db.prepare('SELECT * FROM clientes WHERE id=? AND workspace_id=?').get(req.params.id,req.wsId);
  if(!c)return res.status(404).json({error:'No encontrado'});
  const peds=db.prepare('SELECT id,ref,entregado,cancelado,urgente,es_cotizacion,valor_final,valor_final_calc,fecha_pedido,fecha_entrega FROM pedidos WHERE cliente_id=? ORDER BY creado DESC').all(c.id);
  c.pedidos=peds.map(p=>{
    p.es_cotizacion=!!p.es_cotizacion;
    const encs=db.prepare('SELECT id,categoria,subcategoria,categorias,subcategorias,valor,valor_calc FROM encargos WHERE pedido_id=? ORDER BY orden').all(p.id);
    encs.forEach(e=>{e.items=db.prepare('SELECT cantidad,valor_unitario,valor_unitario_calc FROM enc_items WHERE encargo_id=?').all(e.id);resolverCategoriasEncargo(e)});
    p.valor_sugerido=calcValorSugerido(encs);
    p.valor_total=valorOficialPedido(p,p.valor_sugerido);
    p.encargosResumen=encs.map(e=>({categorias:e.categorias,subcategorias:e.subcategorias}));
    return p;
  });
  res.json(c);
});

// Stats
app.get('/api/stats',(req,res)=>{
  const wsId=req.wsId;
  const activos=db.prepare("SELECT COUNT(*) as n FROM pedidos WHERE workspace_id=? AND entregado=0 AND cancelado=0 AND es_cotizacion=0").get(wsId).n;
  const urgentes=db.prepare("SELECT COUNT(*) as n FROM pedidos WHERE workspace_id=? AND urgente=1 AND entregado=0 AND cancelado=0 AND es_cotizacion=0").get(wsId).n;
  // Listo: todos sus encargos en Listo/Entregado y pedido no entregado/cancelado/cotización
  const candidatos=db.prepare("SELECT id FROM pedidos WHERE workspace_id=? AND entregado=0 AND cancelado=0 AND es_cotizacion=0").all(wsId);
  let listos=0;
  candidatos.forEach(p=>{
    const encs=db.prepare('SELECT estado FROM encargos WHERE pedido_id=?').all(p.id);
    if(encs.length&&encs.every(e=>e.estado==='Listo'||e.estado==='Entregado'))listos++;
  });
  const clientes=db.prepare('SELECT COUNT(*) as n FROM clientes WHERE workspace_id=?').get(wsId).n;
  const pendPago=db.prepare("SELECT COUNT(*) as n FROM pedidos WHERE workspace_id=? AND pendiente_pago=1 AND entregado=0 AND cancelado=0 AND es_cotizacion=0").get(wsId).n;
  const cotizaciones=db.prepare("SELECT COUNT(*) as n FROM pedidos WHERE workspace_id=? AND es_cotizacion=1").get(wsId).n;
  res.json({activos,urgentes,listos,clientes,pendPago,cotizaciones});
});

// Export CSV
app.get('/api/export/csv',(req,res)=>{
  const{estado}=req.query;
  let sql='SELECT * FROM pedidos WHERE workspace_id=?'; const params=[req.wsId];
  if(estado==='entregado')sql+=' AND entregado=1';
  else if(estado==='cancelado')sql+=' AND cancelado=1';
  else if(estado&&estado!=='todos')sql+=' AND entregado=0 AND cancelado=0';
  const pedidos=db.prepare(sql+' ORDER BY creado DESC').all(...params).map(pedidoCompleto);
  const rows=[['Ref','Cliente','Tel','Estado','Urgente','Encargos','Valor Total','Pagado','Saldo','F.Pedido','F.Entrega','Notas']];
  pedidos.forEach(p=>{
    const encRes=(p.encargos||[]).map(e=>`[${(e.categorias||[]).join(', ')}] ${(e.items||[]).map(i=>`${i.cantidad} ${i.detalle}`).join(', ')}`).join(' | ');
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
  const pedidos=db.prepare('SELECT * FROM pedidos WHERE workspace_id=?').all(req.wsId).map(pedidoCompleto);
  const rows=pedidos.map(p=>{
    const ing=p.valor_total||0;
    const cos=(p.costos||[]).reduce((a,c)=>a+toNum(c.monto_calc),0);
    const pag=(p.pagos||[]).reduce((a,x)=>a+toNum(x.monto_calc),0);
    return{ref:p.ref,nombre:p.nombre,ing,cos,gan:ing-cos,pag,saldo:Math.max(0,ing-pag)};
  }).filter(r=>r.ing||r.cos);
  res.json(rows);
});

// ── INFORMACIÓN DE LA APP (estática, no es dato por workspace) ──
const APP_INFO={
  nombre:'GRAFÍA Studio',
  fecha_actualizacion:'2026-06-26',
  novedades:[
    'Inventario: stock por producto con descuento y restauración automática.',
    'Aviso de stock insuficiente al armar un pedido.',
    'Nueva sección de Ayuda y About.'
  ]
};
app.get('/api/app-info',(req,res)=>{
  res.json({...APP_INFO,version:require('./package.json').version});
});

// ── ETIQUETAS DEL NEGOCIO (categorías y subcategorías personalizables) ──
const PALETA_ETIQUETAS=['purple','amber','orange','teal','green','slate','red','pink','blue','yellow','brown','indigo'];
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
app.get('/api/configuracion',(req,res)=>{
  res.json(getConfiguracion(req.wsId));
});

app.put('/api/configuracion',(req,res)=>{
  try{
    const b=req.body||{};
    const errores=[];
    if(b.formato_fecha!==undefined&&!FORMATOS_FECHA.includes(b.formato_fecha))errores.push('Formato de fecha no válido');
    if(b.separador_miles!==undefined&&!SEPARADORES_MILES.includes(b.separador_miles))errores.push('Separador de miles no válido');
    if(b.zona_horaria!==undefined&&!ZONAS_HORARIAS.has(b.zona_horaria))errores.push('Zona horaria no válida');
    if(b.metodos_pago!==undefined&&(!Array.isArray(b.metodos_pago)||b.metodos_pago.some(m=>!METODOS_PAGO_VALIDOS.includes(m))))errores.push('Métodos de pago no válidos');
    if(b.dias_validez_cotizacion!==undefined&&(!Number.isInteger(b.dias_validez_cotizacion)||b.dias_validez_cotizacion<0))errores.push('Días de validez de cotización no válido');
    if(b.dias_anticipacion_entrega!==undefined&&(!Number.isInteger(b.dias_anticipacion_entrega)||b.dias_anticipacion_entrega<0))errores.push('Días de anticipación no válido');
    if(b.iva_porcentaje!==undefined&&(!Number.isInteger(b.iva_porcentaje)||b.iva_porcentaje<0||b.iva_porcentaje>100))errores.push('Porcentaje de IVA no válido');
    if(errores.length)return res.status(400).json({error:errores.join('. ')});
    const actual=getConfiguracion(req.wsId);
    const nuevo={...actual,...b};
    db.prepare(`INSERT INTO configuracion_negocio
        (workspace_id,nombre_negocio,direccion,telefono,email,nit,moneda_prefijo,decimales,separador_miles,formato_fecha,zona_horaria,dias_validez_cotizacion,estado_default_cotizacion,metodos_pago,alertas_entrega,dias_anticipacion_entrega,iva_activo,iva_porcentaje,iva_desglosado)
      VALUES(@workspace_id,@nombre_negocio,@direccion,@telefono,@email,@nit,@moneda_prefijo,@decimales,@separador_miles,@formato_fecha,@zona_horaria,@dias_validez_cotizacion,@estado_default_cotizacion,@metodos_pago,@alertas_entrega,@dias_anticipacion_entrega,@iva_activo,@iva_porcentaje,@iva_desglosado)
      ON CONFLICT(workspace_id) DO UPDATE SET
        nombre_negocio=excluded.nombre_negocio,direccion=excluded.direccion,telefono=excluded.telefono,
        email=excluded.email,nit=excluded.nit,moneda_prefijo=excluded.moneda_prefijo,decimales=excluded.decimales,
        separador_miles=excluded.separador_miles,formato_fecha=excluded.formato_fecha,zona_horaria=excluded.zona_horaria,
        dias_validez_cotizacion=excluded.dias_validez_cotizacion,estado_default_cotizacion=excluded.estado_default_cotizacion,
        metodos_pago=excluded.metodos_pago,alertas_entrega=excluded.alertas_entrega,dias_anticipacion_entrega=excluded.dias_anticipacion_entrega,
        iva_activo=excluded.iva_activo,iva_porcentaje=excluded.iva_porcentaje,iva_desglosado=excluded.iva_desglosado`)
      .run({
        workspace_id:req.wsId,
        nombre_negocio:nuevo.nombre_negocio||'',
        direccion:nuevo.direccion||'',
        telefono:nuevo.telefono||'',
        email:nuevo.email||'',
        nit:nuevo.nit||'',
        moneda_prefijo:nuevo.moneda_prefijo||'$',
        decimales:nuevo.decimales?1:0,
        separador_miles:nuevo.separador_miles||'.',
        formato_fecha:nuevo.formato_fecha||'DD/MM/AAAA',
        zona_horaria:nuevo.zona_horaria||'America/Bogota',
        dias_validez_cotizacion:Number.isInteger(nuevo.dias_validez_cotizacion)?nuevo.dias_validez_cotizacion:15,
        estado_default_cotizacion:nuevo.estado_default_cotizacion?1:0,
        metodos_pago:JSON.stringify(Array.isArray(nuevo.metodos_pago)?nuevo.metodos_pago:CFG_DEFAULTS.metodos_pago),
        alertas_entrega:nuevo.alertas_entrega?1:0,
        dias_anticipacion_entrega:Number.isInteger(nuevo.dias_anticipacion_entrega)?nuevo.dias_anticipacion_entrega:3,
        iva_activo:nuevo.iva_activo?1:0,
        iva_porcentaje:Number.isInteger(nuevo.iva_porcentaje)?nuevo.iva_porcentaje:19,
        iva_desglosado:nuevo.iva_desglosado?1:0
      });
    res.json(getConfiguracion(req.wsId));
  }catch(e){logError('PUT /api/configuracion',e);res.status(500).json({error:e.message})}
});

app.post('/api/configuracion/logo',upload.single('logo'),(req,res)=>{
  try{
    if(!req.file)return res.status(400).json({error:'No se recibió ningún archivo'});
    const ruta='/uploads/'+req.file.filename;
    db.prepare(`INSERT INTO configuracion_negocio(workspace_id,logo_ruta) VALUES(?,?)
      ON CONFLICT(workspace_id) DO UPDATE SET logo_ruta=excluded.logo_ruta`).run(req.wsId,ruta);
    res.json({logo_ruta:ruta});
  }catch(e){logError('POST /api/configuracion/logo',e);res.status(500).json({error:e.message})}
});

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

// ── PRODUCTOS (fichas de producto) ──
app.get('/api/productos',(req,res)=>{
  const{q,activo}=req.query; let sql='SELECT * FROM fichas_producto WHERE workspace_id=?'; const params=[req.wsId];
  if(q){sql+=' AND nombre LIKE ?';params.push(`%${q}%`)}
  if(activo==='1'){sql+=' AND activo=1'}
  sql+=' ORDER BY nombre';
  res.json(db.prepare(sql).all(...params).map(fichaCompleta));
});

app.get('/api/productos/insumos',(req,res)=>{
  const{q}=req.query;
  let sql=`SELECT i.nombre_insumo,i.proveedor,i.costo_unitario_calc,i.es_variable
    FROM ficha_insumos i JOIN fichas_producto f ON f.id=i.ficha_id
    WHERE f.workspace_id=?`;
  const params=[req.wsId];
  if(q){sql+=' AND i.nombre_insumo LIKE ?';params.push(`%${q}%`)}
  sql+=' ORDER BY i.nombre_insumo LIMIT 8';
  res.json(db.prepare(sql).all(...params).map(r=>({...r,es_variable:!!r.es_variable})));
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
function guardarComposicion(fichaId,componentes,wsId){
  db.prepare('DELETE FROM combo_composicion WHERE ficha_id=?').run(fichaId);
  (componentes||[]).forEach((c,i)=>{
    db.prepare('INSERT INTO combo_composicion(id,ficha_id,componente_ficha_id,componente_nombre,cantidad_consumida,precio_unitario,precio_unitario_calc,orden,workspace_id)VALUES(?,?,?,?,?,?,?,?,?)')
      .run(uid(),fichaId,c.componente_ficha_id||'',c.componente_nombre||'',c.cantidad_consumida,c.precio_unitario||'',normCalc(c.precio_unitario),i,wsId);
  });
}

app.post('/api/productos',(req,res)=>{
  try{
    const b=req.body;
    if(!b.nombre)return res.status(400).json({error:'Nombre requerido'});
    const errores=validarFicha(b,req.wsId);
    if(errores.length)return res.status(400).json({error:errores.join('. ')});
    const id=uid();
    db.prepare(`INSERT INTO fichas_producto(id,workspace_id,nombre,categoria_id,tipo_precio,margen_tipo,margen_valor,precio_base,precio_base_calc,rangos,fecha_inicio,fecha_fin,cantidad_minima,descripcion,activo,stock_actual,stock_minimo,regla_lleva,regla_paga,combo_precio_modo)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
      .run(id,req.wsId,b.nombre.trim(),b.categoria_id||'',b.tipo_precio||'unitario',b.margen_tipo||'fijo',b.margen_valor||'',normVF(b.precio_base),normCalc(b.precio_base),JSON.stringify(b.rangos||[]),b.fecha_inicio||'',b.fecha_fin||'',b.cantidad_minima||'',b.descripcion||'',b.activo===false?0:1,Number.isInteger(b.stock_actual)?b.stock_actual:null,Number.isInteger(b.stock_minimo)?b.stock_minimo:null,Number.isInteger(b.regla_lleva)?b.regla_lleva:null,Number.isInteger(b.regla_paga)?b.regla_paga:null,b.combo_precio_modo||'global');
    guardarInsumos(id,b.insumos,req.wsId);
    guardarComposicion(id,b.componentes,req.wsId);
    res.json(fichaCompleta(db.prepare('SELECT * FROM fichas_producto WHERE id=?').get(id)));
  }catch(e){logError('POST /api/productos',e);res.status(500).json({error:e.message})}
});

app.put('/api/productos/:id',(req,res)=>{
  try{
    const b=req.body; const fid=req.params.id;
    const f=db.prepare('SELECT * FROM fichas_producto WHERE id=? AND workspace_id=?').get(fid,req.wsId);
    if(!f)return res.status(404).json({error:'No encontrado'});
    const errores=validarFicha(b,req.wsId,fid);
    if(errores.length)return res.status(400).json({error:errores.join('. ')});
    db.prepare(`UPDATE fichas_producto SET nombre=?,categoria_id=?,tipo_precio=?,margen_tipo=?,margen_valor=?,precio_base=?,precio_base_calc=?,rangos=?,fecha_inicio=?,fecha_fin=?,cantidad_minima=?,descripcion=?,activo=?,stock_actual=?,stock_minimo=?,regla_lleva=?,regla_paga=?,combo_precio_modo=? WHERE id=? AND workspace_id=?`)
      .run(b.nombre.trim(),b.categoria_id||'',b.tipo_precio||'unitario',b.margen_tipo||'fijo',b.margen_valor||'',normVF(b.precio_base),normCalc(b.precio_base),JSON.stringify(b.rangos||[]),b.fecha_inicio||'',b.fecha_fin||'',b.cantidad_minima||'',b.descripcion||'',b.activo===false?0:1,Number.isInteger(b.stock_actual)?b.stock_actual:null,Number.isInteger(b.stock_minimo)?b.stock_minimo:null,Number.isInteger(b.regla_lleva)?b.regla_lleva:null,Number.isInteger(b.regla_paga)?b.regla_paga:null,b.combo_precio_modo||'global',fid,req.wsId);
    if(b.insumos!==undefined)guardarInsumos(fid,b.insumos,req.wsId);
    if(b.componentes!==undefined)guardarComposicion(fid,b.componentes,req.wsId);
    res.json(fichaCompleta(db.prepare('SELECT * FROM fichas_producto WHERE id=?').get(fid)));
  }catch(e){logError('PUT /api/productos/:id',e);res.status(500).json({error:e.message})}
});

app.delete('/api/productos/:id',(req,res)=>{
  const r=db.prepare('DELETE FROM fichas_producto WHERE id=? AND workspace_id=?').run(req.params.id,req.wsId);
  if(r.changes===0)return res.status(404).json({error:'No encontrado'});
  res.json({ok:true});
});

app.get('*',(req,res)=>res.sendFile(path.join(__dirname,'public','index.html')));
app.listen(PORT,()=>console.log(`✅ GRAFÍA Studio en http://localhost:${PORT}`));
