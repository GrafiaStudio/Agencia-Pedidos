// Tablet y móvil: sin scroll horizontal, sin errores, barra móvil visible; capturas
const { abrir, vista, foto, VISTAS } = require('./pw.js');
(async () => {
  const res = [], ok = (n, c, d) => { res.push((c ? '  ok   ' : ' FALLA ') + n + (d !== undefined && d !== '' ? '  → ' + d : '')); return c; };
  for (const [w, h] of [[768, 1024], [390, 844]]) for (const modo of ['dia', 'noche']) {
    const { b, page, errores } = await abrir({ ancho: w, alto: h, modo });
    const anchas = [];
    for (const v of VISTAS) { await vista(page, v); const sw = await page.evaluate(() => document.documentElement.scrollWidth); if (sw > w + 1) anchas.push(v + ' ' + sw); await foto(page, `t9b-${w}-${modo}-${v}`); }
    const peds = await page.evaluate(async () => (await api('GET', '/pedidos')).filter(p => !p.cerrado && !p.es_cotizacion).map(p => p.id));
    await page.evaluate(id => abrirEditar(id), peds[0]); await page.waitForTimeout(1200); await foto(page, `t9b-${w}-${modo}-editor`);
    const swE = await page.evaluate(() => document.getElementById('ovP').scrollWidth);
    await page.evaluate(() => cerrar());
    const mob = await page.evaluate(() => getComputedStyle(document.querySelector('.mob-nav')).display);
    ok(`${w} px ${modo}: sin scroll horizontal en las 12 vistas`, anchas.length === 0, anchas.join(', '));
    ok(`${w} px ${modo}: editor de pedido sin desborde`, swE <= w + 1, swE);
    if (w === 390) ok(`${w} px ${modo}: barra móvil visible`, mob !== 'none', mob);
    ok(`${w} px ${modo}: sin errores de consola`, errores.length === 0, errores.slice(0, 2).join(' | '));
    await b.close();
  }
  // ingreso en móvil
  const s = await abrir({ ancho: 390, alto: 844, sinSesion: true }); await s.page.waitForSelector('#pinScreen', { state: 'visible' }); await foto(s.page, 't9b-390-ingreso'); await s.b.close();
  console.log(res.join('\n')); process.exit(res.some(r => r.startsWith(' FALLA')) ? 1 : 0);
})().catch(e => { console.error('FALLO', e.message); process.exit(1); });
