// Canario de escapado: crea en LOCAL datos «ZZ …» cuyo texto trae una etiqueta HTML marcada y comillas,
// recorre las pantallas y cuenta dónde esa etiqueta llega viva al DOM (= texto sin escapar). Borra lo creado.
const { abrir, vista, token, BASE } = require('./pw.js');
const C = t => `ZZ ${t} <i data-xss="${t}">x</i> 24"x36" O'Hara`;
(async () => {
  const tk = await token();
  const api = async (met, ruta, body) => { const r = await fetch(BASE + '/api' + ruta, { method: met, headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + tk }, body: body ? JSON.stringify(body) : undefined }); let j = null; try { j = await r.json(); } catch (e) {} if (r.status >= 400) console.log('   !', met, ruta, r.status, j && j.error); return j; };
  const creado = { pedidos: [], clientes: [], productos: [], notas: [], inv: [], eventos: [] };
  try {
    const hoy = new Date().toISOString().slice(0, 10);
    const ped = await api('POST', '/pedidos', { nombre: C('cli'), tel: '3000000001', cli_nit: C('nit'), cli_email: C('email'), cli_direccion: C('dir'), cli_contacto: C('contacto'), notas: C('notas'), fecha_entrega: hoy,
      encargos: [{ numero: 1, anotacion: C('anot'), categorias: [], items: [{ cantidad: '2', detalle: C('det'), valor_unitario: '1000', nota: C('itemnota'), estado: 'Nuevo' }] }],
      pagos: [{ monto: '500', fecha: hoy, tipo: 'efectivo', nota: C('pagonota') }], pagos_nuevos: [], costos: [{ descripcion: C('costo'), cantidad: '1', valor_unitario: '100', monto: '100' }] });
    if (ped && ped.id) { creado.pedidos.push(ped.id); if (ped.cliente_id) creado.clientes.push(ped.cliente_id); }
    const prod = await api('POST', '/productos', { nombre: C('prod'), tipo_precio: 'unitario', precio: '1000', categoria: '', activo: 1, insumos: [{ nombre_insumo: C('insumo'), proveedor: C('prov'), cantidad_usada: '1', unidad_medida: 'un', costo_unitario: '100' }] });
    if (prod && prod.id) creado.productos.push(prod.id);
    const nota = await api('POST', '/bitacora/notas', { titulo: C('bit'), contenido: C('bitc') }); if (nota && nota.id) creado.notas.push(nota.id);
    const inv = await api('POST', '/inventario-items', { nombre: C('inv'), unidad: 'u"n', stock_actual: 5, stock_minimo: 1 }); if (inv && inv.id) creado.inv.push(inv.id);
    const ev = await api('POST', '/eventos', { titulo: C('ev'), tipo: 'recordatorio', fecha: hoy, hora: '09:00', pedido_id: ped && ped.id, notas: C('evn') }); if (ev && ev.id) creado.eventos.push(ev.id);
    console.log('creado:', JSON.stringify(Object.fromEntries(Object.entries(creado).map(([k, v]) => [k, v.length]))));

    const { b, page, errores } = await abrir({ ancho: 1920, alto: 950 });
    const vivo = {}; const mira = async donde => { const r = await page.evaluate(() => [...document.querySelectorAll('[data-xss]')].map(e => e.getAttribute('data-xss') + '@' + (e.parentElement.className || e.parentElement.tagName).toString().split(' ')[0])); if (r.length) vivo[donde] = [...new Set(r)]; };
    const cierra = () => page.evaluate(() => document.querySelectorAll('.overlay.open').forEach(o => o.classList.remove('open')));
    for (const v of ['dashboard', 'pedidos', 'clientes', 'registros', 'productos', 'costos', 'produccion', 'inventario', 'bitacora']) { await vista(page, v); await page.waitForTimeout(500); await mira(v); }
    await vista(page, 'registros'); for (const t of ['ventas', 'costos', 'utilidades', 'ingresos', 'saldos']) { await page.evaluate(t => { try { showReg(t); } catch (e) {} }, t); await page.waitForTimeout(350); await mira('registros-' + t); }
    await vista(page, 'produccion'); for (const t of ['lista', 'calendario', 'cronograma', 'agenda', 'metricas']) { await page.evaluate(t => prodSetVista(t), t); await page.waitForTimeout(450); await mira('prod-' + t); }
    await page.evaluate(() => prodSetVista('kanban')); await vista(page, 'costos'); for (const t of ['proveedor', 'categoria', 'listas']) { await page.evaluate(t => { try { costosSetVista(t); } catch (e) {} }, t); await page.waitForTimeout(350); await mira('costos-' + t); }
    await vista(page, 'pedidos');
    if (creado.pedidos[0]) { await page.evaluate(id => abrirEditar(id), creado.pedidos[0]); await page.waitForTimeout(1300); await mira('editor-pedido');
      const campos = await page.evaluate(() => [...document.querySelectorAll('#ovP input, #ovP textarea')].map(i => i.value).filter(v => /^ZZ /.test(v)).map(v => ({ ok: /24"x36" O'Hara$/.test(v), v: v.slice(0, 26) })));
      console.log('editor de pedido · campos con el texto completo:', campos.filter(c => c.ok).length, 'de', campos.length, campos.filter(c => !c.ok).map(c => c.v));
      await page.evaluate(() => { try { document.querySelectorAll('#ovP .tab,#ovP [onclick*="Resumen"],#ovP [onclick*="historial"]').forEach(x => x.click()); } catch (e) {} }); await page.waitForTimeout(400); await mira('editor-pedido-resumen'); await cierra(); }
    if (creado.clientes[0]) { await page.evaluate(id => verCli(id), creado.clientes[0]); await page.waitForTimeout(900); await mira('cliente'); await cierra(); }
    if (creado.productos[0]) { await page.evaluate(id => abrirEditarProducto(id), creado.productos[0]); await page.waitForTimeout(1200); await mira('editor-producto');
      const campos = await page.evaluate(() => [...document.querySelectorAll('#ovProd input, #ovProd textarea')].map(i => i.value).filter(v => /^ZZ /.test(v)).map(v => ({ ok: /24"x36" O'Hara$/.test(v), v: v.slice(0, 26) })));
      console.log('editor de producto · campos con el texto completo:', campos.filter(c => c.ok).length, 'de', campos.length, campos.filter(c => !c.ok).map(c => c.v)); await cierra(); }
    await page.evaluate(() => abrirNuevo()); await page.waitForTimeout(600); await page.fill('#f-nom', 'ZZ cli'); await page.waitForTimeout(900); await mira('autocompletar-cliente'); await cierra();
    await page.evaluate(() => toggleCampana()); await page.waitForTimeout(400); await mira('campana'); await page.evaluate(() => document.getElementById('bell-panel').classList.remove('open'));
    await page.evaluate(() => abrirCodigos()); await page.waitForTimeout(600); await mira('codigos'); await cierra();
    const inp = page.locator('#s-inp'); await inp.click(); await inp.fill('ZZ'); await page.waitForTimeout(1000); await mira('buscador'); await page.keyboard.press('Escape');
    if (creado.pedidos[0]) { await page.evaluate(async id => { await api('POST', '/archivar', { tipo: 'pedido', id }); }, creado.pedidos[0]); await vista(page, 'archivo'); await page.waitForTimeout(600); await mira('archivo'); }
    console.log('errores de consola:', errores.length, errores.slice(0, 3));
    const n = Object.keys(vivo).length;
    console.log(n ? `SIN ESCAPAR en ${n} pantallas:` : 'TODO ESCAPADO: la etiqueta no llegó viva a ninguna pantalla');
    for (const [k, v] of Object.entries(vivo)) console.log('  ', k, '→', v.join('  '));
    await b.close();
  } finally {
    for (const id of creado.eventos) await api('DELETE', '/eventos/' + id);
    for (const id of creado.pedidos) await api('DELETE', '/pedidos/' + id);
    for (const id of creado.clientes) await api('DELETE', '/clientes/' + id);
    for (const id of creado.productos) await api('DELETE', '/productos/' + id);
    for (const id of creado.notas) await api('DELETE', '/bitacora/notas/' + id);
    for (const id of creado.inv) await api('DELETE', '/inventario-items/' + id);
    console.log('datos de prueba borrados');
  }
})().catch(e => { console.error('ERROR', e.message); process.exit(2); });
