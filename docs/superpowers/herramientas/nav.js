// Prueba de la navegación: botón atrás / adelante con ventanas, vistas y cambios sin guardar. No guarda datos.
const { abrir, vista } = require('./pw.js');
let bien = 0, mal = 0;
const ok = (n, c, d) => { c ? bien++ : mal++; console.log((c ? '  ok   ' : ' FALLA ') + n + (d !== undefined ? '  → ' + (typeof d === 'string' ? d : JSON.stringify(d)) : '')); };
(async () => {
  for (const [w, h] of [[1366, 768], [390, 844]]) {
    const { b, page, errores } = await abrir({ ancho: w, alto: h });
    let acepta = true, vistos = []; page.on('dialog', d => { vistos.push(d.message().slice(0, 30)); acepta ? d.accept() : d.dismiss(); });
    const est = () => page.evaluate(() => ({ v: (document.querySelector('.view.active') || {}).id, ab: [...document.querySelectorAll('.overlay.open')].map(o => o.id).join(','), h: location.hash, pila: NAV.pila.join(','), st: history.state && (history.state.cl + ':' + (history.state.v || history.state.id)) }));
    const atras = async () => { await page.goBack().catch(() => {}); await page.waitForTimeout(450); };
    const T = `[${w}] `;
    let e = await est(); ok(T + 'arranca en el Dashboard con la vista en la dirección', e.v === 'view-dashboard' && e.h === '#dashboard' && e.st === 'v:dashboard', e);
    await vista(page, 'pedidos'); await vista(page, 'clientes');
    // 1 · ventana simple
    await page.evaluate(() => abrirPerfil()); await page.waitForTimeout(300); e = await est();
    ok(T + 'abrir Perfil añade un paso', e.ab === 'ovPerfil' && e.pila === 'ovPerfil' && e.st === 'ov:ovPerfil', e);
    await atras(); e = await est(); ok(T + 'atrás cierra Perfil y NO cambia de vista', e.ab === '' && e.v === 'view-clientes' && e.pila === '' && e.st === 'v:clientes', e);
    // 2 · cerrar con la X y luego atrás
    await page.evaluate(() => abrirPerfil()); await page.waitForTimeout(300); await page.evaluate(() => cerrarPerfil()); await page.waitForTimeout(450); e = await est();
    ok(T + 'cerrar con la X deja el historial como estaba', e.ab === '' && e.st === 'v:clientes' && e.pila === '', e);
    await atras(); e = await est(); ok(T + 'y atrás vuelve a la vista anterior', e.v === 'view-pedidos' && e.h === '#pedidos' && e.ab === '', e);
    await page.goForward().catch(() => {}); await page.waitForTimeout(450); e = await est(); ok(T + 'adelante regresa', e.v === 'view-clientes', e);
    // 3 · editor sin cambios
    await page.evaluate(() => abrirNuevo()); await page.waitForTimeout(700); vistos = [];
    await atras(); e = await est(); ok(T + 'editor sin cambios: atrás lo cierra sin preguntar', e.ab === '' && vistos.length === 0 && e.v === 'view-clientes', { ...e, vistos });
    // 4 · editor con cambios
    await page.evaluate(() => abrirNuevo()); await page.waitForTimeout(700); await page.fill('#f-nom', 'A medio escribir');
    acepta = false; vistos = []; await atras(); e = await est();
    ok(T + 'editor con cambios: atrás pregunta y, si digo que no, se queda', e.ab === 'ovP' && vistos.length === 1 && e.pila === 'ovP' && e.st === 'ov:ovP', { ...e, vistos });
    const nom = await page.inputValue('#f-nom'); ok(T + 'y lo escrito sigue ahí', nom === 'A medio escribir', nom);
    await page.keyboard.press('Escape'); await page.waitForTimeout(350); e = await est(); ok(T + 'Escape también pregunta', e.ab === 'ovP' && vistos.length === 2, vistos.length);
    acepta = true; await atras(); e = await est(); ok(T + 'si digo que sí, se cierra', e.ab === '' && e.v === 'view-clientes' && e.pila === '', e);
    await page.evaluate(() => abrirNuevo()); await page.waitForTimeout(700); vistos = []; await page.keyboard.press('Escape'); await page.waitForTimeout(350); e = await est();
    ok(T + 'al reabrir el editor ya no arrastra el aviso anterior', e.ab === '' && vistos.length === 0, { ...e, vistos });
    // 5 · de una ventana a otra (cliente → nuevo pedido)
    const cli = await page.evaluate(async () => (await api('GET', '/clientes'))[0].id);
    await page.evaluate(id => verCli(id), cli); await page.waitForTimeout(900);
    await page.evaluate(() => nuevoPedidoDesdeCliente()); await page.waitForTimeout(900); e = await est();
    ok(T + 'cliente → nuevo pedido: queda solo el editor', e.ab === 'ovP' && e.pila === 'ovP', e);
    await atras(); e = await est(); ok(T + 'atrás cierra el editor y sigue en Clientes', e.ab === '' && e.v === 'view-clientes', e);
    await atras(); e = await est(); ok(T + 'otro atrás: vista anterior, sin ventanas fantasma', e.ab === '' && e.v === 'view-pedidos', e);
    // 6 · hoja «Todo» del móvil y Coralyne
    if (w <= 768) {
      await page.evaluate(() => abrirMas()); await page.waitForTimeout(350);
      await page.evaluate(() => { cerrarMas(); showView('bitacora'); }); await page.waitForTimeout(500); e = await est();
      ok(T + 'hoja «Todo» → ir a Bitácora', e.v === 'view-bitacora' && e.h === '#bitacora' && e.ab === '' && e.st === 'v:bitacora', e);
      await atras(); e = await est(); ok(T + 'atrás vuelve a Pedidos (no reabre la hoja)', e.v === 'view-pedidos' && e.ab === '', e);
      await page.evaluate(() => abrirMas()); await page.waitForTimeout(350); await atras(); e = await est(); ok(T + 'atrás cierra la hoja «Todo»', e.ab === '' && e.v === 'view-pedidos', e);
    }
    await page.evaluate(() => iaAbrir()); await page.waitForTimeout(500); e = await est();
    const iaAb = await page.evaluate(() => document.getElementById('ovIA').classList.contains('open'));
    await atras(); const iaAb2 = await page.evaluate(() => document.getElementById('ovIA').classList.contains('open')); e = await est();
    ok(T + 'atrás cierra Coralyne', iaAb && !iaAb2 && e.v === 'view-pedidos', { iaAb, iaAb2, v: e.v });
    // 7 · recargar con una ventana abierta
    await vista(page, 'registros'); await page.evaluate(() => abrirExp()); await page.waitForTimeout(300);
    await page.reload({ waitUntil: 'networkidle' }); await page.waitForFunction(() => typeof ME !== 'undefined' && ME && document.querySelector('.view.active'), null, { timeout: 15000 }); await page.waitForTimeout(500); e = await est();
    ok(T + 'recargar: misma vista, sin ventanas', e.v === 'view-registros' && e.ab === '' && e.h === '#registros', e);
    await atras(); e = await est(); ok(T + 'tras recargar, atrás no deja la app en blanco', !!e.v && /127\.0\.0\.1/.test(page.url()), e);
    ok(T + 'sin errores de consola', errores.length === 0, errores.slice(0, 3));
    await b.close();
  }
  console.log(`\n${bien} ok · ${mal} fallas`);
})().catch(e => { console.error('ERROR', e.message); process.exit(2); });
