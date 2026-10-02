// Tarea 9 · regresión funcional de punta a punta con la piel nueva (por la INTERFAZ, no solo por la API)
const { abrir, vista, foto, token, BASE } = require('./pw.js');
const fs = require('fs'), path = require('path');
const apiN = async (tk, m, p, b) => {
  if (!tk) throw new Error('token vacío: la prueba no puede caer al de admin');
  const r = await fetch(BASE + '/api' + p, { method: m, headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + tk }, body: b ? JSON.stringify(b) : undefined });
  return { st: r.status, j: await r.json().catch(() => ({})) };
};
(async () => {
  const res = [], ok = (n, c, d) => { res.push((c ? '  ok   ' : ' FALLA ') + n + (d !== undefined && d !== '' ? '  → ' + d : '')); return c; };
  // La prueba cambia colores e intensidad del negocio: se guarda lo que había y se restaura al final
  const tk0 = await token(); const CFG0 = (await apiN(tk0, 'GET', '/configuracion')).j;
  const { b, page, errores } = await abrir();
  page.on('dialog', d => d.accept());
  const NOM = 'ZZ prueba piel ' + Date.now().toString().slice(-5);
  // 1 · crear un pedido con dos ítems por el editor
  await vista(page, 'pedidos');
  await page.evaluate(() => abrirNuevo()); await page.waitForTimeout(700);
  ok('Nuevo pedido abre el editor', await page.evaluate(() => document.getElementById('ovP').classList.contains('open')));
  await page.fill('#f-nom', NOM);
  await page.evaluate(() => {
    if (!fEnc.length) addEnc();
    const e = fEnc[0]; if (!e.items.length) addItem(e.id); addItem(e.id);
    setItem(e.id, e.items[0].id, 'cantidad', '3'); setItem(e.id, e.items[0].id, 'detalle', 'ZZ camisetas'); setItem(e.id, e.items[0].id, 'valor_unitario', '20000');
    setItem(e.id, e.items[1].id, 'cantidad', '1'); setItem(e.id, e.items[1].id, 'detalle', 'ZZ pendón'); setItem(e.id, e.items[1].id, 'valor_unitario', '40000');
    renderEncs(); actualizarValorTotal();
  });
  await foto(page, 't9-nuevo');
  await page.evaluate(() => guardar()); await page.waitForTimeout(1600);
  const tk = await token();
  let ped = (await apiN(tk, 'GET', '/pedidos')).j.find(p => p.nombre === NOM);
  ok('el pedido se guarda', !!ped, ped && ('#' + ped.ref));
  const det = ped && (await apiN(tk, 'GET', '/pedidos/' + ped.id)).j;
  const items = det ? (det.encargos || []).flatMap(e => e.items || []) : [];
  ok('con sus dos ítems y su valor', items.length === 2 && det.valor_total === 100000, items.length + ' ítems · ' + (det && det.valor_total));
  // 2 · editarlo y registrar un abono
  await page.evaluate(id => abrirEditar(id), ped.id); await page.waitForTimeout(1200);
  await page.evaluate(() => { addPago(); const p = fPag[fPag.length - 1]; setPagVal(p.id, 'monto', '30000'); renderPagos(); });
  await page.fill('#f-motivo', 'ZZ prueba de la piel');
  await foto(page, 't9-abono');
  await page.evaluate(() => guardar()); await page.waitForTimeout(1600);
  const det2 = (await apiN(tk, 'GET', '/pedidos/' + ped.id)).j;
  const pagado = (det2.pagos || []).reduce((a, p) => a + (+p.monto_calc || 0), 0);
  ok('el abono queda registrado', pagado === 30000, pagado);
  // 3 · PDF del pedido
  await page.evaluate(id => abrirEditar(id), ped.id); await page.waitForTimeout(1200);
  const pdf = await page.evaluate(async () => { const r = await construirPdfPedido(); if (!r) return null; const u = new Uint8Array(r.doc.output('arraybuffer')); let s = ''; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000)); return { nombre: r.filename, b64: btoa(s) }; });
  ok('el PDF se genera', !!pdf && pdf.b64.length > 4000, pdf && (pdf.nombre + ' · ' + Math.round(pdf.b64.length * .75 / 1024) + ' KB'));
  if (pdf) fs.writeFileSync(path.join(__dirname, 'cap', 't9-pedido.pdf'), Buffer.from(pdf.b64, 'base64'));
  await page.evaluate(() => cerrar());
  // 4 · mover un ítem en Producción
  await vista(page, 'produccion'); await page.waitForTimeout(800);
  const mov = await page.evaluate(async ref => { const c = PROD_CARDS.find(x => String(x.ref) === String(ref) && x.item_id); if (!c) return null; const sig = ENC_ESTS[1]; await api('PUT', '/produccion/encargo/' + c.encargo_id, { responsable_id: ME.id, notas_tec: 'ZZ observación de prueba' }); await prodSetEstadoCard(prodKey(c), sig, ''); return { item: c.item_id, sig }; }, ped.ref);
  await page.waitForTimeout(700);
  const det3 = (await apiN(tk, 'GET', '/pedidos/' + ped.id)).j;
  const est = mov && (det3.encargos || []).flatMap(e => e.items || []).find(i => i.id === mov.item);
  ok('mover un ítem en Producción cambia su estado', !!est && est.estado === mov.sig, est && est.estado);
  await foto(page, 't9-produccion');
  // 5 · el asistente se abre, escribe y pinta respuestas (sin llamar al proveedor externo)
  await page.evaluate(() => iaAbrir()); await page.waitForTimeout(400);
  await page.fill('#ia-pregunta', '¿Qué entrego esta semana?');
  await page.evaluate(() => { IA_HIST.push({ rol: 'usuario', texto: '¿Qué entrego esta semana?' }, { rol: 'asistente', texto: 'Esta semana entregas **1 pedido**: el #0000 de ZZ.' }); renderIaChat(); });
  const ia = await page.evaluate(() => ({ abierto: document.getElementById('ovIA').classList.contains('open'), burbujas: document.querySelectorAll('#ia-chat .ia-burbuja').length }));
  ok('Coralyne/asistente: abre y pinta la conversación', ia.abierto && ia.burbujas >= 2, JSON.stringify(ia));
  await foto(page, 't9-asistente');
  await page.evaluate(() => { IA_HIST = []; iaCerrar(); });
  // 6 · cambiar colores en Configuración, guardar y volver a fábrica
  await vista(page, 'configuracion');
  await page.evaluate(() => { cfgColorCambio('primario', '#5A2D82'); cfgColorCambio('acento', '#E0762B'); });
  await page.evaluate(() => guardarConfiguracion()); await page.waitForTimeout(900);
  const c1 = (await apiN(tk, 'GET', '/configuracion')).j;
  ok('colores propios: se guardan', c1.color_primario.toUpperCase() === '#5A2D82' && c1.color_acento.toUpperCase() === '#E0762B');
  const brand = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--brand').trim().toUpperCase());
  ok('colores propios: la app los usa', brand === '#5A2D82', brand);
  await vista(page, 'dashboard'); await foto(page, 't9-colores-propios');
  await vista(page, 'configuracion'); await page.evaluate(() => cfgColoresFabrica()); await page.evaluate(() => guardarConfiguracion()); await page.waitForTimeout(900);
  const c2 = (await apiN(tk, 'GET', '/configuracion')).j;
  ok('volver a fábrica: Coral Line', c2.color_primario === '#0A2E3B' && c2.color_acento === '#118AA0' && c2.piel_intensidad === 60);
  const rest = await apiN(tk, 'PUT', '/configuracion', { color_primario: CFG0.color_primario, color_acento: CFG0.color_acento, piel_intensidad: CFG0.piel_intensidad, banner_texto: CFG0.banner_texto });
  ok('configuración del negocio restaurada como estaba', rest.st === 200 && rest.j.color_primario === CFG0.color_primario && rest.j.piel_intensidad === CFG0.piel_intensidad, CFG0.color_primario + ' ' + CFG0.color_acento + ' ' + CFG0.piel_intensidad);
  // 7 · archivar el pedido de prueba (por la interfaz)
  await page.evaluate(id => abrirEditar(id), ped.id); await page.waitForTimeout(1100);
  await page.evaluate(() => archivarPed()); await page.waitForTimeout(1200);
  const vivo = (await apiN(tk, 'GET', '/pedidos')).j.find(p => p.id === ped.id);
  ok('archivar desde el editor', !vivo);
  ok('sin errores de consola en todo el recorrido', errores.length === 0, errores.slice(0, 4).join(' | '));
  await b.close();
  // 8 · rol limitado con SU PROPIO token
  const roles = (await apiN(tk, 'GET', '/roles')).j;
  const vend = (Array.isArray(roles) ? roles : roles.roles || []).find(r => !r.es_admin);
  const usuario = 'zzpiel' + Date.now();
  const cr = await apiN(tk, 'POST', '/usuarios', { usuario, nombre: 'ZZ Piel', pass: 'zz1234', rol_id: vend.id });
  ok('crear usuario de prueba con rol ' + vend.nombre, cr.st === 200, cr.st + ' ' + (cr.j.error || ''));
  const lg = await fetch(BASE + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ usuario, pass: 'zz1234' }) }).then(r => r.json());
  ok('el usuario limitado obtiene SU token', !!lg.token);
  if (lg.token) {
    const s2 = await abrir({ cred: { usuario, pass: 'zz1234' } });
    const vis = await s2.page.evaluate(() => [...document.querySelectorAll('.sidebar .nav-item[data-view]')].filter(e => getComputedStyle(e).display !== 'none').map(e => e.dataset.view));
    ok('rol limitado: no ve Configuración ni Costos', !vis.includes('configuracion') && !vis.includes('costos'), vis.join(','));
    await vista(s2.page, 'pedidos'); await foto(s2.page, 't9-rol-limitado');
    ok('rol limitado: sin errores de consola', s2.errores.length === 0, s2.errores.slice(0, 3).join(' | '));
    await s2.b.close();
  }
  if (cr.j && cr.j.id) await apiN(tk, 'DELETE', '/usuarios/' + cr.j.id);
  console.log(res.join('\n'));
  console.log(JSON.stringify({ pedido: ped && ped.id, usuario }));
  process.exit(res.some(r => r.startsWith(' FALLA')) ? 1 : 0);
})().catch(e => { console.error('FALLO', e.stack || e.message); process.exit(1); });
