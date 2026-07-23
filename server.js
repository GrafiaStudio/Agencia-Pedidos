require('dotenv').config();
const express=require('express');
const Database=require('better-sqlite3');
const multer=require('multer');
const cors=require('cors');
const path=require('path');
const fs=require('fs');
const jwt=require('jsonwebtoken');
const bcrypt=require('bcryptjs');

const app=express();
const PORT=process.env.PORT||3000;

const DB_DIR=path.join(__dirname,'db');
// A1 · Los archivos subidos (logo, adjuntos) DEBEN vivir en el volumen persistente, no en el
// código. db/ es donde Railway monta el volumen (por eso la BD sobrevive); antes UP_DIR estaba
// en public/uploads (parte del código → se recreaba vacío en cada deploy y se perdía el logo).
const UP_DIR=path.join(DB_DIR,'uploads');
[DB_DIR,UP_DIR].forEach(d=>{if(!fs.existsSync(d))fs.mkdirSync(d,{recursive:true})});
// Migración única: rescatar lo que haya quedado en la ruta vieja (efímera) hacia el volumen.
try{
  const LEGACY_UP=path.join(__dirname,'public','uploads');
  if(LEGACY_UP!==UP_DIR&&fs.existsSync(LEGACY_UP)){
    for(const f of fs.readdirSync(LEGACY_UP)){
      const src=path.join(LEGACY_UP,f),dst=path.join(UP_DIR,f);
      try{if(fs.statSync(src).isFile()&&!fs.existsSync(dst))fs.copyFileSync(src,dst)}catch(e){}
    }
  }
}catch(e){}

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
try { db.exec("ALTER TABLE pedidos ADD COLUMN costos_manual INTEGER DEFAULT 0"); } catch(e){}
try { db.exec("ALTER TABLE pedidos ADD COLUMN cancel_motivo TEXT DEFAULT ''"); } catch(e){}
try { db.exec("ALTER TABLE pedidos ADD COLUMN cancel_reintegro INTEGER DEFAULT 0"); } catch(e){}
try { db.exec("ALTER TABLE pedidos ADD COLUMN cancel_monto TEXT DEFAULT ''"); } catch(e){}
try { db.exec("ALTER TABLE pedidos ADD COLUMN cancel_monto_calc TEXT DEFAULT ''"); } catch(e){}
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
try { db.exec("ALTER TABLE costos ADD COLUMN auto INTEGER DEFAULT 0"); } catch(e){}
/* ── AUTOCODIFICACIÓN DE VENTA ──────────────────────────────────────────────────────────
   Cada CONFIGURACIÓN vendida (ficha + variantes elegidas + medidas) recibe un código único
   y ESTABLE: si mañana alguien pide exactamente lo mismo, se reusa el mismo código. Sirve
   para que un auditor pueda referenciar lo vendido sin ambigüedad, y para que el vendedor
   pueda inventar productos al vuelo sin llamar al desarrollador. El precio NO entra en la
   identidad: se puede negociar y el código sigue siendo el mismo. La cantidad tampoco.  */
db.exec(`CREATE TABLE IF NOT EXISTS codigos_venta(
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  ficha_id TEXT NOT NULL,
  codigo TEXT NOT NULL,
  clave TEXT NOT NULL,
  descripcion TEXT DEFAULT '',
  consecutivo INTEGER DEFAULT 0,
  usos INTEGER DEFAULT 0,
  creado TEXT DEFAULT(datetime('now','localtime')),
  ultimo_uso TEXT DEFAULT(datetime('now','localtime')))`);
try { db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_codven_clave ON codigos_venta(workspace_id,ficha_id,clave)"); } catch(e){}
try { db.exec("ALTER TABLE enc_items ADD COLUMN codigo_venta TEXT DEFAULT ''"); } catch(e){}
// ── VERSIONADO DE PEDIDOS (v3.0 Fase 2b) ──
db.exec(`CREATE TABLE IF NOT EXISTS pedido_versiones(
  id TEXT PRIMARY KEY, pedido_id TEXT, workspace_id TEXT,
  version INTEGER, snapshot TEXT,
  usuario_id TEXT DEFAULT '', usuario_nombre TEXT DEFAULT '', rol TEXT DEFAULT '', motivo TEXT DEFAULT '',
  creado TEXT DEFAULT(datetime('now','localtime')))`);
try { db.exec("ALTER TABLE historial ADD COLUMN usuario_id TEXT DEFAULT ''"); } catch(e){}
try { db.exec("ALTER TABLE historial ADD COLUMN usuario_nombre TEXT DEFAULT ''"); } catch(e){}
try { db.exec("ALTER TABLE historial ADD COLUMN rol TEXT DEFAULT ''"); } catch(e){}
try { db.exec("ALTER TABLE historial ADD COLUMN motivo TEXT DEFAULT ''"); } catch(e){}
// ── CIERRE DE PEDIDO (v3.0 Fase 3) ──
try { db.exec("ALTER TABLE pedidos ADD COLUMN cerrado INTEGER DEFAULT 0"); } catch(e){}
try { db.exec("ALTER TABLE pedidos ADD COLUMN cerrado_por TEXT DEFAULT ''"); } catch(e){}
try { db.exec("ALTER TABLE pedidos ADD COLUMN cerrado_en TEXT DEFAULT ''"); } catch(e){}
try { db.exec("ALTER TABLE pedidos ADD COLUMN cerrado_motivo TEXT DEFAULT ''"); } catch(e){}
// ── PRODUCCIÓN (v3.0 Fase 4) — responsable y observación técnica por encargo ──
try { db.exec("ALTER TABLE encargos ADD COLUMN responsable_id TEXT DEFAULT ''"); } catch(e){}
try { db.exec("ALTER TABLE encargos ADD COLUMN notas_tec TEXT DEFAULT ''"); } catch(e){}
// ── INVENTARIO DESDE PRODUCCIÓN (v3.0 Fase 5) — consumo real, ledger reversible ──
db.exec(`CREATE TABLE IF NOT EXISTS consumo_inventario(
  id TEXT PRIMARY KEY, workspace_id TEXT, pedido_id TEXT, encargo_id TEXT,
  item_inv_id TEXT, item_nombre TEXT, unidad TEXT DEFAULT '', cantidad REAL,
  usuario_id TEXT DEFAULT '', usuario_nombre TEXT DEFAULT '',
  creado TEXT DEFAULT(datetime('now','localtime')))`);
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

// ── USUARIOS Y ROLES (v3.0 Fase 1) ──
// Multi-usuario dentro de cada workspace. El PIN del workspace sigue sirviendo como
// contraseña del usuario admin (migración sin fricción). Usuario único POR workspace.
db.exec(`CREATE TABLE IF NOT EXISTS roles(
  id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, nombre TEXT NOT NULL,
  permisos TEXT DEFAULT '{}', es_admin INTEGER DEFAULT 0, orden INTEGER DEFAULT 0,
  creado TEXT DEFAULT(datetime('now','localtime')))`);
db.exec(`CREATE TABLE IF NOT EXISTS usuarios(
  id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, usuario TEXT NOT NULL,
  pass_hash TEXT NOT NULL, nombre TEXT DEFAULT '', rol_id TEXT,
  activo INTEGER DEFAULT 1, creado TEXT DEFAULT(datetime('now','localtime')))`);
try { db.exec("ALTER TABLE roles ADD COLUMN color TEXT DEFAULT ''"); } catch(e){}
try { db.exec("ALTER TABLE usuarios ADD COLUMN ultimo_login TEXT DEFAULT ''"); } catch(e){}
const ROL_COLORES=['navy','teal','purple','green','amber','red','pink','slate'];

// Catálogo de permisos disponibles en Fase 1 (crece en fases siguientes).
const PERMISOS_FASE1=['crear_pedidos','editar_pedidos','reabrir_pedidos','registrar_pagos','ver_costos','ver_utilidad','ver_registros','ver_dashboard','ver_produccion','gestionar_produccion','consumir_inventario','editar_clientes','gestionar_productos','gestionar_inventario','gestionar_eventos','gestionar_bitacora','configurar_sistema','administrar_usuarios'];
function permisosDeRol(rol){
  if(!rol) return {};
  if(rol.es_admin) return {__admin:true};
  try{ return JSON.parse(rol.permisos||'{}'); }catch(e){ return {}; }
}
// Seed idempotente: cada workspace sin usuarios estrena rol admin + rol Vendedor + usuario admin.
function sembrarUsuariosSiFalta(){
  const wss=db.prepare('SELECT id,pin FROM workspaces').all();
  for(const ws of wss){
    const ya=db.prepare('SELECT COUNT(*) c FROM usuarios WHERE workspace_id=?').get(ws.id).c;
    if(ya>0) continue;
    let rolAdmin=db.prepare('SELECT id FROM roles WHERE workspace_id=? AND es_admin=1').get(ws.id);
    if(!rolAdmin){ const rid=uid(); db.prepare('INSERT INTO roles(id,workspace_id,nombre,permisos,es_admin,orden)VALUES(?,?,?,?,?,?)').run(rid,ws.id,'Administrador','{}',1,0); rolAdmin={id:rid}; }
    const permVend=JSON.stringify({crear_pedidos:true,editar_pedidos:true,registrar_pagos:true});
    try{ db.prepare('INSERT INTO roles(id,workspace_id,nombre,permisos,es_admin,orden)VALUES(?,?,?,?,?,?)').run(uid(),ws.id,'Vendedor',permVend,0,1); }catch(e){}
    db.prepare('INSERT INTO usuarios(id,workspace_id,usuario,pass_hash,nombre,rol_id,activo)VALUES(?,?,?,?,?,?,1)')
      .run(uid(),ws.id,'admin',bcrypt.hashSync(String(ws.pin),10),'Administrador',rolAdmin.id);
  }
}
sembrarUsuariosSiFalta();

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
try { db.exec("ALTER TABLE configuracion_negocio ADD COLUMN info_pdf TEXT DEFAULT ''"); } catch(e){}
// C1 · colores de marca editables: una sola fuente de verdad para la app Y el PDF.
try { db.exec("ALTER TABLE configuracion_negocio ADD COLUMN color_primario TEXT DEFAULT ''"); } catch(e){}
try { db.exec("ALTER TABLE configuracion_negocio ADD COLUMN color_acento TEXT DEFAULT ''"); } catch(e){}
try { db.exec("ALTER TABLE fichas_producto ADD COLUMN stock_actual INTEGER"); } catch(e){}
try { db.exec("ALTER TABLE fichas_producto ADD COLUMN stock_minimo INTEGER"); } catch(e){}
try { db.exec("ALTER TABLE fichas_producto ADD COLUMN regla_lleva INTEGER"); } catch(e){}
try { db.exec("ALTER TABLE fichas_producto ADD COLUMN regla_paga INTEGER"); } catch(e){}
try { db.exec("ALTER TABLE fichas_producto ADD COLUMN combo_precio_modo TEXT DEFAULT 'global'"); } catch(e){}
try { db.exec("ALTER TABLE combo_composicion ADD COLUMN componente_nombre TEXT DEFAULT ''"); } catch(e){}
try { db.exec("ALTER TABLE combo_composicion ADD COLUMN precio_unitario TEXT DEFAULT ''"); } catch(e){}
try { db.exec("ALTER TABLE combo_composicion ADD COLUMN precio_unitario_calc TEXT"); } catch(e){}
try { db.exec("ALTER TABLE enc_items ADD COLUMN ficha_id TEXT"); } catch(e){}
try { db.exec("ALTER TABLE enc_items ADD COLUMN config TEXT DEFAULT ''"); } catch(e){}
try { db.exec("ALTER TABLE enc_items ADD COLUMN categoria TEXT DEFAULT ''"); } catch(e){}
try { db.exec("ALTER TABLE enc_items ADD COLUMN subcategoria TEXT DEFAULT ''"); } catch(e){}
try { db.exec("ALTER TABLE enc_items ADD COLUMN estado TEXT DEFAULT 'Nuevo'"); } catch(e){}
try { db.exec("ALTER TABLE enc_items ADD COLUMN nota TEXT DEFAULT ''"); } catch(e){}
try { db.exec("ALTER TABLE enc_items ADD COLUMN precio_sugerido TEXT DEFAULT ''"); } catch(e){}
try { db.exec("ALTER TABLE pedidos ADD COLUMN archivado INTEGER DEFAULT 0"); } catch(e){}
try { db.exec("ALTER TABLE clientes ADD COLUMN archivado INTEGER DEFAULT 0"); } catch(e){}
try { db.exec("ALTER TABLE fichas_producto ADD COLUMN archivado INTEGER DEFAULT 0"); } catch(e){}
try { db.exec("ALTER TABLE clientes ADD COLUMN nit TEXT DEFAULT ''"); } catch(e){}
try { db.exec("ALTER TABLE clientes ADD COLUMN email TEXT DEFAULT ''"); } catch(e){}
try { db.exec("ALTER TABLE clientes ADD COLUMN direccion TEXT DEFAULT ''"); } catch(e){}
try { db.exec("ALTER TABLE clientes ADD COLUMN contacto TEXT DEFAULT ''"); } catch(e){}
try { db.exec("ALTER TABLE pedidos ADD COLUMN stock_consumido TEXT"); } catch(e){}
try { db.exec("ALTER TABLE fichas_producto ADD COLUMN medida_unidad TEXT DEFAULT 'm2'"); } catch(e){}
try { db.exec("ALTER TABLE fichas_producto ADD COLUMN medida_tarifa TEXT DEFAULT ''"); } catch(e){}
try { db.exec("ALTER TABLE fichas_producto ADD COLUMN medida_tarifa_calc TEXT"); } catch(e){}
try { db.exec("ALTER TABLE fichas_producto ADD COLUMN costos_fijos TEXT DEFAULT '[]'"); } catch(e){}
try { db.exec("ALTER TABLE fichas_producto ADD COLUMN cobro_minimo TEXT DEFAULT ''"); } catch(e){}
try { db.exec("ALTER TABLE fichas_producto ADD COLUMN cobro_minimo_calc TEXT"); } catch(e){}
// Costo por medida (proveedor): tarifa con decimales + mínimo. Se calcula ancho×alto al pedir.
try { db.exec("ALTER TABLE fichas_producto ADD COLUMN costo_medida_tarifa TEXT DEFAULT ''"); } catch(e){}
try { db.exec("ALTER TABLE fichas_producto ADD COLUMN costo_medida_tarifa_calc TEXT"); } catch(e){}
try { db.exec("ALTER TABLE fichas_producto ADD COLUMN costo_medida_minimo TEXT DEFAULT ''"); } catch(e){}
try { db.exec("ALTER TABLE fichas_producto ADD COLUMN costo_medida_minimo_calc TEXT"); } catch(e){}
// FASE E · CONDICIONES en el producto simple por medidas (mismo modelo que en las variantes).
try { db.exec("ALTER TABLE fichas_producto ADD COLUMN medida_cond TEXT DEFAULT '[]'"); } catch(e){}
try { db.exec("ALTER TABLE fichas_producto ADD COLUMN medida_cond_eje TEXT DEFAULT 'cantidad'"); } catch(e){}
// SEGUNDA DIMENSIÓN · las condiciones de arriba eligen la TARIFA por un eje; esta la AJUSTA en %
// por el OTRO eje. Así "por área Y por cantidad" son N+M reglas, no una cuadrícula N×M.
try { db.exec("ALTER TABLE fichas_producto ADD COLUMN medida_ajuste TEXT DEFAULT '[]'"); } catch(e){}
try { db.exec("ALTER TABLE fichas_producto ADD COLUMN medida_ajuste_eje TEXT DEFAULT 'cantidad'"); } catch(e){}
try { db.exec("ALTER TABLE fichas_producto ADD COLUMN piezas_por_pliego INTEGER"); } catch(e){}
try { db.exec("ALTER TABLE fichas_producto ADD COLUMN precio_pliego TEXT DEFAULT ''"); } catch(e){}
try { db.exec("ALTER TABLE fichas_producto ADD COLUMN precio_pliego_calc TEXT"); } catch(e){}
try { db.exec("ALTER TABLE fichas_producto ADD COLUMN pliego_superficies TEXT DEFAULT '[]'"); } catch(e){}
try { db.exec("ALTER TABLE fichas_producto ADD COLUMN pliego_extras TEXT DEFAULT '[]'"); } catch(e){}
try { db.exec("ALTER TABLE fichas_producto ADD COLUMN codigo TEXT DEFAULT ''"); } catch(e){}
try { db.exec("ALTER TABLE fichas_producto ADD COLUMN inventario_item_id TEXT DEFAULT ''"); } catch(e){}
try { db.exec("ALTER TABLE fichas_producto ADD COLUMN inventario_cantidad_consumida TEXT DEFAULT ''"); } catch(e){}
db.exec(`CREATE TABLE IF NOT EXISTS items_inventario(
  id TEXT PRIMARY KEY,
  workspace_id TEXT,
  nombre TEXT NOT NULL,
  descripcion TEXT DEFAULT '',
  unidad_medida TEXT DEFAULT 'unidad',
  stock_actual REAL,
  stock_minimo REAL,
  activo INTEGER DEFAULT 1,
  creado TEXT DEFAULT(datetime('now','localtime'))
)`);

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
db.exec(`CREATE TABLE IF NOT EXISTS ficha_variantes(
  id TEXT PRIMARY KEY,
  ficha_id TEXT REFERENCES fichas_producto(id) ON DELETE CASCADE,
  workspace_id TEXT,
  nombre TEXT NOT NULL,
  precio TEXT DEFAULT '',
  precio_calc TEXT,
  tramos TEXT DEFAULT '[]',
  costos TEXT DEFAULT '[]',
  orden INTEGER DEFAULT 0
)`);
try { db.exec("ALTER TABLE ficha_variantes ADD COLUMN costos TEXT DEFAULT '[]'"); } catch(e){}
try { db.exec("ALTER TABLE ficha_variantes ADD COLUMN parent_id TEXT DEFAULT ''"); } catch(e){}
try { db.exec("ALTER TABLE ficha_variantes ADD COLUMN multi INTEGER DEFAULT 0"); } catch(e){}
try { db.exec("ALTER TABLE ficha_variantes ADD COLUMN modo TEXT DEFAULT 'precio'"); } catch(e){}
try { db.exec("ALTER TABLE ficha_variantes ADD COLUMN piezas INTEGER"); } catch(e){}
try { db.exec("ALTER TABLE ficha_variantes ADD COLUMN informativa INTEGER DEFAULT 0"); } catch(e){}
// Editor 2.0 · modo 'medidas' en sub-variantes (cobro por ancho×alto, tarifa por m² con decimales)
try { db.exec("ALTER TABLE ficha_variantes ADD COLUMN medida_tarifa TEXT DEFAULT ''"); } catch(e){}
try { db.exec("ALTER TABLE ficha_variantes ADD COLUMN medida_tarifa_calc TEXT"); } catch(e){}
try { db.exec("ALTER TABLE ficha_variantes ADD COLUMN medida_minimo TEXT DEFAULT ''"); } catch(e){}
try { db.exec("ALTER TABLE ficha_variantes ADD COLUMN medida_minimo_calc TEXT"); } catch(e){}
// FASE E · CONDICIONES — la tarifa por medida deja de ser una constante: puede cambiar por tramos.
// medida_cond = [{desde,hasta,tarifa}] (números ya normalizados) · medida_cond_eje = 'cantidad' | 'area'.
// Ej. cantidad: 1-20 prendas a $10, de 21 en adelante a $8. Ej. área: hasta 2 m² a $9, más grande a $7.
try { db.exec("ALTER TABLE ficha_variantes ADD COLUMN medida_cond TEXT DEFAULT '[]'"); } catch(e){}
try { db.exec("ALTER TABLE ficha_variantes ADD COLUMN medida_cond_eje TEXT DEFAULT 'cantidad'"); } catch(e){}
// SEGUNDA DIMENSIÓN (ver fichas_producto): ajuste en % sobre la tarifa ya elegida, por el otro eje.
// Ej. tarifa por área (pieza grande más barata) + "de 21 prendas en adelante, −15%".
try { db.exec("ALTER TABLE ficha_variantes ADD COLUMN medida_ajuste TEXT DEFAULT '[]'"); } catch(e){}
try { db.exec("ALTER TABLE ficha_variantes ADD COLUMN medida_ajuste_eje TEXT DEFAULT 'cantidad'"); } catch(e){}
/* La cuenta es ancho × alto × tarifa con los números TAL CUAL: no hay conversión en ningún
   sitio (ver areaFicha). La unidad no cambia la matemática — dice en qué se van a escribir
   las medidas, y con eso se rotula el campo del pedido. Las partes no la tenían y el campo
   decía "(m)" siempre: quien cobra $20 el cm² escribía 10×10 y veía "metros". Por defecto
   'm2' para no mover ni un precio de los que ya existen. */
try { db.exec("ALTER TABLE ficha_variantes ADD COLUMN medida_unidad TEXT DEFAULT 'm2'"); } catch(e){}
/* Costo POR MEDIDA de una parte. El producto simple ya lo tenía (costo_medida_tarifa); una
   parte dentro de variantes no, y por eso el asistente contestó — con razón — que el costo
   de "$8 el cm² del transfer" no tenía dónde guardarse. `costos` solo admite importes fijos,
   y un costo que depende del tamaño no es un importe fijo. */
try { db.exec("ALTER TABLE ficha_variantes ADD COLUMN costo_medida_tarifa TEXT DEFAULT ''"); } catch(e){}
try { db.exec("ALTER TABLE ficha_variantes ADD COLUMN costo_medida_tarifa_calc TEXT"); } catch(e){}
db.exec(`CREATE TABLE IF NOT EXISTS etiquetas_negocio(
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  nombre TEXT NOT NULL,
  color TEXT DEFAULT 'slate',
  subs TEXT DEFAULT '[]',
  activo INTEGER DEFAULT 1,
  orden INTEGER DEFAULT 0
)`);
db.exec(`CREATE TABLE IF NOT EXISTS encargo_estados(
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  nombre TEXT NOT NULL,
  color TEXT DEFAULT '#8A9EAD',
  orden INTEGER DEFAULT 0,
  requiere_notas INTEGER DEFAULT 0,
  requiere_responsable INTEGER DEFAULT 0,
  activo INTEGER DEFAULT 1
)`);
db.exec(`CREATE TABLE IF NOT EXISTS costo_listas(
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  proveedor TEXT NOT NULL,
  titulo TEXT DEFAULT '',
  notas TEXT DEFAULT '',
  activo INTEGER DEFAULT 1,
  creado TEXT DEFAULT(datetime('now','localtime')),
  actualizado TEXT DEFAULT(datetime('now','localtime'))
)`);
db.exec(`CREATE TABLE IF NOT EXISTS costo_lista_items(
  id TEXT PRIMARY KEY,
  lista_id TEXT NOT NULL,
  workspace_id TEXT NOT NULL,
  descripcion TEXT NOT NULL,
  precio TEXT DEFAULT '',
  precio_calc INTEGER DEFAULT 0,
  orden INTEGER DEFAULT 0
)`);
// B2 · Listados de costos MULTI-COLUMNA (un ítem puede tener varias columnas de precio: Caucho/Máquina/Completo…)
try { db.exec("ALTER TABLE costo_listas ADD COLUMN columnas TEXT DEFAULT '[]'"); } catch(e){}
try { db.exec("ALTER TABLE costo_lista_items ADD COLUMN codigo TEXT DEFAULT ''"); } catch(e){}
try { db.exec("ALTER TABLE costo_lista_items ADD COLUMN valores TEXT DEFAULT '[]'"); } catch(e){}
db.exec(`CREATE TABLE IF NOT EXISTS eventos(
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  titulo TEXT NOT NULL,
  fecha TEXT NOT NULL,
  hora TEXT DEFAULT '',
  tipo TEXT DEFAULT 'recordatorio',
  notas TEXT DEFAULT '',
  pedido_id TEXT DEFAULT '',
  responsable_id TEXT DEFAULT '',
  hecho INTEGER DEFAULT 0,
  hecho_por TEXT DEFAULT '',
  hecho_en TEXT DEFAULT '',
  creado_por TEXT DEFAULT '',
  archivado INTEGER DEFAULT 0,
  creado TEXT DEFAULT(datetime('now','localtime'))
)`);
// ── BITÁCORA (segundo cerebro) · Fase 1 MVP: tableros + notas ──
db.exec(`CREATE TABLE IF NOT EXISTS bitacora_tableros(
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  nombre TEXT NOT NULL,
  color TEXT DEFAULT 'slate',
  orden INTEGER DEFAULT 0,
  archivado INTEGER DEFAULT 0,
  creado TEXT DEFAULT(datetime('now','localtime'))
)`);
db.exec(`CREATE TABLE IF NOT EXISTS bitacora_notas(
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  tablero_id TEXT DEFAULT '',
  titulo TEXT DEFAULT '',
  contenido TEXT DEFAULT '',
  color TEXT DEFAULT '',
  favorita INTEGER DEFAULT 0,
  creado_por TEXT DEFAULT '',
  actualizado_por TEXT DEFAULT '',
  archivado INTEGER DEFAULT 0,
  creado TEXT DEFAULT(datetime('now','localtime')),
  actualizado TEXT DEFAULT(datetime('now','localtime'))
)`);
// F2 · relaciones inteligentes: una nota se enlaza a N entidades (pedido/cliente/producto/…)
db.exec(`CREATE TABLE IF NOT EXISTS bitacora_relaciones(
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  nota_id TEXT NOT NULL,
  entidad_tipo TEXT NOT NULL,
  entidad_id TEXT NOT NULL,
  creado TEXT DEFAULT(datetime('now','localtime'))
)`);

// F3 · adjuntos de la Bitácora. Los archivos van al MISMO volumen que el resto (UP_DIR =
// db/uploads), nunca a public/: lo que vive en el código se borra en cada deploy.
db.exec(`CREATE TABLE IF NOT EXISTS bitacora_adjuntos(
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  nota_id TEXT NOT NULL,
  nombre TEXT NOT NULL,
  tipo TEXT DEFAULT '',
  ruta TEXT NOT NULL,
  tamano INTEGER DEFAULT 0,
  creado TEXT DEFAULT(datetime('now','localtime'))
)`);
try { db.exec("CREATE INDEX IF NOT EXISTS idx_bit_adj_nota ON bitacora_adjuntos(nota_id)"); } catch(e){}

/* AI GATEWAY · configuración del asistente. Tabla APARTE de configuracion_negocio a
   propósito: esa se devuelve entera al navegador, y la clave del proveedor NUNCA puede
   salir del servidor. Aquí solo se dice si hay clave puesta, jamás cuál es. */
db.exec(`CREATE TABLE IF NOT EXISTS ia_config(
  workspace_id TEXT PRIMARY KEY,
  proveedor TEXT DEFAULT 'claude',
  modelo TEXT DEFAULT '',
  clave TEXT DEFAULT '',
  url_base TEXT DEFAULT '',
  activo INTEGER DEFAULT 0,
  actualizado TEXT DEFAULT(datetime('now','localtime'))
)`);
/* ── G6 · RASTRO DE LAS PROPUESTAS DEL ASISTENTE ────────────────────────────────────────
   APPEND-ONLY, como produccion_eventos. La IA no crea nada: PROPONE, y aquí queda escrito
   qué propuso, quién lo confirmó y qué salió. Sin esto no se puede responder "¿de dónde
   salió este producto?" dentro de seis meses, y el trato era que todo quedara trazable.
   `estado`: propuesta (se mostró) → confirmada (el humano apretó y se creó). Una propuesta
   que nadie confirma se queda en 'propuesta' para siempre: también es información.        */
db.exec(`CREATE TABLE IF NOT EXISTS ia_acciones(
  id TEXT PRIMARY KEY,
  workspace_id TEXT,
  tipo TEXT DEFAULT 'crear_producto',
  resumen TEXT DEFAULT '',
  payload TEXT DEFAULT '{}',
  estado TEXT DEFAULT 'propuesta',
  propuesto_por TEXT DEFAULT '',
  propuesto_en TEXT DEFAULT(datetime('now','localtime')),
  confirmado_por TEXT DEFAULT '',
  confirmado_en TEXT DEFAULT '',
  resultado_id TEXT DEFAULT ''
)`);

// ── PRODUCCIÓN 2.0 (Fase D) · eventos de taller ──
// Registro APPEND-ONLY: nunca se sobrescribe ni se borra (manifiesto: todo trazable).
// Un solo lugar para los tres casos, distinguidos por `tipo`:
//   traspaso → una etapa termina y deja nota para la que recibe (el corazón del handoff)
//   calidad  → sello de visto bueno / con problema en cualquier etapa
//   dano     → reporte de daño (anónimo EN PANTALLA: el autor se guarda, no se muestra)
// Guardar el nombre del usuario junto al id evita que el historial se rompa si luego
// se desactiva o renombra a esa persona.
db.exec(`CREATE TABLE IF NOT EXISTS produccion_eventos(
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  tipo TEXT DEFAULT 'traspaso',
  pedido_id TEXT DEFAULT '',
  encargo_id TEXT DEFAULT '',
  item_id TEXT DEFAULT '',
  estado_desde TEXT DEFAULT '',
  estado_hasta TEXT DEFAULT '',
  nota TEXT DEFAULT '',
  resultado TEXT DEFAULT '',
  cantidad TEXT DEFAULT '',
  origen TEXT DEFAULT '',
  usuario_id TEXT DEFAULT '',
  usuario_nombre TEXT DEFAULT '',
  anonimo INTEGER DEFAULT 0,
  creado TEXT DEFAULT(datetime('now','localtime'))
)`);
try{ db.exec("CREATE INDEX IF NOT EXISTS idx_prodev_item ON produccion_eventos(workspace_id,item_id,creado)"); }catch(e){}
try{ db.exec("CREATE INDEX IF NOT EXISTS idx_prodev_tipo ON produccion_eventos(workspace_id,tipo,creado)"); }catch(e){}

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
  info_pdf:'',
  alertas_entrega:1,dias_anticipacion_entrega:3,
  iva_activo:0,iva_porcentaje:19,iva_desglosado:0,
  // C1 · colores de marca (los de fábrica de GRAFÍA). Alimentan la app y el PDF.
  color_primario:'#222B46',color_acento:'#5B7FA6'
};
// Solo aceptamos hex #RGB o #RRGGBB (evita inyectar cualquier cosa en el CSS/PDF).
const HEX_RE=/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
const colorOk=(v,porDefecto)=>HEX_RE.test(String(v||'').trim())?String(v).trim():porDefecto;
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
    info_pdf:row.info_pdf||'',
    alertas_entrega:row.alertas_entrega?1:0,
    dias_anticipacion_entrega:row.dias_anticipacion_entrega??CFG_DEFAULTS.dias_anticipacion_entrega,
    iva_activo:row.iva_activo?1:0,
    iva_porcentaje:row.iva_porcentaje??CFG_DEFAULTS.iva_porcentaje,
    iva_desglosado:row.iva_desglosado?1:0,
    color_primario:colorOk(row.color_primario,CFG_DEFAULTS.color_primario),
    color_acento:colorOk(row.color_acento,CFG_DEFAULTS.color_acento)
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
// Seguridad: headers básicos (sin dependencias nuevas)
app.disable('x-powered-by');
app.use((req,res,next)=>{
  res.setHeader('X-Content-Type-Options','nosniff');
  res.setHeader('X-Frame-Options','DENY');
  res.setHeader('Referrer-Policy','same-origin');
  next();
});
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
// Parseo de número con DECIMALES (formato colombiano: coma decimal, punto miles).
// El separador decimal es el que aparece más a la derecha. Ej: "8,5"→8.5, "1.234,5"→1234.5, "3.5"→3.5
function toFloatCO(s){
  if(s==null)return 0;
  let t=String(s).replace(/[^0-9.,]/g,'').trim();
  if(t==='')return 0;
  const c=t.lastIndexOf(','), d=t.lastIndexOf('.');
  if(c>-1&&d>-1){ t=(c>d)?t.replace(/\./g,'').replace(',','.'):t.replace(/,/g,''); }
  else if(c>-1){ t=t.replace(',','.'); }
  const v=parseFloat(t);
  return isFinite(v)?v:0;
}
/* toFloatCO borra el signo A PROPÓSITO: ningún precio, costo ni tarifa es negativo, y dejar
   pasar un "-" ahí sería un agujero. El % de ajuste de la 2.ª dimensión es el único número con
   signo del sistema (-15 = más barato), así que lee el signo aparte y reusa el resto. */
function toPctCO(s){
  if(s==null)return 0;
  const t=String(s).trim();
  const v=toFloatCO(t);
  return /^-/.test(t)?-v:v;
}
function normDecimal(raw){const v=toFloatCO(raw);return v?String(v):null;}
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
  encargos.forEach(enc=>{enc.items=db.prepare('SELECT * FROM enc_items WHERE encargo_id=? ORDER BY orden').all(enc.id);resolverCategoriasEncargo(enc);enc.items.forEach(it=>{if(!it.categoria&&enc.categorias.length)it.categoria=enc.categorias[0];if(!it.subcategoria&&enc.subcategorias.length)it.subcategoria=enc.subcategorias[0];if((!it.estado||it.estado==='Nuevo')&&enc.estado&&enc.estado!=='Nuevo')it.estado=enc.estado;});});
  p.encargos=encargos;
  p.pagos   =db.prepare('SELECT * FROM pagos WHERE pedido_id=? ORDER BY creado').all(p.id);
  p.costos  =db.prepare('SELECT * FROM costos WHERE pedido_id=? ORDER BY creado').all(p.id);
  p.historial=db.prepare('SELECT * FROM historial WHERE pedido_id=? ORDER BY creado DESC').all(p.id);
  p.archivos =db.prepare('SELECT * FROM archivos WHERE pedido_id=? ORDER BY creado').all(p.id);
  p.urgente=!!p.urgente; p.entregado=!!p.entregado; p.cancelado=!!p.cancelado; p.pendiente_pago=!!p.pendiente_pago; p.es_cotizacion=!!p.es_cotizacion; p.costos_manual=!!p.costos_manual; p.cancel_reintegro=!!p.cancel_reintegro; p.cerrado=!!p.cerrado;
  encargos.forEach(enc=>{
    enc.valor_referencial=calcReferencialEncargo(enc);
    enc.valor_efectivo=calcValorEncargoEfectivo(enc);
  });
  p.valor_sugerido=calcValorSugerido(encargos);
  p.valor_total=valorOficialPedido(p,p.valor_sugerido);
  if(p.cliente_id){const cli=db.prepare('SELECT nit,email,direccion,contacto FROM clientes WHERE id=?').get(p.cliente_id);if(cli){p.cli_nit=cli.nit||'';p.cli_email=cli.email||'';p.cli_direccion=cli.direccion||'';p.cli_contacto=cli.contacto||'';}}
  try{p.version=db.prepare('SELECT MAX(version) m FROM pedido_versiones WHERE pedido_id=?').get(p.id).m||0;}catch(e){p.version=0;}
  return p;
}
// CORR 006 — texto de historial para una cancelación (motivo + reintegro sí/no)
function txtCancelacion(motivo,reint,monto){
  return 'Pedido cancelado'+((motivo||'').trim()?` — Motivo: ${String(motivo).trim()}`:'')+(reint?` · Reintegro al cliente: Sí${(monto||'').trim()?' ('+String(monto).trim()+')':''}`:' · Sin reintegro (el dinero recibido queda como ingreso real, para auditoría)');
}

function addHist(pid,txt,wsId,actor,motivo){
  const a=actor||{};
  db.prepare('INSERT INTO historial(id,pedido_id,texto,fecha,hora,workspace_id,usuario_id,usuario_nombre,rol,motivo)VALUES(?,?,?,?,?,?,?,?,?,?)')
    .run(uid(),pid,txt,hoy(wsId),ahora(),wsId,a.id||'',a.nombre||'',a.rol||'',motivo||'');
}
// v3.0 Fase 2b — versionado de pedidos
function actorDe(req){ const u=req&&req.usuario; return {id:u?u.id:'',nombre:u?(u.nombre||u.usuario||''):'',rol:req&&req.rol?req.rol.nombre:''}; }
// Firma de lo que cuenta como "cambio clave": cliente, valores e ítems (no urgente/notas/estado).
function firmaClave(pc){
  if(!pc)return '';
  const items=[];
  (pc.encargos||[]).forEach(e=>(e.items||[]).forEach(it=>items.push({c:it.cantidad||'',d:it.detalle||'',v:it.valor_unitario_calc||it.valor_unitario||'',f:it.ficha_id||''})));
  return JSON.stringify({cli:pc.cliente_id||'',nom:pc.nombre||'',val:pc.valor_total||0,vf:pc.valor_final_calc||'',items});
}
function crearVersion(pid,wsId,actor,motivo){
  const pc=pedidoCompleto(db.prepare('SELECT * FROM pedidos WHERE id=?').get(pid));
  if(!pc)return null;
  const max=db.prepare('SELECT MAX(version) m FROM pedido_versiones WHERE pedido_id=?').get(pid).m||0;
  const version=max+1;
  const a=actor||{};
  db.prepare('INSERT INTO pedido_versiones(id,pedido_id,workspace_id,version,snapshot,usuario_id,usuario_nombre,rol,motivo)VALUES(?,?,?,?,?,?,?,?,?)')
    .run(uid(),pid,wsId,version,JSON.stringify(pc),a.id||'',a.nombre||'',a.rol||'',motivo||'');
  return version;
}

/* ── AUTOCODIFICACIÓN · la huella de una configuración ─────────────────────────────────
   Dos ítems son "el mismo producto" si coinciden ficha + variantes elegidas + medidas.
   El JSON se serializa con las claves ORDENADAS: si no, {ancho,alto} y {alto,ancho}
   producirían huellas distintas para la misma cosa y se crearían códigos duplicados.   */
function jsonEstable(v){
  if(v===null||v===undefined)return 'null';
  if(Array.isArray(v))return '['+v.map(jsonEstable).join(',')+']';
  if(typeof v==='object')return '{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+jsonEstable(v[k])).join(',')+'}';
  return JSON.stringify(v);
}
// Las medidas se normalizan: "100", "100.0" y "100,0" son la MISMA pieza.
function normMedida(x){ const n=toFloatCO(x); return n>0?String(n):''; }
function claveConfigItem(it){
  return jsonEstable({
    f: String(it.ficha_id||''),
    v: it._varPicks||null,
    a: normMedida(it._ancho), h: normMedida(it._alto),
    hs: (it._hojaSurf!==undefined&&it._hojaSurf!==null)?String(it._hojaSurf):'',
    he: it._hojaExtras||null
  });
}
/* Devuelve el código de venta de esa configuración: el que YA tenía, o uno nuevo con el
   siguiente consecutivo de esa ficha. Formato `<código de la ficha>-<NN>` (ej. P0010-01):
   se lee de dónde viene el producto y no colisiona entre fichas.                        */
function codigoDeVenta(wsId,it,descripcion){
  const fichaId=String(it.ficha_id||''); if(!fichaId)return '';
  try{
    const clave=claveConfigItem(it);
    const ya=db.prepare('SELECT id,codigo FROM codigos_venta WHERE workspace_id=? AND ficha_id=? AND clave=?').get(wsId,fichaId,clave);
    if(ya){
      db.prepare("UPDATE codigos_venta SET usos=usos+1, ultimo_uso=datetime('now','localtime') WHERE id=?").run(ya.id);
      return ya.codigo;
    }
    const f=db.prepare('SELECT codigo FROM fichas_producto WHERE id=? AND workspace_id=?').get(fichaId,wsId);
    // Productos antiguos sin código: se usa un prefijo derivado del id, para no dejarlos fuera.
    const pref=String((f&&f.codigo)||'').trim()||('X'+fichaId.slice(0,4).toUpperCase());
    const max=db.prepare('SELECT COALESCE(MAX(consecutivo),0) c FROM codigos_venta WHERE workspace_id=? AND ficha_id=?').get(wsId,fichaId).c;
    const cons=(max||0)+1;
    const codigo=pref+'-'+String(cons).padStart(2,'0');
    db.prepare('INSERT INTO codigos_venta(id,workspace_id,ficha_id,codigo,clave,descripcion,consecutivo,usos)VALUES(?,?,?,?,?,?,?,1)')
      .run(uid(),wsId,fichaId,codigo,clave,String(descripcion||'').slice(0,160),cons);
    return codigo;
  }catch(e){ logError('codigoDeVenta',e); return ''; }
}
function saveEncargos(pid,encargos,wsId){
  db.prepare('DELETE FROM encargos WHERE pedido_id=? AND workspace_id=?').run(pid,wsId);
  (encargos||[]).forEach((enc,i)=>{
    const eid=enc.id||uid();
    db.prepare('INSERT INTO encargos(id,pedido_id,numero,categoria,subcategoria,categorias,subcategorias,estado,valor,valor_calc,anotacion,responsable_id,notas_tec,orden,workspace_id)VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
      .run(eid,pid,enc.numero||i+1,'','',JSON.stringify(enc.categorias||[]),JSON.stringify(enc.subcategorias||[]),enc.estado||'Nuevo',enc.valor||'',normCalc(enc.valor),enc.anotacion||'',enc.responsable_id||'',enc.notas_tec||'',i,wsId);
    db.prepare('DELETE FROM enc_items WHERE encargo_id=?').run(eid);
    (enc.items||[]).forEach((it,j)=>{
      const cfg=(it._varPicks||it._ancho||it._alto||it._hojaSurf!==undefined&&it._hojaSurf!==''||it._hojaExtras)?JSON.stringify({varPicks:it._varPicks||null,ancho:it._ancho||'',alto:it._alto||'',hojaSurf:(it._hojaSurf!==undefined?it._hojaSurf:''),hojaExtras:it._hojaExtras||null}):'';
      // Autocodificación: misma configuración → mismo código, siempre (se reusa el que ya exista).
      const med=(normMedida(it._ancho)&&normMedida(it._alto))?(normMedida(it._ancho)+'×'+normMedida(it._alto)):'';
      // Descripción legible del código: el texto del ítem, y si no hay, las medidas.
      const codVenta=codigoDeVenta(wsId,it,String(it.detalle||'').trim()||med);
      db.prepare('INSERT INTO enc_items(id,encargo_id,cantidad,detalle,valor_unitario,valor_unitario_calc,ficha_id,suministrado,config,categoria,subcategoria,estado,nota,precio_sugerido,codigo_venta,orden,workspace_id)VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(uid(),eid,it.cantidad||'',it.detalle||'',it.valor_unitario||'0',normCalc(it.valor_unitario)||'0',it.ficha_id||null,it.suministrado?1:0,cfg,it.categoria||'',it.subcategoria||'',it.estado||'Nuevo',it.nota||'',it.precio_sugerido||'',codVenta,j,wsId);
    });
  });
}
function descontarStock(pid,wsId){
  const encargos=db.prepare('SELECT id FROM encargos WHERE pedido_id=?').all(pid);
  const consumoFicha={}; // stock propio del producto (retrocompat)
  const consumoInv={};   // ítem de inventario compartido (CORR 003/005)
  function acumular(fichaId,cantidad){
    const ficha=db.prepare('SELECT stock_actual,inventario_item_id,inventario_cantidad_consumida FROM fichas_producto WHERE id=? AND workspace_id=?').get(fichaId,wsId);
    if(!ficha)return;
    const comps=db.prepare('SELECT componente_ficha_id,cantidad_consumida FROM combo_composicion WHERE ficha_id=?').all(fichaId);
    if(comps.length){
      comps.forEach(c=>{
        if(!c.componente_ficha_id)return;
        acumular(c.componente_ficha_id,cantidad*c.cantidad_consumida);
      });
      return;
    }
    if(ficha.inventario_item_id){
      const inv=db.prepare('SELECT stock_actual FROM items_inventario WHERE id=? AND workspace_id=?').get(ficha.inventario_item_id,wsId);
      if(!inv||inv.stock_actual==null)return;
      const factor=parseFloat(ficha.inventario_cantidad_consumida)||1;
      consumoInv[ficha.inventario_item_id]=(consumoInv[ficha.inventario_item_id]||0)+cantidad*factor;
      return;
    }
    if(ficha.stock_actual==null)return;
    consumoFicha[fichaId]=(consumoFicha[fichaId]||0)+cantidad;
  }
  encargos.forEach(enc=>{
    const items=db.prepare('SELECT cantidad,ficha_id FROM enc_items WHERE encargo_id=? AND ficha_id IS NOT NULL').all(enc.id);
    items.forEach(it=>acumular(it.ficha_id,toNum(it.cantidad)));
  });
  const resultado=[];
  Object.entries(consumoFicha).forEach(([fichaId,cantidad])=>{
    db.prepare('UPDATE fichas_producto SET stock_actual=stock_actual-? WHERE id=?').run(cantidad,fichaId);
    resultado.push({tipo:'ficha',id:fichaId,cantidad});
  });
  Object.entries(consumoInv).forEach(([invId,cantidad])=>{
    db.prepare('UPDATE items_inventario SET stock_actual=stock_actual-? WHERE id=?').run(cantidad,invId);
    resultado.push({tipo:'inv',id:invId,cantidad});
  });
  return resultado;
}
function restaurarStock(stockConsumidoJSON,wsId){
  let lista=[];
  try{lista=JSON.parse(stockConsumidoJSON||'[]')}catch(e){lista=[]}
  lista.forEach(item=>{
    if(item.tipo==='inv'){
      db.prepare('UPDATE items_inventario SET stock_actual=stock_actual+? WHERE id=? AND workspace_id=?').run(item.cantidad,item.id,wsId);
    }else{
      const fid=item.id||item.ficha_id; // formato viejo: {ficha_id,cantidad}
      db.prepare('UPDATE fichas_producto SET stock_actual=stock_actual+? WHERE id=? AND workspace_id=?').run(item.cantidad,fid,wsId);
    }
  });
}

function asegurarCliente(nombre,tel,cid,wsId,extra){
  extra=extra||{};
  const campos={nit:extra.nit,email:extra.email,direccion:extra.direccion,contacto:extra.contacto};
  const setExtra=(id)=>{Object.entries(campos).forEach(([k,v])=>{if(v!==undefined&&v!==null)db.prepare(`UPDATE clientes SET ${k}=? WHERE id=? AND workspace_id=?`).run(v,id,wsId);});};
  if(cid){
    const existe=db.prepare('SELECT id FROM clientes WHERE id=? AND workspace_id=?').get(cid,wsId);
    if(!existe)cid=null; // cliente_id de otro workspace (o inexistente): se ignora, no se usa a ciegas
  }
  if(cid){
    if(nombre)db.prepare('UPDATE clientes SET nombre=? WHERE id=? AND workspace_id=?').run(nombre.trim(),cid,wsId);
    if(tel)db.prepare('UPDATE clientes SET tel=? WHERE id=? AND workspace_id=?').run(tel,cid,wsId);
    setExtra(cid);
    return cid;
  }
  const ex=db.prepare('SELECT id FROM clientes WHERE lower(nombre)=lower(?) AND workspace_id=?').get(nombre.trim(),wsId);
  if(ex){if(tel)db.prepare('UPDATE clientes SET tel=? WHERE id=? AND workspace_id=?').run(tel,ex.id,wsId);setExtra(ex.id);return ex.id}
  const id=uid(); db.prepare('INSERT INTO clientes(id,nombre,tel,workspace_id)VALUES(?,?,?,?)').run(id,nombre.trim(),tel||'',wsId); setExtra(id); return id;
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
const TIPOS_PRECIO_VALIDOS=['unitario','escalonado','promocional','combo','regla','medidas','variantes','pliego'];
function calcPrecioPliegoUnit(ficha,cantidad){
  const ppp=parseInt(ficha.piezas_por_pliego,10)||0;
  const ppl=toNum(ficha.precio_pliego_calc);
  const n=parseInt(cantidad,10)||0;
  if(ppp<=0||n<=0)return 0;
  const pliegos=Math.ceil(n/ppp);
  return Math.round(pliegos*ppl/n);
}
function calcPrecioHojaTotal(superficie,extras,cantidad){
  const piezas=parseInt(superficie&&superficie.piezas,10)||0;
  const precio=toNum(superficie&&superficie.precio_calc);
  const n=parseInt(cantidad,10)||0;
  if(piezas<=0||n<=0)return 0;
  const pliegos=Math.ceil(n/piezas);
  let total=pliegos*precio;
  (extras||[]).forEach(e=>{
    const v=toNum(e.valor_calc);
    if(e.tipo==='pieza')total+=v*n;
    else if(e.tipo==='hoja')total+=v*pliegos;
    else total+=v; // fijo
  });
  return Math.round(total);
}
const MEDIDA_UNIDADES_VALIDAS=['m2','m','cm2'];
function calcPrecioMedidas(ficha,ancho,alto){
  const tarifa=toFloatCO(ficha.medida_tarifa_calc);
  const a=parseFloat(ancho)||0, b=parseFloat(alto)||0;
  const area=(ficha.medida_unidad==='m')?a:a*b;
  let fijos=0;
  try{(Array.isArray(ficha.costos_fijos)?ficha.costos_fijos:JSON.parse(ficha.costos_fijos||'[]')).forEach(c=>{fijos+=toNum(c.valor_calc)})}catch(e){}
  const minimo=toNum(ficha.cobro_minimo_calc);
  return Math.max(minimo, Math.round(area*tarifa+fijos));
}
// Costo del proveedor calculado por medida (ancho×alto×tarifa_costo) con su propio mínimo.
function calcCostoMedida(ficha,ancho,alto){
  const ct=toFloatCO(ficha.costo_medida_tarifa_calc);
  if(!(ct>0))return 0;
  const a=parseFloat(ancho)||0, b=parseFloat(alto)||0;
  const area=(ficha.medida_unidad==='m')?a:a*b;
  if(!(area>0))return 0;
  const min=toNum(ficha.costo_medida_minimo_calc);
  return Math.max(min, Math.round(area*ct));
}
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
function detectarPrecioEscalonado(rangos,cantidad){
  if(!rangos||!rangos.length)return null;
  for(const r of rangos){
    if(cantidad>=r.desde&&(r.hasta==null||cantidad<=r.hasta))return r.precio;
  }
  const ultimo=rangos[rangos.length-1];
  if(ultimo.hasta!=null&&cantidad>ultimo.hasta)return ultimo.precio;
  return null;
}
/* Tramos por cantidad CONTIGUOS — respaldo del servidor (la UI ya deriva el "desde", pero la
   IA o la API cruda podrían mandar tramos sueltos). Evita el caso ambiguo "de 6 a 10 = 5.000
   y de 8 a 12 = 4.000": para 8, 9 o 10 el precio quedaba indefinido. Regla: el primero empieza
   en 1, cada siguiente en (hasta anterior + 1), y solo el último puede quedar "en adelante". */
function erroresTramos(arr,pre){
  const out=[]; const t=Array.isArray(arr)?arr:[];
  if(!t.length)return out;
  let prevH=null;
  t.forEach((r,i)=>{
    const d=Number(r&&r.desde);
    const hRaw=r&&r.hasta;
    const h=(hRaw==null||hRaw==='')?null:Number(hRaw);
    const esUlt=i===t.length-1;
    if(i===0){ if(d!==1)out.push(`${pre}el primer tramo debe empezar en 1`); }
    else if(prevH!=null&&d!==prevH+1)out.push(`${pre}el tramo #${i+1} debe empezar en ${prevH+1} (justo después del anterior, sin huecos ni solapes)`);
    if(!esUlt&&h==null)out.push(`${pre}solo el último tramo puede quedar "en adelante"; el #${i+1} necesita un "hasta"`);
    if(h!=null&&Number.isFinite(d)&&h<d)out.push(`${pre}el "hasta" del tramo #${i+1} no puede ser menor que su inicio`);
    prevH=h;
  });
  return out;
}
// FASE E · CONDICIONES — validación. Una fila sin tarifa se descartaría en silencio al guardar,
// y el usuario creería que quedó guardada: por eso se avisa en vez de dejarla caer.
function erroresCond(arr,etiq){
  const pre=etiq?`${etiq}: `:'';
  const out=[];
  (arr||[]).forEach((c,i)=>{
    const vacia=!definido(c.desde)&&!definido(c.hasta)&&!definido(c.tarifa);
    if(vacia)return; // fila en blanco recién agregada: no estorba
    if(!(toFloatCO(c.tarifa)>0))out.push(`${pre}la condición #${i+1} necesita una tarifa mayor que 0`);
    if(definido(c.hasta)&&toFloatCO(c.hasta)<toFloatCO(c.desde))out.push(`${pre}en la condición #${i+1} el "hasta" es menor que el "desde"`);
  });
  return out;
}
/* SEGUNDA DIMENSIÓN — validación. El valor es un % con signo: 0 (o vacío) no ajusta nada y se
   descartaría en silencio, igual que una condición sin tarifa. Un −100% dejaría el precio en 0. */
function erroresAjuste(arr,etiq){
  const pre=etiq?`${etiq}: `:'';
  const out=[];
  (arr||[]).forEach((c,i)=>{
    const vacia=!definido(c.desde)&&!definido(c.hasta)&&!definido(c.ajuste);
    if(vacia)return;
    const a=toPctCO(c.ajuste);
    if(!a)out.push(`${pre}el ajuste #${i+1} necesita un porcentaje distinto de 0 (ej: -15 para 15% menos)`);
    else if(a<=-100)out.push(`${pre}el ajuste #${i+1} no puede bajar 100% o más: el precio quedaría en 0 o negativo`);
    if(definido(c.hasta)&&toFloatCO(c.hasta)<toFloatCO(c.desde))out.push(`${pre}en el ajuste #${i+1} el "hasta" es menor que el "desde"`);
  });
  return out;
}
// La 2.ª dimensión no sirve sola: ajusta un % sobre una tarifa que alguien más tiene que fijar.
function erroresAjusteSinBase(ajuste,tarifa,cond,etiq){
  const hay=(Array.isArray(ajuste)?ajuste:[]).some(c=>toPctCO(c&&c.ajuste)!==0);
  if(!hay)return [];
  if(toFloatCO(tarifa)>0||hayCondFE(cond))return [];
  return [`${etiq?etiq+': ':''}el ajuste por porcentaje necesita una tarifa (o condiciones de tarifa) sobre la cual aplicarse`];
}
// Precio de UNA unidad de una hoja/parte de variante (A3). El precio suele vivir en los TRAMOS,
// no en precio_calc: si hay tramo que cubre la cantidad 1 se usa ese; si los tramos arrancan por
// encima de 1, se usa el primer tramo (evita devolver 0 y mostrar "desde $0").
function precioVarUnidad(v){
  if(!v)return 0;
  if(v.modo==='hoja'){const pz=parseInt(v.piezas,10)||0;return pz>0?Math.round(toNum(v.precio_calc)/pz):0;}
  const tr=Array.isArray(v.tramos)?v.tramos:[];
  const p1=detectarPrecioEscalonado(tr,1);
  if(p1!=null)return toNum(p1);
  if(tr.length)return toNum(tr[0].precio);
  return toNum(v.precio_calc);
}
// A3 · "Desde $X" de un producto por variantes = precio del PRODUCTO BASE a 1 unidad: la PRIMERA
// parte (variante principal) que tenga precio. Antes se tomaba el mínimo de TODAS las hojas, y
// ganaba una informativa sin precio (Talla/Color → "desde $0") o un add-on barato (empaque
// $1.000/$2.000). Se ignoran informativas y hojas por medida (tarifa/m², no comparable).
function precioDesdeVariantes(variantes){
  for(const parte of (variantes||[])){
    if(parte.informativa)continue;
    const hijos=(parte.hijos||[]).filter(h=>!h.informativa);
    const cands=(hijos.length?hijos:[parte]).filter(v=>v.modo!=='medidas');
    const precios=cands.map(precioVarUnidad).filter(x=>x>0);
    if(precios.length)return Math.min(...precios);
  }
  // Sin precios unitarios (p. ej. todo por medida) → desde = mínima tarifa por m².
  const tar=hojasVariantes(variantes).filter(v=>!v.informativa).map(v=>toFloatCO(v.medida_tarifa_calc)).filter(x=>x>0);
  return tar.length?Math.min(...tar):0;
}
function precioOficialFicha(ficha,precioSugerido){
  if(ficha.tipo_precio==='medidas')return toFloatCO(ficha.medida_tarifa_calc);
  if(ficha.tipo_precio==='pliego'){
    const sup=(Array.isArray(ficha.pliego_superficies)&&ficha.pliego_superficies.length)?ficha.pliego_superficies[0]:null;
    if(sup){const pz=parseInt(sup.piezas,10)||0;return pz>0?Math.round(toNum(sup.precio_calc)/pz):0;}
    const ppp=parseInt(ficha.piezas_por_pliego,10)||0;return ppp>0?Math.round(toNum(ficha.precio_pliego_calc)/ppp):0;
  }
  if(ficha.tipo_precio==='escalonado'&&Array.isArray(ficha.rangos)&&ficha.rangos.length){
    const precioParaUno=detectarPrecioEscalonado(ficha.rangos,1);
    if(precioParaUno!=null)return precioParaUno;
  }
  return definido(ficha.precio_base)?toNum(ficha.precio_base_calc):(precioSugerido||0);
}
function fichaCompleta(f){
  if(!f)return null;
  if(f.inventario_item_id){const inv=db.prepare('SELECT nombre,stock_actual,stock_minimo FROM items_inventario WHERE id=?').get(f.inventario_item_id);if(inv){f.inventario_stock=inv.stock_actual;f.inventario_nombre=inv.nombre;f.inventario_stock_minimo=inv.stock_minimo;}}
  f.insumos=db.prepare('SELECT * FROM ficha_insumos WHERE ficha_id=? ORDER BY orden').all(f.id);
  f.componentes=db.prepare('SELECT * FROM combo_composicion WHERE ficha_id=? ORDER BY orden').all(f.id);
  f.variantes=arbolVariantes(db.prepare('SELECT * FROM ficha_variantes WHERE ficha_id=? ORDER BY orden').all(f.id));
  f.activo=!!f.activo;
  try{f.rangos=JSON.parse(f.rangos||'[]')}catch(e){f.rangos=[]}
  try{f.costos_fijos=JSON.parse(f.costos_fijos||'[]')}catch(e){f.costos_fijos=[]}
  try{f.pliego_superficies=JSON.parse(f.pliego_superficies||'[]')}catch(e){f.pliego_superficies=[]}
  try{f.pliego_extras=JSON.parse(f.pliego_extras||'[]')}catch(e){f.pliego_extras=[]}
  try{f.medida_cond=JSON.parse(f.medida_cond||'[]')}catch(e){f.medida_cond=[]}
  f.medida_cond_eje=condEje(f.medida_cond_eje);
  try{f.medida_ajuste=JSON.parse(f.medida_ajuste||'[]')}catch(e){f.medida_ajuste=[]}
  f.medida_ajuste_eje=condEje(f.medida_ajuste_eje);
  if(f.tipo_precio==='pliego'&&!f.pliego_superficies.length&&parseInt(f.piezas_por_pliego,10)>0){
    f.pliego_superficies=[{nombre:'Hoja',piezas:parseInt(f.piezas_por_pliego,10),precio:f.precio_pliego||'',precio_calc:f.precio_pliego_calc}];
  }
  f.costo_total=calcCostoTotalInsumos(f.insumos);
  f.precio_sugerido=calcPrecioSugerido(f,f.costo_total);
  if((f.tipo_precio==='combo'||f.tipo_precio==='promocional')&&f.combo_precio_modo==='individual'&&f.componentes.length){
    f.precio_oficial=f.componentes.reduce((a,c)=>a+c.cantidad_consumida*toNum(c.precio_unitario_calc),0);
  }else if(f.tipo_precio==='variantes'&&f.variantes.length){
    f.precio_oficial=precioDesdeVariantes(f.variantes);
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
    erroresTramos(b.rangos,'Tramos por cantidad: ').forEach(e=>errores.push(e));
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
  if(b.tipo_precio==='medidas'){
    erroresCond(b.medida_cond,'').forEach(e=>errores.push(e));
    erroresAjuste(b.medida_ajuste,'').forEach(e=>errores.push(e));
    erroresAjusteSinBase(b.medida_ajuste,b.medida_tarifa,b.medida_cond,'').forEach(e=>errores.push(e));
    if(b.medida_unidad!==undefined&&!MEDIDA_UNIDADES_VALIDAS.includes(b.medida_unidad))errores.push('Unidad de medida no válida');
    if(!(toFloatCO(b.medida_tarifa)>0)&&!hayCondFE(b.medida_cond))errores.push('Falta la tarifa por unidad de medida (acepta decimales, ej: 8,5) — o al menos una condición de tarifa con su valor');
    if(definido(b.costo_medida_tarifa)&&!(toFloatCO(b.costo_medida_tarifa)>0))errores.push('El costo por medida debe ser un número válido (acepta decimales)');
    (b.costos_fijos||[]).forEach((c,i)=>{
      if(definido(c.valor)&&evalExpr(c.valor)===null)errores.push(`Costo fijo #${i+1} no es una expresión válida`);
    });
    if(definido(b.cobro_minimo)&&evalExpr(b.cobro_minimo)===null)errores.push('El cobro mínimo no es una expresión válida');
  }
  if(b.tipo_precio==='pliego'){
    if(!Array.isArray(b.pliego_superficies)||!b.pliego_superficies.length)errores.push('Agrega al menos una hoja/superficie de impresión');
    (b.pliego_superficies||[]).forEach((s,i)=>{
      if(!String(s.nombre||'').trim())errores.push(`Hoja #${i+1}: escribe un nombre (ej. A4, Carta)`);
      if(!Number.isInteger(s.piezas)||s.piezas<=0)errores.push(`Hoja #${i+1}: las piezas que rinde deben ser un número mayor a 0`);
      if(!definido(s.precio)||evalExpr(s.precio)===null)errores.push(`Hoja #${i+1}: el precio no es válido`);
    });
    (b.pliego_extras||[]).forEach((e,i)=>{
      if(!String(e.nombre||'').trim())errores.push(`Extra #${i+1}: escribe un nombre`);
      if(!['pieza','hoja','fijo'].includes(e.tipo))errores.push(`Extra #${i+1}: tipo de cobro no válido`);
      if(definido(e.valor)&&evalExpr(e.valor)===null)errores.push(`Extra #${i+1}: el valor no es válido`);
    });
  }
  if(b.tipo_precio==='variantes'){
    if(!Array.isArray(b.variantes)||!b.variantes.length)errores.push('Un producto por variantes necesita al menos una variante');
    const validarNodo=(v,etiq,info)=>{
      if(!String(v.nombre||'').trim())errores.push(`Variante ${etiq}: escribe un nombre`);
      // B1.5 — variable informativa: opciones sin precio (solo nombre)
      if(v.informativa){
        if(!Array.isArray(v.hijos)||!v.hijos.length)errores.push(`Variable "${v.nombre}": agrega al menos una opción`);
        else v.hijos.forEach((h,j)=>validarNodo(h,etiq+'.'+(j+1),true));
        return;
      }
      if(info)return; // opción informativa: solo nombre
      const tieneHijos=Array.isArray(v.hijos)&&v.hijos.length;
      if(tieneHijos){
        v.hijos.forEach((h,j)=>validarNodo(h,etiq+'.'+(j+1)));
      }else if(v.modo==='medidas'){
        if(!(toFloatCO(v.medida_tarifa)>0)&&!hayCondFE(v.medida_cond))errores.push(`Variante ${etiq}: falta la tarifa por medida (acepta decimales, ej: 8,5) — o al menos una condición de tarifa con su valor`);
        erroresCond(v.medida_cond,`Variante ${etiq}`).forEach(e=>errores.push(e));
        erroresAjuste(v.medida_ajuste,`Variante ${etiq}`).forEach(e=>errores.push(e));
        erroresAjusteSinBase(v.medida_ajuste,v.medida_tarifa,v.medida_cond,`Variante ${etiq}`).forEach(e=>errores.push(e));
      }else if(v.modo==='hoja'){
        if(!Number.isInteger(v.piezas)&&!(parseInt(v.piezas,10)>0))errores.push(`Variante ${etiq}: piezas por hoja debe ser un número mayor a 0`);
        if(!definido(v.precio)||evalExpr(v.precio)===null)errores.push(`Variante ${etiq}: el precio por hoja no es válido`);
      }else{
        const precioOk=definido(v.precio)&&evalExpr(v.precio)!==null;
        const tramoUno=detectarPrecioEscalonado(v.tramos||[],1);
        if(!precioOk&&tramoUno==null)errores.push(`Variante ${etiq}: necesita un precio (o un tramo que empiece en 1)`);
        erroresTramos(v.tramos,`Variante ${etiq}: `).forEach(e=>errores.push(e));
      }
    };
    (b.variantes||[]).forEach((v,i)=>validarNodo(v,String(i+1)));
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

// ── AUTENTICACIÓN (usuario+contraseña · con compat de PIN) ──
function firmarUsuario(u){ return jwt.sign({wsId:u.workspace_id,userId:u.id,rolId:u.rol_id},JWT_SECRET,{expiresIn:'90d'}); }
// Seguridad: rate-limit del login en memoria (frena fuerza bruta de PIN/contraseñas).
// 8 intentos fallidos por IP en 10 min → bloqueo temporal. Se limpia al acertar.
const _loginFails=new Map(); // ip -> {n, hasta}
function loginBloqueado(ip){ const r=_loginFails.get(ip); if(!r)return false; if(Date.now()>r.hasta){_loginFails.delete(ip);return false;} return r.n>=8; }
function loginFallo(ip){ const r=_loginFails.get(ip)||{n:0,hasta:0}; r.n++; r.hasta=Date.now()+10*60*1000; _loginFails.set(ip,r); }
function marcarLogin(u){ try{ db.prepare("UPDATE usuarios SET ultimo_login=datetime('now','localtime') WHERE id=?").run(u.id); }catch(e){} }
app.post('/api/auth/login',(req,res)=>{
  const ip=req.headers['x-forwarded-for']||req.socket.remoteAddress||'?';
  if(loginBloqueado(ip)) return res.status(429).json({error:'Demasiados intentos. Espera unos minutos e intenta de nuevo.'});
  const{usuario,pass,pin}=req.body||{};
  // 1) Login por usuario + contraseña
  if(usuario&&pass){
    const cands=db.prepare('SELECT * FROM usuarios WHERE usuario=? AND activo=1').all(String(usuario).trim());
    const u=cands.find(c=>{ try{ return bcrypt.compareSync(String(pass),c.pass_hash); }catch(e){ return false; } });
    if(!u){ loginFallo(ip); return res.status(401).json({error:'Usuario o contraseña incorrectos'}); }
    _loginFails.delete(ip); marcarLogin(u);
    return res.json({token:firmarUsuario(u)});
  }
  // 2) Login por PIN (compat) → entra como el usuario admin de ese workspace
  if(pin){
    const ws=db.prepare('SELECT id FROM workspaces WHERE pin=?').get(String(pin));
    if(!ws){ loginFallo(ip); return res.status(401).json({error:'PIN incorrecto'}); }
    const adm=db.prepare('SELECT * FROM usuarios WHERE workspace_id=? AND activo=1 ORDER BY (rol_id IN (SELECT id FROM roles WHERE es_admin=1)) DESC, creado ASC').get(ws.id);
    if(!adm){ loginFallo(ip); return res.status(401).json({error:'PIN incorrecto'}); }
    _loginFails.delete(ip); marcarLogin(adm);
    return res.json({token:firmarUsuario(adm)});
  }
  return res.status(401).json({error:'Ingresa usuario y contraseña'});
});

app.use('/api',(req,res,next)=>{
  if(req.path==='/auth/login')return next();
  const header=req.headers.authorization||'';
  const token=header.startsWith('Bearer ')?header.slice(7):null;
  if(!token)return res.status(401).json({error:'No autorizado, inicia sesión'});
  try{
    const payload=jwt.verify(token,JWT_SECRET);
    if(!payload.wsId)return res.status(401).json({error:'Sesión expirada, inicia sesión de nuevo'});
    req.wsId=payload.wsId;
    // Cargar usuario+rol (tokens viejos sin userId → degradar al admin del workspace)
    let u=payload.userId?db.prepare('SELECT * FROM usuarios WHERE id=? AND activo=1').get(payload.userId):null;
    if(!u) u=db.prepare('SELECT * FROM usuarios WHERE workspace_id=? AND activo=1 ORDER BY (rol_id IN (SELECT id FROM roles WHERE es_admin=1)) DESC, creado ASC').get(req.wsId);
    if(u){
      req.userId=u.id; req.usuario=u;
      const rol=db.prepare('SELECT * FROM roles WHERE id=?').get(u.rol_id);
      req.rol=rol; req.rolId=u.rol_id; req.permisos=permisosDeRol(rol);
    }else{ req.permisos={}; }
    next();
  }catch(e){
    res.status(401).json({error:'Sesión expirada, inicia sesión de nuevo'});
  }
});
// Middleware de permiso: corta con 403 si el rol no lo tiene (admin siempre pasa).
function requiere(clave){ return (req,res,next)=>{ const p=req.permisos||{}; if(p.__admin||p[clave]===true) return next(); return res.status(403).json({error:'No tienes permiso para esta acción'}); }; }

// ── IDENTIDAD, USUARIOS Y ROLES (v3.0 Fase 1) ──
function rolPublico(r){ return r?{id:r.id,nombre:r.nombre,es_admin:!!r.es_admin,permisos:permisosDeRol(r),orden:r.orden,color:r.color||''}:null; }
function usuarioPublico(u,rolesPorId){ const r=rolesPorId?rolesPorId[u.rol_id]:null; return {id:u.id,usuario:u.usuario,nombre:u.nombre,activo:!!u.activo,rol_id:u.rol_id,rol_nombre:r?r.nombre:'',rol_color:(r&&r.color)||'',es_admin:r?!!r.es_admin:false,ultimo_login:u.ultimo_login||'',creado:u.creado||''}; }

app.get('/api/me',(req,res)=>{
  const u=req.usuario; if(!u) return res.status(401).json({error:'Sin sesión'});
  res.json({id:u.id,usuario:u.usuario,nombre:u.nombre,rol:req.rol?req.rol.nombre:'',rol_id:u.rol_id,rol_color:(req.rol&&req.rol.color)||'',es_admin:!!(req.permisos&&req.permisos.__admin),permisos:req.permisos||{},permisos_catalogo:PERMISOS_FASE1,ultimo_login:u.ultimo_login||'',creado:u.creado||''});
});
// Mi perfil: el usuario edita su propio nombre visible (sin permisos especiales)
app.put('/api/me',(req,res)=>{
  const u=req.usuario; if(!u) return res.status(401).json({error:'Sin sesión'});
  const nombre=String((req.body||{}).nombre||'').trim();
  if(!nombre) return res.status(400).json({error:'El nombre no puede quedar vacío'});
  db.prepare('UPDATE usuarios SET nombre=? WHERE id=?').run(nombre,u.id);
  res.json({ok:true,nombre});
});
app.post('/api/me/pass',(req,res)=>{
  const u=req.usuario; if(!u) return res.status(401).json({error:'Sin sesión'});
  const{actual,nueva}=req.body||{};
  if(!nueva||String(nueva).length<4) return res.status(400).json({error:'La nueva contraseña debe tener al menos 4 caracteres'});
  if(!bcrypt.compareSync(String(actual||''),u.pass_hash)) return res.status(400).json({error:'La contraseña actual no es correcta'});
  db.prepare('UPDATE usuarios SET pass_hash=? WHERE id=?').run(bcrypt.hashSync(String(nueva),10),u.id);
  res.json({ok:true});
});

// Roles
app.get('/api/roles',requiere('administrar_usuarios'),(req,res)=>{
  const rows=db.prepare('SELECT * FROM roles WHERE workspace_id=? ORDER BY es_admin DESC, orden ASC, creado ASC').all(req.wsId);
  res.json(rows.map(rolPublico));
});
app.post('/api/roles',requiere('administrar_usuarios'),(req,res)=>{
  const{nombre,permisos,color}=req.body||{};
  if(!String(nombre||'').trim()) return res.status(400).json({error:'El rol necesita un nombre'});
  const perm={}; PERMISOS_FASE1.forEach(k=>{ if(permisos&&permisos[k]===true) perm[k]=true; });
  const col=ROL_COLORES.includes(color)?color:'';
  const id=uid();
  db.prepare('INSERT INTO roles(id,workspace_id,nombre,permisos,es_admin,orden,color)VALUES(?,?,?,?,0,?,?)').run(id,req.wsId,String(nombre).trim(),JSON.stringify(perm),Date.now(),col);
  res.json(rolPublico(db.prepare('SELECT * FROM roles WHERE id=?').get(id)));
});
app.put('/api/roles/:id',requiere('administrar_usuarios'),(req,res)=>{
  const r=db.prepare('SELECT * FROM roles WHERE id=? AND workspace_id=?').get(req.params.id,req.wsId);
  if(!r) return res.status(404).json({error:'Rol no encontrado'});
  if(r.es_admin) return res.status(400).json({error:'El rol Administrador no se puede modificar'});
  const{nombre,permisos,color}=req.body||{};
  const perm={}; PERMISOS_FASE1.forEach(k=>{ if(permisos&&permisos[k]===true) perm[k]=true; });
  const col=(color===undefined)?(r.color||''):(ROL_COLORES.includes(color)?color:'');
  db.prepare('UPDATE roles SET nombre=?,permisos=?,color=? WHERE id=?').run(String(nombre||r.nombre).trim(),JSON.stringify(perm),col,r.id);
  res.json(rolPublico(db.prepare('SELECT * FROM roles WHERE id=?').get(r.id)));
});
app.delete('/api/roles/:id',requiere('administrar_usuarios'),(req,res)=>{
  const r=db.prepare('SELECT * FROM roles WHERE id=? AND workspace_id=?').get(req.params.id,req.wsId);
  if(!r) return res.status(404).json({error:'Rol no encontrado'});
  if(r.es_admin) return res.status(400).json({error:'El rol Administrador no se puede eliminar'});
  const enUso=db.prepare('SELECT COUNT(*) c FROM usuarios WHERE rol_id=? AND activo=1').get(r.id).c;
  if(enUso>0) return res.status(400).json({error:`No puedes eliminar un rol en uso (${enUso} usuario(s))`});
  db.prepare('DELETE FROM roles WHERE id=?').run(r.id);
  res.json({ok:true});
});

// Usuarios
app.get('/api/usuarios',requiere('administrar_usuarios'),(req,res)=>{
  const roles=db.prepare('SELECT * FROM roles WHERE workspace_id=?').all(req.wsId);
  const rolesPorId={}; roles.forEach(r=>rolesPorId[r.id]=r);
  const rows=db.prepare('SELECT * FROM usuarios WHERE workspace_id=? ORDER BY activo DESC, creado ASC').all(req.wsId);
  res.json(rows.map(u=>usuarioPublico(u,rolesPorId)));
});
app.post('/api/usuarios',requiere('administrar_usuarios'),(req,res)=>{
  const{usuario,nombre,pass,rol_id}=req.body||{};
  const login=String(usuario||'').trim();
  if(!login) return res.status(400).json({error:'Escribe un nombre de usuario'});
  if(!pass||String(pass).length<4) return res.status(400).json({error:'La contraseña debe tener al menos 4 caracteres'});
  const rol=rol_id?db.prepare('SELECT id FROM roles WHERE id=? AND workspace_id=?').get(rol_id,req.wsId):null;
  if(!rol) return res.status(400).json({error:'Elige un rol válido'});
  const dup=db.prepare('SELECT id FROM usuarios WHERE workspace_id=? AND usuario=?').get(req.wsId,login);
  if(dup) return res.status(400).json({error:'Ya existe un usuario con ese nombre'});
  const id=uid();
  db.prepare('INSERT INTO usuarios(id,workspace_id,usuario,pass_hash,nombre,rol_id,activo)VALUES(?,?,?,?,?,?,1)').run(id,req.wsId,login,bcrypt.hashSync(String(pass),10),String(nombre||'').trim(),rol.id);
  const roles=db.prepare('SELECT * FROM roles WHERE workspace_id=?').all(req.wsId); const rp={}; roles.forEach(r=>rp[r.id]=r);
  res.json(usuarioPublico(db.prepare('SELECT * FROM usuarios WHERE id=?').get(id),rp));
});
app.put('/api/usuarios/:id',requiere('administrar_usuarios'),(req,res)=>{
  const u=db.prepare('SELECT * FROM usuarios WHERE id=? AND workspace_id=?').get(req.params.id,req.wsId);
  if(!u) return res.status(404).json({error:'Usuario no encontrado'});
  const{nombre,rol_id,activo}=req.body||{};
  let rid=u.rol_id;
  if(rol_id){ const rol=db.prepare('SELECT id FROM roles WHERE id=? AND workspace_id=?').get(rol_id,req.wsId); if(!rol) return res.status(400).json({error:'Rol inválido'}); rid=rol.id; }
  const act=(activo===undefined)?u.activo:(activo?1:0);
  db.prepare('UPDATE usuarios SET nombre=?,rol_id=?,activo=? WHERE id=?').run(nombre===undefined?u.nombre:String(nombre).trim(),rid,act,u.id);
  const roles=db.prepare('SELECT * FROM roles WHERE workspace_id=?').all(req.wsId); const rp={}; roles.forEach(r=>rp[r.id]=r);
  res.json(usuarioPublico(db.prepare('SELECT * FROM usuarios WHERE id=?').get(u.id),rp));
});
app.put('/api/usuarios/:id/pass',requiere('administrar_usuarios'),(req,res)=>{
  const u=db.prepare('SELECT * FROM usuarios WHERE id=? AND workspace_id=?').get(req.params.id,req.wsId);
  if(!u) return res.status(404).json({error:'Usuario no encontrado'});
  const{pass}=req.body||{};
  if(!pass||String(pass).length<4) return res.status(400).json({error:'La contraseña debe tener al menos 4 caracteres'});
  db.prepare('UPDATE usuarios SET pass_hash=? WHERE id=?').run(bcrypt.hashSync(String(pass),10),u.id);
  res.json({ok:true});
});
app.delete('/api/usuarios/:id',requiere('administrar_usuarios'),(req,res)=>{
  const u=db.prepare('SELECT * FROM usuarios WHERE id=? AND workspace_id=?').get(req.params.id,req.wsId);
  if(!u) return res.status(404).json({error:'Usuario no encontrado'});
  if(u.id===req.userId) return res.status(400).json({error:'No puedes desactivar tu propia cuenta'});
  db.prepare('UPDATE usuarios SET activo=0 WHERE id=?').run(u.id);
  res.json({ok:true});
});

// ── PEDIDOS ──
app.get('/api/pedidos',(req,res)=>{
  const{estado,urgente,q}=req.query;
  let sql='SELECT * FROM pedidos WHERE workspace_id=? AND archivado=0'; const params=[req.wsId];
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
// v3.0 Fase 2b — lista liviana de versiones (sin snapshot)
app.get('/api/pedidos/:id/versiones',(req,res)=>{
  const rows=db.prepare('SELECT version,usuario_nombre,rol,motivo,creado FROM pedido_versiones WHERE pedido_id=? AND workspace_id=? ORDER BY version DESC').all(req.params.id,req.wsId);
  res.json(rows);
});

app.post('/api/pedidos',requiere('crear_pedidos'),(req,res)=>{
  try{
    const b=req.body;
    if(!b.nombre)return res.status(400).json({error:'Nombre requerido'});
    const errores=validarPedido(b);
    if(errores.length)return res.status(400).json({error:errores.join('. ')});
    const id=uid(); const ref=nextRef();
    const cid=asegurarCliente(b.nombre,b.tel,b.cliente_id||null,req.wsId,{nit:b.cli_nit,email:b.cli_email,direccion:b.cli_direccion,contacto:b.cli_contacto});
    db.prepare(`INSERT INTO pedidos(id,ref,cliente_id,nombre,tel,urgente,entregado,cancelado,pendiente_pago,es_cotizacion,valor_final,valor_final_calc,fecha_pedido,fecha_entrega,notas,workspace_id)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
      .run(id,ref,cid,b.nombre.trim(),b.tel||'',b.urgente?1:0,b.entregado?1:0,b.cancelado?1:0,b.pendiente_pago?1:0,b.es_cotizacion?1:0,normVF(b.valor_final),normCalc(b.valor_final),hoy(req.wsId),b.fecha_entrega||'',b.notas||'',req.wsId);
    saveEncargos(id,b.encargos,req.wsId);
    (b.pagos||[]).forEach(pg=>db.prepare('INSERT INTO pagos(id,pedido_id,monto,monto_calc,fecha,tipo,nota,workspace_id)VALUES(?,?,?,?,?,?,?,?)').run(uid(),id,pg.monto||'',normCalc(pg.monto),pg.fecha||hoy(req.wsId),pg.tipo||'efectivo',pg.nota||'',req.wsId));
    (b.costos||[]).forEach(c=>db.prepare('INSERT INTO costos(id,pedido_id,encargo_id,descripcion,cantidad,valor_unitario,valor_unitario_calc,monto,monto_calc,auto,workspace_id)VALUES(?,?,?,?,?,?,?,?,?,?,?)').run(uid(),id,c.encargo_id||'',c.descripcion||'',c.cantidad||'',c.valor_unitario||'',normCalc(c.valor_unitario),c.monto||'',normCalc(c.monto),c.auto?1:0,req.wsId));
    if(!b.es_cotizacion){
      const consumo=descontarStock(id,req.wsId);
      db.prepare('UPDATE pedidos SET stock_consumido=? WHERE id=?').run(JSON.stringify(consumo),id);
    }
    if(b.costos_manual)db.prepare('UPDATE pedidos SET costos_manual=1 WHERE id=?').run(id);
    // CORR 006 — datos de cancelación
    if(b.cancel_motivo!==undefined||b.cancel_reintegro!==undefined||b.cancel_monto!==undefined){
      db.prepare('UPDATE pedidos SET cancel_motivo=?,cancel_reintegro=?,cancel_monto=?,cancel_monto_calc=? WHERE id=?')
        .run(b.cancel_motivo||'',b.cancel_reintegro?1:0,b.cancel_monto||'',normCalc(String(b.cancel_monto||'').replace(/[$\s]/g,'')),id);
    }
    const act=actorDe(req);
    addHist(id,'Pedido creado',req.wsId,act);
    if(b.cancelado)addHist(id,txtCancelacion(b.cancel_motivo,b.cancel_reintegro,b.cancel_monto),req.wsId,act);
    (b.pagos_nuevos||[]).forEach(pg=>addHist(id,`Abono registrado: ${pg.monto} · ${pg.forma}${pg.nota?' — '+pg.nota:''}`,req.wsId,act));
    (b.precio_edits||[]).forEach(ed=>addHist(id,`PAM · Precio ajustado manualmente en "${ed.detalle}": sugerido ${ed.sugerido} → final ${ed.nuevo}${ed.dif?' (dif '+ed.dif+')':''}`,req.wsId,act));
    crearVersion(id,req.wsId,act,'Creación del pedido'); // v1 = estado inicial
    res.json(pedidoCompleto(db.prepare('SELECT * FROM pedidos WHERE id=?').get(id)));
  }catch(e){logError('POST /api/pedidos',e);res.status(500).json({error:e.message})}
});

app.put('/api/pedidos/:id',requiere('editar_pedidos'),(req,res)=>{
  try{
    const b=req.body; const pid=req.params.id;
    const p=db.prepare('SELECT * FROM pedidos WHERE id=? AND workspace_id=?').get(pid,req.wsId);
    if(!p)return res.status(404).json({error:'No encontrado'});
    if(p.cerrado)return res.status(409).json({error:'Este pedido está cerrado. Reábrelo para poder editarlo.'}); // v3.0 Fase 3
    const errores=validarPedido(b);
    if(errores.length)return res.status(400).json({error:errores.join('. ')});
    const act=actorDe(req);
    // v3.0 Fase 7 — sin permiso editar_clientes, una edición del pedido NO puede tocar los datos del cliente
    const puedeCli=!!(req.permisos&&(req.permisos.__admin||req.permisos.editar_clientes===true));
    if(!puedeCli){ b.nombre=p.nombre; b.tel=undefined; b.cliente_id=p.cliente_id; b.cli_nit=undefined; b.cli_email=undefined; b.cli_direccion=undefined; b.cli_contacto=undefined; }
    const firmaAntes=firmaClave(pedidoCompleto(db.prepare('SELECT * FROM pedidos WHERE id=?').get(pid))); // v3.0 Fase 2b
    const cid=asegurarCliente(b.nombre||p.nombre,b.tel,b.cliente_id||p.cliente_id,req.wsId,{nit:b.cli_nit,email:b.cli_email,direccion:b.cli_direccion,contacto:b.cli_contacto});
    // Log cambios de estado checkboxes
    if(b.entregado&&!p.entregado)addHist(pid,'Pedido marcado como entregado',req.wsId,act);
    if(b.cancelado&&!p.cancelado)addHist(pid,txtCancelacion(b.cancel_motivo,b.cancel_reintegro,b.cancel_monto),req.wsId,act);
    // CORR 006 — persistir datos de cancelación
    if(b.cancel_motivo!==undefined||b.cancel_reintegro!==undefined||b.cancel_monto!==undefined){
      db.prepare('UPDATE pedidos SET cancel_motivo=?,cancel_reintegro=?,cancel_monto=?,cancel_monto_calc=? WHERE id=? AND workspace_id=?')
        .run(b.cancel_motivo||'',b.cancel_reintegro?1:0,b.cancel_monto||'',normCalc(String(b.cancel_monto||'').replace(/[$\s]/g,'')),pid,req.wsId);
    }
    (b.pagos_nuevos||[]).forEach(pg=>addHist(pid,`Abono registrado: ${pg.monto} · ${pg.forma}${pg.nota?' — '+pg.nota:''}`,req.wsId,act));
    (b.precio_edits||[]).forEach(ed=>addHist(pid,`Precio editado en "${ed.detalle}": sugerido ${ed.sugerido} → ${ed.nuevo}`,req.wsId,act));
    db.prepare(`UPDATE pedidos SET nombre=?,tel=?,cliente_id=?,urgente=?,entregado=?,cancelado=?,pendiente_pago=?,es_cotizacion=?,costos_manual=?,valor_final=?,valor_final_calc=?,fecha_entrega=?,notas=?,modificado=datetime('now','localtime') WHERE id=? AND workspace_id=?`)
      .run(b.nombre||p.nombre,(b.tel!==undefined?b.tel:p.tel),cid,b.urgente?1:0,b.entregado?1:0,b.cancelado?1:0,b.pendiente_pago?1:0,b.es_cotizacion?1:0,(b.costos_manual!==undefined?(b.costos_manual?1:0):p.costos_manual),(b.valor_final!==undefined?normVF(b.valor_final):p.valor_final),(b.valor_final!==undefined?normCalc(b.valor_final):p.valor_final_calc),(b.fecha_entrega!==undefined?b.fecha_entrega:p.fecha_entrega),b.notas!==undefined?b.notas:p.notas,pid,req.wsId);
    if(b.encargos!==undefined)saveEncargos(pid,b.encargos,req.wsId);
    if(b.pagos!==undefined){db.prepare('DELETE FROM pagos WHERE pedido_id=? AND workspace_id=?').run(pid,req.wsId);(b.pagos||[]).forEach(pg=>db.prepare('INSERT INTO pagos(id,pedido_id,monto,monto_calc,fecha,tipo,nota,workspace_id)VALUES(?,?,?,?,?,?,?,?)').run(uid(),pid,pg.monto||'',normCalc(pg.monto),pg.fecha||hoy(req.wsId),pg.tipo||'efectivo',pg.nota||'',req.wsId));}
    if(b.costos!==undefined){db.prepare('DELETE FROM costos WHERE pedido_id=? AND workspace_id=?').run(pid,req.wsId);(b.costos||[]).forEach(c=>db.prepare('INSERT INTO costos(id,pedido_id,encargo_id,descripcion,cantidad,valor_unitario,valor_unitario_calc,monto,monto_calc,auto,workspace_id)VALUES(?,?,?,?,?,?,?,?,?,?,?)').run(uid(),pid,c.encargo_id||'',c.descripcion||'',c.cantidad||'',c.valor_unitario||'',normCalc(c.valor_unitario),c.monto||'',normCalc(c.monto),c.auto?1:0,req.wsId));}
    // ── Re-sincronización de stock al editar ──
    const ahoraCotiz=(b.es_cotizacion!==undefined?!!b.es_cotizacion:!!p.es_cotizacion);
    const ahoraCancel=(b.cancelado!==undefined?!!b.cancelado:!!p.cancelado);
    let stockConsumidoActual=p.stock_consumido;
    if(ahoraCotiz||ahoraCancel){
      // Cotización o cancelado: no debe consumir. Restaurar lo que hubiera consumido.
      if(stockConsumidoActual){restaurarStock(stockConsumidoActual,req.wsId);db.prepare('UPDATE pedidos SET stock_consumido=NULL WHERE id=?').run(pid);}
    }else{
      // Pedido activo: re-sincronizar (deshacer lo viejo + descontar las cantidades actuales)
      if(stockConsumidoActual)restaurarStock(stockConsumidoActual,req.wsId);
      const consumo=descontarStock(pid,req.wsId);
      db.prepare('UPDATE pedidos SET stock_consumido=? WHERE id=?').run(JSON.stringify(consumo),pid);
    }
    // v3.0 Fase 2b — versionar solo si cambió algo clave (cliente, valores o ítems)
    const firmaDespues=firmaClave(pedidoCompleto(db.prepare('SELECT * FROM pedidos WHERE id=?').get(pid)));
    if(firmaDespues!==firmaAntes){
      const v=crearVersion(pid,req.wsId,act,b.motivo||'');
      addHist(pid,`Versión ${v} guardada`,req.wsId,act,b.motivo||'');
    }
    res.json(pedidoCompleto(db.prepare('SELECT * FROM pedidos WHERE id=?').get(pid)));
  }catch(e){logError('PUT /api/pedidos/:id',e);res.status(500).json({error:e.message})}
});

app.delete('/api/pedidos/:id',requiere('editar_pedidos'),(req,res)=>{
  const p=db.prepare('SELECT stock_consumido FROM pedidos WHERE id=? AND workspace_id=?').get(req.params.id,req.wsId);
  if(!p)return res.status(404).json({error:'No encontrado'});
  if(p.stock_consumido)restaurarStock(p.stock_consumido,req.wsId);
  db.prepare('DELETE FROM pedidos WHERE id=? AND workspace_id=?').run(req.params.id,req.wsId);
  res.json({ok:true});
});

// ── CIERRE DE PEDIDO (v3.0 Fase 3) ──
// Cerrar: cualquiera que pueda editar. Solo pedidos entregados y no cancelados.
app.post('/api/pedidos/:id/cerrar',requiere('editar_pedidos'),(req,res)=>{
  const pid=req.params.id;
  const p=db.prepare('SELECT * FROM pedidos WHERE id=? AND workspace_id=?').get(pid,req.wsId);
  if(!p)return res.status(404).json({error:'No encontrado'});
  if(p.cerrado)return res.status(409).json({error:'El pedido ya está cerrado'});
  if(p.cancelado)return res.status(400).json({error:'Un pedido cancelado no se cierra'});
  if(!p.entregado)return res.status(400).json({error:'Solo se puede cerrar un pedido entregado'});
  const act=actorDe(req);
  db.prepare("UPDATE pedidos SET cerrado=1,cerrado_por=?,cerrado_en=datetime('now','localtime') WHERE id=? AND workspace_id=?").run(act.nombre,pid,req.wsId);
  addHist(pid,'Pedido cerrado',req.wsId,act,(req.body&&req.body.motivo)||'');
  res.json(pedidoCompleto(db.prepare('SELECT * FROM pedidos WHERE id=?').get(pid)));
});
// Reabrir: permiso dedicado (más sensible).
app.post('/api/pedidos/:id/reabrir',requiere('reabrir_pedidos'),(req,res)=>{
  const pid=req.params.id;
  const p=db.prepare('SELECT * FROM pedidos WHERE id=? AND workspace_id=?').get(pid,req.wsId);
  if(!p)return res.status(404).json({error:'No encontrado'});
  if(!p.cerrado)return res.status(409).json({error:'El pedido no está cerrado'});
  const act=actorDe(req);
  const motivo=String((req.body&&req.body.motivo)||'').trim();
  db.prepare('UPDATE pedidos SET cerrado=0,cerrado_motivo=? WHERE id=? AND workspace_id=?').run(motivo,pid,req.wsId);
  addHist(pid,'Pedido reabierto'+(motivo?` — Motivo: ${motivo}`:''),req.wsId,act,motivo);
  res.json(pedidoCompleto(db.prepare('SELECT * FROM pedidos WHERE id=?').get(pid)));
});

// ── MÓDULO PRODUCCIÓN (v3.0 Fase 4) ──
// Vista derivada (único origen de verdad = el Pedido). No duplica datos: lee los encargos
// de los pedidos ACTIVOS (no entregado/cancelado/cotización/cerrado/archivado) como tarjetas.
app.get('/api/produccion',requiere('ver_produccion'),(req,res)=>{
  const peds=db.prepare("SELECT id,ref,nombre,tel,urgente,fecha_entrega,creado FROM pedidos WHERE workspace_id=? AND archivado=0 AND entregado=0 AND cancelado=0 AND es_cotizacion=0 AND cerrado=0 ORDER BY urgente DESC, (fecha_entrega='' OR fecha_entrega IS NULL) ASC, fecha_entrega ASC, creado DESC").all(req.wsId);
  const uById={}; db.prepare('SELECT id,nombre,usuario FROM usuarios WHERE workspace_id=?').all(req.wsId).forEach(u=>uById[u.id]=u.nombre||u.usuario);
  const estados=getEstados(req.wsId); const nombresEstados=estados.map(e=>e.nombre); const primerEstado=nombresEstados[0]||'Nuevo';
  const tarjetas=[];
  peds.forEach(p=>{
    const encs=db.prepare('SELECT * FROM encargos WHERE pedido_id=? ORDER BY orden').all(p.id);
    encs.forEach(enc=>{
      resolverCategoriasEncargo(enc);
      const items=db.prepare('SELECT id,cantidad,detalle,estado FROM enc_items WHERE encargo_id=? ORDER BY orden').all(enc.id);
      const consumos=db.prepare('SELECT id,item_inv_id,item_nombre,unidad,cantidad FROM consumo_inventario WHERE encargo_id=? AND workspace_id=? ORDER BY creado').all(enc.id,req.wsId);
      const base={
        pedido_id:p.id, ref:p.ref, cliente:p.nombre, tel:p.tel||'', urgente:!!p.urgente,
        fecha_entrega:p.fecha_entrega||'', creado:p.creado,
        encargo_id:enc.id, numero:enc.numero||1,
        categorias:enc.categorias||[], anotacion:enc.anotacion||'',
        responsable_id:enc.responsable_id||'', responsable_nombre:uById[enc.responsable_id]||'',
        notas_tec:enc.notas_tec||'', consumos
      };
      // Una tarjeta por ÍTEM: cada ítem tiene su propio proceso y tiempos.
      // Si el encargo no tiene ítems, una tarjeta del encargo (compatibilidad).
      if(items.length){
        items.forEach(it=>tarjetas.push({...base,
          item_id:it.id, cantidad:it.cantidad||'', detalle:it.detalle||'',
          estado:nombresEstados.includes(it.estado)?it.estado:primerEstado
        }));
      }else{
        tarjetas.push({...base, item_id:'', cantidad:'', detalle:enc.anotacion||'',
          estado:nombresEstados.includes(enc.estado)?enc.estado:primerEstado});
      }
    });
  });
  // D1 · adjuntar a cada tarjeta la ÚLTIMA nota de traspaso, para que quien recibe el trabajo
  // vea qué dejó dicho la etapa anterior sin tener que ir a buscarla.
  try{
    // Último evento de cada tipo por ítem, en una sola consulta por tipo.
    const ultimoPorTipo=(tipo,exigeNota)=>{
      const filtroNota=exigeNota?" AND nota<>''":'';
      const filas=db.prepare(`SELECT e.* FROM produccion_eventos e
        JOIN (SELECT item_id, MAX(creado) mx FROM produccion_eventos
              WHERE workspace_id=? AND tipo=? AND item_id<>''${filtroNota} GROUP BY item_id) u
          ON u.item_id=e.item_id AND u.mx=e.creado
        WHERE e.workspace_id=? AND e.tipo=?`).all(req.wsId,tipo,req.wsId,tipo);
      const m={}; filas.forEach(e=>{m[e.item_id]=e;}); return m;
    };
    const traspasos=ultimoPorTipo('traspaso',true);
    const calidades=ultimoPorTipo('calidad',false);
    tarjetas.forEach(t=>{
      if(!t.item_id)return;
      const e=traspasos[t.item_id];
      if(e){ t.traspaso_nota=e.nota||''; t.traspaso_de=e.usuario_nombre||''; t.traspaso_estado=e.estado_hasta||''; t.traspaso_fecha=e.creado||''; }
      const q=calidades[t.item_id];
      if(q){ t.calidad=q.resultado||''; t.calidad_nota=q.nota||''; t.calidad_de=q.usuario_nombre||''; t.calidad_fecha=q.creado||''; }
    });
  }catch(err){ logError('GET /api/produccion (últimos eventos)',err); }
  res.json(tarjetas);
});
/* ── PRODUCCIÓN 2.0 (Fase D) ──
   Un evento NUNCA se edita ni se borra: es el rastro de lo que pasó en el taller. */
function registrarEventoProd(req,d){
  try{
    const u=req.usuario||{};
    db.prepare(`INSERT INTO produccion_eventos
      (id,workspace_id,tipo,pedido_id,encargo_id,item_id,estado_desde,estado_hasta,nota,resultado,cantidad,origen,usuario_id,usuario_nombre,anonimo)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
      .run(uid(),req.wsId,d.tipo||'traspaso',d.pedido_id||'',d.encargo_id||'',d.item_id||'',
           d.estado_desde||'',d.estado_hasta||'',String(d.nota||'').slice(0,1000),d.resultado||'',
           String(d.cantidad||''),d.origen||'',u.id||'',u.nombre||u.usuario||'',d.anonimo?1:0);
  }catch(e){ logError('registrarEventoProd',e); }
}
// Los eventos anónimos ocultan el autor a todo el mundo MENOS al administrador.
function eventoProdVista(ev,esAdmin){
  const o={...ev, anonimo:!!ev.anonimo};
  if(o.anonimo&&!esAdmin){ o.usuario_id=''; o.usuario_nombre=''; }
  return o;
}
// Línea de tiempo de un ítem (lo que dejó cada etapa) — la ve quien recibe el trabajo.
app.get('/api/produccion/eventos',requiere('ver_produccion'),(req,res)=>{
  const{item_id,encargo_id,pedido_id,tipo}=req.query;
  let sql='SELECT * FROM produccion_eventos WHERE workspace_id=?'; const p=[req.wsId];
  if(item_id){sql+=' AND item_id=?';p.push(item_id);}
  if(encargo_id){sql+=' AND encargo_id=?';p.push(encargo_id);}
  if(pedido_id){sql+=' AND pedido_id=?';p.push(pedido_id);}
  if(tipo){sql+=' AND tipo=?';p.push(tipo);}
  const esAdmin=!!(req.permisos&&req.permisos.__admin);
  res.json(db.prepare(sql+' ORDER BY creado DESC LIMIT 200').all(...p).map(e=>eventoProdVista(e,esAdmin)));
});
/* D2 · CONTROL DE CALIDAD — sello de visto bueno en CUALQUIER etapa (no es un estado más
   del tablero). Cada sello queda registrado; volver a sellar no borra el anterior. */
const CALIDAD_RESULTADOS=['ok','problema'];
app.post('/api/produccion/calidad',requiere('gestionar_produccion'),(req,res)=>{
  const b=req.body||{};
  if(!CALIDAD_RESULTADOS.includes(b.resultado))return res.status(400).json({error:'Resultado no válido'});
  const nota=String(b.nota||'').trim();
  if(b.resultado==='problema'&&!nota)return res.status(400).json({error:'Cuando marcas "con problema" hay que decir qué pasó'});
  const it=db.prepare(`SELECT i.id,i.detalle,i.encargo_id,e.numero,p.id AS p_id,p.cerrado AS p_cerrado
    FROM enc_items i JOIN encargos e ON e.id=i.encargo_id JOIN pedidos p ON p.id=e.pedido_id
    WHERE i.id=? AND e.workspace_id=?`).get(b.item_id,req.wsId);
  if(!it)return res.status(404).json({error:'Ítem no encontrado'});
  if(it.p_cerrado)return res.status(409).json({error:'El pedido está cerrado'});
  registrarEventoProd(req,{tipo:'calidad',pedido_id:it.p_id,encargo_id:it.encargo_id,item_id:it.id,
    resultado:b.resultado,nota});
  const det=String(it.detalle||'ítem').slice(0,40);
  addHist(it.p_id,`Calidad · Encargo #${it.numero} · "${det}": ${b.resultado==='ok'?'visto bueno':'CON PROBLEMA'}`+(nota?` · ${nota.slice(0,120)}`:''),req.wsId,actorDe(req));
  res.json({ok:true});
});
/* D3 · REPORTES DE DAÑOS — "se dañó una camiseta", "la prenda del proveedor llegó rota".
   ANÓNIMO EN PANTALLA: se guarda quién reportó (nada queda sin trazabilidad) pero no se
   muestra; solo el administrador puede verlo. Así se reporta sin miedo a quedar señalado. */
const DANO_ORIGENES=['proveedor','interno','otro'];
app.post('/api/produccion/danos',requiere('ver_produccion'),(req,res)=>{
  const b=req.body||{};
  const desc=String(b.descripcion||'').trim();
  if(!desc)return res.status(400).json({error:'Cuenta qué pasó'});
  const origen=DANO_ORIGENES.includes(b.origen)?b.origen:'otro';
  // El pedido es opcional: a veces el daño es de material de bodega, sin pedido asociado.
  let pedido_id='',encargo_id='',item_id='';
  if(b.item_id){
    const it=db.prepare(`SELECT i.id,i.encargo_id,p.id AS p_id FROM enc_items i
      JOIN encargos e ON e.id=i.encargo_id JOIN pedidos p ON p.id=e.pedido_id
      WHERE i.id=? AND e.workspace_id=?`).get(b.item_id,req.wsId);
    if(it){ item_id=it.id; encargo_id=it.encargo_id; pedido_id=it.p_id; }
  }else if(b.pedido_id){
    const p=db.prepare('SELECT id FROM pedidos WHERE id=? AND workspace_id=?').get(b.pedido_id,req.wsId);
    if(p)pedido_id=p.id;
  }
  registrarEventoProd(req,{tipo:'dano',pedido_id,encargo_id,item_id,nota:desc,
    cantidad:String(b.cantidad||''),origen,anonimo:1});
  res.json({ok:true});
});
/* D4 · MÉTRICAS DE PRODUCCIÓN — se calculan SOLO con lo que los eventos permiten medir
   de verdad; no se inventan promedios. El tiempo por etapa sale de la diferencia entre
   traspasos consecutivos del mismo ítem, así que solo cuenta lo que ya se movió dos veces
   (se informa cuántos tramos se midieron para que el dato no engañe). */
app.get('/api/produccion/metricas',requiere('ver_produccion'),(req,res)=>{
  try{
    const dias=Math.min(365,Math.max(1,parseInt(req.query.dias,10)||30));
    const desde=db.prepare("SELECT date('now','localtime',?) d").get(`-${dias} days`).d;
    const evs=db.prepare(`SELECT * FROM produccion_eventos WHERE workspace_id=? AND date(creado)>=?
                          ORDER BY item_id, creado`).all(req.wsId,desde);

    // ── Equipo: qué hizo cada persona (los daños NO se atribuyen: son anónimos) ──
    const porPersona={};
    const tocar=(nom)=>{ const k=nom||'(sin nombre)'; if(!porPersona[k])porPersona[k]={nombre:k,traspasos:0,calidad_ok:0,calidad_problema:0}; return porPersona[k]; };
    evs.forEach(e=>{
      if(e.tipo==='traspaso') tocar(e.usuario_nombre).traspasos++;
      else if(e.tipo==='calidad'){ const p=tocar(e.usuario_nombre); if(e.resultado==='ok')p.calidad_ok++; else p.calidad_problema++; }
    });

    // ── Etapas: cuánto tiempo se queda un ítem en cada una ──
    const porEtapa={}; const trasp=evs.filter(e=>e.tipo==='traspaso'&&e.item_id);
    const porItem={}; trasp.forEach(e=>{ (porItem[e.item_id]=porItem[e.item_id]||[]).push(e); });
    Object.values(porItem).forEach(lista=>{
      lista.sort((a,b)=>String(a.creado).localeCompare(String(b.creado)));
      for(let i=0;i<lista.length-1;i++){
        const etapa=lista[i].estado_hasta; if(!etapa)continue;
        const h=(new Date(lista[i+1].creado.replace(' ','T'))-new Date(lista[i].creado.replace(' ','T')))/3600000;
        if(!isFinite(h)||h<0)continue;
        const r=porEtapa[etapa]=porEtapa[etapa]||{etapa,horas:0,tramos:0};
        r.horas+=h; r.tramos++;
      }
    });
    const etapas=Object.values(porEtapa).map(r=>({etapa:r.etapa,tramos:r.tramos,
      horas_promedio:Math.round((r.horas/r.tramos)*10)/10})).sort((a,b)=>b.horas_promedio-a.horas_promedio);

    // ── Calidad y daños del negocio ──
    const cal=evs.filter(e=>e.tipo==='calidad');
    const danos=evs.filter(e=>e.tipo==='dano');
    const danosPorOrigen={};
    danos.forEach(d=>{ const k=d.origen||'otro'; danosPorOrigen[k]=(danosPorOrigen[k]||0)+1; });

    // Qué se daña o falla más (por el detalle del ítem, si el reporte iba ligado a uno)
    const itemsIds=[...new Set([...cal.filter(e=>e.resultado==='problema'),...danos].map(e=>e.item_id).filter(Boolean))];
    const nombres={};
    if(itemsIds.length){
      const q=itemsIds.map(()=>'?').join(',');
      db.prepare(`SELECT id,detalle FROM enc_items WHERE id IN (${q})`).all(...itemsIds)
        .forEach(r=>{ nombres[r.id]=r.detalle||''; });
    }
    const problemasPorProducto={};
    [...cal.filter(e=>e.resultado==='problema'),...danos].forEach(e=>{
      const n=(nombres[e.item_id]||'').trim(); if(!n)return;
      problemasPorProducto[n]=(problemasPorProducto[n]||0)+1;
    });

    res.json({
      dias, desde,
      equipo:Object.values(porPersona).sort((a,b)=>(b.traspasos+b.calidad_ok+b.calidad_problema)-(a.traspasos+a.calidad_ok+a.calidad_problema)),
      etapas,
      calidad:{ok:cal.filter(e=>e.resultado==='ok').length,problema:cal.filter(e=>e.resultado==='problema').length},
      danos:{total:danos.length,por_origen:danosPorOrigen},
      productos_con_problemas:Object.entries(problemasPorProducto).map(([nombre,n])=>({nombre,n})).sort((a,b)=>b.n-a.n).slice(0,8),
      movimientos:trasp.length
    });
  }catch(e){ logError('GET /api/produccion/metricas',e); res.status(500).json({error:e.message}); }
});
// Cambiar el estado de UN ÍTEM desde Producción (cada ítem fluye por separado).
app.put('/api/produccion/item/:id',requiere('gestionar_produccion'),(req,res)=>{
  const it=db.prepare(`SELECT i.id,i.estado,i.detalle,i.cantidad,i.encargo_id,e.numero,e.responsable_id,e.notas_tec,p.cerrado AS p_cerrado,p.id AS p_id
    FROM enc_items i JOIN encargos e ON e.id=i.encargo_id JOIN pedidos p ON p.id=e.pedido_id
    WHERE i.id=? AND e.workspace_id=?`).get(req.params.id,req.wsId);
  if(!it)return res.status(404).json({error:'Ítem no encontrado'});
  if(it.p_cerrado)return res.status(409).json({error:'El pedido está cerrado'});
  const b=req.body||{};
  if(b.estado===undefined||b.estado===it.estado)return res.json({ok:true,sinCambios:true});
  const estados=getEstados(req.wsId); const nombresEstados=estados.map(e=>e.nombre);
  if(!nombresEstados.includes(b.estado))return res.status(400).json({error:'Estado no válido'});
  const destino=estados.find(e=>e.nombre===b.estado);
  if(destino.requiere_notas && !(it.notas_tec||'').trim())return res.status(400).json({error:`El estado "${destino.nombre}" requiere una observación técnica en el encargo`});
  if(destino.requiere_responsable && !it.responsable_id)return res.status(400).json({error:`El estado "${destino.nombre}" requiere un responsable asignado`});
  db.prepare('UPDATE enc_items SET estado=? WHERE id=?').run(b.estado,it.id);
  const act=actorDe(req);
  const det=String(it.detalle||'ítem').slice(0,40);
  // D1 · queda el traspaso registrado (quién, cuándo, desde/hasta y la nota para quien recibe)
  registrarEventoProd(req,{tipo:'traspaso',pedido_id:it.p_id,encargo_id:it.encargo_id,item_id:it.id,
    estado_desde:it.estado||'',estado_hasta:b.estado,nota:String(b.nota||'').trim()});
  const nota=String(b.nota||'').trim();
  addHist(it.p_id,`Producción · Encargo #${it.numero} · "${det}": ${it.estado||'—'} → ${b.estado}`+(nota?` · Nota: ${nota.slice(0,120)}`:''),req.wsId,act);
  res.json({ok:true});
});
// Equipo asignable (usuarios activos del workspace) — accesible con solo ver_produccion.
app.get('/api/produccion/equipo',requiere('ver_produccion'),(req,res)=>{
  res.json(db.prepare('SELECT id,nombre,usuario FROM usuarios WHERE workspace_id=? AND activo=1 ORDER BY nombre').all(req.wsId).map(u=>({id:u.id,nombre:u.nombre||u.usuario})));
});
// Actualizar un encargo desde Producción: estado / responsable / observación técnica.
// NO toca información comercial (valores, cliente, pagos). Bloqueado si el pedido está cerrado.
app.put('/api/produccion/encargo/:id',requiere('gestionar_produccion'),(req,res)=>{
  const enc=db.prepare('SELECT e.*, p.cerrado AS p_cerrado, p.id AS p_id FROM encargos e JOIN pedidos p ON p.id=e.pedido_id WHERE e.id=? AND e.workspace_id=?').get(req.params.id,req.wsId);
  if(!enc)return res.status(404).json({error:'Encargo no encontrado'});
  if(enc.p_cerrado)return res.status(409).json({error:'El pedido está cerrado'});
  const b=req.body||{}; const act=actorDe(req); const sets=[]; const vals=[]; const logs=[];
  const estados=getEstados(req.wsId); const nombresEstados=estados.map(e=>e.nombre);
  if(b.estado!==undefined && b.estado!==enc.estado){
    if(!nombresEstados.includes(b.estado))return res.status(400).json({error:'Estado no válido'});
    const destino=estados.find(e=>e.nombre===b.estado);
    const notaFinal=b.notas_tec!==undefined?String(b.notas_tec):(enc.notas_tec||'');
    const respFinal=b.responsable_id!==undefined?(b.responsable_id||''):(enc.responsable_id||'');
    if(destino.requiere_notas && !notaFinal.trim())return res.status(400).json({error:`El estado "${destino.nombre}" requiere una observación técnica`});
    if(destino.requiere_responsable && !respFinal)return res.status(400).json({error:`El estado "${destino.nombre}" requiere un responsable asignado`});
    logs.push(`Producción · Encargo #${enc.numero}: ${enc.estado||'Nuevo'} → ${b.estado}`);
    sets.push('estado=?'); vals.push(b.estado);
  }
  if(b.responsable_id!==undefined && (b.responsable_id||'')!==(enc.responsable_id||'')){
    const rid=b.responsable_id||'';
    const u=rid?db.prepare('SELECT nombre,usuario FROM usuarios WHERE id=? AND workspace_id=?').get(rid,req.wsId):null;
    if(rid&&!u)return res.status(400).json({error:'Responsable inválido'});
    logs.push(rid?`Producción · Encargo #${enc.numero}: responsable → ${u.nombre||u.usuario}`:`Producción · Encargo #${enc.numero}: responsable quitado`);
    sets.push('responsable_id=?'); vals.push(rid);
  }
  if(b.notas_tec!==undefined && String(b.notas_tec)!==(enc.notas_tec||'')){
    logs.push(`Producción · Encargo #${enc.numero}: observación técnica actualizada`);
    sets.push('notas_tec=?'); vals.push(String(b.notas_tec));
  }
  if(!sets.length)return res.json({ok:true,sinCambios:true});
  vals.push(req.params.id,req.wsId);
  db.prepare(`UPDATE encargos SET ${sets.join(',')} WHERE id=? AND workspace_id=?`).run(...vals);
  logs.forEach(t=>addHist(enc.p_id,t,req.wsId,act));
  res.json({ok:true});
});

// ── INVENTARIO DESDE PRODUCCIÓN (v3.0 Fase 5) — consumo real, híbrido ──
// El operario registra el material físico usado en un encargo. Descuenta stock exacto y deja
// un registro reversible. Convive con el descuento automático del producto (compatibilidad).
app.post('/api/produccion/encargo/:id/consumo',requiere('consumir_inventario'),(req,res)=>{
  const enc=db.prepare('SELECT e.numero, e.id AS e_id, p.cerrado AS p_cerrado, p.id AS p_id FROM encargos e JOIN pedidos p ON p.id=e.pedido_id WHERE e.id=? AND e.workspace_id=?').get(req.params.id,req.wsId);
  if(!enc)return res.status(404).json({error:'Encargo no encontrado'});
  if(enc.p_cerrado)return res.status(409).json({error:'El pedido está cerrado'});
  const b=req.body||{}; const cant=Number(b.cantidad);
  if(!b.item_inv_id)return res.status(400).json({error:'Elige un ítem de inventario'});
  if(!(cant>0))return res.status(400).json({error:'La cantidad debe ser mayor a 0'});
  const it=db.prepare('SELECT * FROM items_inventario WHERE id=? AND workspace_id=?').get(b.item_inv_id,req.wsId);
  if(!it)return res.status(404).json({error:'Ítem de inventario no encontrado'});
  if(it.stock_actual==null)return res.status(400).json({error:'Ese ítem no lleva control de stock'});
  const act=actorDe(req); const id=uid();
  db.prepare('UPDATE items_inventario SET stock_actual=stock_actual-? WHERE id=? AND workspace_id=?').run(cant,it.id,req.wsId);
  db.prepare('INSERT INTO consumo_inventario(id,workspace_id,pedido_id,encargo_id,item_inv_id,item_nombre,unidad,cantidad,usuario_id,usuario_nombre)VALUES(?,?,?,?,?,?,?,?,?,?)')
    .run(id,req.wsId,enc.p_id,enc.e_id,it.id,it.nombre,it.unidad_medida||'',cant,act.id||'',act.nombre||'');
  addHist(enc.p_id,`Producción · Encargo #${enc.numero}: consumió ${cant} ${it.unidad_medida||''} de "${it.nombre}"`,req.wsId,act);
  res.json({ok:true, consumo:{id,item_inv_id:it.id,item_nombre:it.nombre,unidad:it.unidad_medida||'',cantidad:cant}, item_inv_id:it.id, stock_actual:it.stock_actual-cant});
});
app.delete('/api/produccion/consumo/:id',requiere('consumir_inventario'),(req,res)=>{
  const c=db.prepare('SELECT c.*, p.cerrado AS p_cerrado, e.numero AS enc_num FROM consumo_inventario c JOIN pedidos p ON p.id=c.pedido_id LEFT JOIN encargos e ON e.id=c.encargo_id WHERE c.id=? AND c.workspace_id=?').get(req.params.id,req.wsId);
  if(!c)return res.status(404).json({error:'Consumo no encontrado'});
  if(c.p_cerrado)return res.status(409).json({error:'El pedido está cerrado'});
  const act=actorDe(req);
  db.prepare('UPDATE items_inventario SET stock_actual=stock_actual+? WHERE id=? AND workspace_id=?').run(c.cantidad,c.item_inv_id,req.wsId);
  db.prepare('DELETE FROM consumo_inventario WHERE id=? AND workspace_id=?').run(req.params.id,req.wsId);
  addHist(c.pedido_id,`Producción · Encargo #${c.enc_num||''}: revirtió consumo de ${c.cantidad} ${c.unidad||''} de "${c.item_nombre}"`,req.wsId,act);
  res.json({ok:true, stock_restaurado:c.cantidad, item_inv_id:c.item_inv_id});
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
  const{q}=req.query; let sql='SELECT * FROM clientes WHERE workspace_id=? AND archivado=0'; const params=[req.wsId];
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
// v3.0 Fase 7 — editar la ficha del cliente (solo roles autorizados, desde el módulo Clientes)
app.put('/api/clientes/:id',requiere('editar_clientes'),(req,res)=>{
  const c=db.prepare('SELECT * FROM clientes WHERE id=? AND workspace_id=?').get(req.params.id,req.wsId);
  if(!c)return res.status(404).json({error:'No encontrado'});
  const b=req.body||{};
  const nombre=(b.nombre!=null&&String(b.nombre).trim())?String(b.nombre).trim():c.nombre;
  db.prepare(`UPDATE clientes SET nombre=?,tel=?,nit=?,email=?,direccion=?,contacto=?,notas=? WHERE id=? AND workspace_id=?`)
    .run(nombre,b.tel!=null?String(b.tel).trim():c.tel,b.nit!=null?String(b.nit).trim():c.nit,
         b.email!=null?String(b.email).trim():c.email,b.direccion!=null?String(b.direccion).trim():c.direccion,
         b.contacto!=null?String(b.contacto).trim():c.contacto,b.notas!=null?String(b.notas):c.notas,
         req.params.id,req.wsId);
  // Mantener el nombre/tel copiados en los pedidos del cliente coherentes con la ficha
  db.prepare('UPDATE pedidos SET nombre=?,tel=? WHERE cliente_id=? AND workspace_id=?')
    .run(nombre,b.tel!=null?String(b.tel).trim():c.tel,req.params.id,req.wsId);
  res.json(db.prepare('SELECT * FROM clientes WHERE id=?').get(req.params.id));
});

// Stats
app.get('/api/stats',(req,res)=>{
  const wsId=req.wsId;
  // Los archivados NO cuentan (deben coincidir con el Dashboard, que filtra archivado=0).
  const activos=db.prepare("SELECT COUNT(*) as n FROM pedidos WHERE workspace_id=? AND archivado=0 AND entregado=0 AND cancelado=0 AND es_cotizacion=0").get(wsId).n;
  const urgentes=db.prepare("SELECT COUNT(*) as n FROM pedidos WHERE workspace_id=? AND archivado=0 AND urgente=1 AND entregado=0 AND cancelado=0 AND es_cotizacion=0").get(wsId).n;
  // Listo: todos sus encargos en la etapa FINAL configurada (legacy 'Entregado' cuenta) y pedido activo
  const estadosWs=getEstados(wsId); const estadoFinal=estadosWs.length?estadosWs[estadosWs.length-1].nombre:'Listo';
  const candidatos=db.prepare("SELECT id FROM pedidos WHERE workspace_id=? AND archivado=0 AND entregado=0 AND cancelado=0 AND es_cotizacion=0").all(wsId);
  let listos=0;
  candidatos.forEach(p=>{
    const its=db.prepare('SELECT i.estado FROM enc_items i JOIN encargos e ON e.id=i.encargo_id WHERE e.pedido_id=?').all(p.id);
    const src=its.length?its:db.prepare('SELECT estado FROM encargos WHERE pedido_id=?').all(p.id);
    if(src.length&&src.every(x=>x.estado===estadoFinal||x.estado==='Entregado'))listos++;
  });
  const clientes=db.prepare('SELECT COUNT(*) as n FROM clientes WHERE workspace_id=? AND archivado=0').get(wsId).n;
  const pendPago=db.prepare("SELECT COUNT(*) as n FROM pedidos WHERE workspace_id=? AND archivado=0 AND pendiente_pago=1 AND entregado=0 AND cancelado=0 AND es_cotizacion=0").get(wsId).n;
  const cotizaciones=db.prepare("SELECT COUNT(*) as n FROM pedidos WHERE workspace_id=? AND archivado=0 AND es_cotizacion=1 AND cancelado=0").get(wsId).n;
  res.json({activos,urgentes,listos,clientes,pendPago,cotizaciones});
});

// ── DASHBOARD EJECUTIVO (v3.0 Fase 6) — solo lectura, agregaciones ──
app.get('/api/dashboard',requiere('ver_dashboard'),(req,res)=>{
  const wsId=req.wsId; const hoyStr=hoy(wsId);
  const periodo=['hoy','semana','mes'].includes(req.query.periodo)?req.query.periodo:'hoy';
  // KPIs
  const activos=db.prepare("SELECT COUNT(*) n FROM pedidos WHERE workspace_id=? AND archivado=0 AND entregado=0 AND cancelado=0 AND es_cotizacion=0").get(wsId).n;
  const urgentes=db.prepare("SELECT COUNT(*) n FROM pedidos WHERE workspace_id=? AND archivado=0 AND urgente=1 AND entregado=0 AND cancelado=0 AND es_cotizacion=0").get(wsId).n;
  const entregasHoy=db.prepare("SELECT COUNT(*) n FROM pedidos WHERE workspace_id=? AND archivado=0 AND entregado=0 AND cancelado=0 AND es_cotizacion=0 AND fecha_entrega=?").get(wsId,hoyStr).n;
  const cotPeds=db.prepare("SELECT * FROM pedidos WHERE workspace_id=? AND archivado=0 AND es_cotizacion=1 AND cancelado=0").all(wsId).map(pedidoCompleto);
  const cotValor=cotPeds.reduce((a,p)=>a+(p.valor_total||0),0);
  // Finanzas del período (ingresos = pagos por fecha; costos = por fecha de registro; solo pedidos vivos)
  const desde = periodo==='hoy'?hoyStr : periodo==='semana'
    ? db.prepare("SELECT date(?, '-6 days') d").get(hoyStr).d
    : db.prepare("SELECT date(?, 'start of month') d").get(hoyStr).d;
  const ingresos=db.prepare(`SELECT COALESCE(SUM(CAST(pg.monto_calc AS INTEGER)),0) s FROM pagos pg JOIN pedidos p ON p.id=pg.pedido_id
    WHERE pg.workspace_id=? AND p.archivado=0 AND p.cancelado=0 AND pg.fecha>=? AND pg.fecha<=?`).get(wsId,desde,hoyStr).s;
  // Costos por fecha del pedido (los registros de costos se reescriben al editar → su 'creado' no es confiable)
  const costos=db.prepare(`SELECT COALESCE(SUM(CAST(c.monto_calc AS INTEGER)),0) s FROM costos c JOIN pedidos p ON p.id=c.pedido_id
    WHERE c.workspace_id=? AND p.archivado=0 AND p.cancelado=0 AND p.es_cotizacion=0 AND p.fecha_pedido>=? AND p.fecha_pedido<=?`).get(wsId,desde,hoyStr).s;
  const utilidad=ingresos-costos;
  const margen=ingresos>0?Math.round(utilidad*100/ingresos):0;
  // Pedidos recientes (últimos 5, con valor oficial)
  const recientes=db.prepare("SELECT * FROM pedidos WHERE workspace_id=? AND archivado=0 ORDER BY creado DESC LIMIT 5").all(wsId)
    .map(pedidoCompleto).map(p=>({id:p.id,ref:p.ref,nombre:p.nombre,entregado:p.entregado,cancelado:p.cancelado,cerrado:!!p.cerrado,es_cotizacion:p.es_cotizacion,urgente:p.urgente,valor_total:p.valor_total||0,pagado:(p.pagos||[]).reduce((a,x)=>a+toNum(x.monto_calc),0),encargos:(p.encargos||[]).map(e=>({estado:e.estado})),fecha_pedido:p.fecha_pedido}));
  // Entregas próximas (7 días)
  const hasta=db.prepare("SELECT date(?, '+7 days') d").get(hoyStr).d;
  const entregas=db.prepare(`SELECT id,ref,nombre,fecha_entrega,urgente FROM pedidos WHERE workspace_id=? AND archivado=0
    AND entregado=0 AND cancelado=0 AND es_cotizacion=0 AND fecha_entrega>=? AND fecha_entrega<=? ORDER BY fecha_entrega ASC LIMIT 8`).all(wsId,hoyStr,hasta);
  // Producción: ÍTEMS por estado (pedidos activos) — cada ítem fluye por separado
  const prodRows=db.prepare(`SELECT i.estado, COUNT(*) n FROM enc_items i JOIN encargos e ON e.id=i.encargo_id JOIN pedidos p ON p.id=e.pedido_id
    WHERE e.workspace_id=? AND p.archivado=0 AND p.entregado=0 AND p.cancelado=0 AND p.es_cotizacion=0 AND p.cerrado=0 GROUP BY i.estado`).all(wsId);
  const estadosWs=getEstados(wsId); const nombresEstadosWs=estadosWs.map(e=>e.nombre); const primerEstadoWs=nombresEstadosWs[0]||'Nuevo';
  const produccion={}; nombresEstadosWs.forEach(s=>produccion[s]=0);
  prodRows.forEach(r=>{ const s=nombresEstadosWs.includes(r.estado)?r.estado:primerEstadoWs; produccion[s]=(produccion[s]||0)+r.n; });
  // Actividad reciente (historial cross-pedidos)
  const actividad=db.prepare(`SELECT h.texto,h.usuario_nombre,h.creado,p.ref FROM historial h JOIN pedidos p ON p.id=h.pedido_id
    WHERE h.workspace_id=? ORDER BY h.creado DESC LIMIT 8`).all(wsId);
  // Serie: ingresos reales (pagos) por día, últimos 7 días — para el gráfico del dashboard
  const serie7=[];
  for(let i=6;i>=0;i--){
    const dia=db.prepare('SELECT date(?, ?) d').get(hoyStr,`-${i} days`).d;
    const v=db.prepare(`SELECT COALESCE(SUM(CAST(pg.monto_calc AS INTEGER)),0) s FROM pagos pg JOIN pedidos p ON p.id=pg.pedido_id
      WHERE pg.workspace_id=? AND p.archivado=0 AND p.cancelado=0 AND pg.fecha=?`).get(wsId,dia).s;
    serie7.push({d:dia,v});
  }
  res.json({hoy:hoyStr,periodo,kpis:{activos,urgentes,entregasHoy,cotizaciones:cotPeds.length,cotValor},finanzas:{desde,ingresos,costos,utilidad,margen},serie7,recientes,entregas,produccion,actividad});
});

// Export CSV
app.get('/api/export/csv',requiere('ver_registros'),(req,res)=>{
  const{estado}=req.query;
  let sql='SELECT * FROM pedidos WHERE workspace_id=? AND archivado=0'; const params=[req.wsId];
  if(estado==='entregado')sql+=' AND entregado=1';
  else if(estado==='cancelado')sql+=' AND cancelado=1';
  else if(estado&&estado!=='todos')sql+=' AND entregado=0 AND cancelado=0';
  const pedidos=db.prepare(sql+' ORDER BY creado DESC').all(...params).map(pedidoCompleto);
  const estadoDe=p=>p.entregado?'Entregado':p.cancelado?'Cancelado':p.es_cotizacion?'Cotización':p.urgente?'Urgente':'Activo';
  const costoDe=p=>(p.costos||[]).reduce((a,c)=>a+toNum(c.monto_calc),0);
  let rows,nombreArch;
  // B3 · dos formas de exportar. "items" pone UNA FILA POR ÍTEM para poder filtrar, sumar y
  // hacer tablas dinámicas en Excel; antes todo iba aplastado en una sola celda "Encargos".
  if(req.query.tipo==='items'){
    nombreArch='pedidos_grafia_detalle_por_item.csv';
    // El "Código de venta" va aquí: es la columna por la que un auditor agrupa y referencia.
    rows=[['Ref','Cliente','Tel','Estado','F.Pedido','F.Entrega','Encargo','Categorías','Código de venta','Cantidad','Detalle','Nota del ítem','Estado del ítem','V. Unitario','V. Total ítem']];
    pedidos.forEach(p=>{
      const est=estadoDe(p);
      (p.encargos||[]).forEach(e=>{
        const cats=(e.categorias||[]).join(', ');
        (e.items||[]).forEach(i=>{
          const cant=parseInt(String(i.cantidad||0).replace(/\D/g,''))||0;
          const unit=toNum(i.valor_unitario_calc);
          rows.push([p.ref,p.nombre,p.tel||'',est,p.fecha_pedido||'',p.fecha_entrega||'',
            e.numero||'',cats,i.codigo_venta||'',i.cantidad||'',i.detalle||'',i.nota||'',i.estado||'',unit,cant*unit]);
        });
      });
    });
  }else{
    nombreArch='pedidos_grafia_resumen.csv';
    // Resumen: un pedido por fila, ahora CON costos y utilidad (antes no salían).
    rows=[['Ref','Cliente','Tel','Estado','Urgente','Encargos','Valor Total','Costos','Utilidad','Pagado','Saldo','F.Pedido','F.Entrega','Notas']];
    pedidos.forEach(p=>{
      const encRes=(p.encargos||[]).map(e=>`[${(e.categorias||[]).join(', ')}] ${(e.items||[]).map(i=>`${i.cantidad} ${i.detalle}${i.codigo_venta?' ('+i.codigo_venta+')':''}`).join(', ')}`).join(' | ');
      const pag=(p.pagos||[]).reduce((a,x)=>a+toNum(x.monto_calc),0);
      const val=p.valor_total||0, cos=costoDe(p);
      rows.push([p.ref,p.nombre,p.tel||'',estadoDe(p),p.urgente?'Sí':'No',encRes,val,cos,val-cos,pag,Math.max(0,val-pag),p.fecha_pedido||'',p.fecha_entrega||'',p.notas||'']);
    });
  }
  // Los números van SIN comillas para que Excel los sume; el texto sí entrecomillado.
  const celda=c=>(typeof c==='number'&&Number.isFinite(c))?String(c):'"'+String(c).replace(/"/g,'""')+'"';
  const csv='\uFEFF'+rows.map(r=>r.map(celda).join(',')).join('\n');
  res.setHeader('Content-Type','text/csv; charset=utf-8');
  res.setHeader('Content-Disposition',`attachment; filename="${nombreArch}"`);
  res.send(csv);
});

// Registros financieros
app.get('/api/registros/utilidades',requiere('ver_registros'),(req,res)=>{
  const pedidos=db.prepare('SELECT * FROM pedidos WHERE workspace_id=? AND archivado=0').all(req.wsId).map(pedidoCompleto);
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

// ── RESPALDO DE BASE DE DATOS ──
// Descarga una copia consistente del .db completo (usa el backup API de SQLite, seguro con WAL).
// Solo el admin del workspace principal: el archivo contiene TODOS los workspaces.
app.get('/api/backup/db',requiere('configurar_sistema'),async(req,res)=>{
  if(req.wsId!=='main')return res.status(403).json({error:'El respaldo completo solo está disponible para el workspace principal'});
  try{
    const stamp=new Date().toISOString().slice(0,16).replace(/[T:]/g,'-');
    const tmp=path.join(require('os').tmpdir(),`agencia-backup-${stamp}-${Math.random().toString(36).slice(2,8)}.db`);
    await db.backup(tmp);
    res.download(tmp,`agencia-backup-${stamp}.db`,()=>{ try{fs.unlinkSync(tmp)}catch(e){} });
  }catch(e){logError('GET /api/backup/db',e);res.status(500).json({error:e.message})}
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

// ── ESTADOS DE PRODUCCIÓN (tablero configurable por workspace) ──
const ESTADOS_DEFAULT=[
  {nombre:'Nuevo',color:'#8A9EAD',requiere_notas:0,requiere_responsable:0},
  {nombre:'Diseño',color:'#7B6EF6',requiere_notas:0,requiere_responsable:1},
  {nombre:'Aprobación',color:'#F5A623',requiere_notas:0,requiere_responsable:1},
  {nombre:'Producción',color:'#0BB5B0',requiere_notas:0,requiere_responsable:1},
  {nombre:'Listo',color:'#2BAD72',requiere_notas:0,requiere_responsable:0},
];
function sembrarEstados(wsId){
  ESTADOS_DEFAULT.forEach((e,i)=>{
    db.prepare('INSERT INTO encargo_estados(id,workspace_id,nombre,color,orden,requiere_notas,requiere_responsable,activo)VALUES(?,?,?,?,?,?,?,1)')
      .run(uid(),wsId,e.nombre,e.color,i,e.requiere_notas,e.requiere_responsable);
  });
}
function getEstados(wsId){
  let filas=db.prepare('SELECT * FROM encargo_estados WHERE workspace_id=? AND activo=1 ORDER BY orden').all(wsId);
  if(!filas.length){
    sembrarEstados(wsId);
    filas=db.prepare('SELECT * FROM encargo_estados WHERE workspace_id=? AND activo=1 ORDER BY orden').all(wsId);
  }
  return filas.map(f=>({id:f.id,nombre:f.nombre,color:f.color,orden:f.orden,requiere_notas:!!f.requiere_notas,requiere_responsable:!!f.requiere_responsable}));
}
function validarEstado(b){
  const errores=[];
  if(!String(b.nombre||'').trim())errores.push('El nombre del estado no puede estar vacío');
  if(b.color!==undefined&&!/^#[0-9a-fA-F]{6}$/.test(b.color||''))errores.push('Color no válido');
  return errores;
}

// ── CONFIGURACIÓN DEL NEGOCIO ──
app.get('/api/configuracion',(req,res)=>{
  res.json(getConfiguracion(req.wsId));
});

app.put('/api/configuracion',requiere('configurar_sistema'),(req,res)=>{
  try{
    const b=req.body||{};
    const errores=[];
    if(b.formato_fecha!==undefined&&!FORMATOS_FECHA.includes(b.formato_fecha))errores.push('Formato de fecha no válido');
    if(b.separador_miles!==undefined&&!SEPARADORES_MILES.includes(b.separador_miles))errores.push('Separador de miles no válido');
    if(b.zona_horaria!==undefined&&!ZONAS_HORARIAS.has(b.zona_horaria))errores.push('Zona horaria no válida');
    if(b.metodos_pago!==undefined&&!Array.isArray(b.metodos_pago))errores.push('Métodos de pago no válidos');
    if(b.dias_validez_cotizacion!==undefined&&(!Number.isInteger(b.dias_validez_cotizacion)||b.dias_validez_cotizacion<0))errores.push('Días de validez de cotización no válido');
    if(b.dias_anticipacion_entrega!==undefined&&(!Number.isInteger(b.dias_anticipacion_entrega)||b.dias_anticipacion_entrega<0))errores.push('Días de anticipación no válido');
    if(b.iva_porcentaje!==undefined&&(!Number.isInteger(b.iva_porcentaje)||b.iva_porcentaje<0||b.iva_porcentaje>100))errores.push('Porcentaje de IVA no válido');
    if(errores.length)return res.status(400).json({error:errores.join('. ')});
    const actual=getConfiguracion(req.wsId);
    const nuevo={...actual,...b};
    db.prepare(`INSERT INTO configuracion_negocio
        (workspace_id,nombre_negocio,direccion,telefono,email,nit,moneda_prefijo,decimales,separador_miles,formato_fecha,zona_horaria,dias_validez_cotizacion,estado_default_cotizacion,metodos_pago,info_pdf,alertas_entrega,dias_anticipacion_entrega,iva_activo,iva_porcentaje,iva_desglosado,color_primario,color_acento)
      VALUES(@workspace_id,@nombre_negocio,@direccion,@telefono,@email,@nit,@moneda_prefijo,@decimales,@separador_miles,@formato_fecha,@zona_horaria,@dias_validez_cotizacion,@estado_default_cotizacion,@metodos_pago,@info_pdf,@alertas_entrega,@dias_anticipacion_entrega,@iva_activo,@iva_porcentaje,@iva_desglosado,@color_primario,@color_acento)
      ON CONFLICT(workspace_id) DO UPDATE SET
        nombre_negocio=excluded.nombre_negocio,direccion=excluded.direccion,telefono=excluded.telefono,
        email=excluded.email,nit=excluded.nit,moneda_prefijo=excluded.moneda_prefijo,decimales=excluded.decimales,
        separador_miles=excluded.separador_miles,formato_fecha=excluded.formato_fecha,zona_horaria=excluded.zona_horaria,
        dias_validez_cotizacion=excluded.dias_validez_cotizacion,estado_default_cotizacion=excluded.estado_default_cotizacion,
        metodos_pago=excluded.metodos_pago,info_pdf=excluded.info_pdf,alertas_entrega=excluded.alertas_entrega,dias_anticipacion_entrega=excluded.dias_anticipacion_entrega,
        iva_activo=excluded.iva_activo,iva_porcentaje=excluded.iva_porcentaje,iva_desglosado=excluded.iva_desglosado,
        color_primario=excluded.color_primario,color_acento=excluded.color_acento`)
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
        info_pdf:(nuevo.info_pdf||''),
        alertas_entrega:nuevo.alertas_entrega?1:0,
        dias_anticipacion_entrega:Number.isInteger(nuevo.dias_anticipacion_entrega)?nuevo.dias_anticipacion_entrega:3,
        iva_activo:nuevo.iva_activo?1:0,
        iva_porcentaje:Number.isInteger(nuevo.iva_porcentaje)?nuevo.iva_porcentaje:19,
        iva_desglosado:nuevo.iva_desglosado?1:0,
        color_primario:colorOk(nuevo.color_primario,CFG_DEFAULTS.color_primario),
        color_acento:colorOk(nuevo.color_acento,CFG_DEFAULTS.color_acento)
      });
    res.json(getConfiguracion(req.wsId));
  }catch(e){logError('PUT /api/configuracion',e);res.status(500).json({error:e.message})}
});

app.post('/api/configuracion/logo',requiere('configurar_sistema'),upload.single('logo'),(req,res)=>{
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
app.post('/api/etiquetas',requiere('configurar_sistema'),(req,res)=>{
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
app.put('/api/etiquetas/:id',requiere('configurar_sistema'),(req,res)=>{
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
app.delete('/api/etiquetas/:id',requiere('configurar_sistema'),(req,res)=>{
  const r=db.prepare('DELETE FROM etiquetas_negocio WHERE id=? AND workspace_id=?').run(req.params.id,req.wsId);
  if(r.changes===0)return res.status(404).json({error:'No encontrada'});
  res.json({ok:true});
});

// ── ESTADOS DE PRODUCCIÓN (tablero configurable) ──
app.get('/api/encargo-estados',(req,res)=>{
  res.json(getEstados(req.wsId));
});
app.post('/api/encargo-estados',requiere('configurar_sistema'),(req,res)=>{
  try{
    const b=req.body;
    const errores=validarEstado(b);
    if(errores.length)return res.status(400).json({error:errores.join('. ')});
    const dup=db.prepare('SELECT id FROM encargo_estados WHERE workspace_id=? AND activo=1 AND lower(nombre)=lower(?)').get(req.wsId,b.nombre.trim());
    if(dup)return res.status(400).json({error:'Ya existe un estado con ese nombre'});
    const id=uid();
    const max=db.prepare('SELECT MAX(orden) AS m FROM encargo_estados WHERE workspace_id=? AND activo=1').get(req.wsId).m;
    db.prepare('INSERT INTO encargo_estados(id,workspace_id,nombre,color,orden,requiere_notas,requiere_responsable,activo)VALUES(?,?,?,?,?,?,?,1)')
      .run(id,req.wsId,b.nombre.trim(),b.color||'#8A9EAD',(max??-1)+1,b.requiere_notas?1:0,b.requiere_responsable?1:0);
    res.json(getEstados(req.wsId).find(e=>e.id===id));
  }catch(e){logError('POST /api/encargo-estados',e);res.status(500).json({error:e.message})}
});
app.put('/api/encargo-estados/:id',requiere('configurar_sistema'),(req,res)=>{
  try{
    const b=req.body; const eid=req.params.id;
    const f=db.prepare('SELECT * FROM encargo_estados WHERE id=? AND workspace_id=?').get(eid,req.wsId);
    if(!f)return res.status(404).json({error:'No encontrado'});
    const errores=validarEstado(b);
    if(errores.length)return res.status(400).json({error:errores.join('. ')});
    const dup=db.prepare('SELECT id FROM encargo_estados WHERE workspace_id=? AND activo=1 AND lower(nombre)=lower(?) AND id!=?').get(req.wsId,b.nombre.trim(),eid);
    if(dup)return res.status(400).json({error:'Ya existe un estado con ese nombre'});
    const nombreAnterior=f.nombre;
    db.prepare('UPDATE encargo_estados SET nombre=?,color=?,requiere_notas=?,requiere_responsable=? WHERE id=? AND workspace_id=?')
      .run(b.nombre.trim(),b.color||'#8A9EAD',b.requiere_notas?1:0,b.requiere_responsable?1:0,eid,req.wsId);
    if(nombreAnterior!==b.nombre.trim()){
      db.prepare('UPDATE encargos SET estado=? WHERE workspace_id=? AND estado=?').run(b.nombre.trim(),req.wsId,nombreAnterior);
      db.prepare('UPDATE enc_items SET estado=? WHERE estado=? AND encargo_id IN (SELECT id FROM encargos WHERE workspace_id=?)').run(b.nombre.trim(),nombreAnterior,req.wsId);
    }
    res.json(getEstados(req.wsId).find(e=>e.id===eid));
  }catch(e){logError('PUT /api/encargo-estados/:id',e);res.status(500).json({error:e.message})}
});
app.delete('/api/encargo-estados/:id',requiere('configurar_sistema'),(req,res)=>{
  const f=db.prepare('SELECT * FROM encargo_estados WHERE id=? AND workspace_id=? AND activo=1').get(req.params.id,req.wsId);
  if(!f)return res.status(404).json({error:'No encontrado'});
  const total=db.prepare('SELECT COUNT(*) AS n FROM encargo_estados WHERE workspace_id=? AND activo=1').get(req.wsId).n;
  if(total<=2)return res.status(400).json({error:'Debe haber al menos 2 estados en el tablero'});
  const enUso=db.prepare(`SELECT COUNT(*) AS n FROM encargos e JOIN pedidos p ON p.id=e.pedido_id WHERE e.workspace_id=? AND e.estado=? AND p.archivado=0 AND p.entregado=0 AND p.cancelado=0`).get(req.wsId,f.nombre).n;
  if(enUso>0)return res.status(400).json({error:`No se puede eliminar. Hay ${enUso} encargo(s) activo(s) en "${f.nombre}". Muévelos a otro estado primero.`});
  db.prepare('UPDATE encargo_estados SET activo=0 WHERE id=? AND workspace_id=?').run(req.params.id,req.wsId);
  res.json({ok:true});
});
app.post('/api/encargo-estados/reordenar',requiere('configurar_sistema'),(req,res)=>{
  try{
    const orden=req.body.orden;
    if(!Array.isArray(orden))return res.status(400).json({error:'Formato inválido'});
    const upd=db.prepare('UPDATE encargo_estados SET orden=? WHERE id=? AND workspace_id=?');
    orden.forEach((id,i)=>upd.run(i,id,req.wsId));
    res.json(getEstados(req.wsId));
  }catch(e){logError('POST /api/encargo-estados/reordenar',e);res.status(500).json({error:e.message})}
});

// ── CENTRO DE COSTOS (v4.0) — vista derivada de las fichas: no crea datos, solo los organiza ──
app.get('/api/costos',requiere('ver_costos'),(req,res)=>{
  try{
    const filas=db.prepare('SELECT * FROM fichas_producto WHERE workspace_id=? AND archivado=0 ORDER BY nombre').all(req.wsId);
    // B5 · Ventas reales por ficha (pedidos NO cotización, no archivados/cancelados): unidades, ingreso, # pedidos
    const ventasMap={};
    try{
      db.prepare(`SELECT i.ficha_id AS fid, i.cantidad AS cant, i.valor_unitario_calc AS vu, e.pedido_id AS pid
        FROM enc_items i JOIN encargos e ON e.id=i.encargo_id JOIN pedidos p ON p.id=e.pedido_id
        WHERE i.workspace_id=? AND i.ficha_id IS NOT NULL AND p.archivado=0 AND p.cancelado=0 AND p.es_cotizacion=0`).all(req.wsId)
        .forEach(r=>{ const m=ventasMap[r.fid]||(ventasMap[r.fid]={und:0,ingreso:0,peds:{}}); const c=toNum(r.cant); m.und+=c; m.ingreso+=c*toNum(r.vu); m.peds[r.pid]=1; });
    }catch(e){ logError('costos/ventas',e); }
    const productos=filas.map(f=>{
      fichaCompleta(f);
      const insumos=(f.insumos||[]).map(i=>{
        const unit=toNum(i.costo_unitario_calc), cant=parseFloat(i.cantidad_usada)||0;
        return {nombre:i.nombre_insumo||'',proveedor:String(i.proveedor||'').trim(),unidad:i.unidad_medida||'',
          variable:!!i.es_variable,costo_unit:unit,cantidad:cant,subtotal:Math.round(unit*(cant||1))};
      });
      const fijos=(f.costos_fijos||[]).map(c=>({nombre:c.nombre||'',valor:c.valor_calc!=null?toNum(c.valor_calc):(evalExpr(c.valor)||0)}));
      // Variantes hoja: costo propio + heredado de grupos (los costos de un grupo aplican a sus hijas)
      const hojas=[];
      const walk=(nodos,herencia,ruta)=>{(nodos||[]).forEach(v=>{
        if(v.informativa)return; // Centro de Costos: solo COSTOS — las variables informativas (tallas/color/género) no entran
        const propios=(v.costos||[]).reduce((a,c)=>a+(evalExpr(c.valor)||0),0);
        const acum=herencia+propios;
        const nombre=[...ruta,String(v.nombre||'—')];
        if(v.hijos&&v.hijos.length){ walk(v.hijos,acum,nombre); }
        else{
          let precio=toNum(v.precio_calc);
          if(v.modo==='hoja'){ const pz=parseInt(v.piezas,10)||0; if(pz>0)precio=Math.round(toNum(v.precio_calc)/pz); }
          else if(v.modo==='medidas'){ precio=toFloatCO(v.medida_tarifa_calc); }
          else if((v.tramos||[]).length){ const p1=detectarPrecioEscalonado(v.tramos,1); if(p1!=null)precio=p1; }
          hojas.push({nombre:nombre.join(' › '),precio,costo_extra:Math.round(acum)});
        }
      });};
      walk(f.variantes||[],0,[]);
      const esMedidas=f.tipo_precio==='medidas';
      // Medidas cobran por m²/m lineal con tarifas que aceptan DECIMALES (ej. 3,5). toNum borra el
      // punto decimal (3.5→35) y arruina el margen; toFloatCO respeta la coma decimal colombiana.
      const precio=esMedidas?toFloatCO(f.medida_tarifa_calc):toNum(f.precio_oficial);
      const costo=esMedidas?toFloatCO(f.costo_medida_tarifa_calc):toNum(f.costo_total);
      const margen=(precio>0&&costo>0)?precio-costo:null;
      const vt=ventasMap[f.id];
      return {id:f.id,nombre:f.nombre,codigo:f.codigo||'',categoria_id:f.categoria_id||'',
        tipo_precio:f.tipo_precio||'unitario',activo:!!f.activo,medida_unidad:f.medida_unidad||'',
        precio,costo,margen,margen_pct:(margen!=null&&precio>0)?Math.round(margen*100/precio):null,
        ventas_und:vt?vt.und:0, ventas_ingreso:vt?Math.round(vt.ingreso):0, ventas_pedidos:vt?Object.keys(vt.peds).length:0,
        insumos,fijos,variantes:hojas};
    });
    res.json({productos});
  }catch(e){logError('GET /api/costos',e);res.status(500).json({error:e.message})}
});

// ── LISTAS DE COSTOS DE PROVEEDORES (base de datos de precios, informativa) ──
function listaConItems(l){
  l.items=db.prepare('SELECT id,descripcion,codigo,precio,precio_calc,valores,orden FROM costo_lista_items WHERE lista_id=? ORDER BY orden').all(l.id);
  l.items.forEach(it=>{ try{it.valores=JSON.parse(it.valores||'[]')}catch(e){it.valores=[]} });
  try{l.columnas=JSON.parse(l.columnas||'[]')}catch(e){l.columnas=[]}
  l.activo=!!l.activo;
  return l;
}
function guardarItemsLista(listaId,wsId,items){
  db.prepare('DELETE FROM costo_lista_items WHERE lista_id=?').run(listaId);
  const ins=db.prepare('INSERT INTO costo_lista_items(id,lista_id,workspace_id,descripcion,codigo,precio,precio_calc,valores,orden)VALUES(?,?,?,?,?,?,?,?,?)');
  (items||[]).forEach((it,i)=>{
    const desc=String(it.descripcion||'').trim();
    if(!desc)return;
    // Preservar el id del ítem si viene (para no romper vínculos 📎 de costos al editar la lista).
    const iid=(it.id&&String(it.id).trim())||uid();
    // Precios de lista = enteros en pesos; toNum quita separadores ("23.500"→23500). NO toFloatCO (daría 23.5).
    const vals=Array.isArray(it.valores)?it.valores.map(v=>{const raw=String((v&&v.valor!=null?v.valor:v)||'').trim();return {valor:raw,valor_calc:toNum(raw)};}):[];
    const precioRaw=String(it.precio||(vals[0]?vals[0].valor:'')||'').trim();
    ins.run(iid,listaId,wsId,desc,String(it.codigo||'').trim(),precioRaw,toNum(precioRaw),JSON.stringify(vals),i);
  });
}
app.get('/api/costo-listas',requiere('ver_costos'),(req,res)=>{
  const listas=db.prepare('SELECT * FROM costo_listas WHERE workspace_id=? AND activo=1 ORDER BY proveedor,titulo').all(req.wsId);
  res.json(listas.map(listaConItems));
});
app.post('/api/costo-listas',requiere('gestionar_productos'),(req,res)=>{
  try{
    const b=req.body||{};
    if(!String(b.proveedor||'').trim())return res.status(400).json({error:'El proveedor es obligatorio'});
    const id=uid();
    const cols=Array.isArray(b.columnas)?b.columnas.map(c=>String(c||'').trim()).filter(Boolean):[];
    db.prepare('INSERT INTO costo_listas(id,workspace_id,proveedor,titulo,notas,columnas)VALUES(?,?,?,?,?,?)')
      .run(id,req.wsId,String(b.proveedor).trim(),String(b.titulo||'').trim(),String(b.notas||'').trim(),JSON.stringify(cols));
    guardarItemsLista(id,req.wsId,b.items);
    res.json(listaConItems(db.prepare('SELECT * FROM costo_listas WHERE id=?').get(id)));
  }catch(e){logError('POST /api/costo-listas',e);res.status(500).json({error:e.message})}
});
app.put('/api/costo-listas/:id',requiere('gestionar_productos'),(req,res)=>{
  try{
    const f=db.prepare('SELECT * FROM costo_listas WHERE id=? AND workspace_id=?').get(req.params.id,req.wsId);
    if(!f)return res.status(404).json({error:'Lista no encontrada'});
    const b=req.body||{};
    if(!String(b.proveedor||'').trim())return res.status(400).json({error:'El proveedor es obligatorio'});
    const cols=Array.isArray(b.columnas)?b.columnas.map(c=>String(c||'').trim()).filter(Boolean):(function(){try{return JSON.parse(f.columnas||'[]')}catch(e){return[]}})();
    db.prepare("UPDATE costo_listas SET proveedor=?,titulo=?,notas=?,columnas=?,actualizado=datetime('now','localtime') WHERE id=? AND workspace_id=?")
      .run(String(b.proveedor).trim(),String(b.titulo||'').trim(),String(b.notas||'').trim(),JSON.stringify(cols),f.id,req.wsId);
    if(b.items!==undefined)guardarItemsLista(f.id,req.wsId,b.items);
    res.json(listaConItems(db.prepare('SELECT * FROM costo_listas WHERE id=?').get(f.id)));
  }catch(e){logError('PUT /api/costo-listas/:id',e);res.status(500).json({error:e.message})}
});
app.delete('/api/costo-listas/:id',requiere('gestionar_productos'),(req,res)=>{
  const r=db.prepare('UPDATE costo_listas SET activo=0 WHERE id=? AND workspace_id=?').run(req.params.id,req.wsId);
  if(r.changes===0)return res.status(404).json({error:'Lista no encontrada'});
  res.json({ok:true});
});

// ── EVENTOS Y RECORDATORIOS (planificador del trabajo) ──
const EVENTO_TIPOS=['recordatorio','insumos','entrega','gestion','otro'];
function eventoPublico(e,uById,pedById){
  return {id:e.id,titulo:e.titulo,fecha:e.fecha,hora:e.hora||'',tipo:e.tipo||'recordatorio',notas:e.notas||'',
    pedido_id:e.pedido_id||'',pedido_ref:(pedById&&pedById[e.pedido_id])||'',
    responsable_id:e.responsable_id||'',responsable_nombre:(uById&&uById[e.responsable_id])||'',
    hecho:!!e.hecho,hecho_por:e.hecho_por||'',creado_por:e.creado_por||'',creado:e.creado};
}
function mapasEventos(wsId){
  const uById={}; db.prepare('SELECT id,nombre,usuario FROM usuarios WHERE workspace_id=?').all(wsId).forEach(u=>uById[u.id]=u.nombre||u.usuario);
  const pedById={}; db.prepare('SELECT id,ref FROM pedidos WHERE workspace_id=?').all(wsId).forEach(p=>pedById[p.id]=p.ref);
  return {uById,pedById};
}
function validarEvento(b){
  if(!String(b.titulo||'').trim())return 'El título es obligatorio';
  if(!/^\d{4}-\d{2}-\d{2}$/.test(String(b.fecha||'')))return 'La fecha no es válida';
  if(b.hora&&!/^\d{2}:\d{2}$/.test(String(b.hora)))return 'La hora no es válida (HH:MM)';
  if(b.tipo&&!EVENTO_TIPOS.includes(b.tipo))return 'Tipo de evento no válido';
  return null;
}
// Todos los usuarios logueados VEN los eventos; crear/editar/completar requiere gestionar_eventos.
app.get('/api/eventos',(req,res)=>{
  const desde=String(req.query.desde||'').match(/^\d{4}-\d{2}-\d{2}$/)?req.query.desde:db.prepare("SELECT date('now','localtime','-60 days') d").get().d;
  const hasta=String(req.query.hasta||'').match(/^\d{4}-\d{2}-\d{2}$/)?req.query.hasta:db.prepare("SELECT date('now','localtime','+400 days') d").get().d;
  const filas=db.prepare('SELECT * FROM eventos WHERE workspace_id=? AND archivado=0 AND fecha>=? AND fecha<=? ORDER BY fecha,hora').all(req.wsId,desde,hasta);
  const {uById,pedById}=mapasEventos(req.wsId);
  res.json(filas.map(e=>eventoPublico(e,uById,pedById)));
});
// Pendientes para la campana: vencidos + hoy, no hechos.
app.get('/api/eventos/pendientes',(req,res)=>{
  const hoy=db.prepare("SELECT date('now','localtime') d").get().d;
  const filas=db.prepare('SELECT * FROM eventos WHERE workspace_id=? AND archivado=0 AND hecho=0 AND fecha<=? ORDER BY fecha,hora').all(req.wsId,hoy);
  const {uById,pedById}=mapasEventos(req.wsId);
  res.json({hoy,eventos:filas.map(e=>eventoPublico(e,uById,pedById))});
});
app.post('/api/eventos',requiere('gestionar_eventos'),(req,res)=>{
  try{
    const b=req.body||{}; const err=validarEvento(b);
    if(err)return res.status(400).json({error:err});
    if(b.pedido_id){const p=db.prepare('SELECT id,ref FROM pedidos WHERE id=? AND workspace_id=?').get(b.pedido_id,req.wsId); if(!p)return res.status(400).json({error:'Pedido no válido'});}
    if(b.responsable_id){const u=db.prepare('SELECT id FROM usuarios WHERE id=? AND workspace_id=?').get(b.responsable_id,req.wsId); if(!u)return res.status(400).json({error:'Responsable no válido'});}
    const act=actorDe(req); const id=uid();
    db.prepare(`INSERT INTO eventos(id,workspace_id,titulo,fecha,hora,tipo,notas,pedido_id,responsable_id,creado_por)VALUES(?,?,?,?,?,?,?,?,?,?)`)
      .run(id,req.wsId,String(b.titulo).trim(),b.fecha,String(b.hora||''),b.tipo||'recordatorio',String(b.notas||''),b.pedido_id||'',b.responsable_id||'',act.nombre||'');
    if(b.pedido_id)addHist(b.pedido_id,`Evento: "${String(b.titulo).trim()}" para el ${b.fecha}`,req.wsId,act);
    const {uById,pedById}=mapasEventos(req.wsId);
    res.json(eventoPublico(db.prepare('SELECT * FROM eventos WHERE id=?').get(id),uById,pedById));
  }catch(e){logError('POST /api/eventos',e);res.status(500).json({error:e.message})}
});
app.put('/api/eventos/:id',requiere('gestionar_eventos'),(req,res)=>{
  try{
    const ev=db.prepare('SELECT * FROM eventos WHERE id=? AND workspace_id=? AND archivado=0').get(req.params.id,req.wsId);
    if(!ev)return res.status(404).json({error:'Evento no encontrado'});
    const b=req.body||{}; const act=actorDe(req);
    if(b.hecho!==undefined&&Object.keys(b).length===1){
      // marcar / desmarcar hecho
      db.prepare("UPDATE eventos SET hecho=?,hecho_por=?,hecho_en=CASE WHEN ?=1 THEN datetime('now','localtime') ELSE '' END WHERE id=?")
        .run(b.hecho?1:0,b.hecho?(act.nombre||''):'',b.hecho?1:0,ev.id);
    }else{
      const err=validarEvento({...ev,...b});
      if(err)return res.status(400).json({error:err});
      if(b.pedido_id){const p=db.prepare('SELECT id FROM pedidos WHERE id=? AND workspace_id=?').get(b.pedido_id,req.wsId); if(!p)return res.status(400).json({error:'Pedido no válido'});}
      if(b.responsable_id){const u=db.prepare('SELECT id FROM usuarios WHERE id=? AND workspace_id=?').get(b.responsable_id,req.wsId); if(!u)return res.status(400).json({error:'Responsable no válido'});}
      db.prepare('UPDATE eventos SET titulo=?,fecha=?,hora=?,tipo=?,notas=?,pedido_id=?,responsable_id=? WHERE id=?')
        .run(String(b.titulo??ev.titulo).trim(),b.fecha??ev.fecha,String(b.hora??ev.hora??''),b.tipo??ev.tipo,String(b.notas??ev.notas??''),b.pedido_id??ev.pedido_id??'',b.responsable_id??ev.responsable_id??'',ev.id);
    }
    const {uById,pedById}=mapasEventos(req.wsId);
    res.json(eventoPublico(db.prepare('SELECT * FROM eventos WHERE id=?').get(ev.id),uById,pedById));
  }catch(e){logError('PUT /api/eventos/:id',e);res.status(500).json({error:e.message})}
});
app.delete('/api/eventos/:id',requiere('gestionar_eventos'),(req,res)=>{
  const r=db.prepare('UPDATE eventos SET archivado=1 WHERE id=? AND workspace_id=?').run(req.params.id,req.wsId);
  if(r.changes===0)return res.status(404).json({error:'Evento no encontrado'});
  res.json({ok:true});
});

// ── BITÁCORA · Todos ven; crear/editar/borrar requiere gestionar_bitacora ──
function notaPublica(n){ if(n){n.favorita=!!n.favorita; n.archivado=!!n.archivado;} return n; }
const BIT_ENTIDADES=['pedido','cliente','producto'];
function bitMapas(wsId){
  const ped={}; db.prepare('SELECT id,ref FROM pedidos WHERE workspace_id=?').all(wsId).forEach(p=>ped[p.id]=p.ref);
  const cli={}; db.prepare('SELECT id,nombre FROM clientes WHERE workspace_id=?').all(wsId).forEach(c=>cli[c.id]=c.nombre);
  const pro={}; db.prepare('SELECT id,nombre FROM fichas_producto WHERE workspace_id=?').all(wsId).forEach(f=>pro[f.id]=f.nombre);
  return {ped,cli,pro};
}
function bitLabel(tipo,id,m){
  if(tipo==='pedido')return m.ped[id]?('Pedido #'+m.ped[id]):'Pedido';
  if(tipo==='cliente')return m.cli[id]||'Cliente';
  if(tipo==='producto')return m.pro[id]||'Producto';
  return String(id);
}
function relacionesDeNotas(notaIds,wsId,m){
  const out={}; if(!notaIds.length)return out;
  const ph=notaIds.map(()=>'?').join(',');
  db.prepare(`SELECT * FROM bitacora_relaciones WHERE workspace_id=? AND nota_id IN (${ph})`).all(wsId,...notaIds)
    .forEach(r=>{ (out[r.nota_id]=out[r.nota_id]||[]).push({tipo:r.entidad_tipo,id:r.entidad_id,label:bitLabel(r.entidad_tipo,r.entidad_id,m)}); });
  return out;
}
function guardarRelacionesNota(notaId,wsId,relaciones){
  db.prepare('DELETE FROM bitacora_relaciones WHERE nota_id=? AND workspace_id=?').run(notaId,wsId);
  const ins=db.prepare('INSERT INTO bitacora_relaciones(id,workspace_id,nota_id,entidad_tipo,entidad_id)VALUES(?,?,?,?,?)');
  (Array.isArray(relaciones)?relaciones:[]).forEach(r=>{ const tipo=String(r.tipo||'').trim(), eid=String(r.id||'').trim(); if(tipo&&eid&&BIT_ENTIDADES.includes(tipo))ins.run(uid(),wsId,notaId,tipo,eid); });
}
// F3 · adjuntos por nota, en una sola consulta para no dispararle N veces a la BD.
function adjuntosDeNotas(notaIds,wsId){
  const out={}; if(!notaIds.length)return out;
  const ph=notaIds.map(()=>'?').join(',');
  db.prepare(`SELECT id,nota_id,nombre,tipo,ruta,tamano FROM bitacora_adjuntos WHERE workspace_id=? AND nota_id IN (${ph}) ORDER BY creado`).all(wsId,...notaIds)
    .forEach(a=>{ (out[a.nota_id]=out[a.nota_id]||[]).push({id:a.id,nombre:a.nombre,tipo:a.tipo,ruta:a.ruta,tamano:a.tamano}); });
  return out;
}
function notaConRel(id,wsId){
  const n=notaPublica(db.prepare('SELECT * FROM bitacora_notas WHERE id=?').get(id));
  if(n){ const m=bitMapas(wsId); n.relaciones=relacionesDeNotas([id],wsId,m)[id]||[]; n.adjuntos=adjuntosDeNotas([id],wsId)[id]||[]; }
  return n;
}
app.get('/api/bitacora/tableros',(req,res)=>{
  res.json(db.prepare('SELECT * FROM bitacora_tableros WHERE workspace_id=? AND archivado=0 ORDER BY orden,nombre').all(req.wsId));
});
app.post('/api/bitacora/tableros',requiere('gestionar_bitacora'),(req,res)=>{
  try{
    const b=req.body||{}; const nombre=String(b.nombre||'').trim();
    if(!nombre)return res.status(400).json({error:'El nombre del tablero es obligatorio'});
    const id=uid();
    const n=db.prepare('SELECT COUNT(*) c FROM bitacora_tableros WHERE workspace_id=? AND archivado=0').get(req.wsId).c;
    db.prepare('INSERT INTO bitacora_tableros(id,workspace_id,nombre,color,orden)VALUES(?,?,?,?,?)').run(id,req.wsId,nombre,String(b.color||'slate'),n);
    res.json(db.prepare('SELECT * FROM bitacora_tableros WHERE id=?').get(id));
  }catch(e){logError('POST bitacora/tableros',e);res.status(500).json({error:e.message})}
});
app.put('/api/bitacora/tableros/:id',requiere('gestionar_bitacora'),(req,res)=>{
  const t=db.prepare('SELECT * FROM bitacora_tableros WHERE id=? AND workspace_id=?').get(req.params.id,req.wsId);
  if(!t)return res.status(404).json({error:'Tablero no encontrado'});
  const b=req.body||{};
  db.prepare('UPDATE bitacora_tableros SET nombre=?,color=? WHERE id=?').run(String(b.nombre??t.nombre).trim(),String(b.color??t.color),t.id);
  res.json(db.prepare('SELECT * FROM bitacora_tableros WHERE id=?').get(t.id));
});
app.delete('/api/bitacora/tableros/:id',requiere('gestionar_bitacora'),(req,res)=>{
  const r=db.prepare('UPDATE bitacora_tableros SET archivado=1 WHERE id=? AND workspace_id=?').run(req.params.id,req.wsId);
  if(r.changes===0)return res.status(404).json({error:'Tablero no encontrado'});
  db.prepare("UPDATE bitacora_notas SET tablero_id='' WHERE tablero_id=? AND workspace_id=?").run(req.params.id,req.wsId); // las notas no se pierden
  res.json({ok:true});
});
app.get('/api/bitacora/notas',(req,res)=>{
  let sql='SELECT * FROM bitacora_notas WHERE workspace_id=? AND archivado=0'; const p=[req.wsId];
  if(req.query.tablero){sql+=' AND tablero_id=?';p.push(req.query.tablero);}
  if(req.query.favorita==='1')sql+=' AND favorita=1';
  if(req.query.q){sql+=' AND (titulo LIKE ? OR contenido LIKE ?)';p.push('%'+req.query.q+'%','%'+req.query.q+'%');}
  sql+=' ORDER BY favorita DESC, actualizado DESC';
  const notas=db.prepare(sql).all(...p).map(notaPublica);
  const m=bitMapas(req.wsId); const rel=relacionesDeNotas(notas.map(n=>n.id),req.wsId,m);
  const adj=adjuntosDeNotas(notas.map(n=>n.id),req.wsId);
  notas.forEach(n=>{n.relaciones=rel[n.id]||[]; n.adjuntos=adj[n.id]||[];});
  res.json(notas);
});
// Notas de la Bitácora relacionadas con una entidad (para mostrarlas dentro de su módulo)
app.get('/api/bitacora/relacionadas',(req,res)=>{
  const tipo=String(req.query.tipo||''), eid=String(req.query.id||'');
  if(!tipo||!eid)return res.json([]);
  const ids=db.prepare('SELECT nota_id FROM bitacora_relaciones WHERE workspace_id=? AND entidad_tipo=? AND entidad_id=?').all(req.wsId,tipo,eid).map(r=>r.nota_id);
  if(!ids.length)return res.json([]);
  const ph=ids.map(()=>'?').join(',');
  const notas=db.prepare(`SELECT * FROM bitacora_notas WHERE workspace_id=? AND archivado=0 AND id IN (${ph}) ORDER BY favorita DESC, actualizado DESC`).all(req.wsId,...ids).map(notaPublica);
  const m=bitMapas(req.wsId); const rel=relacionesDeNotas(notas.map(n=>n.id),req.wsId,m);
  const adj=adjuntosDeNotas(notas.map(n=>n.id),req.wsId);
  notas.forEach(n=>{n.relaciones=rel[n.id]||[]; n.adjuntos=adj[n.id]||[];});
  res.json(notas);
});
app.post('/api/bitacora/notas',requiere('gestionar_bitacora'),(req,res)=>{
  try{
    const b=req.body||{};
    if(!String(b.titulo||'').trim()&&!String(b.contenido||'').trim())return res.status(400).json({error:'Escribe al menos un título o contenido'});
    const act=actorDe(req); const id=uid();
    db.prepare('INSERT INTO bitacora_notas(id,workspace_id,tablero_id,titulo,contenido,color,favorita,creado_por,actualizado_por)VALUES(?,?,?,?,?,?,?,?,?)')
      .run(id,req.wsId,String(b.tablero_id||''),String(b.titulo||'').trim(),String(b.contenido||''),String(b.color||''),b.favorita?1:0,act.nombre||'',act.nombre||'');
    guardarRelacionesNota(id,req.wsId,b.relaciones);
    res.json(notaConRel(id,req.wsId));
  }catch(e){logError('POST bitacora/notas',e);res.status(500).json({error:e.message})}
});
app.put('/api/bitacora/notas/:id',requiere('gestionar_bitacora'),(req,res)=>{
  try{
    const n=db.prepare('SELECT * FROM bitacora_notas WHERE id=? AND workspace_id=? AND archivado=0').get(req.params.id,req.wsId);
    if(!n)return res.status(404).json({error:'Nota no encontrada'});
    const b=req.body||{}; const act=actorDe(req);
    if(b.favorita!==undefined&&Object.keys(b).length===1){
      db.prepare('UPDATE bitacora_notas SET favorita=? WHERE id=?').run(b.favorita?1:0,n.id);
    }else{
      db.prepare("UPDATE bitacora_notas SET tablero_id=?,titulo=?,contenido=?,color=?,favorita=?,actualizado_por=?,actualizado=datetime('now','localtime') WHERE id=?")
        .run(String(b.tablero_id??n.tablero_id),String(b.titulo??n.titulo).trim(),String(b.contenido??n.contenido),String(b.color??n.color),(b.favorita??n.favorita)?1:0,act.nombre||'',n.id);
      if(b.relaciones!==undefined)guardarRelacionesNota(n.id,req.wsId,b.relaciones);
    }
    res.json(notaConRel(n.id,req.wsId));
  }catch(e){logError('PUT bitacora/notas/:id',e);res.status(500).json({error:e.message})}
});
app.delete('/api/bitacora/notas/:id',requiere('gestionar_bitacora'),(req,res)=>{
  const r=db.prepare('UPDATE bitacora_notas SET archivado=1 WHERE id=? AND workspace_id=?').run(req.params.id,req.wsId);
  if(r.changes===0)return res.status(404).json({error:'Nota no encontrada'});
  res.json({ok:true});
});
/* F3 · ADJUNTOS. Una nota puede llevar la foto de la factura, el PDF del proveedor o el
   audio de la llamada — es lo que convierte la Bitácora en memoria real del negocio.
   El archivo se guarda en el volumen (UP_DIR) igual que los archivos de pedido; se
   comprueba ANTES de recibirlo que la nota exista y sea de este workspace. */
app.post('/api/bitacora/notas/:id/adjuntos',requiere('gestionar_bitacora'),(req,res,next)=>{
  const n=db.prepare('SELECT id FROM bitacora_notas WHERE id=? AND workspace_id=? AND archivado=0').get(req.params.id,req.wsId);
  if(!n)return res.status(404).json({error:'Nota no encontrada'});
  next();
},upload.array('files',6),(req,res)=>{
  try{
    const notaId=req.params.id, out=[];
    (req.files||[]).forEach(f=>{
      const id=uid(), ruta='/uploads/'+f.filename;
      db.prepare('INSERT INTO bitacora_adjuntos(id,workspace_id,nota_id,nombre,tipo,ruta,tamano)VALUES(?,?,?,?,?,?,?)')
        .run(id,req.wsId,notaId,f.originalname,f.mimetype||'',ruta,f.size||0);
      out.push({id,nombre:f.originalname,tipo:f.mimetype||'',ruta,tamano:f.size||0});
    });
    res.json(out);
  }catch(e){logError('POST bitacora adjuntos',e);res.status(500).json({error:e.message})}
});
app.delete('/api/bitacora/adjuntos/:id',requiere('gestionar_bitacora'),(req,res)=>{
  const a=db.prepare('SELECT * FROM bitacora_adjuntos WHERE id=? AND workspace_id=?').get(req.params.id,req.wsId);
  if(!a)return res.status(404).json({error:'Adjunto no encontrado'});
  // basename() evita que una ruta manipulada saque el borrado fuera de la carpeta de subidas.
  try{ const fp=path.join(UP_DIR,path.basename(a.ruta)); if(fs.existsSync(fp))fs.unlinkSync(fp); }catch(e){ logError('borrar archivo adjunto',e); }
  db.prepare('DELETE FROM bitacora_adjuntos WHERE id=?').run(a.id);
  res.json({ok:true});
});

/* ── F4 · BÚSQUEDA GLOBAL ────────────────────────────────────────────────────────────
   Una sola pregunta que barre pedidos, clientes, productos y notas de la Bitácora.
   Es el cimiento del AI Gateway: cuando la IA pregunte "qué sé de Textiles ABC",
   consumirá este mismo camino, no la base de datos directamente.
   Respeta permisos: nadie ve por el buscador lo que no puede ver por su módulo. */
function bLike(q){ return '%'+String(q).replace(/[%_]/g,m=>'\\'+m)+'%'; }
function recorte(txt,q,largo){
  const s=String(txt||'').replace(/\s+/g,' ').trim();
  if(!s)return '';
  const i=s.toLowerCase().indexOf(String(q).toLowerCase());
  if(i<0)return s.slice(0,largo)+(s.length>largo?'…':'');
  const desde=Math.max(0,i-30);
  return (desde>0?'…':'')+s.slice(desde,desde+largo)+(desde+largo<s.length?'…':'');
}
app.get('/api/buscar',(req,res)=>{
  try{ res.json(svcBuscar(req.wsId,req.query.q,req.permisos)); }
  catch(e){logError('GET /api/buscar',e);res.status(500).json({error:e.message})}
});
/* SERVICIO de búsqueda. Vive aparte del endpoint a propósito: el AI Gateway consume
   ESTA función, no la base de datos — misma información y mismos permisos que ve un humano. */
function svcBuscar(wsId,consulta,permisos,tope){
    const q=String(consulta||'').trim();
    if(q.length<2)return {q,pedidos:[],clientes:[],productos:[],notas:[],total:0};
    const L=bLike(q), ws=wsId, perm=permisos||{};
    const puede=k=>!!(perm.__admin||perm[k]===true);
    const TOPE=tope||8;
    const out={q,pedidos:[],clientes:[],productos:[],notas:[]};

    // Pedidos: por referencia, cliente o anotaciones. Los archivados no estorban la búsqueda.
    out.pedidos=db.prepare(`SELECT id,ref,nombre,fecha_entrega,entregado,cancelado,es_cotizacion,notas
      FROM pedidos WHERE workspace_id=? AND archivado=0 AND (ref LIKE ? ESCAPE '\\' OR nombre LIKE ? ESCAPE '\\' OR notas LIKE ? ESCAPE '\\')
      ORDER BY creado DESC LIMIT ?`).all(ws,L,L,L,TOPE)
      .map(p=>({id:p.id,titulo:'#'+p.ref+' · '+p.nombre,
        sub:(p.cancelado?'Cancelado':(p.entregado?'Entregado':(p.es_cotizacion?'Cotización':'En curso')))+(p.fecha_entrega?(' · entrega '+p.fecha_entrega):''),
        extra:recorte(p.notas,q,90)}));

    if(puede('editar_clientes')||puede('crear_pedidos')){
      out.clientes=db.prepare(`SELECT id,nombre,tel,email,nit FROM clientes WHERE workspace_id=? AND archivado=0
        AND (nombre LIKE ? ESCAPE '\\' OR tel LIKE ? ESCAPE '\\' OR email LIKE ? ESCAPE '\\' OR nit LIKE ? ESCAPE '\\')
        ORDER BY nombre LIMIT ?`).all(ws,L,L,L,L,TOPE)
        .map(c=>({id:c.id,titulo:c.nombre,sub:[c.tel,c.email].filter(Boolean).join(' · ')}));
    }
    if(puede('gestionar_productos')||puede('crear_pedidos')){
      out.productos=db.prepare(`SELECT id,nombre,codigo,descripcion FROM fichas_producto WHERE workspace_id=? AND archivado=0
        AND (nombre LIKE ? ESCAPE '\\' OR codigo LIKE ? ESCAPE '\\' OR descripcion LIKE ? ESCAPE '\\')
        ORDER BY nombre LIMIT ?`).all(ws,L,L,L,TOPE)
        .map(p=>({id:p.id,titulo:p.nombre,sub:p.codigo||'',extra:recorte(p.descripcion,q,90)}));
    }
    // La Bitácora la ve todo el mundo (igual que su módulo); escribir sí pide permiso.
    const notas=db.prepare(`SELECT id,titulo,contenido,tablero_id,favorita FROM bitacora_notas
      WHERE workspace_id=? AND archivado=0 AND (titulo LIKE ? ESCAPE '\\' OR contenido LIKE ? ESCAPE '\\')
      ORDER BY favorita DESC, actualizado DESC LIMIT ?`).all(ws,L,L,TOPE);
    const adj=adjuntosDeNotas(notas.map(n=>n.id),ws);
    const m=bitMapas(ws); const rel=relacionesDeNotas(notas.map(n=>n.id),ws,m);
    out.notas=notas.map(n=>({id:n.id,titulo:n.titulo||'(sin título)',sub:recorte(n.contenido,q,90),
      favorita:!!n.favorita, adjuntos:(adj[n.id]||[]).length, relaciones:rel[n.id]||[]}));

    out.total=out.pedidos.length+out.clientes.length+out.productos.length+out.notas.length;
    return out;
}

/* ══ AI GATEWAY · CAPA DE SERVICIOS ═══════════════════════════════════════════════════
   Regla de arquitectura (visión del usuario): la IA NUNCA toca la base de datos. Consulta
   estos servicios, que son los mismos que alimentan la app y respetan workspace y permisos.
   Si mañana cambia el motor de IA, esto no se toca; si cambia el negocio, la IA se entera
   sola porque lee de aquí. Todo servicio devuelve datos ya digeridos, no filas crudas.     */
function iaPagado(p){ return (p.pagos||[]).reduce((a,x)=>a+toNum(x.monto_calc),0); }
function iaEstadoPedido(p){
  if(p.cancelado)return 'cancelado';
  if(p.es_cotizacion)return 'cotización';
  if(p.entregado)return 'entregado';
  return 'en curso';
}
/* Las fechas viajan en la base como 2026-08-03, y el modelo repetía eso tal cual en la
   respuesta. Aquí se entregan ya en día/mes/año: la IA no tiene que formatear nada,
   solo copiar lo que ve — es la forma más confiable de que no se equivoque. */
function iaFecha(iso){
  const m=/^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso||''));
  return m?`${m[3]}/${m[2]}/${m[1]}`:String(iso||'');
}
/* PERMISOS · el asistente no puede ser la puerta de atrás.
   Un operario del taller ve sus pedidos pero NO el dinero (el Dashboard y el Centro de
   Costos están detrás de ver_dashboard / ver_costos / ver_utilidad). Si el asistente le
   entregara valores y saldos, bastaría con preguntar para saltarse el rol. Por eso todo
   dato de plata se recorta ANTES de armar el contexto, no en el prompt: al modelo no le
   pedimos que guarde secretos, simplemente no se los contamos. */
function iaVeDinero(perm){
  const p=perm||{};
  return !!(p.__admin||p.ver_dashboard===true||p.ver_costos===true||p.ver_utilidad===true||p.ver_registros===true);
}
function iaPedidoResumen(p,perm){
  const total=p.valor_total||0, pag=iaPagado(p);
  const base={
    ref:p.ref, cliente:p.nombre, estado:iaEstadoPedido(p),
    urgente:!!p.urgente, fecha_pedido:iaFecha(p.fecha_pedido), entrega:iaFecha(p.fecha_entrega),
    etapas:[...new Set((p.encargos||[]).map(e=>e.estado).filter(Boolean))],
    // 1500, no 300: aquí es donde vive el acuerdo con el cliente ("4 pagos de
    // $200.000: 1) inicio, 2) estructura…"). Con 300 se cortaba justo en lo que se
    // estaba preguntando, y el asistente tenía que decir que el texto venía cortado.
    anotaciones:String(p.notas||'').slice(0,1500)
  };
  // perm undefined = llamada interna sin contexto de usuario: se asume lo más restrictivo.
  if(iaVeDinero(perm))Object.assign(base,{valor:total,pagado:pag,saldo:Math.max(0,total-pag)});
  return base;
}
// Panorama: lo que un dueño querría saber al abrir el negocio por la mañana.
function svcPanorama(wsId,perm){
  const hoyStr=hoy(wsId);
  const activos=db.prepare(`SELECT * FROM pedidos WHERE workspace_id=? AND archivado=0 AND cancelado=0 AND entregado=0 AND es_cotizacion=0`).all(wsId).map(pedidoCompleto);
  const cotiz=db.prepare(`SELECT * FROM pedidos WHERE workspace_id=? AND archivado=0 AND cancelado=0 AND es_cotizacion=1`).all(wsId).map(pedidoCompleto);
  const enDias=(p,n)=>{ if(!p.fecha_entrega)return false; const d=(new Date(p.fecha_entrega)-new Date(hoyStr))/86400000; return d>=0&&d<=n; };
  const vencidos=activos.filter(p=>p.fecha_entrega&&p.fecha_entrega<hoyStr);
  const conSaldo=activos.filter(p=>(p.valor_total||0)-iaPagado(p)>0);
  const out={
    hoy:iaFecha(hoyStr),
    pedidos_activos:activos.length,
    urgentes:activos.filter(p=>p.urgente).length,
    entregan_hoy:activos.filter(p=>p.fecha_entrega===hoyStr).map(p=>iaPedidoResumen(p,perm)),
    entregan_esta_semana:activos.filter(p=>enDias(p,7)).map(p=>iaPedidoResumen(p,perm)),
    atrasados:vencidos.map(p=>iaPedidoResumen(p,perm)),
    cotizaciones_abiertas:cotiz.length
  };
  // El resumen de cobranza es dinero puro: a quien no puede verlo, ni se le menciona.
  if(iaVeDinero(perm)){
    out.por_cobrar_total=conSaldo.reduce((a,p)=>a+((p.valor_total||0)-iaPagado(p)),0);
    out.pedidos_con_saldo=conSaldo.map(p=>iaPedidoResumen(p,perm)).slice(0,15);
  }else{
    out.nota_permisos='Este usuario no tiene permiso para ver valores ni saldos; por eso el contexto no los incluye. Si pregunta por dinero, dile que su rol no tiene acceso a esa información.';
  }
  return out;
}
// Un pedido concreto, por referencia (#0021 o 0021).
function svcPedido(wsId,ref,perm){
  const r=String(ref||'').replace(/^#/,'').trim();
  if(!r)return null;
  const p=db.prepare('SELECT * FROM pedidos WHERE workspace_id=? AND ref=?').get(wsId,r);
  if(!p)return null;
  const c=pedidoCompleto(p);
  const base=iaPedidoResumen(c,perm);
  const dinero=iaVeDinero(perm);
  base.encargos=(c.encargos||[]).map(e=>({estado:e.estado,responsable:e.responsable||'',
    items:(e.items||[]).map(it=>{
      const i={cantidad:it.cantidad,detalle:it.detalle};
      if(dinero)i.valor_unitario=toNum(it.valor_unitario_calc||it.valor_unitario);
      return i;
    })}));
  // Los pagos son dinero: quien no puede verlos en la app tampoco los recibe por aquí.
  if(dinero)base.pagos=(c.pagos||[]).map(x=>({fecha:iaFecha(x.fecha||x.creado),monto:toNum(x.monto_calc),metodo:x.metodo||''}));
  return base;
}
// Historial de un cliente: lo que pidió, cuánto dejó, qué debe.
function svcCliente(wsId,nombre,perm){
  const n=String(nombre||'').trim(); if(n.length<2)return null;
  const cli=db.prepare(`SELECT * FROM clientes WHERE workspace_id=? AND archivado=0 AND nombre LIKE ? ESCAPE '\\' ORDER BY LENGTH(nombre) LIMIT 1`).get(wsId,bLike(n));
  if(!cli)return null;
  const peds=db.prepare('SELECT * FROM pedidos WHERE workspace_id=? AND archivado=0 AND cliente_id=? ORDER BY creado DESC').all(wsId,cli.id).map(pedidoCompleto);
  const validos=peds.filter(p=>!p.cancelado&&!p.es_cotizacion);
  const facturado=validos.reduce((a,p)=>a+(p.valor_total||0),0);
  const pagado=validos.reduce((a,p)=>a+iaPagado(p),0);
  const out={
    nombre:cli.nombre, telefono:cli.tel||'', email:cli.email||'', nit:cli.nit||'',
    pedidos_totales:validos.length,
    ultimos_pedidos:peds.slice(0,8).map(p=>iaPedidoResumen(p,perm))
  };
  if(iaVeDinero(perm))Object.assign(out,{facturado,pagado,saldo:Math.max(0,facturado-pagado)});
  return out;
}
// Un producto y CÓMO se cobra (incluye las condiciones de la Fase E).
function svcProducto(wsId,nombre,perm){
  const n=String(nombre||'').trim(); if(n.length<2)return null;
  const f=db.prepare(`SELECT * FROM fichas_producto WHERE workspace_id=? AND archivado=0 AND (nombre LIKE ? ESCAPE '\\' OR codigo LIKE ? ESCAPE '\\') ORDER BY LENGTH(nombre) LIMIT 1`).get(wsId,bLike(n),bLike(n));
  if(!f)return null;
  const ficha=fichaCompleta(f), dinero=iaVeDinero(perm);
  const out={nombre:ficha.nombre,codigo:ficha.codigo||'',tipo_precio:ficha.tipo_precio,
    precio:ficha.precio_oficial||0,descripcion:String(ficha.descripcion||'').slice(0,300)};
  if(ficha.tipo_precio==='medidas'){
    out.unidad=ficha.medida_unidad||'m2';
    out.tarifa=toFloatCO(ficha.medida_tarifa_calc);
    out.cobro_minimo=toNum(ficha.cobro_minimo_calc);
    if((ficha.medida_cond||[]).length)out.condiciones={eje:ficha.medida_cond_eje,tramos:ficha.medida_cond};
    if((ficha.medida_ajuste||[]).length)out.ajuste_de_tarifa={
      cambia_segun:ficha.medida_ajuste_eje==='area'?'el área de la pieza':'la cantidad de unidades del pedido',
      es:'un PORCENTAJE que se aplica sobre la tarifa ya elegida (negativo = más barato)',
      tramos:ficha.medida_ajuste};
  }
  if(ficha.tipo_precio==='escalonado'&&(ficha.rangos||[]).length)out.tramos_por_cantidad=ficha.rangos;
  if(ficha.tipo_precio==='variantes'){
    out.precio_desde=ficha.precio_oficial||0;
    delete out.precio; // en un producto por variantes no hay "un" precio: se arma sumando partes
    out.como_se_cobra='El precio se arma sumando las partes que el cliente elija. Cada opción trae su propio precio, y si tiene tramos, el precio cambia según la cantidad.';
    out.partes=(ficha.variantes||[]).map(v=>iaVarNodo(v,dinero));
  }
  /* COSTO PROPIO de la ficha: lo que cuesta PRODUCIR una unidad (la composición de insumos +
     costos fijos, o la tarifa de costo por medida). Faltaba de origen: ningún servicio se lo
     mandaba al modelo, así que preguntar "el costo del mug y su margen" recibía siempre "no
     trae costo cargado" aunque la ficha SÍ tuviera $6.700 en insumos. Solo si ve dinero. */
  if(dinero){
    const cm=ficha.tipo_precio==='medidas';
    const costo=cm?toFloatCO(ficha.costo_medida_tarifa_calc):toNum(ficha.costo_total);
    if(costo>0){
      out.costo=cm?{por_medida:costo,unidad:(ficha.medida_unidad==='cm2'?'cm2':'m2')}:costo;
      out.costo_es='lo que cuesta hacer UNA unidad, según la ficha (no es el costo de lo vendido)';
      const ins=(ficha.insumos||[]).map(i=>({insumo:i.nombre_insumo,costo:Math.round(toNum(i.costo_unitario_calc)*(parseFloat(i.cantidad_usada)||1))})).filter(x=>x.insumo&&x.costo>0);
      if(ins.length)out.costo_desglose=ins;
      const fij=(ficha.costos_fijos||[]).map(c=>({concepto:c.nombre,costo:toNum(c.valor_calc!=null?c.valor_calc:evalExpr(c.valor))})).filter(x=>x.concepto&&x.costo>0);
      if(fij.length)out.costos_fijos=fij;
      if(!cm&&(ficha.precio_oficial||0)>0){
        const p=ficha.precio_oficial; out.margen_por_unidad={precio:p,costo,utilidad:p-costo,margen_pct:Math.round((p-costo)*100/p)};
      }
    }
  }
  return out;
}
/* Una parte/opción de un producto por variantes, con TODO lo que hace falta para cotizarla.
   Antes solo se mandaban los nombres: el asistente veía que existía la opción "tabloide"
   pero no cuánto costaba, así que no podía cotizar y lo decía. El dato faltaba de origen. */
function iaVarNodo(v,dinero){
  const o={nombre:v.nombre};
  if(v.informativa){
    o.informativa='solo para describir, no cambia el precio';
    if((v.hijos||[]).length)o.opciones=(v.hijos||[]).slice(0,30).map(h=>h.nombre);
    return o;
  }
  const hijos=(v.hijos||[]).slice(0,30);
  if(hijos.length){
    o.se_elige=v.multi?'se pueden elegir VARIAS opciones, cada una con su cantidad':'se elige UNA opción';
    o.opciones=hijos.map(h=>iaVarNodo(h,dinero));
    return o;
  }
  if(v.modo==='medidas'){
    // La unidad se dice SIEMPRE: sin ella el modelo cotiza 10×10 como metros y se equivoca
    // por un factor de 10.000. No hay conversión — se multiplica lo que se escribe.
    const cm=v.medida_unidad==='cm2';
    o.cobro='por medidas: ancho × alto en '+(cm?'CENTÍMETROS':'METROS')+', multiplicado por la tarifa';
    o['tarifa_por_'+(cm?'cm2':'m2')]=toFloatCO(v.medida_tarifa_calc);
    if(toNum(v.medida_minimo_calc)>0)o.cobro_minimo=toNum(v.medida_minimo_calc);
    if((v.medida_cond||[]).length)o.condiciones_de_tarifa={
      cambia_segun:v.medida_cond_eje==='area'?'el área de la pieza (m²)':'la cantidad de unidades del pedido',
      tramos:v.medida_cond};
    if((v.medida_ajuste||[]).length)o.ajuste_de_tarifa={
      cambia_segun:v.medida_ajuste_eje==='area'?'el área de la pieza':'la cantidad de unidades del pedido',
      es:'un PORCENTAJE sobre la tarifa ya elegida (negativo = más barato). Se aplica ADEMÁS de las condiciones',
      tramos:v.medida_ajuste};
    if(dinero&&toFloatCO(v.costo_medida_tarifa_calc)>0)o['costo_por_'+(cm?'cm2':'m2')]=toFloatCO(v.costo_medida_tarifa_calc);
  }else if(v.modo==='hoja'){
    o.cobro='por hoja: se calcula cuántas hojas hacen falta';
    o.piezas_por_hoja=parseInt(v.piezas,10)||0;
    o.precio_por_hoja=toNum(v.precio_calc);
  }else{
    o.precio=toNum(v.precio_calc);
    if((v.tramos||[]).length)o.precio_segun_cantidad=v.tramos;
  }
  // Costo propio de esta parte (lo que le da de comer al margen): mismo motivo que arriba,
  // el modelo veía el precio de la opción pero no su costo. Solo si quien pregunta ve dinero.
  if(dinero){
    const cp=(v.costos||[]).reduce((a,c)=>a+(evalExpr(c.valor)||0),0);
    if(cp>0)o.costo=Math.round(cp);
  }
  return o;
}
/* ⭐ CATÁLOGO COMPLETO · la pieza que faltaba.
   Antes se adivinaba qué palabra de la pregunta era un producto y se buscaba por LIKE.
   Eso fallaba siempre: en "25 unidades de DTF" la palabra clave tiene 3 letras; en
   "hay vasos blancos?" el producto se llama "mug"; y las muletillas se comían los cupos.
   Ningún LIKE entiende que "vasos", "tazas" y "mugs" son lo mismo — un modelo de lenguaje
   sí. Así que se le entrega el catálogo ENTERO, en una línea por producto, y él empareja.
   Con esto el asistente ya no puede decir "no existe" cuando sí existe. */
function iaCobroResumen(f){
  const p=f.precio_oficial||0;
  if(f.tipo_precio==='medidas'){
    const u=f.medida_unidad==='m'?'m lineal':(f.medida_unidad==='cm2'?'cm²':'m²');
    let s='por medidas: $'+toFloatCO(f.medida_tarifa_calc)+' por '+u;
    if(toNum(f.cobro_minimo_calc)>0)s+=', cobro mínimo $'+toNum(f.cobro_minimo_calc);
    if((f.medida_cond||[]).length)s+=', con condiciones por '+(f.medida_cond_eje==='area'?'área':'cantidad');
    return s;
  }
  if(f.tipo_precio==='variantes')return 'por variantes (el precio se arma sumando las partes elegidas), desde $'+p;
  if(f.tipo_precio==='pliego')return 'por hoja/pliego, aprox $'+p+' c/u';
  if(f.tipo_precio==='escalonado')return 'por cantidad, con tramos, desde $'+p;
  if(f.tipo_precio==='regla')return 'promoción por cantidad, desde $'+p;
  return 'precio fijo $'+p;
}
function svcCatalogo(wsId,perm){
  const cats={};
  try{ db.prepare('SELECT id,label FROM etiquetas_negocio WHERE workspace_id=?').all(wsId).forEach(c=>cats[c.id]=c.label); }catch(e){}
  const filas=db.prepare('SELECT * FROM fichas_producto WHERE workspace_id=? AND archivado=0 AND activo=1 ORDER BY nombre LIMIT 120').all(wsId);
  const dinero=iaVeDinero(perm);
  return filas.map(f=>{
    const ficha=fichaCompleta(f);
    const o={producto:ficha.nombre, cobro:iaCobroResumen(ficha)};
    if(ficha.codigo)o.codigo=ficha.codigo;
    if(cats[ficha.categoria_id])o.categoria=cats[ficha.categoria_id];
    // Costo de la ficha (lo que cuesta producir una unidad), solo el número, solo con permiso
    // de dinero. Así ningún producto del catálogo aparece "sin costo" cuando su ficha sí lo
    // tiene; el desglose completo llega por svcProducto cuando se pregunta por él en concreto.
    if(dinero){
      if(ficha.tipo_precio==='medidas'){ const c=toFloatCO(ficha.costo_medida_tarifa_calc); if(c>0)o.costo_por_medida=c; }
      else { const c=toNum(ficha.costo_total); if(c>0)o.costo=c; }
    }
    // De los productos por variantes se anuncian las partes: así se sabe que "camiseta"
    // tiene estampados de varios tamaños sin tener que pedir la ficha completa.
    if(ficha.tipo_precio==='variantes'){
      const partes=(ficha.variantes||[]).filter(v=>!v.informativa).map(v=>{
        const ops=(v.hijos||[]).map(h=>h.nombre).filter(Boolean);
        return v.nombre+(ops.length?(' ['+ops.slice(0,8).join(', ')+']'):'');
      });
      if(partes.length)o.partes=partes.slice(0,6);
    }
    return o;
  });
}
/* Existencias. Faltaba: preguntaron "necesito saber si tengo inventario de ello" y el
   asistente no tenía forma de saberlo, así que decía que no había. Ahora consulta el
   mismo inventario del módulo, y avisa cuando algo está por debajo de su mínimo. */
function svcInventario(wsId,terminos){
  // Igual que el catálogo: se entrega TODO el inventario, no lo que adivine un LIKE.
  // Preguntaron "¿hay vasos blancos?" y el insumo podía llamarse "mug" o estar en inglés.
  const filas=db.prepare(`SELECT nombre,unidad_medida,stock_actual,stock_minimo FROM items_inventario
    WHERE workspace_id=? AND activo=1 ORDER BY nombre LIMIT 80`).all(wsId);
  return filas.map(i=>{
    const hay=Number(i.stock_actual)||0, min=Number(i.stock_minimo)||0;
    return {insumo:i.nombre, existencias:hay, unidad:i.unidad_medida||'unidad',
      estado: hay<=0 ? 'AGOTADO' : (min>0&&hay<=min ? 'por debajo del mínimo ('+min+')' : 'disponible')};
  });
}
/* ── PREGUNTAS DE NEGOCIO ──────────────────────────────────────────────────────────────
   Tres cosas que el asistente contestó con "ese dato no está en el sistema", y sí estaban:
   las ganancias del período, cuántos insumos se han consumido, y qué se ha vendido.
   Los datos existían; lo que faltaba era el servicio que se los entregara.               */
function iaPeriodo(wsId,q){
  const hoyStr=hoy(wsId), t=String(q||'').toLowerCase();
  const d=(expr)=>db.prepare('SELECT date(?, ?) x').get(hoyStr,expr).x;
  if(/\bhoy\b/.test(t))                                    return {clave:'hoy',           desde:hoyStr};
  if(/semana/.test(t))                                     return {clave:'esta semana',   desde:d('-6 days')};
  if(/(este )?a[ñn]o|anual/.test(t))                       return {clave:'este año',      desde:d('start of year')};
  if(/desde el inicio|hist[óo]ric|siempre|en total/.test(t))return {clave:'desde siempre', desde:'0000-01-01'};
  return {clave:'este mes', desde:d('start of month')};     // lo más pedido por defecto
}
// Ganancias de UN rango. Mismo cálculo que el Dashboard: ingresos = pagos recibidos;
// costos = los registrados en pedidos de ese rango.
function finCorte(wsId,desde,hasta,etiqueta){
  const ingresos=db.prepare(`SELECT COALESCE(SUM(CAST(pg.monto_calc AS INTEGER)),0) s FROM pagos pg JOIN pedidos p ON p.id=pg.pedido_id
    WHERE pg.workspace_id=? AND p.archivado=0 AND p.cancelado=0 AND pg.fecha>=? AND pg.fecha<=?`).get(wsId,desde,hasta).s;
  const costos=db.prepare(`SELECT COALESCE(SUM(CAST(c.monto_calc AS INTEGER)),0) s FROM costos c JOIN pedidos p ON p.id=c.pedido_id
    WHERE c.workspace_id=? AND p.archivado=0 AND p.cancelado=0 AND p.es_cotizacion=0 AND p.fecha_pedido>=? AND p.fecha_pedido<=?`).get(wsId,desde,hasta).s;
  const utilidad=ingresos-costos;
  return {periodo:etiqueta, desde:iaFecha(desde), hasta:iaFecha(hasta),
    ingresos_cobrados:ingresos, costos, utilidad,
    margen_pct:ingresos>0?Math.round(utilidad*100/ingresos):0};
}
/* ⭐ VARIOS CORTES DE UNA VEZ, no uno solo.
   Falla real: preguntaron "ventas desde el inicio … en total … y las ganancias de este
   último mes" — tres marcos de tiempo en UNA frase. iaPeriodo elige UNO, ganó
   "desde siempre", y el asistente contestó (con razón) que no tenía el corte del mes.
   El dato existía. Como calcular un corte cuesta dos SUM, se mandan todos: mes actual,
   mes pasado, año y desde siempre. Así ninguna pregunta mixta se queda sin su número,
   y de paso se puede comparar un mes contra el anterior, que es lo que pide un informe. */
function svcFinanzas(wsId,q,perm){
  if(!iaVeDinero(perm))return null;
  const hoyStr=hoy(wsId), per=iaPeriodo(wsId,q);
  const d=(base,expr)=>db.prepare('SELECT date(?, ?) x').get(base,expr).x;
  const iniMes=d(hoyStr,'start of month');
  const cortes=[
    finCorte(wsId,iniMes,hoyStr,'este mes'),
    finCorte(wsId,d(iniMes,'-1 month'),d(iniMes,'-1 day'),'el mes pasado'),
    finCorte(wsId,d(hoyStr,'start of year'),hoyStr,'este año'),
    finCorte(wsId,'0000-01-01',hoyStr,'desde siempre')
  ];
  // Si preguntaron por "hoy" o "esta semana", ese corte no está en la lista fija: se añade.
  if(!cortes.some(c=>c.periodo===per.clave))cortes.unshift(finCorte(wsId,per.desde,hoyStr,per.clave));
  return {preguntaste_por:per.clave, cortes,
    /* Los dos números NO son del mismo grupo de pedidos, y eso hay que decirlo: un pago de
       julio por un pedido de junio suma a los ingresos de julio, pero su costo contó en
       junio. Es la misma fórmula del Dashboard (a propósito: una sola fuente de verdad),
       pero al comparar mes contra mes produce saltos que parecen desplomes y son calendario
       de pagos. Sin este aviso el asistente presenta un "-88%" como si fuera rendimiento. */
    ojo:'Cada corte es independiente y ya está calculado: usa el que te pidan, NO sumes ni restes cortes entre sí. '
      +'"ingresos_cobrados" es plata que YA entró (pagos recibidos por su fecha de pago), no lo facturado; '
      +'"costos" son los de los pedidos CREADOS en ese rango. Al no ser el mismo grupo de pedidos, la utilidad '
      +'de un mes puede subir o caer por CUÁNDO se cobró, no por cómo se trabajó: si comparas dos períodos y el '
      +'salto es grande, dilo en una línea antes de que suene a desplome. Es el mismo cálculo del Dashboard.'};
}
// Cuántos insumos se han consumido (los vasos que ya se gastaron en pedidos).
function svcConsumoInsumos(wsId,q){
  const per=iaPeriodo(wsId,q), hoyStr=hoy(wsId);
  const filas=db.prepare(`SELECT c.item_nombre nombre, c.unidad, SUM(c.cantidad) total, COUNT(DISTINCT c.pedido_id) pedidos
    FROM consumo_inventario c JOIN pedidos p ON p.id=c.pedido_id
    WHERE c.workspace_id=? AND p.archivado=0 AND p.cancelado=0 AND date(c.creado)>=? AND date(c.creado)<=?
    GROUP BY c.item_nombre, c.unidad ORDER BY total DESC LIMIT 25`).all(wsId,per.desde,hoyStr);
  // Devolver null haría que el asistente dijera "no tengo ese dato". Consultado-y-vacío
  // NO es lo mismo que no-puedo-consultarlo: se responde la estructura con la lista vacía.
  return {periodo:per.clave, desde:iaFecha(per.desde),
    consumido:filas.map(f=>({insumo:f.nombre, cantidad:f.total, unidad:f.unidad||'unidad', en_pedidos:f.pedidos})),
    ojo:filas.length?undefined:'Consultado: no hay consumos de insumos registrados en ese período. El dato SÍ se lleva, simplemente no hay movimientos.'};
}
/* Qué se ha vendido, por producto — CON SU COSTO. Sale de los ítems de los pedidos.
   Falla real: contestó "no puedo darte la rentabilidad, el sistema no trae costo por
   producto, solo utilidad global". El costo SÍ está; lo que no hay es una columna que lo
   ate al producto: `costos.encargo_id` existe en el esquema pero la app nunca lo llena
   (los costos automáticos se generan sueltos en el pedido). Y atarlo por el nombre que
   viene en la descripción sería adivinar — justo lo que ya se descartó en B1b.
   Así que se reparte a PRORRATA DEL VALOR: el costo del pedido se divide entre sus ítems
   según lo que pesa cada uno. Si el pedido tiene un solo producto el reparto es exacto;
   si tiene varios es una aproximación, y se dice que lo es. Si algún día se llena
   encargo_id, ese costo se reparte dentro de su encargo, que afina más. */
function svcVentasProductos(wsId,q,perm){
  const per=iaPeriodo(wsId,q), hoyStr=hoy(wsId);
  // El alias no puede llamarse "nombre": esa columna existe en pedidos y en fichas_producto,
  // y SQLite lo rechaza por ambiguo al agrupar. Se agrupa por la expresión completa.
  const filas=db.prepare(`WITH item AS (
      SELECT i.encargo_id AS eid, p.id AS pid,
        COALESCE(NULLIF(f.nombre,''), i.detalle) AS producto,
        CAST(COALESCE(NULLIF(i.cantidad,''),'0') AS INTEGER) AS uds,
        CAST(COALESCE(NULLIF(i.cantidad,''),'0') AS INTEGER)*CAST(COALESCE(NULLIF(i.valor_unitario_calc,''),'0') AS INTEGER) AS valor
      FROM enc_items i JOIN encargos e ON e.id=i.encargo_id JOIN pedidos p ON p.id=e.pedido_id
      LEFT JOIN fichas_producto f ON f.id=i.ficha_id
      WHERE e.workspace_id=? AND p.archivado=0 AND p.cancelado=0 AND p.es_cotizacion=0
        AND p.fecha_pedido>=? AND p.fecha_pedido<=?
    ), enc AS (SELECT eid, SUM(valor) AS tot FROM item GROUP BY eid
    ), ped AS (SELECT pid, SUM(valor) AS tot FROM item GROUP BY pid
    ), c_enc AS (SELECT encargo_id AS k, SUM(CAST(COALESCE(NULLIF(monto_calc,''),'0') AS INTEGER)) AS c
        FROM costos WHERE workspace_id=? AND COALESCE(encargo_id,'')<>'' GROUP BY encargo_id
    ), c_ped AS (SELECT pedido_id AS k, SUM(CAST(COALESCE(NULLIF(monto_calc,''),'0') AS INTEGER)) AS c
        FROM costos WHERE workspace_id=? AND COALESCE(encargo_id,'')='' GROUP BY pedido_id)
    SELECT item.producto AS producto, SUM(item.uds) AS unidades, SUM(item.valor) AS valor,
      SUM(CASE WHEN enc.tot>0 THEN COALESCE(c_enc.c,0)*1.0*item.valor/enc.tot ELSE 0 END
        + CASE WHEN ped.tot>0 THEN COALESCE(c_ped.c,0)*1.0*item.valor/ped.tot ELSE 0 END) AS costo,
      COUNT(DISTINCT item.pid) AS pedidos
    FROM item LEFT JOIN enc ON enc.eid=item.eid LEFT JOIN ped ON ped.pid=item.pid
      LEFT JOIN c_enc ON c_enc.k=item.eid LEFT JOIN c_ped ON c_ped.k=item.pid
    GROUP BY item.producto ORDER BY unidades DESC LIMIT 25`).all(wsId,per.desde,hoyStr,wsId,wsId);
  const dinero=iaVeDinero(perm);
  let conCosto=0;
  const vendido=filas.map(f=>{
    const o={producto:f.producto||'(sin nombre)', unidades:f.unidades||0, en_pedidos:f.pedidos};
    if(dinero){
      const val=f.valor||0, cos=Math.round(f.costo||0);
      o.valor=val;
      // Costo 0 = nadie cargó el costo, NO "salió gratis". Se distinguen los dos casos:
      // sin esto el asistente calcula 100% de margen y presenta un número falso.
      if(cos>0){ conCosto++; o.costo=cos; o.utilidad=val-cos; o.margen_pct=val>0?Math.round((val-cos)*100/val):0; }
      else o.costo='sin costo cargado — no se puede calcular su margen';
    }
    return o;
  });
  const notas=[];
  if(!filas.length)notas.push('Consultado: no hay ventas registradas en ese período.');
  notas.push('Sale de los ítems de pedidos reales (sin cotizaciones ni cancelados). Si un ítem se escribió a mano sin elegir producto, aparece por su descripción.');
  if(dinero){
    notas.push('El costo NO viene marcado por producto: es el costo del pedido repartido entre sus ítems a prorrata del valor de cada uno. Exacto cuando el pedido lleva un solo producto, aproximado cuando lleva varios. Dilo una vez si presentas márgenes.');
    if(filas.length&&!conCosto)notas.push('OJO: ningún producto de este período tiene costo cargado, así que NO hay rentabilidad por producto que calcular. Para tenerla hay que registrar los costos en cada pedido (pestaña Costos) o enlazarlos desde un listado de proveedor.');
    else if(conCosto<filas.length)notas.push('Solo '+conCosto+' de '+filas.length+' productos tienen costo cargado: el ranking de rentabilidad solo vale para esos.');
  }
  return {periodo:per.clave, desde:iaFecha(per.desde), vendido, ojo:notas.join(' ')};
}
// A quién le vendemos. Un informe sin esto responde "qué" pero nunca "a quién".
function svcVentasClientes(wsId,q,perm){
  if(!iaVeDinero(perm))return null;
  const per=iaPeriodo(wsId,q), hoyStr=hoy(wsId);
  // Se pasa por pedidoCompleto en vez de sumar valor_total en SQL: esa columna es TEXTO
  // con formato colombiano, y el resto del sistema confía en el valor ya calculado.
  const filas=db.prepare(`SELECT * FROM pedidos WHERE workspace_id=? AND archivado=0 AND cancelado=0
    AND es_cotizacion=0 AND fecha_pedido>=? AND fecha_pedido<=?`).all(wsId,per.desde,hoyStr).map(pedidoCompleto);
  const m=new Map();
  filas.forEach(p=>{
    const k=p.nombre||'(sin nombre)';
    const a=m.get(k)||{cliente:k, pedidos:0, facturado:0, pagado:0};
    a.pedidos++; a.facturado+=(p.valor_total||0); a.pagado+=iaPagado(p); m.set(k,a);
  });
  const lista=[...m.values()].sort((a,b)=>b.facturado-a.facturado).slice(0,15)
    .map(c=>({...c, saldo:Math.max(0,c.facturado-c.pagado)}));
  return {periodo:per.clave, desde:iaFecha(per.desde), clientes:lista,
    ojo:(lista.length?'':'Consultado: no hay pedidos de ningún cliente en ese período. ')
      +'"facturado" es el valor de los pedidos; "pagado" es lo que ya entró. Ordenado de mayor a menor facturación.'};
}
// Qué se entrega en los próximos N días — la pregunta más frecuente de un taller.
function svcAgenda(wsId,dias,perm){
  const n=Math.min(60,Math.max(1,parseInt(dias,10)||7)), hoyStr=hoy(wsId);
  return db.prepare(`SELECT * FROM pedidos WHERE workspace_id=? AND archivado=0 AND cancelado=0 AND entregado=0 AND es_cotizacion=0
    AND fecha_entrega!='' AND fecha_entrega<=date(?, '+'||?||' day') ORDER BY fecha_entrega`).all(wsId,hoyStr,n)
    .map(pedidoCompleto).map(p=>iaPedidoResumen(p,perm));
}

/* ══ AI GATEWAY · EL PUENTE ═══════════════════════════════════════════════════════════
   Toda la app habla SOLO con esta capa; esta capa habla con el proveedor de turno.
   Cambiar de motor de IA (Claude, OpenAI, un Ollama local) no debe tocar nada más.     */
const IA_PROVEEDORES={
  claude:{nombre:'Claude (Anthropic)', modelo:'claude-sonnet-5',  url:'https://api.anthropic.com/v1/messages'},
  openai:{nombre:'OpenAI (GPT)',       modelo:'gpt-4o-mini',      url:'https://api.openai.com/v1/chat/completions'},
  ollama:{nombre:'Ollama (local)',     modelo:'llama3.1',         url:'http://localhost:11434/api/chat'}
};
function iaConfig(wsId){
  const r=db.prepare('SELECT * FROM ia_config WHERE workspace_id=?').get(wsId)||{};
  const prov=IA_PROVEEDORES[r.proveedor]?r.proveedor:'claude';
  return {
    proveedor:prov,
    modelo:String(r.modelo||'').trim()||IA_PROVEEDORES[prov].modelo,
    clave:String(r.clave||''),
    url_base:String(r.url_base||'').trim()||IA_PROVEEDORES[prov].url,
    activo:!!r.activo
  };
}
// Lo que SÍ puede ver el navegador: nunca la clave, solo si hay una puesta.
function iaConfigPublica(wsId){
  const c=iaConfig(wsId);
  return {proveedor:c.proveedor, modelo:c.modelo, url_base:c.url_base, activo:c.activo,
    clave_puesta:!!c.clave, requiere_clave:c.proveedor!=='ollama',
    proveedores:Object.entries(IA_PROVEEDORES).map(([k,v])=>({id:k,nombre:v.nombre,modelo:v.modelo}))};
}

/* CONTEXTO · qué servicios se consultan según lo que se pregunta.
   Es deliberadamente determinista y auditable: la IA recibe datos reales, no adivina.
   Siempre va el panorama (barato y casi siempre relevante) + una búsqueda con la pregunta,
   y se añade el detalle fino cuando la pregunta lo pide (una referencia, un cliente…). */
/* Buscar con la frase entera no encuentra nada: "¿qué sabes de Textiles ABC?" no es el
   nombre de nadie. Se extraen las palabras con peso (fuera preguntas y muletillas) y se
   busca término por término, uniendo lo hallado. */
const IA_VACIAS=new Set(['que','qué','como','cómo','cual','cuál','cuanto','cuánto','cuando','cuándo','donde','dónde','quien','quién',
  'para','por','con','del','los','las','una','unos','unas','este','esta','estos','estas','eso','esa','ese',
  'sabes','saber','dime','cuenta','quiero','puedes','puede','favor','hay','tengo','tiene','estan','están','esta','está',
  'sobre','todo','toda','todos','todas','mas','más','muy','pero','desde','hasta','entre','sus','sus','mis','tus',
  'pedido','pedidos','cliente','clientes','producto','productos','nota','notas','vale','cuesta','precio','hola',
  // Palabras de TIEMPO y de ESTADO: describen la pregunta, no son el nombre de nadie.
  // Sin esto, "¿qué entrego esta semana?" se ponía a buscar clientes llamados "entrego".
  'semana','semanas','entrego','entrega','entregas','entregar','entregado','entregados',
  'mañana','manana','ayer','proxima','próxima','proximo','próximo','mes','meses','dias','días',
  'atrasado','atrasados','atraso','pendiente','pendientes','urgente','urgentes','activo','activos',
  'debe','deben','deuda','deudas','plata','dinero','saldo','saldos','cobrar','pagar','pagado',
  // Muletillas de quien pide una cotización: describen el encargo, no nombran productos.
  // (Salieron de una cotización real: gastaban 4 de los 6 cupos de búsqueda.)
  'pidio','pidió','pide','piden','cotizacion','cotización','cotizar','ayudame','ayúdame','ayuda',
  'necesito','necesita','saber','ademas','además','cuales','cuáles','tienen','tiene','otras','otros',
  'ultimas','últimas','ultimos','últimos','esas','esos','estos','estas','dame','darle','decir','sale',
  'total','cuanto','cuánta','cuantas','cuántas','hacer','tamaño','tamano','frente','espalda',
  // Más muletillas reales: en una cotización de verdad se comieron 6 de los 8 cupos.
  'exigente','rapido','rápido','varias','varios','cotizaciones','unidad','unidades','litro','litros',
  'cierto','tambien','también','tmbien','digas','decirme','pidio','manda','manga','pecho','sabes','como',
  'milimetro','milimetros','milímetro','milímetros','centimetro','centimetros','metro','metros',
  'con','sin','del','por','los','las','una','uno','que','the','and','for',
  // Palabras de 3 letras: al bajar el mínimo (para que 'DTF' y 'mug' fueran visibles)
  // entraron estas, que no nombran nada.
  'son','sus','mis','tus','nos','les','ese','esa','eso','ahi','ahí','aca','acá','ala','muy','ver','dar',
  'voy','fue','han','has','hay','era','ser','sea','dos','tre','mil','asi','así','pero','esta','este']);
/* El producto se llama "Camiseta" y el usuario escribe "camisetas": buscar '%camisetas%'
   NO encuentra "Camiseta" (la consulta es más larga que el nombre guardado). Por eso cada
   término aporta también su singular — en español se pregunta en plural casi siempre. */
function iaSingular(w){
  if(w.length>5&&/(es)$/.test(w))return w.slice(0,-2);   // pendones → pendon
  if(w.length>4&&/[^s]s$/.test(w))return w.slice(0,-1);  // camisetas → camiseta
  return null;
}
// "300x250" y "20x30" son MEDIDAS, no nombres de nada: buscarlas gasta cupo y no encuentra.
// Un código como "P0010" sí se conserva, porque sí identifica un producto.
// Con unidad pegada ('300x250cm', '9x5cm', '10x15') seguía pareciendo un nombre.
const IA_MEDIDA=/^[\d.,]+(?:\s*[x×*]\s*[\d.,]+)*\s*(?:cm|mm|mts?|m|cm2|m2|pulg|in|lt|lts|litros?|und|uds?|unidades?)?$/i;
function iaTerminos(q){
  // El tope se aplica a las palabras BASE, y el singular se añade DESPUÉS: antes el corte
  // separaba "camisetas" de su singular "camiseta" — se buscaba el plural, que no existe
  // en el catálogo, y se perdía justo el término que sí encontraba algo.
  const base=[...new Set(String(q||'').toLowerCase().split(/[^0-9a-záéíóúñü]+/i)
    // 8 palabras: una cotización real nombra varios productos ("1 pendón… 10 camisetas…
    // 150 vasos"). Con un tope corto, lo último que pedía el cliente nunca se buscaba.
    // Mínimo 3 letras: 'DTF' y 'mug' son productos reales y con 4 quedaban invisibles.
    .filter(w=>w.length>=3&&!IA_VACIAS.has(w)&&!IA_MEDIDA.test(w)))].slice(0,8);
  const out=[];
  base.forEach(w=>{ out.push(w); const s=iaSingular(w); if(s&&!IA_VACIAS.has(s))out.push(s); });
  return [...new Set(out)];
}
function iaUnir(destino,origen,clave){
  const vistos=new Set((destino[clave]||[]).map(x=>x.id));
  (origen[clave]||[]).forEach(x=>{ if(!vistos.has(x.id)){ (destino[clave]=destino[clave]||[]).push(x); vistos.add(x.id); } });
}
function iaContexto(wsId,pregunta,permisos){
  const q=String(pregunta||'').trim();
  const ctx={panorama:svcPanorama(wsId,permisos)};
  const refs=[...q.matchAll(/#?\b(\d{3,5})\b/g)].map(m=>m[1]).slice(0,3);
  const clientesDePedido=[];
  refs.forEach(r=>{ const p=svcPedido(wsId,r,permisos); if(p){ (ctx.pedidos=ctx.pedidos||[]).push(p); if(p.cliente)clientesDePedido.push(p.cliente); } });
  const porTermino=iaTerminos(q).map(t=>svcBuscar(wsId,t,permisos,5));
  const enc={pedidos:[],clientes:[],productos:[],notas:[],total:0};
  porTermino.forEach(r=>['pedidos','clientes','productos','notas'].forEach(k=>iaUnir(enc,r,k)));
  enc.total=enc.pedidos.length+enc.clientes.length+enc.productos.length+enc.notas.length;
  if(enc.total)ctx.coincidencias=enc;
  /* Reparto POR RONDAS entre los términos, no por orden de llegada.
     En una cotización real ("1 pendón … 10 camisetas") el término "pendon" encontraba 5
     productos y se quedaba con todos los cupos: la camiseta no llegaba nunca y el asistente
     respondía que no existía. Ahora cada término aporta su mejor resultado antes de que
     ninguno aporte el segundo. */
  const porRondas=(clave,tope)=>{
    const out=[], vistos=new Set();
    for(let i=0;i<6&&out.length<tope;i++){
      for(const r of porTermino){
        const x=(r[clave]||[])[i];
        if(x&&!vistos.has(x.id)){ vistos.add(x.id); out.push(x); if(out.length>=tope)break; }
      }
    }
    return out;
  };
  // El cliente del pedido del que se está hablando entra sí o sí: preguntas como
  // "¿le compro el material o espero a que pague?" necesitan su historial de pagos.
  const yaCli=new Set();
  clientesDePedido.forEach(n=>{ const d=svcCliente(wsId,n,permisos); if(d&&!yaCli.has(d.nombre)){ yaCli.add(d.nombre); (ctx.clientes=ctx.clientes||[]).push(d); } });
  porRondas('clientes',3).forEach(c=>{ const d=svcCliente(wsId,c.titulo,permisos); if(d&&!yaCli.has(d.nombre)){ yaCli.add(d.nombre); (ctx.clientes=ctx.clientes||[]).push(d); } });
  porRondas('productos',6).forEach(p=>{ const d=svcProducto(wsId,p.titulo,permisos); if(d)(ctx.productos=ctx.productos||[]).push(d); });
  // El catálogo y el inventario van SIEMPRE completos: son la única forma de que el
  // asistente no diga "no existe" sobre algo que sí está, solo porque se llama distinto.
  const cat=svcCatalogo(wsId,permisos);
  if(cat.length)ctx.catalogo=cat;
  const inv=svcInventario(wsId);
  if(inv.length)ctx.inventario=inv;
  if(/entrega|agenda|semana|hoy|mañana|pendiente|cuando/i.test(q))ctx.agenda=svcAgenda(wsId,7,permisos);
  // Preguntas de negocio: solo se consultan si se preguntan, para no engordar cada consulta.
  /* Salvo que pidan un INFORME. Ahí se traen todas: un informe que solo responde la palabra
     que se coló en el regex no es un informe. Pidieron ventas + rentabilidad + ganancias del
     mes en una frase y llegó media respuesta porque cada servicio tenía su propio disparador. */
  const informe=/informe|reporte|an[áa]lisis|balance|estad[íi]stic|resumen (del|de mi|de el)? ?negocio|c[óo]mo (va|vamos|estamos)|panorama general|rentab/i.test(q);
  if(informe||/ganancia|utilidad|margen|ingreso|factur|vend|ventas|cobrad|finanz/i.test(q)){
    const fin=svcFinanzas(wsId,q,permisos); if(fin)ctx.finanzas=fin;
  }
  /* "cuant[oa]s" a secas disparaba esto en "¿cuánto vale un pendón de 2x1?" — la pregunta
     más común del taller — y le colgaba el ranking de ventas a cada cotización. Se quita:
     era redundante, porque "cuántas camisetas hemos VENDIDO" ya cae en /vend/. */
  if(informe||/vend|ventas|salido|se mueve|rotaci[óo]n|mas vendido|más vendido/i.test(q)){
    ctx.ventas_por_producto=svcVentasProductos(wsId,q,permisos);
  }
  if(informe||/mejores? clientes?|qui[eé]n(es)? (me )?(compra|compran|paga)|client.* que m[áa]s|top .*client/i.test(q)){
    const cli=svcVentasClientes(wsId,q,permisos); if(cli)ctx.ventas_por_cliente=cli;
  }
  if(informe||/consum|gastad|gasta|usado|se han ido|salida/i.test(q)){
    ctx.consumo_de_insumos=svcConsumoInsumos(wsId,q);
  }
  if(informe)ctx.te_piden_un_informe=true;
  return ctx;
}
const IA_SISTEMA=`Eres el asistente de un taller de artes gráficas. Hablas español de Colombia, con voz serena, breve y con datos.

REGLAS QUE NO SE ROMPEN:
- Respondes ÚNICAMENTE con los datos del CONTEXTO que se te entrega. Si el dato no está ahí, dices exactamente qué falta y dónde mirarlo. Nunca inventas cifras, fechas, nombres ni precios.
- Los valores van en pesos colombianos con separador de miles (ej: $1.250.000).
- Las fechas del contexto YA vienen en día/mes/año (ej: 03/08/2026). Escríbelas tal cual; nunca las conviertas a otro formato ni las recalcules.
- Si te piden algo que implique cambiar datos (crear, editar, borrar), explicas cómo hacerlo en la app: tú no ejecutas cambios.
- Prefieres 3 líneas útiles a 10 de relleno. Sin saludos de cortesía ni "¡claro que sí!". (Excepción: el MODO INFORME de más abajo.)
- Si la pregunta es ambigua, respondes con lo más probable y ofreces la alternativa en una línea.
- COTIZACIONES DE VARIOS ÍTEMS: da primero TODOS los ítems con su precio, una línea corta por ítem, y al final el total. Las aclaraciones y las dudas van al final, en dos líneas máximo. Es preferible cotizar los 7 ítems escuetamente que explicar largo los 2 primeros y dejar el resto sin responder.

CÓMO LEER LO QUE TE PIDEN (esto es un taller, la gente habla rápido y en desorden):
- El CATÁLOGO que recibes está COMPLETO: son todos los productos activos. Por eso NUNCA digas "no existe ese producto" sin haberlo buscado ahí. Si no hay coincidencia exacta, busca el parecido y NÓMBRALO: el cliente dice "vasos" y el catálogo dice "mug"; dice "tazas", "mugs" o lo dice en inglés. Son la misma cosa. Empareja tú por significado.
- Si lo que piden encaja con VARIOS productos, no elijas en silencio: di cuáles son y pregunta. Ej: "¿DTF textil o DTF UV?". Y si el producto no se cobra como lo están pidiendo (piden "25 unidades" pero se cobra por medidas o por listado), dilo así: "eso no se cobra por unidad sino por medida — dime el tamaño".
- Si de verdad no hay nada parecido, dilo claro y di qué habría que crear.
- POSICIÓN DEL ESTAMPADO (pecho, espalda, manga, frente): salvo que el catálogo cobre distinto por eso, NO cambia el precio. Es una anotación del pedido. Lo que sí cambia el precio es el TAMAÑO del estampado (carta, media carta, tabloide, o las medidas) y la CANTIDAD. No pidas aclaración por la posición.
- Ignora lo que no venga al caso. Si te preguntan algo ajeno al taller, una línea y sigues con lo que importa.

CIFRAS DEL NEGOCIO (cómo leer lo que te llega):
- FINANZAS no trae un solo número: trae varios CORTES ya calculados ("este mes", "el mes pasado", "este año", "desde siempre"). Usa el corte que te pidieron y NÓMBRALO. Nunca digas que no tienes el corte del mes: está ahí. No sumes ni restes cortes entre sí.
- Si en una misma frase te piden cosas con tiempos distintos ("las ventas desde el inicio y las ganancias de este mes"), responde cada una con su corte. No apliques un solo período a todo.
- Al comparar un período con otro: la utilidad mezcla pagos recibidos con costos de pedidos creados, que no son el mismo grupo. Un mes puede desplomarse solo porque los cobros entraron tarde. Cuando la variación sea fuerte, dilo en una línea ("puede ser cuándo se cobró, no cómo se trabajó") en vez de presentarlo como una caída del negocio. Y si el mes aún no cierra, recuérdalo.
- HAY DOS COSTOS DISTINTOS, no los confundas:
  · El del CATÁLOGO y de cada producto ("costo" / "costo_por_medida", con su "costo_desglose") es lo que cuesta PRODUCIR una unidad, según la ficha. Úsalo para "¿cuánto me cuesta hacer X?" y para el margen unitario (precio − costo), aunque el producto no se haya vendido. Si el producto trae "costo", NUNCA digas que su ficha no tiene costo cargado: ahí está.
  · El de "ventas_por_producto" es el costo de lo que YA SE VENDIÓ, repartido entre los ítems del pedido a prorrata del valor. Es una aproximación — al presentar márgenes de lo vendido, dilo en una línea, una sola vez.
- Si un producto NO trae "costo" en el catálogo y "ventas_por_producto" dice "sin costo cargado", entonces sí: no se sabe su costo. NO es margen 0% ni 100%. Sepáralo del ranking, di cuántos están así y qué habría que cargar. Nunca inventes un costo ni supongas que algo salió gratis.

MODO INFORME (cuando el contexto trae "te_piden_un_informe", o te piden un informe/reporte/análisis):
- Aquí SÍ te extiendes. Un informe corto es un informe inútil.
- Estructura: (1) título con el período y la fecha de corte; (2) una sección por tema pedido, con sus cifras y su TOTAL; (3) comparación contra el período anterior cuando tengas los dos cortes, diciendo la variación; (4) cierre con 2 o 3 observaciones accionables, concretas, basadas solo en las cifras que mostraste.
- Usa tablas o listas con viñetas y negrilla en los totales. Cada cifra debe poder rastrearse al dato que te dieron.
- Si un dato del informe no está en el contexto, di en una línea qué falta y qué habría que cargar en la app para tenerlo la próxima vez. No dejes el hueco en silencio ni lo rellenes con supuestos.

PRODUCTOS · PUEDES PROPONER TRES COSAS (todo lo demás sigue siendo solo consulta):
- **Crear** una ficha nueva · **Editar** una que exista · **Archivar** una que sobre. Tú NUNCA ejecutas: propones y una persona aprieta el botón. Una sola propuesta por mensaje.
- EDITAR: identifica el producto por su CÓDIGO del catálogo y manda SOLO lo que cambia. Lo que no nombres se queda como está.
  {"accion":"editar_producto","codigo":"P0010","cambios":{"medida_tarifa":"8"}}
- ⚠️ Hay productos ANTIGUOS que no tienen código (en el catálogo aparecen sin él). Para esos usa "nombre" con el nombre EXACTO tal como está escrito en el catálogo, tildes incluidas: {"accion":"editar_producto","nombre":"Pendón lona","cambios":{...}}. Nunca te inventes un código que no viste.
- ARCHIVAR: {"accion":"archivar_producto","codigo":"P0010"} (o "nombre" si no tiene código). Archivar NO borra: el producto sale del catálogo y se puede recuperar desde Archivados. Dilo así cuando lo propongas.
- UNIFICAR DOS PRODUCTOS es editar uno y archivar el otro, y son DOS propuestas: haz primero la edición, y cuando esté confirmada ofrece archivar el que sobra. No prometas hacer las dos de una.
- Si te piden editar o archivar algo que no encuentras en el catálogo, dilo y pide el código. No adivines cuál es.
- Cuando te pidan CREAR/DAR DE ALTA/REGISTRAR un producto, explica en 2 o 3 líneas qué vas a proponer y AL FINAL del mensaje añades el bloque, exactamente así:
\`\`\`propuesta
{"accion":"crear_producto","nombre":"...","tipo_precio":"..."}
\`\`\`
- Un solo bloque por respuesta. Nunca lo comentes ni lo expliques por dentro: el usuario no ve ese JSON, ve una tarjeta con lo que se va a crear.
- "tipo_precio" tiene que ser uno de: unitario · escalonado · medidas · variantes · pliego · regla. Elige según CÓMO SE COBRA de verdad:
  · unitario → precio fijo por unidad. Campo: "precio_base".
  · escalonado → el precio baja por cantidad. Campo: "rangos": [{"desde":1,"hasta":20,"precio":10000},{"desde":21,"hasta":null,"precio":8000}].
  · medidas → se cobra por tamaño. Campos: "medida_unidad" (m2 · cm2 · m), "medida_tarifa", opcional "cobro_minimo", y si la tarifa cambia por tramos: "medida_cond":[{"desde":2,"hasta":null,"tarifa":7000}] con "medida_cond_eje":"area" o "cantidad".
  · ⭐ SI LA TARIFA DEPENDE DE DOS COSAS A LA VEZ (del área Y de la cantidad), NO intentes una tabla combinada. Son dos capas: "medida_cond" elige la tarifa por UN eje, y "medida_ajuste":[{"desde":21,"hasta":null,"ajuste":-15}] con "medida_ajuste_eje" (el OTRO eje) la sube o baja ese PORCENTAJE. Negativo = más barato. Ej: tarifa por área + "de 21 prendas en adelante, 15% menos" → medida_cond_eje "area" y medida_ajuste_eje "cantidad" con ajuste -15. El ajuste no sirve solo: necesita una tarifa o condiciones debajo.
  · variantes → el precio se arma sumando partes. "variantes":[{"nombre":"Tamaño","hijos":[{"nombre":"Carta","precio":"3000"}]}]. Una parte que solo describe y no cobra lleva "informativa":true.
- ⭐ UNA PARTE PUEDE COBRARSE POR MEDIDAS, no solo por precio fijo. Si dentro de un producto por variantes hay algo que se cobra por tamaño (un estampado a $20 el cm²), esa parte lleva "modo":"medidas" con su propia "medida_tarifa", y si la tarifa baja por cantidad o por área, sus propias "medida_cond" y "medida_cond_eje". NO uses "tramos" para eso: los tramos son el precio de la parte entera según cuántas unidades del PEDIDO, no una tarifa por medida.
- UNIDADES · NO conviertas nada, NUNCA multipliques por 10.000. El sistema calcula ancho × alto × tarifa con los números tal cual se escriben: si la tarifa es 20 y el operario escribe 10 × 10, el cobro es $2.000. La unidad no cambia la cuenta, solo dice EN QUÉ se van a escribir esas medidas. Pon la tarifa tal como te la dicten y declara la unidad con "medida_unidad":"cm2" (o "m2"), en la parte y también en el producto simple. Si no te dicen la unidad, pregúntala en una línea: es la diferencia entre cobrar $2.000 y cobrar $0,20.
  Ejemplo: estampado a $20 el cm² que baja a $18 desde 7 unidades y a $16 desde 13 →
  {"nombre":"Estampado","modo":"medidas","medida_unidad":"cm2","medida_tarifa":"20","medida_cond_eje":"cantidad","medida_cond":[{"desde":7,"hasta":12,"tarifa":18},{"desde":13,"hasta":null,"tarifa":16}]}
- TRAMOS/RANGOS por cantidad tienen que ser CONTIGUOS: el primero empieza en 1, y cada siguiente empieza justo en (el "hasta" del anterior + 1). Nada de solapes ni huecos (ej. válido: 1-5, 6-20, 21 en adelante). Solo el último puede ir "en adelante" (hasta null). Si no, el sistema lo rechaza porque una cantidad podría tener dos precios.

EL COSTO SÍ SE PUEDE GUARDAR — nunca digas que la ficha no tiene dónde:
- PRODUCTO SIMPLE (unitario, escalonado, medidas): el costo de lo que está hecho va en "insumos":[{"nombre":"Vaso","costo":"3700"},{"nombre":"Sublimación","costo":"2000"}]. Esa es la composición que forma el COSTO TOTAL de la ficha. Si te dictan "el cuadro en resina me cuesta: resina 8000, marco 5000", eso son dos insumos. Ponlos SIEMPRE que te den un costo de un producto simple — sin esto el producto se crea sin costo y no hay margen.
- Cada parte y cada opción (en productos por variantes) lleva su propio costo: "costos":[{"nombre":"Camiseta algodón","valor":"12000"}]. Ahí van los costos que te den por opción.
- El producto entero puede llevar costos que no dependen de la opción: "costos_fijos":[{"nombre":"...","valor":"..."}].
- Un producto por medidas lleva además su costo por medida: "costo_medida_tarifa" (y "costo_medida_minimo" si aplica).
- Una parte que se cobra por medidas puede llevar su COSTO por medida: "costo_medida_tarifa". Va en la misma unidad que su tarifa. Ej: el transfer se cobra a $20 el cm² y cuesta $8 el cm² → "medida_tarifa":"20","costo_medida_tarifa":"8","medida_unidad":"cm2". Ese costo se convierte solo en una línea de costo del pedido (área × tarifa × cantidad).
- Si te dan un costo y de verdad no encaja en ninguno de estos sitios, dilo concreto y propón el resto igual — no dejes la ficha sin crear por un costo.
- Antes de proponer, MIRA EL CATÁLOGO. Si ya existe algo con ese nombre o muy parecido, dilo y pregunta si quiere crearlo igual o editar el que hay. No dupliques productos en silencio.
- Si te falta un dato para que el precio quede bien (la tarifa, el tamaño, desde qué cantidad baja), PREGUNTA en vez de inventarlo. Es preferible una pregunta corta a una ficha con precios que no son.
- Precios en números, sin puntos de miles y sin el signo $ dentro del JSON.`;

/* ══ G6 · LA IA PROPONE, EL HUMANO CONFIRMA ═══════════════════════════════════════════
   Regla que no se toca: el asistente NO escribe en la base. Emite una propuesta, el
   servidor la NORMALIZA CON LISTA BLANCA (nunca se reenvía lo que mandó el modelo tal
   cual) y la valida con `validarFicha`, el mismo validador del formulario. Si sobrevive,
   se muestra una tarjeta. Al confirmar, el navegador llama a `POST /api/productos` — la
   MISMA puerta que usa una persona — con el token de quien aprieta: si no tiene permiso
   de gestionar productos, le responde 403 igual que en la interfaz. No hay atajo.        */
function iaNumPos(v){ const n=toFloatCO(v); return Number.isFinite(n)&&n>=0?n:null; }
function iaEnteroONulo(v){
  if(v===null||v===undefined||v==='')return null;
  const n=parseInt(v,10); return Number.isFinite(n)?n:null;
}
function iaNormTramos(arr){
  return (Array.isArray(arr)?arr:[]).slice(0,12).map(t=>({
    desde:iaEnteroONulo(t&&t.desde)||0,
    hasta:iaEnteroONulo(t&&t.hasta),
    precio:iaNumPos(t&&t.precio)||0
  })).filter(t=>t.precio>0);
}
function iaNormCond(arr){
  return (Array.isArray(arr)?arr:[]).slice(0,10).map(c=>({
    desde:iaNumPos(c&&c.desde)||0,
    hasta:(c&&definido(c.hasta)&&c.hasta!==null)?iaNumPos(c.hasta):null,
    tarifa:iaNumPos(c&&c.tarifa)||0
  })).filter(c=>c.tarifa>0);
}
/* SEGUNDA DIMENSIÓN en la lista blanca. Ojo: aquí el valor es un % CON SIGNO y casi siempre
   negativo, así que no puede pasar por iaNumPos (que descarta lo que no sea positivo). */
function iaNormAjuste(arr){
  return (Array.isArray(arr)?arr:[]).slice(0,10).map(c=>{
    const a=toPctCO(c&&(c.ajuste!=null?c.ajuste:c.porcentaje));
    return {desde:iaNumPos(c&&c.desde)||0,
      hasta:(c&&definido(c.hasta)&&c.hasta!==null)?iaNumPos(c.hasta):null,
      ajuste:(isFinite(a)&&a>-100)?a:0};
  }).filter(c=>c.ajuste!==0);
}
// Se copian SOLO los campos conocidos, y el árbol se limita en hondura y en anchura: una
// propuesta no puede convertirse en un árbol de miles de nodos que tumbe el guardado.
/* El costo SÍ existe en la ficha desde B1/B2 (cada variante lleva su `costos`, el producto
   lleva `costos_fijos` y `costo_medida_tarifa`). No estaban en esta lista blanca, así que el
   modelo no tenía dónde ponerlos y acabó diciéndole al usuario que la app no los soporta.
   Falso, y encima le hizo dudar de su propio sistema. */
function iaNormCostos(arr){
  return (Array.isArray(arr)?arr:[]).slice(0,10).map(c=>({
    nombre:String((c&&c.nombre)||'').trim().slice(0,80),
    valor:definido(c&&c.valor)?String(c.valor).trim():''
  })).filter(c=>c.nombre&&toFloatCO(c.valor)>0);
}
/* INSUMOS = la composición que forma el COSTO TOTAL de una ficha (vaso $3.700 + sublimación
   $2.000…). Es el costo de un producto SIMPLE. Faltaba en la lista blanca: el modelo dictaba
   los costos de "cuadro resina", se creaba el producto y quedaba SIN costo, porque no había
   dónde meterlos. guardarInsumos() espera exactamente estas claves. Se aceptan sinónimos
   (costo/valor por costo_unitario, cantidad por cantidad_usada) porque el modelo los mezcla. */
function iaNormInsumos(arr){
  return (Array.isArray(arr)?arr:[]).slice(0,20).map(x=>{
    if(!x||typeof x!=='object')return null;
    const nombre=String(x.nombre_insumo||x.nombre||'').trim().slice(0,80);
    const costo=String((x.costo_unitario!=null?x.costo_unitario:(x.costo!=null?x.costo:x.valor))||'').trim();
    const cant=String((x.cantidad_usada!=null?x.cantidad_usada:(x.cantidad!=null?x.cantidad:'1'))||'1').trim()||'1';
    return {nombre_insumo:nombre, proveedor:String(x.proveedor||'').trim().slice(0,80),
      costo_unitario:costo, cantidad_usada:cant,
      unidad_medida:String(x.unidad_medida||x.unidad||'unidad').trim().slice(0,20)};
  }).filter(i=>i&&i.nombre_insumo&&toFloatCO(i.costo_unitario)>0);
}
function iaNormVariante(v,prof,rec){
  if(!v||typeof v!=='object')return null;
  // Recortar en silencio y después culpar a la variante que quedó coja engaña: se anota.
  if(prof>3){ if(rec)rec.hondo=true; return null; }
  const nombre=String(v.nombre||'').trim().slice(0,80);
  if(!nombre)return null;
  const modo=['hoja','medidas','fijo'].includes(v.modo)?v.modo:'precio';
  const o={nombre,modo};
  if(v.informativa)o.informativa=true;
  if(v.multi)o.multi=true;
  if(definido(v.precio))o.precio=String(v.precio).trim();
  if(modo==='medidas'){
    if(definido(v.medida_tarifa))o.medida_tarifa=String(v.medida_tarifa).trim();
    if(definido(v.medida_minimo))o.medida_minimo=String(v.medida_minimo).trim();
    o.medida_unidad=v.medida_unidad==='cm2'?'cm2':'m2';
    if(definido(v.costo_medida_tarifa))o.costo_medida_tarifa=String(v.costo_medida_tarifa).trim();
    o.medida_cond=iaNormCond(v.medida_cond);
    o.medida_cond_eje=v.medida_cond_eje==='area'?'area':'cantidad';
    o.medida_ajuste=iaNormAjuste(v.medida_ajuste);
    o.medida_ajuste_eje=v.medida_ajuste_eje==='area'?'area':'cantidad';
  }
  if(modo==='hoja')o.piezas=iaEnteroONulo(v.piezas);
  const cs=iaNormCostos(v.costos); if(cs.length)o.costos=cs;
  const tr=iaNormTramos(v.tramos); if(tr.length)o.tramos=tr;
  const brutos=Array.isArray(v.hijos)?v.hijos:[];
  if(brutos.length>40&&rec)rec.ancho=true;
  const hijos=brutos.slice(0,40).map(h=>iaNormVariante(h,prof+1,rec)).filter(Boolean);
  if(hijos.length)o.hijos=hijos;
  return o;
}
function iaNormPropuesta(p,rec){
  const tipo=TIPOS_PRECIO_VALIDOS.includes(p.tipo_precio)?p.tipo_precio:'unitario';
  const b={
    nombre:String(p.nombre||'').trim().slice(0,120),
    descripcion:String(p.descripcion||'').trim().slice(0,600),
    tipo_precio:tipo,
    activo:true
  };
  if(tipo==='unitario'||tipo==='regla'||tipo==='variantes'||tipo==='pliego'){
    if(definido(p.precio_base))b.precio_base=String(p.precio_base).trim();
  }
  if(tipo==='escalonado'){
    b.rangos=(Array.isArray(p.rangos)?p.rangos:[]).slice(0,12).map(r=>({
      desde:iaNumPos(r&&r.desde)||0,
      hasta:(r&&definido(r.hasta)&&r.hasta!==null)?iaNumPos(r.hasta):null,
      precio:iaNumPos(r&&r.precio)||0
    })).filter(r=>r.precio>0);
  }
  if(tipo==='medidas'){
    b.medida_unidad=['m2','cm2','m'].includes(p.medida_unidad)?p.medida_unidad:'m2';
    if(definido(p.medida_tarifa))b.medida_tarifa=String(p.medida_tarifa).trim();
    if(definido(p.cobro_minimo))b.cobro_minimo=String(p.cobro_minimo).trim();
    b.medida_cond=iaNormCond(p.medida_cond);
    b.medida_cond_eje=p.medida_cond_eje==='area'?'area':'cantidad';
    b.medida_ajuste=iaNormAjuste(p.medida_ajuste);
    b.medida_ajuste_eje=p.medida_ajuste_eje==='area'?'area':'cantidad';
    // Costo por medida: solo existe A NIVEL DE PRODUCTO, no por sub-variante.
    if(definido(p.costo_medida_tarifa))b.costo_medida_tarifa=String(p.costo_medida_tarifa).trim();
    if(definido(p.costo_medida_minimo))b.costo_medida_minimo=String(p.costo_medida_minimo).trim();
  }
  const cf=iaNormCostos(p.costos_fijos); if(cf.length)b.costos_fijos=cf;
  // El costo de un producto simple (su composición de materiales) va aquí, en cualquier tipo.
  const ins=iaNormInsumos(p.insumos); if(ins.length)b.insumos=ins;
  if(tipo==='variantes'){
    const raiz=Array.isArray(p.variantes)?p.variantes:[];
    if(raiz.length>20&&rec)rec.ancho=true;
    b.variantes=raiz.slice(0,20).map(v=>iaNormVariante(v,0,rec)).filter(Boolean);
  }
  if(tipo==='regla'){
    const lleva=iaEnteroONulo(p.regla_lleva), paga=iaEnteroONulo(p.regla_paga);
    if(lleva!==null)b.regla_lleva=lleva;
    if(paga!==null)b.regla_paga=paga;
  }
  return b;
}
// El usuario no ve JSON: ve en cristiano qué se va a crear. Si esta lista no coincide con
// lo que él quería, no aprieta el botón — y ese es todo el punto de la confirmación.
function iaResumenPropuesta(b){
  const pesos=n=>'$'+Number(n||0).toLocaleString('es-CO');
  const L=[{campo:'Producto',valor:b.nombre}];
  if(b.descripcion)L.push({campo:'Descripción',valor:b.descripcion});
  if(b.tipo_precio==='unitario')L.push({campo:'Se cobra',valor:'precio fijo de '+pesos(toFloatCO(b.precio_base))+' por unidad'});
  else if(b.tipo_precio==='escalonado'){
    L.push({campo:'Se cobra',valor:'por cantidad, con '+(b.rangos||[]).length+' tramo(s)'});
    (b.rangos||[]).forEach(r=>L.push({campo:'  de '+r.desde+(r.hasta?(' a '+r.hasta):' en adelante'),valor:pesos(r.precio)+' c/u'}));
  }else if(b.tipo_precio==='medidas'){
    const u=b.medida_unidad==='m'?'metro lineal':(b.medida_unidad==='cm2'?'cm²':'m²');
    L.push({campo:'Se cobra',valor:'por medidas: '+pesos(toFloatCO(b.medida_tarifa))+' por '+u});
    if(toFloatCO(b.cobro_minimo)>0)L.push({campo:'Cobro mínimo',valor:pesos(toFloatCO(b.cobro_minimo))});
    // "si el área pasa de 2" se leía a medias: 2 ¿qué? La unidad va pegada al número.
    (b.medida_cond||[]).forEach(c=>L.push({
      campo:'  si '+(b.medida_cond_eje==='area'
        ? ('el área pasa de '+c.desde+' '+u)
        : ('la cantidad pasa de '+c.desde+' und')),
      valor:pesos(c.tarifa)+' por '+u}));
    // La 2.ª dimensión NO puede quedar muda en la tarjeta: es la que mueve el precio final.
    (b.medida_ajuste||[]).forEach(c=>L.push({
      campo:'  y si '+(b.medida_ajuste_eje==='area'
        ? ('el área pasa de '+c.desde+' '+u)
        : ('la cantidad pasa de '+c.desde+' und')),
      valor:(c.ajuste>0?'+':'')+c.ajuste+'% sobre esa tarifa'}));
  }else if(b.tipo_precio==='variantes'){
    L.push({campo:'Se cobra',valor:'por variantes (se suman las partes elegidas)'});
    // El costo va en la MISMA línea que el precio: es lo que hay que poder comparar de un
    // vistazo antes de apretar. Un costo escondido en otra sección no se revisa.
    const costoDe=n=>{ const c=(n.costos||[]).reduce((s,x)=>s+(toFloatCO(x.valor)||0),0);
      return c>0?(' · costo '+pesos(c)):''; };
    const linea=n=>{
      if(n.modo==='medidas'){
        /* ⚠️ Una PARTE por medidas siempre se calcula en m² (ancho×alto en metros): no
           tiene unidad propia, solo el producto simple la tiene. Decir "por unidad de
           medida" escondía justo el dato que hay que revisar: si alguien dicta "$20 el
           cm²" y se guarda 20, un estampado de 10×10 cm cobraría $0,20 en vez de $2.000. */
        const um=n.medida_unidad==='cm2'?'cm²':'m²';
        let s='por medidas: '+pesos(toFloatCO(n.medida_tarifa))+' por '+um+' (se escribe ancho × alto en '
          +(n.medida_unidad==='cm2'?'centímetros':'metros')+')';
        (n.medida_cond||[]).forEach(c=>{ s+=' · desde '+c.desde
          +(n.medida_cond_eje==='area'?(' '+um):' und')+': '+pesos(c.tarifa)+'/'+um; });
        if(toFloatCO(n.costo_medida_tarifa)>0)s+=' · costo '+pesos(toFloatCO(n.costo_medida_tarifa))+'/'+um;
        return s+costoDe(n);
      }
      return (toFloatCO(n.precio)>0?pesos(toFloatCO(n.precio)):'sin precio')+costoDe(n);
    };
    (b.variantes||[]).forEach(v=>{
      L.push({campo:'  '+v.nombre+(v.informativa?' (solo describe)':''),
        valor:(v.hijos||[]).length?'':linea(v)});
      (v.hijos||[]).forEach(h=>L.push({campo:'    '+h.nombre,valor:linea(h)}));
    });
  }else L.push({campo:'Se cobra',valor:b.tipo_precio});
  if(b.tipo_precio==='medidas'&&toFloatCO(b.costo_medida_tarifa)>0)
    L.push({campo:'Costo por medida',valor:pesos(toFloatCO(b.costo_medida_tarifa))});
  (b.insumos||[]).forEach(c=>{ const q=toFloatCO(c.cantidad_usada)||1;
    L.push({campo:'  costo · '+c.nombre_insumo,valor:pesos(toFloatCO(c.costo_unitario))+(q>1?(' × '+c.cantidad_usada):'')}); });
  (b.costos_fijos||[]).forEach(c=>L.push({campo:'  costo: '+c.nombre,valor:pesos(toFloatCO(c.valor))}));
  // Total de costo bien visible: es lo que hay que comparar contra el precio antes de crear.
  const costoTot=(b.insumos||[]).reduce((s,c)=>s+toFloatCO(c.costo_unitario)*(toFloatCO(c.cantidad_usada)||1),0)
    +(b.costos_fijos||[]).reduce((s,c)=>s+toFloatCO(c.valor),0);
  if(costoTot>0)L.push({campo:'Costo total',valor:pesos(Math.round(costoTot))});
  return L;
}
/* Saca el bloque ```propuesta del texto, lo valida, y devuelve el texto ya LIMPIO. Si el
   bloque viene roto o no pasa la validación, no se muestra botón: se dice qué falló. Nunca
   se deja a medias — un botón que crea algo distinto a lo que se leyó sería lo peor. */
const IA_RX_PROPUESTA=/```\s*propuesta\s*\n([\s\S]*?)```/i;
const IA_ACCIONES=['crear_producto','editar_producto','archivar_producto'];
// Se identifica por CÓDIGO (P0010), que el modelo ya recibe en el catálogo y el usuario ve
// en pantalla. Un id interno no lo puede teclear nadie y no se puede verificar de un vistazo.
function iaResolverFicha(wsId,ref){
  const cod=String((ref&&ref.codigo)||'').trim();
  if(cod){
    const f=db.prepare(`SELECT * FROM fichas_producto WHERE workspace_id=? AND archivado=0
      AND lower(codigo)=lower(?) LIMIT 1`).get(wsId,cod);
    if(f)return f;
  }
  const nom=String((ref&&ref.nombre)||'').trim();
  if(nom){
    const f=db.prepare(`SELECT * FROM fichas_producto WHERE workspace_id=? AND archivado=0
      AND lower(nombre)=lower(?) LIMIT 1`).get(wsId,nom);
    if(f)return f;
  }
  return null;
}
/* Solo se cambia lo que el modelo NOMBRÓ. Sin este filtro, normalizar una ficha completa
   devolvería nombre:'' y descripcion:'' y una edición de la tarifa borraría el nombre. */
function iaNormCambios(c,base,rec){
  const tipo=TIPOS_PRECIO_VALIDOS.includes(c.tipo_precio)?c.tipo_precio:base.tipo_precio;
  const full=iaNormPropuesta(Object.assign({},c,{tipo_precio:tipo}),rec);
  const out={};
  Object.keys(full).forEach(k=>{ if(Object.prototype.hasOwnProperty.call(c,k))out[k]=full[k]; });
  return out;
}
const IA_ETIQ={nombre:'Nombre',descripcion:'Descripción',tipo_precio:'Cómo se cobra',
  precio_base:'Precio base',medida_unidad:'Unidad de medida',medida_tarifa:'Tarifa por medida',
  cobro_minimo:'Cobro mínimo',costo_medida_tarifa:'Costo por medida',medida_cond_eje:'Las condiciones van por',
  medida_ajuste_eje:'El ajuste en % va por'};
// En una edición lo que importa no es cómo queda, sino QUÉ CAMBIA. Un resumen del estado
// final obliga a comparar de memoria contra lo que hay, y así nadie revisa de verdad.
function iaDiffFicha(antes,despues){
  const pesos=n=>'$'+Number(n||0).toLocaleString('es-CO');
  const d=[];
  Object.keys(IA_ETIQ).forEach(k=>{
    if(!Object.prototype.hasOwnProperty.call(despues,k))return;
    const a=String(antes[k]==null?'':antes[k]).trim(), b=String(despues[k]==null?'':despues[k]).trim();
    if(a===b)return;
    d.push({campo:IA_ETIQ[k],antes:a||'(vacío)',despues:b||'(vacío)'});
  });
  const cnt=(o,k)=>Array.isArray(o[k])?o[k].length:0;
  [['medida_cond','Condiciones de tarifa'],['medida_ajuste','Ajustes en % de la tarifa'],['rangos','Tramos por cantidad'],
   ['variantes','Variantes'],['costos_fijos','Costos fijos'],['insumos','Insumos (costo)']].forEach(([k,lbl])=>{
    if(!Object.prototype.hasOwnProperty.call(despues,k))return;
    if(cnt(antes,k)===cnt(despues,k)&&JSON.stringify(antes[k])===JSON.stringify(despues[k]))return;
    d.push({campo:lbl,antes:cnt(antes,k)+'',despues:cnt(despues,k)+''});
  });
  return d;
}
function iaExtraerPropuesta(texto,wsId){
  const m=IA_RX_PROPUESTA.exec(String(texto||''));
  if(!m)return {texto,propuesta:null};
  const limpio=String(texto).replace(IA_RX_PROPUESTA,'').replace(/\n{3,}/g,'\n\n').trim();
  let crudo;
  try{ crudo=JSON.parse(m[1]); }
  catch(e){ return {texto:limpio,propuesta:null,
    aviso:'Preparé una ficha pero me salió mal escrita y no me fío de mostrarte un botón con ella. Pídemela otra vez.'}; }
  if(!crudo||!IA_ACCIONES.includes(crudo.accion))return {texto:limpio,propuesta:null};
  const no=aviso=>({texto:limpio,propuesta:null,aviso});

  // ── ARCHIVAR ──────────────────────────────────────────────────────────────────────
  if(crudo.accion==='archivar_producto'){
    const f=iaResolverFicha(wsId,crudo);
    if(!f)return no('Quise archivar un producto pero no encuentro cuál: dime su código (por ejemplo P0010).');
    return {texto:limpio,propuesta:{tipo:'archivar_producto',ficha_id:f.id,
      payload:{nombre:f.nombre},
      resumen:[{campo:'Producto',valor:f.nombre+(f.codigo?(' ('+f.codigo+')'):'')},
               {campo:'Qué pasa',valor:'deja de salir en el catálogo y al cotizar'},
               {campo:'Se puede deshacer',valor:'sí — queda en Archivados, no se borra'}]}};
  }

  // ── EDITAR ────────────────────────────────────────────────────────────────────────
  if(crudo.accion==='editar_producto'){
    const f=iaResolverFicha(wsId,crudo);
    if(!f)return no('Quise editar un producto pero no encuentro cuál: dime su código (por ejemplo P0010).');
    // fichaCompleta() devuelve exactamente la forma que acepta el PUT: está comprobado que
    // re-guardar lo que entrega deja la ficha idéntica. Por eso se puede usar de base.
    const base=fichaCompleta(f);
    const rec={};
    const cambios=iaNormCambios(crudo.cambios||{},base,rec);
    if(!Object.keys(cambios).length)return no('Preparé una edición pero no traía ningún cambio concreto.');
    const payload=Object.assign({},base,cambios);
    const errores=validarFicha(payload,wsId,f.id);
    if(errores.length)return no('La edición no pasa las validaciones del sistema ('+errores.join('. ')+'), así que no te muestro el botón.');
    const diff=iaDiffFicha(base,payload);
    if(!diff.length)return no('Preparé una edición pero quedaría exactamente igual que ahora.');
    return {texto:limpio,propuesta:{tipo:'editar_producto',ficha_id:f.id,payload,
      titulo:f.nombre+(f.codigo?(' ('+f.codigo+')'):''),diff}};
  }

  // ── CREAR ─────────────────────────────────────────────────────────────────────────
  const rec={};
  const payload=iaNormPropuesta(crudo,rec);
  const errores=validarFicha(payload,wsId);
  if(!payload.nombre)errores.push('La ficha venía sin nombre');
  if(errores.length){
    // Si además se recortó, decirlo: si no, el error señala a una variante que quedó
    // coja por MI recorte y parece culpa de otra cosa.
    const corte=[rec.hondo?'venía con variantes anidadas más de 3 niveles y las corté':null,
                 rec.ancho?'traía demasiadas variantes y me quedé con las primeras':null]
                 .filter(Boolean).join(' y ');
    return no('Preparé una ficha pero no pasa las validaciones del sistema ('+errores.join('. ')+')'
        +(corte?('. Ojo: la ficha '+corte+', así que el fallo puede venir de ahí'):'')
        +', así que no te muestro el botón.');
  }
  // Aviso, no bloqueo: puede querer dos productos con el mismo nombre a propósito.
  const dup=db.prepare(`SELECT nombre FROM fichas_producto WHERE workspace_id=? AND archivado=0
    AND lower(nombre)=lower(?) LIMIT 1`).get(wsId,payload.nombre);
  return {texto:limpio,propuesta:{tipo:'crear_producto',payload,
    resumen:iaResumenPropuesta(payload),ya_existe:dup?dup.nombre:null}};
}
/* Una respuesta cortada a media palabra ("Sin datos en el catál") parece un error del
   sistema y deja sin saber qué faltaba. Si el proveedor avisa que la cortó, se dice. */
function iaAvisoCorte(txt,razon,diag){
  if(razon!=='max_tokens'&&razon!=='length')return txt;
  // Se muestran los números: si se gastaron 4.000 tokens para dos líneas de texto, el
  // problema no es que la respuesta sea larga, y hay que verlo, no suponerlo.
  const nums=(diag&&diag.tokens)?` (gasté ${diag.tokens} de ${diag.tope} tokens${(diag.bloques||[]).some(b=>b!=='text')?', parte en razonamiento interno':''})`:'';
  return txt+'\n\n⚠️ Aquí se me acabó el espacio de respuesta y quedó cortada'+nums+'. Pídeme lo que falta por partes (por ejemplo: primero los pendones, luego las camisetas).';
}
function iaMotivoVacio(razon){
  if(razon==='max_tokens')return 'La respuesta se cortó por longitud antes de escribir nada. Pregunta por partes (primero el pendón, luego las camisetas).';
  if(razon==='refusal')return 'El modelo se negó a responder esa pregunta.';
  return 'El proveedor devolvió una respuesta vacía'+(razon?(' ('+razon+')'):'')+'. Vuelve a intentarlo.';
}
/* El contexto se recortaba con .slice() sobre el JSON YA convertido a texto: si pasaba del
   tope, al modelo le llegaba un JSON partido por la mitad — basura. Ahora se recortan los
   DATOS, en orden de menor a mayor importancia, y siempre se envía un JSON válido.
   Lo que se haya recortado se le dice, para que no crea que eso es todo lo que hay. */
function iaCompactar(ctx,limite){
  const tam=()=>JSON.stringify(ctx).length;
  const recortes=[];
  const podar=(obj,clave,deja,etiq)=>{
    const a=obj&&obj[clave];
    if(Array.isArray(a)&&a.length>deja){ obj[clave]=a.slice(0,deja); recortes.push(`${etiq}: se muestran ${deja} de ${a.length}`); }
  };
  const pasos=[
    ()=>{ if(ctx.coincidencias){ delete ctx.coincidencias; recortes.push('lista de coincidencias (los detalles ya van aparte)'); } },
    ()=>podar(ctx.panorama,'pedidos_con_saldo',8,'pedidos con saldo'),
    ()=>podar(ctx.panorama,'atrasados',8,'pedidos atrasados'),
    ()=>podar(ctx.panorama,'entregan_esta_semana',8,'entregas de la semana'),
    ()=>podar(ctx.panorama,'entregan_hoy',8,'entregas de hoy'),
    ()=>podar(ctx,'agenda',10,'agenda'),
    // El historial de cada cliente puede traer 8 pedidos completos: se acorta antes de
    // sacrificar productos, que en una cotización son lo que de verdad hace falta.
    ()=>{ (ctx.clientes||[]).forEach(c=>podar(c,'ultimos_pedidos',3,'historial del cliente')); },
    ()=>{ (ctx.pedidos||[]).forEach(p=>podar(p,'encargos',4,'encargos del pedido')); },
    ()=>podar(ctx,'inventario',10,'inventario'),
    ()=>podar(ctx,'productos',4,'productos'),
    ()=>podar(ctx,'clientes',2,'clientes'),
    ()=>podar(ctx,'productos',2,'productos'),
    ()=>podar(ctx.panorama,'atrasados',3,'pedidos atrasados'),
    ()=>podar(ctx.panorama,'entregan_esta_semana',3,'entregas de la semana'),
    ()=>podar(ctx.panorama,'pedidos_con_saldo',3,'pedidos con saldo')
  ];
  for(const paso of pasos){ if(tam()<=limite)break; paso(); }
  // Red de seguridad: si con todo lo anterior sigue pasado, se sueltan secciones enteras
  // en orden inverso de importancia. Nunca se corta el JSON a la mitad.
  // El catálogo se sacrifica de ÚLTIMO: sin él el asistente vuelve a decir "no existe".
  // Finanzas, ventas y consumo tampoco se tocan pronto: si se preguntaron, son LA respuesta.
  /* El orden se invierte en un informe. Fuera de él, el catálogo es lo último que se suelta
     (sin él el asistente vuelve a decir "no existe"); pero en un informe el catálogo no
     pinta nada y las cifras son TODA la respuesta — sacrificarlas primero, como hacía esta
     lista, dejaría un informe sin números y con la lista de precios intacta. */
  const sacrificables=ctx.te_piden_un_informe
    ? ['catalogo','inventario','agenda','productos','clientes','pedidos',
       'consumo_de_insumos','ventas_por_cliente','ventas_por_producto','finanzas']
    : ['agenda','clientes','pedidos','productos','inventario',
       'consumo_de_insumos','ventas_por_cliente','ventas_por_producto','finanzas','catalogo'];
  for(const k of sacrificables){ if(tam()<=limite)break; if(ctx[k]){ delete ctx[k]; recortes.push('sección "'+k+'" completa (demasiado grande)'); } }
  if(tam()>limite&&ctx.panorama){
    ['entregan_hoy','entregan_esta_semana','atrasados','pedidos_con_saldo'].forEach(k=>{ if(tam()>limite&&ctx.panorama[k]){ ctx.panorama[k]=ctx.panorama[k].slice(0,2); } });
    recortes.push('el panorama se dejó al mínimo');
  }
  if(recortes.length)ctx._recortado='Por tamaño se recortó: '+recortes.join(' · ')+'. Si el usuario necesita el resto, dile que lo pida más específico.';
  return ctx;
}
// ── Adaptadores. Cada uno recibe lo mismo y devuelve texto; las diferencias mueren aquí.
async function iaLlamar(cfg,sistema,mensajes,maxTokens){
  const ctrl=new AbortController();
  // 45 s se quedaban cortos: una cotización de 7 ítems, con el catálogo entero y el
  // razonamiento del modelo, pasa de eso. El primer intento moría y el segundo funcionaba.
  const IA_ESPERA=120000;
  const reloj=setTimeout(()=>ctrl.abort(),IA_ESPERA); // que una IA colgada no cuelgue la app
  try{
    if(cfg.proveedor==='claude'){
      const r=await fetch(cfg.url_base,{method:'POST',signal:ctrl.signal,
        headers:{'content-type':'application/json','x-api-key':cfg.clave,'anthropic-version':'2023-06-01'},
        body:JSON.stringify({model:cfg.modelo,max_tokens:maxTokens||2000,system:sistema,messages:mensajes})});
      const j=await r.json().catch(()=>({}));
      if(!r.ok)throw new Error((j.error&&j.error.message)||('El proveedor respondió '+r.status));
      const txt=(j.content||[]).filter(b=>b.type==='text').map(b=>b.text).join('\n').trim();
      /* DIAGNÓSTICO. La respuesta se cortaba tras dos líneas aunque el cupo era de 4.000:
         algo consumía el presupuesto sin aparecer en pantalla. Sin medir no se puede saber,
         así que se anota qué tipos de bloque vinieron y cuántos tokens se gastaron de
         verdad — si hay bloques que no son 'text' (razonamiento), ahí se fue el cupo. */
      const diag={tokens:(j.usage&&j.usage.output_tokens)||0, tope:maxTokens||2000,
        bloques:[...new Set((j.content||[]).map(b=>b.type))], stop:j.stop_reason||''};
      if(!txt){ logError('IA respuesta vacía',new Error(JSON.stringify(diag))); throw new Error(iaMotivoVacio(j.stop_reason)); }
      if(diag.stop==='max_tokens')logError('IA respuesta cortada',new Error(JSON.stringify(diag)));
      return iaAvisoCorte(txt,j.stop_reason,diag);
    }
    if(cfg.proveedor==='openai'){
      const r=await fetch(cfg.url_base,{method:'POST',signal:ctrl.signal,
        headers:{'content-type':'application/json','authorization':'Bearer '+cfg.clave},
        body:JSON.stringify({model:cfg.modelo,max_tokens:maxTokens||2000,
          messages:[{role:'system',content:sistema},...mensajes]})});
      const j=await r.json().catch(()=>({}));
      if(!r.ok)throw new Error((j.error&&j.error.message)||('El proveedor respondió '+r.status));
      const t1=((j.choices||[])[0]?.message?.content||'').trim();
      if(!t1)throw new Error(iaMotivoVacio((j.choices||[])[0]?.finish_reason));
      return iaAvisoCorte(t1,(j.choices||[])[0]?.finish_reason,{tokens:(j.usage&&j.usage.completion_tokens)||0,tope:maxTokens||2000,bloques:['text']});
    }
    if(cfg.proveedor==='ollama'){
      const r=await fetch(cfg.url_base,{method:'POST',signal:ctrl.signal,
        headers:{'content-type':'application/json'},
        body:JSON.stringify({model:cfg.modelo,stream:false,
          messages:[{role:'system',content:sistema},...mensajes]})});
      const j=await r.json().catch(()=>({}));
      if(!r.ok)throw new Error(j.error||('El modelo local respondió '+r.status));
      const t2=String(j.message?.content||'').trim();
      if(!t2)throw new Error(iaMotivoVacio(j.done_reason));
      return iaAvisoCorte(t2,j.done_reason,{tokens:j.eval_count||0,tope:maxTokens||2000,bloques:['text']});
    }
    throw new Error('Proveedor no reconocido');
  }catch(e){
    if(e.name==='AbortError')throw new Error('El proveedor tardó más de '+Math.round(IA_ESPERA/1000)+' s en responder. Si la cotización es muy larga, pídemela por partes.');
    if(/fetch failed|ECONNREFUSED/i.test(e.message))throw new Error('No se pudo conectar con el proveedor. Revisa la conexión'+(cfg.proveedor==='ollama'?' o que Ollama esté corriendo.':' o la URL.'));
    throw e;
  }finally{ clearTimeout(reloj); }
}

app.get('/api/ia/config',requiere('configurar_sistema'),(req,res)=>{ res.json(iaConfigPublica(req.wsId)); });
app.put('/api/ia/config',requiere('configurar_sistema'),(req,res)=>{
  try{
    const b=req.body||{}, act=iaConfig(req.wsId);
    const prov=IA_PROVEEDORES[b.proveedor]?b.proveedor:act.proveedor;
    // Si no mandan clave, se CONSERVA la que había: el front nunca la recibe, así que
    // no puede reenviarla, y sin esto guardar cualquier otro ajuste la borraría.
    const clave=(b.clave===undefined||b.clave===null)?act.clave:String(b.clave);
    const modelo=b.modelo!==undefined?String(b.modelo||'').trim():act.modelo;
    const url=b.url_base!==undefined?String(b.url_base||'').trim():act.url_base;
    db.prepare(`INSERT INTO ia_config(workspace_id,proveedor,modelo,clave,url_base,activo,actualizado)
      VALUES(?,?,?,?,?,?,datetime('now','localtime'))
      ON CONFLICT(workspace_id) DO UPDATE SET proveedor=excluded.proveedor,modelo=excluded.modelo,
        clave=excluded.clave,url_base=excluded.url_base,activo=excluded.activo,actualizado=excluded.actualizado`)
      .run(req.wsId,prov,modelo,clave,url,b.activo?1:0);
    res.json(iaConfigPublica(req.wsId));
  }catch(e){logError('PUT /api/ia/config',e);res.status(500).json({error:e.message})}
});
app.post('/api/ia/probar',requiere('configurar_sistema'),async(req,res)=>{
  try{
    const cfg=iaConfig(req.wsId);
    if(cfg.proveedor!=='ollama'&&!cfg.clave)return res.status(400).json({error:'Falta la clave del proveedor'});
    const t0=Date.now();
    const txt=await iaLlamar(cfg,'Responde solo con la palabra: listo',[{role:'user',content:'Di listo'}],20);
    res.json({ok:true,respuesta:txt.slice(0,80),ms:Date.now()-t0,proveedor:cfg.proveedor,modelo:cfg.modelo});
  }catch(e){ res.status(400).json({error:e.message}); }
});

/* Transparencia: devuelve EXACTAMENTE el contexto que se le entregaría a la IA para esa
   pregunta, sin llamar al proveedor (ni gastar tokens). Sirve para auditar de dónde salió
   una respuesta y para probar toda la capa de servicios sin depender de una clave. */
/* G6 · cierra el rastro: el producto ya se creó por POST /api/productos (la puerta normal,
   con los permisos de quien apretó). Aquí solo se anota quién confirmó y qué salió, para
   poder responder dentro de seis meses "¿de dónde salió este producto?".
   Exige el MISMO permiso que crear: si no puede crear productos, no puede firmar que lo hizo. */
app.post('/api/ia/acciones/:id/confirmada',requiere('gestionar_productos'),(req,res)=>{
  try{
    const a=db.prepare('SELECT * FROM ia_acciones WHERE id=? AND workspace_id=?').get(req.params.id,req.wsId);
    if(!a)return res.status(404).json({error:'Esa propuesta no existe'});
    if(a.estado==='confirmada')return res.json({ok:true,ya:true});
    db.prepare(`UPDATE ia_acciones SET estado='confirmada',confirmado_por=?,
      confirmado_en=datetime('now','localtime'),resultado_id=? WHERE id=? AND workspace_id=?`)
      .run(actorDe(req).nombre,String((req.body||{}).ficha_id||''),req.params.id,req.wsId);
    res.json({ok:true});
  }catch(e){logError('POST /api/ia/acciones/:id/confirmada',e);res.status(500).json({error:e.message})}
});
app.get('/api/ia/contexto',requiere('configurar_sistema'),(req,res)=>{
  try{ res.json(iaContexto(req.wsId,req.query.q||'',req.permisos)); }
  catch(e){ logError('GET /api/ia/contexto',e); res.status(500).json({error:e.message}); }
});

// Un turno de conversación por vez, por workspace: evita disparar la factura sin querer.
const _iaOcupado=new Set();
app.post('/api/ia/preguntar',async(req,res)=>{
  const ws=req.wsId;
  try{
    const cfg=iaConfig(ws);
    if(!cfg.activo)return res.status(400).json({error:'El asistente está apagado. Actívalo en Configuración.'});
    if(cfg.proveedor!=='ollama'&&!cfg.clave)return res.status(400).json({error:'Falta la clave del proveedor en Configuración.'});
    const pregunta=String((req.body||{}).pregunta||'').trim();
    if(!pregunta)return res.status(400).json({error:'Escribe una pregunta'});
    if(pregunta.length>2000)return res.status(400).json({error:'La pregunta es demasiado larga'});
    if(_iaOcupado.has(ws))return res.status(429).json({error:'Ya hay una consulta en curso. Espera a que termine.'});
    _iaOcupado.add(ws);
    try{
      const ctx=iaContexto(ws,pregunta,req.permisos);
      const previo=(Array.isArray((req.body||{}).historial)?req.body.historial:[]).slice(-6)
        .filter(m=>m&&(m.rol==='usuario'||m.rol==='asistente')&&String(m.texto||'').trim())
        .map(m=>({role:m.rol==='usuario'?'user':'assistant',content:String(m.texto).slice(0,4000)}));
      const hoyTxt=iaFecha(hoy(ws)), neg=getConfiguracion(ws).nombre_negocio||'el taller';
      const mensajes=[...previo,{role:'user',content:
`Hoy es ${hoyTxt}. El negocio es ${neg}.

CONTEXTO (datos reales del sistema, en JSON):
${JSON.stringify(iaCompactar(ctx,45000),null,1)}

PREGUNTA: ${pregunta}`}];
      const t0=Date.now();
      // 8000: con 4000 una cotización de 7 ítems se cortaba tras dos líneas — parte del
      // cupo se va en razonamiento interno del modelo, que no se ve pero sí se cuenta.
      // Es un TECHO, no un gasto: solo se paga lo que la respuesta ocupe de verdad.
      const bruto=await iaLlamar(cfg,IA_SISTEMA,mensajes,8000);
      // G6 · si trae una ficha propuesta, se saca del texto, se valida y se guarda el rastro.
      // El JSON nunca llega a la pantalla: el usuario ve una tarjeta con lo que se va a crear.
      const ex=iaExtraerPropuesta(bruto,ws);
      let texto=ex.texto, propuesta=null;
      if(ex.aviso)texto=(texto?texto+'\n\n':'')+'⚠️ '+ex.aviso;
      /* Quien no puede crear productos no ve el botón. La seguridad de verdad está en
         POST /api/productos (que responde 403), pero enseñar un botón condenado a fallar
         es mala interfaz: se le dice por qué y se acabó. */
      const puedeCrear=!!(req.permisos&&(req.permisos.__admin||req.permisos.gestionar_productos===true));
      if(ex.propuesta&&!puedeCrear){
        texto+='\n\n⚠️ Te preparé la ficha, pero tu usuario no tiene permiso para crear productos. Pídeselo a quien administra el sistema.';
        ex.propuesta=null;
      }
      if(ex.propuesta){
        const accId=uid();
        db.prepare(`INSERT INTO ia_acciones(id,workspace_id,tipo,resumen,payload,estado,propuesto_por)
          VALUES(?,?,?,?,?,'propuesta',?)`)
          .run(accId,ws,ex.propuesta.tipo||'crear_producto',
               (ex.propuesta.titulo||(ex.propuesta.payload&&ex.propuesta.payload.nombre)||''),
               JSON.stringify(ex.propuesta.payload||{}),actorDe(req).nombre);
        propuesta={id:accId,...ex.propuesta};
      }
      // Se devuelve QUÉ se consultó: el usuario debe poder auditar de dónde salió la respuesta.
      res.json({respuesta:texto,propuesta,ms:Date.now()-t0,
        // Solo fuentes de DATOS. "te_piden_un_informe" es una bandera interna y aparecía
        // en el pie como si fuera algo que se hubiera consultado.
        consultado:Object.keys(ctx).filter(k=>k!=='_recortado'&&k!=='te_piden_un_informe'),
        proveedor:cfg.proveedor,modelo:cfg.modelo});
    }finally{ _iaOcupado.delete(ws); }
  }catch(e){ logError('POST /api/ia/preguntar',e); res.status(400).json({error:e.message}); }
});

// ── PRODUCTOS (fichas de producto) ──
app.get('/api/productos',(req,res)=>{
  const{q,activo}=req.query; let sql='SELECT * FROM fichas_producto WHERE workspace_id=? AND archivado=0'; const params=[req.wsId];
  if(q){sql+=' AND (nombre LIKE ? OR codigo LIKE ?)';params.push(`%${q}%`,`%${q}%`)}
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

// FASE E · CONDICIONES. Normaliza los tramos de tarifa por medida. Se guardan ya en número
// (desde/hasta/tarifa admiten decimales porque el eje 'area' se mide en m²: 0,5 · 2,25 …).
// Se descartan las filas sin tarifa: una condición sin tarifa no condiciona nada.
const EJES_COND=['cantidad','area'];
function condEje(v){ return EJES_COND.includes(v)?v:'cantidad'; }
function condJSON(arr){
  return JSON.stringify((arr||[]).map(c=>({
    desde:toFloatCO(c.desde)||0,
    hasta:definido(c.hasta)?toFloatCO(c.hasta):null,
    tarifa:toFloatCO(c.tarifa)||0
  })).filter(c=>c.tarifa>0));
}
/* SEGUNDA DIMENSIÓN · mismo modelo de tramos, pero el valor es un PORCENTAJE con signo:
   -15 = quince por ciento más barato · +10 = recargo. Se descarta el 0 (no ajusta nada) y por
   eso aquí NO se filtra por >0 como en condJSON: un ajuste válido es casi siempre negativo. */
function ajusteJSON(arr){
  return JSON.stringify((arr||[]).map(c=>({
    desde:toFloatCO(c.desde)||0,
    hasta:definido(c.hasta)?toFloatCO(c.hasta):null,
    ajuste:toPctCO(c.ajuste)||0
  })).filter(c=>c.ajuste!==0));
}
// FASE E · TARIFA BASE EFECTIVA. La tarifa base por medida es el respaldo para tamaños que
// caen fuera de toda condición. Si alguien llena SOLO las condiciones (de 1 a 100 → 80, …) y
// deja la base vacía, se toma la de la primera condición (la de menor 'desde'). Antes se exigía
// una base redundante y no dejaba guardar, aunque las condiciones ya cubrían todo el rango.
function hayCondFE(cond){ return (Array.isArray(cond)?cond:[]).some(c=>toFloatCO(c&&c.tarifa)>0); }
function primeraCondTarifa(cond){
  const arr=(Array.isArray(cond)?cond:[]).filter(c=>toFloatCO(c&&c.tarifa)>0);
  if(!arr.length)return '';
  let best=arr[0]; arr.forEach(c=>{ if((toFloatCO(c.desde)||0)<(toFloatCO(best.desde)||0))best=c; });
  return String(best.tarifa);
}
function tarifaBaseFE(tarifa,cond){
  return (definido(tarifa)&&toFloatCO(tarifa)>0)?tarifa:primeraCondTarifa(cond);
}
function cfJSON(b){
  return JSON.stringify((b.costos_fijos||[]).map(c=>({nombre:String(c.nombre||'').trim(),valor:c.valor||'',valor_calc:normCalc(c.valor)})));
}
function supJSON(b){
  return JSON.stringify((b.pliego_superficies||[]).map(s=>({nombre:String(s.nombre||'').trim(),piezas:Number.isInteger(s.piezas)?s.piezas:(parseInt(s.piezas,10)||0),precio:s.precio||'',precio_calc:normCalc(s.precio)})));
}
function extrasJSON(b){
  return JSON.stringify((b.pliego_extras||[]).map(e=>({nombre:String(e.nombre||'').trim(),valor:e.valor||'',valor_calc:normCalc(e.valor),tipo:['pieza','hoja','fijo'].includes(e.tipo)?e.tipo:'fijo'})));
}
function guardarVariantes(fichaId,variantes,wsId){
  db.prepare('DELETE FROM ficha_variantes WHERE ficha_id=?').run(fichaId);
  const insertarNodo=(v,parentId,i)=>{
    const id=v.id||uid();
    const costos=(v.costos||[]).map(c=>({nombre:String(c.nombre||'').trim(),valor:c.valor||'',valor_calc:normCalc(c.valor),lista_id:c.lista_id||'',item_id:c.item_id||'',columna:c.columna||''}));
    // A4 · 'fijo' = precio fijo directo (ningún modo marcado): la tarjeta queda compacta, sin
    // tramos. Para el cálculo se comporta igual que 'precio' (cae al mismo else en todas partes).
    const modoV=(v.modo==='hoja'||v.modo==='medidas'||v.modo==='fijo')?v.modo:'precio';
    // Si es por medidas y no pusieron tarifa base, se deriva de la 1.ª condición (ver tarifaBaseFE).
    const baseV=tarifaBaseFE(v.medida_tarifa,v.medida_cond);
    db.prepare('INSERT INTO ficha_variantes(id,ficha_id,workspace_id,parent_id,nombre,precio,precio_calc,tramos,costos,multi,modo,piezas,orden,informativa,medida_tarifa,medida_tarifa_calc,medida_minimo,medida_minimo_calc,medida_cond,medida_cond_eje,medida_ajuste,medida_ajuste_eje,medida_unidad,costo_medida_tarifa,costo_medida_tarifa_calc)VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
      .run(id,fichaId,wsId,parentId||'',String(v.nombre||'').trim(),v.precio||'',normCalc(v.precio),JSON.stringify(v.tramos||[]),JSON.stringify(costos),v.multi?1:0,modoV,Number.isInteger(v.piezas)?v.piezas:(parseInt(v.piezas,10)||null),i,v.informativa?1:0,String(baseV||''),normDecimal(baseV),String(v.medida_minimo||''),normDecimal(v.medida_minimo),condJSON(v.medida_cond),condEje(v.medida_cond_eje),ajusteJSON(v.medida_ajuste),condEje(v.medida_ajuste_eje),v.medida_unidad==='cm2'?'cm2':'m2',
           String(v.costo_medida_tarifa||''),normDecimal(v.costo_medida_tarifa));
    (v.hijos||[]).forEach((h,j)=>insertarNodo(h,id,j));
  };
  (variantes||[]).forEach((v,i)=>insertarNodo(v,'',i));
}
function arbolVariantes(filas){
  filas.forEach(v=>{
    try{v.costos=JSON.parse(v.costos||'[]')}catch(e){v.costos=[]}
    try{v.tramos=JSON.parse(v.tramos||'[]')}catch(e){v.tramos=[]}
    try{v.medida_cond=JSON.parse(v.medida_cond||'[]')}catch(e){v.medida_cond=[]}
    v.medida_cond_eje=condEje(v.medida_cond_eje);
    try{v.medida_ajuste=JSON.parse(v.medida_ajuste||'[]')}catch(e){v.medida_ajuste=[]}
    v.medida_ajuste_eje=condEje(v.medida_ajuste_eje);
    v.multi=!!v.multi;
    v.informativa=!!v.informativa;
    v.hijos=[];
  });
  const porId={}; filas.forEach(v=>porId[v.id]=v);
  const raiz=[];
  filas.forEach(v=>{
    if(v.parent_id&&porId[v.parent_id])porId[v.parent_id].hijos.push(v);
    else raiz.push(v);
  });
  return raiz;
}
function hojasVariantes(nodos){
  const out=[];
  (nodos||[]).forEach(n=>{
    if(n.hijos&&n.hijos.length)out.push(...hojasVariantes(n.hijos));
    else out.push(n);
  });
  return out;
}
app.post('/api/productos',requiere('gestionar_productos'),(req,res)=>{
  try{
    const b=req.body;
    if(!b.nombre)return res.status(400).json({error:'Nombre requerido'});
    const errores=validarFicha(b,req.wsId);
    if(errores.length)return res.status(400).json({error:errores.join('. ')});
    const baseFicha=tarifaBaseFE(b.medida_tarifa,b.medida_cond); // deriva base de la 1.ª condición si va vacía
    const id=uid();
    if(!String(b.codigo||'').trim()){const n=db.prepare('SELECT COUNT(*) c FROM fichas_producto WHERE workspace_id=?').get(req.wsId).c;b.codigo='P'+String(n+1).padStart(4,'0');}
    db.prepare(`INSERT INTO fichas_producto(id,workspace_id,nombre,codigo,categoria_id,tipo_precio,margen_tipo,margen_valor,precio_base,precio_base_calc,rangos,fecha_inicio,fecha_fin,cantidad_minima,descripcion,activo,stock_actual,stock_minimo,regla_lleva,regla_paga,combo_precio_modo,medida_unidad,medida_tarifa,medida_tarifa_calc,costos_fijos,cobro_minimo,cobro_minimo_calc,costo_medida_tarifa,costo_medida_tarifa_calc,costo_medida_minimo,costo_medida_minimo_calc,piezas_por_pliego,precio_pliego,precio_pliego_calc,pliego_superficies,pliego_extras,medida_cond,medida_cond_eje,medida_ajuste,medida_ajuste_eje)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
      .run(id,req.wsId,b.nombre.trim(),String(b.codigo||'').trim(),b.categoria_id||'',b.tipo_precio||'unitario',b.margen_tipo||'fijo',b.margen_valor||'',normVF(b.precio_base),normCalc(b.precio_base),JSON.stringify(b.rangos||[]),b.fecha_inicio||'',b.fecha_fin||'',b.cantidad_minima||'',b.descripcion||'',b.activo===false?0:1,Number.isInteger(b.stock_actual)?b.stock_actual:null,Number.isInteger(b.stock_minimo)?b.stock_minimo:null,Number.isInteger(b.regla_lleva)?b.regla_lleva:null,Number.isInteger(b.regla_paga)?b.regla_paga:null,b.combo_precio_modo||'global',b.medida_unidad||'m2',normVF(baseFicha),normDecimal(baseFicha),cfJSON(b),normVF(b.cobro_minimo),normCalc(b.cobro_minimo),normVF(b.costo_medida_tarifa),normDecimal(b.costo_medida_tarifa),normVF(b.costo_medida_minimo),normCalc(b.costo_medida_minimo),Number.isInteger(b.piezas_por_pliego)?b.piezas_por_pliego:null,normVF(b.precio_pliego),normCalc(b.precio_pliego),supJSON(b),extrasJSON(b),condJSON(b.medida_cond),condEje(b.medida_cond_eje),ajusteJSON(b.medida_ajuste),condEje(b.medida_ajuste_eje));
    guardarInsumos(id,b.insumos,req.wsId);
    guardarComposicion(id,b.componentes,req.wsId);
    guardarVariantes(id,b.variantes,req.wsId);
    db.prepare('UPDATE fichas_producto SET inventario_item_id=?,inventario_cantidad_consumida=? WHERE id=? AND workspace_id=?').run(b.inventario_item_id||'',b.inventario_cantidad_consumida!=null?String(b.inventario_cantidad_consumida):'',id,req.wsId);
    res.json(fichaCompleta(db.prepare('SELECT * FROM fichas_producto WHERE id=?').get(id)));
  }catch(e){logError('POST /api/productos',e);res.status(500).json({error:e.message})}
});

app.put('/api/productos/:id',requiere('gestionar_productos'),(req,res)=>{
  try{
    const b=req.body; const fid=req.params.id;
    const f=db.prepare('SELECT * FROM fichas_producto WHERE id=? AND workspace_id=?').get(fid,req.wsId);
    if(!f)return res.status(404).json({error:'No encontrado'});
    const errores=validarFicha(b,req.wsId,fid);
    if(errores.length)return res.status(400).json({error:errores.join('. ')});
    const baseFicha=tarifaBaseFE(b.medida_tarifa,b.medida_cond); // deriva base de la 1.ª condición si va vacía
    db.prepare(`UPDATE fichas_producto SET nombre=?,codigo=?,categoria_id=?,tipo_precio=?,margen_tipo=?,margen_valor=?,precio_base=?,precio_base_calc=?,rangos=?,fecha_inicio=?,fecha_fin=?,cantidad_minima=?,descripcion=?,activo=?,stock_actual=?,stock_minimo=?,regla_lleva=?,regla_paga=?,combo_precio_modo=?,medida_unidad=?,medida_tarifa=?,medida_tarifa_calc=?,costos_fijos=?,cobro_minimo=?,cobro_minimo_calc=?,costo_medida_tarifa=?,costo_medida_tarifa_calc=?,costo_medida_minimo=?,costo_medida_minimo_calc=?,piezas_por_pliego=?,precio_pliego=?,precio_pliego_calc=?,pliego_superficies=?,pliego_extras=?,medida_cond=?,medida_cond_eje=?,medida_ajuste=?,medida_ajuste_eje=? WHERE id=? AND workspace_id=?`)
      .run(b.nombre.trim(),String(b.codigo||'').trim(),b.categoria_id||'',b.tipo_precio||'unitario',b.margen_tipo||'fijo',b.margen_valor||'',normVF(b.precio_base),normCalc(b.precio_base),JSON.stringify(b.rangos||[]),b.fecha_inicio||'',b.fecha_fin||'',b.cantidad_minima||'',b.descripcion||'',b.activo===false?0:1,Number.isInteger(b.stock_actual)?b.stock_actual:null,Number.isInteger(b.stock_minimo)?b.stock_minimo:null,Number.isInteger(b.regla_lleva)?b.regla_lleva:null,Number.isInteger(b.regla_paga)?b.regla_paga:null,b.combo_precio_modo||'global',b.medida_unidad||'m2',normVF(baseFicha),normDecimal(baseFicha),cfJSON(b),normVF(b.cobro_minimo),normCalc(b.cobro_minimo),normVF(b.costo_medida_tarifa),normDecimal(b.costo_medida_tarifa),normVF(b.costo_medida_minimo),normCalc(b.costo_medida_minimo),Number.isInteger(b.piezas_por_pliego)?b.piezas_por_pliego:null,normVF(b.precio_pliego),normCalc(b.precio_pliego),supJSON(b),extrasJSON(b),condJSON(b.medida_cond),condEje(b.medida_cond_eje),ajusteJSON(b.medida_ajuste),condEje(b.medida_ajuste_eje),fid,req.wsId);
    if(b.insumos!==undefined)guardarInsumos(fid,b.insumos,req.wsId);
    if(b.componentes!==undefined)guardarComposicion(fid,b.componentes,req.wsId);
    if(b.variantes!==undefined)guardarVariantes(fid,b.variantes,req.wsId);
    if(b.inventario_item_id!==undefined||b.inventario_cantidad_consumida!==undefined)db.prepare('UPDATE fichas_producto SET inventario_item_id=?,inventario_cantidad_consumida=? WHERE id=? AND workspace_id=?').run(b.inventario_item_id||'',b.inventario_cantidad_consumida!=null?String(b.inventario_cantidad_consumida):'',fid,req.wsId);
    res.json(fichaCompleta(db.prepare('SELECT * FROM fichas_producto WHERE id=?').get(fid)));
  }catch(e){logError('PUT /api/productos/:id',e);res.status(500).json({error:e.message})}
});

app.delete('/api/productos/:id',requiere('gestionar_productos'),(req,res)=>{
  const r=db.prepare('DELETE FROM fichas_producto WHERE id=? AND workspace_id=?').run(req.params.id,req.wsId);
  if(r.changes===0)return res.status(404).json({error:'No encontrado'});
  res.json({ok:true});
});

/* Base de CÓDIGOS DE VENTA generados: es el registro rastreable de cada configuración que
   se ha vendido alguna vez. Un auditor puede pedir "qué es el P0010-03" y aquí está. */
app.get('/api/codigos-venta',(req,res)=>{
  try{
    const q=String(req.query.q||'').trim();
    let sql=`SELECT c.codigo,c.descripcion,c.usos,c.creado,c.ultimo_uso,c.ficha_id,f.nombre AS producto
      FROM codigos_venta c LEFT JOIN fichas_producto f ON f.id=c.ficha_id
      WHERE c.workspace_id=?`;
    const params=[req.wsId];
    if(q){ sql+=' AND (c.codigo LIKE ? OR c.descripcion LIKE ? OR f.nombre LIKE ?)'; params.push(bLike(q),bLike(q),bLike(q)); }
    sql+=' ORDER BY c.ultimo_uso DESC LIMIT 200';
    res.json({codigos:db.prepare(sql).all(...params)});
  }catch(e){logError('GET /api/codigos-venta',e);res.status(500).json({error:e.message})}
});
/* Histórico de UN código: en qué pedidos se vendió. Es lo que responde "muéstrame todo lo
   que se facturó como P0030-01". El valor solo se incluye si quien pregunta ve dinero. */
app.get('/api/codigos-venta/:codigo/usos',(req,res)=>{
  try{
    const cod=String(req.params.codigo||'').trim();
    if(!cod)return res.json({codigo:'',usos:[]});
    const filas=db.prepare(`SELECT p.ref, p.nombre AS cliente, p.fecha_pedido, p.entregado, p.cancelado,
        i.cantidad, i.detalle, i.valor_unitario_calc AS unit
      FROM enc_items i JOIN encargos e ON e.id=i.encargo_id JOIN pedidos p ON p.id=e.pedido_id
      WHERE i.workspace_id=? AND i.codigo_venta=? AND p.archivado=0
      ORDER BY p.fecha_pedido DESC, p.creado DESC LIMIT 100`).all(req.wsId,cod);
    const dinero=iaVeDinero(req.permisos);
    res.json({codigo:cod, usos:filas.map(f=>{
      const o={ref:f.ref, cliente:f.cliente, fecha:f.fecha_pedido||'', cantidad:f.cantidad||'',
        detalle:f.detalle||'', estado:f.cancelado?'Cancelado':(f.entregado?'Entregado':'Activo')};
      if(dinero)o.valor_unitario=toNum(f.unit);
      return o;
    })});
  }catch(e){logError('GET /api/codigos-venta/:codigo/usos',e);res.status(500).json({error:e.message})}
});

// ── ÍTEMS DE INVENTARIO (CORR 003/005: inventario separado del producto) ──
app.get('/api/inventario-items',(req,res)=>{
  res.json(db.prepare('SELECT * FROM items_inventario WHERE workspace_id=? ORDER BY nombre').all(req.wsId));
});
app.post('/api/inventario-items',requiere('gestionar_inventario'),(req,res)=>{
  const b=req.body||{};
  if(!b.nombre||!String(b.nombre).trim())return res.status(400).json({error:'Nombre requerido'});
  const id=uid();
  const sa=(b.stock_actual===''||b.stock_actual==null)?null:Number(b.stock_actual);
  const sm=(b.stock_minimo===''||b.stock_minimo==null)?null:Number(b.stock_minimo);
  db.prepare('INSERT INTO items_inventario(id,workspace_id,nombre,descripcion,unidad_medida,stock_actual,stock_minimo,activo)VALUES(?,?,?,?,?,?,?,?)')
    .run(id,req.wsId,String(b.nombre).trim(),b.descripcion||'',b.unidad_medida||'unidad',Number.isFinite(sa)?sa:null,Number.isFinite(sm)?sm:null,b.activo===0?0:1);
  res.json(db.prepare('SELECT * FROM items_inventario WHERE id=?').get(id));
});
app.put('/api/inventario-items/:id',requiere('gestionar_inventario'),(req,res)=>{
  const b=req.body||{};
  const ex=db.prepare('SELECT * FROM items_inventario WHERE id=? AND workspace_id=?').get(req.params.id,req.wsId);
  if(!ex)return res.status(404).json({error:'No encontrado'});
  const sa=(b.stock_actual===''||b.stock_actual==null)?null:Number(b.stock_actual);
  const sm=(b.stock_minimo===''||b.stock_minimo==null)?null:Number(b.stock_minimo);
  db.prepare('UPDATE items_inventario SET nombre=?,descripcion=?,unidad_medida=?,stock_actual=?,stock_minimo=?,activo=? WHERE id=? AND workspace_id=?')
    .run(b.nombre!=null?String(b.nombre).trim():ex.nombre,b.descripcion!=null?b.descripcion:ex.descripcion,b.unidad_medida||ex.unidad_medida,b.stock_actual!==undefined?(Number.isFinite(sa)?sa:null):ex.stock_actual,b.stock_minimo!==undefined?(Number.isFinite(sm)?sm:null):ex.stock_minimo,b.activo===0?0:1,req.params.id,req.wsId);
  res.json(db.prepare('SELECT * FROM items_inventario WHERE id=?').get(req.params.id));
});
app.delete('/api/inventario-items/:id',requiere('gestionar_inventario'),(req,res)=>{
  db.prepare("UPDATE fichas_producto SET inventario_item_id='' WHERE inventario_item_id=? AND workspace_id=?").run(req.params.id,req.wsId);
  const r=db.prepare('DELETE FROM items_inventario WHERE id=? AND workspace_id=?').run(req.params.id,req.wsId);
  if(r.changes===0)return res.status(404).json({error:'No encontrado'});
  res.json({ok:true});
});

app.delete('/api/clientes/:id',requiere('editar_clientes'),(req,res)=>{ // Fase 7: borrado definitivo solo roles autorizados (el flujo normal es archivar)
  const r=db.prepare('DELETE FROM clientes WHERE id=? AND workspace_id=?').run(req.params.id,req.wsId);
  if(r.changes===0)return res.status(404).json({error:'No encontrado'});
  res.json({ok:true});
});
// ── ARCHIVO (Archivar en vez de eliminar) ──
const ARCH_TABLAS={pedido:'pedidos',cliente:'clientes',producto:'fichas_producto'};
app.post('/api/archivar',(req,res)=>{
  const{tipo,id}=req.body||{}; const tabla=ARCH_TABLAS[tipo];
  if(!tabla||!id)return res.status(400).json({error:'Tipo o id inválido'});
  if(tipo==='pedido'){const p=db.prepare('SELECT stock_consumido FROM pedidos WHERE id=? AND workspace_id=?').get(id,req.wsId);if(p&&p.stock_consumido){restaurarStock(p.stock_consumido,req.wsId);db.prepare('UPDATE pedidos SET stock_consumido=NULL WHERE id=?').run(id);}}
  const r=db.prepare(`UPDATE ${tabla} SET archivado=1 WHERE id=? AND workspace_id=?`).run(id,req.wsId);
  if(r.changes===0)return res.status(404).json({error:'No encontrado'});
  res.json({ok:true});
});
app.post('/api/restaurar',(req,res)=>{
  const{tipo,id}=req.body||{}; const tabla=ARCH_TABLAS[tipo];
  if(!tabla||!id)return res.status(400).json({error:'Tipo o id inválido'});
  const r=db.prepare(`UPDATE ${tabla} SET archivado=0 WHERE id=? AND workspace_id=?`).run(id,req.wsId);
  if(r.changes===0)return res.status(404).json({error:'No encontrado'});
  if(tipo==='pedido'){const p=db.prepare('SELECT * FROM pedidos WHERE id=? AND workspace_id=?').get(id,req.wsId);if(p&&!p.es_cotizacion&&!p.cancelado){const consumo=descontarStock(id,req.wsId);db.prepare('UPDATE pedidos SET stock_consumido=? WHERE id=?').run(JSON.stringify(consumo),id);}}
  res.json({ok:true});
});
app.get('/api/archivo',(req,res)=>{
  res.json({
    pedidos:db.prepare('SELECT id,ref,nombre,fecha_pedido,valor_final FROM pedidos WHERE workspace_id=? AND archivado=1 ORDER BY creado DESC').all(req.wsId),
    clientes:db.prepare('SELECT id,nombre,tel FROM clientes WHERE workspace_id=? AND archivado=1 ORDER BY nombre').all(req.wsId),
    productos:db.prepare('SELECT id,nombre,codigo FROM fichas_producto WHERE workspace_id=? AND archivado=1 ORDER BY nombre').all(req.wsId)
  });
});

app.get('*',(req,res)=>res.sendFile(path.join(__dirname,'public','index.html')));
app.listen(PORT,()=>console.log(`✅ GRAFÍA Studio en http://localhost:${PORT}`));
