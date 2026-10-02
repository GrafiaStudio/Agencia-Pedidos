// Prueba del lote de servidor del barrido (local). Crea un rol y un usuario «ZZ»/«zzpiel…» y los quita.
const zlib = require('zlib');
const BASE = 'http://127.0.0.1:3000';
let bien = 0, mal = 0;
const ok = (n, c, d) => { c ? bien++ : mal++; console.log((c ? '  ok   ' : ' FALLA ') + n + (d !== undefined ? '  → ' + (typeof d === 'string' ? d : JSON.stringify(d)) : '')); };
const crudo = (ruta, hd = {}) => new Promise((res, rej) => require('http').get(BASE + ruta, { headers: hd }, r => { const b = []; r.on('data', c => b.push(c)); r.on('end', () => res({ st: r.statusCode, h: r.headers, body: Buffer.concat(b) })); }).on('error', rej));
const api = async (tk, met, ruta, body) => { const r = await fetch(BASE + '/api' + ruta, { method: met, headers: { 'Content-Type': 'application/json', ...(tk ? { Authorization: 'Bearer ' + tk } : {}) }, body: body ? JSON.stringify(body) : undefined }); let j = null; try { j = await r.json(); } catch (e) {} return { st: r.status, j }; };
(async () => {
  // compresión de la app
  const sin = await crudo('/'), gz = await crudo('/', { 'accept-encoding': 'gzip' }), br = await crudo('/', { 'accept-encoding': 'gzip, br' });
  ok('la app sin compresión sigue saliendo', sin.st === 200 && !sin.h['content-encoding'] && sin.body.length > 600000, sin.body.length + ' bytes');
  ok('con gzip', gz.h['content-encoding'] === 'gzip' && zlib.gunzipSync(gz.body).equals(sin.body), Math.round(gz.body.length / 1024) + ' KB');
  ok('con brotli', br.h['content-encoding'] === 'br' && zlib.brotliDecompressSync(br.body).equals(sin.body), Math.round(br.body.length / 1024) + ' KB (antes ' + Math.round(sin.body.length / 1024) + ' KB)');
  const r304 = await crudo('/', { 'if-none-match': br.h.etag, 'accept-encoding': 'br' });
  ok('si no cambió responde 304 (no se vuelve a descargar)', r304.st === 304 && r304.body.length === 0, br.h.etag);
  ok('cabeceras: noindex, nosniff, sin marco', sin.h['x-robots-tag'] === 'noindex, nofollow' && sin.h['x-content-type-options'] === 'nosniff' && sin.h['x-frame-options'] === 'DENY');
  const hsts = await crudo('/', { 'x-forwarded-proto': 'https' });
  ok('HSTS solo cuando llega por https', !!hsts.h['strict-transport-security'] && !sin.h['strict-transport-security']);
  // rutas
  const rb = await crudo('/robots.txt'); ok('robots.txt real', rb.st === 200 && /text\/plain/.test(rb.h['content-type']) && /Disallow: \//.test(rb.body.toString()), rb.body.toString().replace(/\n/g, ' '));
  for (const p of ['/uploads/no-existe.png', '/.env', '/server.js', '/db/agencia.db', '/package.json', '/manifest.json', '/sitemap.xml']) { const r = await crudo(p); ok('404 para ' + p, r.st === 404 && r.body.length < 100, r.st + ' ' + r.body.length + 'b'); }
  const nav = await crudo('/pedidos'); ok('una ruta de navegación sí carga la app', nav.st === 200 && /text\/html/.test(nav.h['content-type']) && nav.body.length > 600000);
  const f = await crudo('/fonts/OstrichSans-Heavy.woff2'); ok('la fuente se guarda en caché', f.st === 200 && /max-age=604800/.test(f.h['cache-control'] || ''), f.h['cache-control']);
  // sesión de admin
  const tk = (await api(null, 'POST', '/auth/login', { pin: '1234' })).j.token; ok('ingreso con PIN', !!tk);
  const ne = await api(tk, 'GET', '/no-existe'); ok('ruta de API inexistente → 404 JSON', ne.st === 404 && ne.j && !!ne.j.error, ne);
  const pj = await crudo('/api/pedidos', { authorization: 'Bearer ' + tk, 'accept-encoding': 'gzip' });
  const peds = JSON.parse(zlib.gunzipSync(pj.body).toString());
  ok('JSON grande viaja comprimido y se lee igual', pj.h['content-encoding'] === 'gzip' && Array.isArray(peds) && peds.length > 0, Math.round(pj.body.length / 1024) + ' KB comprimido · ' + peds.length + ' pedidos');
  const chico = await crudo('/api/app-info', { authorization: 'Bearer ' + tk, 'accept-encoding': 'gzip' }); ok('JSON chico va sin comprimir', !chico.h['content-encoding'] && JSON.parse(chico.body.toString()).nombre === 'CORAL LINE');
  // subidas: un .html y un .svg no pueden ejecutar código
  const ped = peds.find(p => !p.cerrado && p.pagos.length) || peds.find(p => !p.cerrado);
  const sube = async (nombre, tipo, txt) => { const fd = new FormData(); fd.append('files', new Blob([txt], { type: tipo }), nombre); const r = await fetch(BASE + `/api/pedidos/${ped.id}/archivos`, { method: 'POST', headers: { Authorization: 'Bearer ' + tk }, body: fd }); return (await r.json())[0]; };
  const aH = await sube('ZZ prueba <x>.HTML', 'text/html', '<script>alert(1)</script>'), aS = await sube('zz.svg', 'image/svg+xml', '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
  const gH = await crudo(aH.ruta), gS = await crudo(aS.ruta);
  ok('.html subido: se descarga, no se abre, y va en caja de arena', /attachment/.test(gH.h['content-disposition'] || '') && /sandbox/.test(gH.h['content-security-policy'] || '') && /\.html$/.test(aH.ruta), aH.ruta + ' · ' + gH.h['content-disposition']);
  ok('.svg subido: se ve como imagen pero en caja de arena', !gS.h['content-disposition'] && /sandbox/.test(gS.h['content-security-policy'] || '') && /max-age=2592000/.test(gS.h['cache-control'] || ''), gS.h['cache-control']);
  const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
  const fdp = new FormData(); fdp.append('files', new Blob([PNG], { type: 'image/png' }), 'zz.PNG');
  const aP = (await (await fetch(BASE + `/api/pedidos/${ped.id}/archivos`, { method: 'POST', headers: { Authorization: 'Bearer ' + tk }, body: fdp })).json())[0];
  const gP = await crudo(aP.ruta);
  ok('una foto se sirve tal cual (sin caja de arena ni descarga forzada)', gP.st === 200 && /image\/png/.test(gP.h['content-type']) && !gP.h['content-security-policy'] && !gP.h['content-disposition'] && /\.png$/.test(aP.ruta), aP.ruta);
  for (const a of [aH, aS, aP]) await api(tk, 'DELETE', '/archivos/' + a.id);
  ok('archivos de prueba borrados', (await crudo(aH.ruta)).st === 404 && (await crudo(aS.ruta)).st === 404);
  const fdl = new FormData(); fdl.append('logo', new Blob(['no soy imagen'], { type: 'text/html' }), 'x.html');
  const lg = await fetch(BASE + '/api/configuracion/logo', { method: 'POST', headers: { Authorization: 'Bearer ' + tk }, body: fdl });
  ok('el logo solo acepta imágenes', lg.status === 400, lg.status);
  // permisos: rol sin «registrar pagos» ni «editar clientes»
  const rol = (await api(tk, 'POST', '/roles', { nombre: 'ZZ barrido', permisos: { crear_pedidos: true, editar_pedidos: true } })).j;
  const usuario = 'zzpiel' + Date.now();
  const us = (await api(tk, 'POST', '/usuarios', { usuario, nombre: 'ZZ Barrido', pass: 'zz1234', rol_id: rol.id })).j;
  const tl = (await api(null, 'POST', '/auth/login', { usuario, pass: 'zz1234' })).j.token;
  ok('usuario limitado obtiene SU token', !!tl && tl !== tk);
  const cli = (await api(tk, 'GET', '/clientes')).j[0];
  const a1 = await api(tl, 'POST', '/archivar', { tipo: 'cliente', id: cli.id }); ok('sin «editar clientes» no puede archivar un cliente', a1.st === 403, a1.st);
  const a2 = await api(tl, 'POST', '/archivar', { tipo: 'producto', id: 'x' }); ok('sin «gestionar productos» no puede archivar un producto', a2.st === 403, a2.st);
  const a3 = await api(tl, 'POST', '/restaurar', { tipo: 'cliente', id: cli.id }); ok('ni restaurar', a3.st === 403, a3.st);
  ok('el cliente sigue activo', (await api(tk, 'GET', '/clientes')).j.some(c => c.id === cli.id));
  const p0 = (await api(tk, 'GET', '/pedidos/' + ped.id)).j, n0 = p0.pagos.length;
  const cuerpo = { ...p0, pagos: [...p0.pagos, { id: 'zz', monto: '999999', fecha: p0.fecha_pedido, tipo: 'efectivo', nota: 'ZZ no debería entrar' }], pagos_nuevos: [{ monto: '999999', forma: 'efectivo' }] };
  const e1 = await api(tl, 'PUT', '/pedidos/' + ped.id, cuerpo);
  const p1 = (await api(tk, 'GET', '/pedidos/' + ped.id)).j;
  ok('sin «registrar pagos»: guardar el pedido NO agrega abonos', e1.st === 200 && p1.pagos.length === n0 && !p1.pagos.some(x => /ZZ/.test(x.nota || '')), { st: e1.st, antes: n0, despues: p1.pagos.length });
  ok('y tampoco los borra', p1.pagos.length === n0 && JSON.stringify(p1.pagos.map(x => x.monto)) === JSON.stringify(p0.pagos.map(x => x.monto)));
  ok('los costos del pedido quedan igual', p1.costos.length === p0.costos.length);
  const e2 = await api(tk, 'PUT', '/pedidos/' + ped.id, p0); ok('el admin sigue pudiendo guardar con sus pagos', e2.st === 200 && e2.j.pagos.length === n0, e2.st);
  // límite de intentos: falsear la primera parte de x-forwarded-for ya no lo salta
  let ult = 0; for (let i = 0; i < 9; i++) { const r = await fetch(BASE + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': `10.${i}.${i}.${i}, 9.9.9.9` }, body: JSON.stringify({ pin: '00' + (10 + i) + 'x' }) }); ult = r.status; }
  ok('8 PIN malos → bloqueado aunque se falsee la cabecera', ult === 429, ult);
  const libre = await api(null, 'POST', '/auth/login', { pin: '1234' }); ok('otro origen sigue entrando', !!libre.j.token, libre.st);
  // limpieza
  await api(tk, 'DELETE', '/usuarios/' + us.id); const dr = await api(tk, 'DELETE', '/roles/' + rol.id);
  console.log('   limpieza: rol', dr.st, dr.j && dr.j.error || '');
  console.log(`\n${bien} ok · ${mal} fallas`);
})().catch(e => { console.error('ERROR', e); process.exit(2); });
