// Sonda de funcionamiento: flujos que las otras pruebas no cubren. No guarda datos del negocio.
const { abrir, vista, foto } = require('./pw.js');
let bien = 0, mal = 0;
const ok = (n, c, d) => { c ? bien++ : mal++; console.log((c ? '  ok   ' : ' FALLA ') + n + (d !== undefined ? '  → ' + (typeof d === 'string' ? d : JSON.stringify(d)) : '')); };
(async () => {
  // 1 · pantalla de ingreso
  for (const [w, h] of [[1366, 768], [390, 844]]) {
    const { b, page, errores } = await abrir({ ancho: w, alto: h, sinSesion: true });
    await page.waitForTimeout(700);
    const s = await page.evaluate(() => { const p = document.getElementById('pinScreen'); const r = p.getBoundingClientRect(); return { visible: getComputedStyle(p).display !== 'none', desborde: document.documentElement.scrollWidth > innerWidth, alto: document.documentElement.scrollHeight, vh: innerHeight, foco: document.activeElement && document.activeElement.id, titulo: document.title }; });
    ok(`ingreso ${w}: visible, sin desborde, sin errores`, s.visible && !s.desborde && errores.length === 0, s);
    await foto(page, 'fn-ingreso-' + w);
    if (w === 1366) {
      await page.evaluate(() => mostrarLoginPin()); await page.waitForTimeout(200);
      await page.fill('#pinInput', '0000'); await page.keyboard.press('Enter'); await page.waitForTimeout(900);
      const e = await page.evaluate(() => { const p = document.getElementById('pinScreen'); const m = [...p.querySelectorAll('*')].filter(x => x.children.length === 0 && /incorrect|inválid|error/i.test(x.textContent)).map(x => x.textContent.trim())[0]; return { sigue: getComputedStyle(p).display !== 'none', msg: m || '' }; });
      ok('ingreso: PIN equivocado avisa y no entra', e.sigue && !!e.msg, e);
      await foto(page, 'fn-ingreso-error');
    }
    await b.close();
  }
  const { b, page, errores } = await abrir({ ancho: 1366, alto: 768 });
  const malas = []; page.on('response', r => { if (r.status() >= 400) malas.push(r.status() + ' ' + r.url().replace('http://127.0.0.1:3000', '')); });
  // 2 · Escape cierra ventanas simples
  for (const [nom, abre, sel] of [['Perfil', 'abrirPerfil', '#ovPerfil'], ['Exportar', 'abrirExp', '#ovExp'], ['Códigos', 'abrirCodigos', '#ovCodigos']]) {
    await page.evaluate(a => window[a](), abre); await page.waitForTimeout(350); await page.keyboard.press('Escape'); await page.waitForTimeout(250);
    const ab = await page.evaluate(s => document.querySelector(s).classList.contains('open'), sel);
    ok(`Escape cierra ${nom}`, !ab); if (ab) await page.evaluate(s => document.querySelector(s).classList.remove('open'), sel);
  }
  await page.evaluate(() => toggleCampana()); await page.waitForTimeout(250); await page.keyboard.press('Escape'); await page.waitForTimeout(200);
  ok('Escape cierra la campana', !(await page.evaluate(() => document.getElementById('bell-panel').classList.contains('open'))));
  await page.evaluate(() => document.getElementById('bell-panel').classList.remove('open'));
  // 3 · clic fuera cierra una ventana simple
  await page.evaluate(() => abrirPerfil()); await page.waitForTimeout(300); await page.mouse.click(20, 300); await page.waitForTimeout(250);
  const pf = await page.evaluate(() => document.getElementById('ovPerfil').classList.contains('open'));
  ok('clic fuera cierra Perfil', !pf); if (pf) await page.evaluate(() => cerrarPerfil());
  // 4 · Dashboard: períodos y calendario
  await vista(page, 'dashboard');
  for (const p of ['hoy', 'semana', 'mes', 'anio']) { await page.evaluate(p => dashSetPeriodo(p), p); await page.waitForTimeout(600);
    const g = await page.evaluate(() => { const s = document.getElementById('db-graf'); return { lbl: document.getElementById('db-per-lbl').textContent.trim(), ejes: [...s.querySelectorAll('text.eje')].map(x => x.textContent).slice(0, 5).join(' '), dibujo: s.children.length }; });
    ok(`Dashboard · período ${p}: se dibuja y el eje no repite cifras`, g.dibujo > 5 && !/1 1|0 0/.test(g.ejes), g); }
  const m0 = await page.evaluate(() => document.querySelector('#db-cal').innerText.split('\n')[0]);
  const flechas = await page.$$('#db-cal button'); if (flechas.length >= 2) { await flechas[flechas.length > 2 ? 1 : 1].click(); await page.waitForTimeout(500); }
  const m1 = await page.evaluate(() => document.querySelector('#db-cal').innerText.split('\n')[0]);
  ok('Dashboard · el calendario cambia de mes', m0 !== m1, m0 + ' → ' + m1);
  // 5 · teclado: foco visible
  await vista(page, 'pedidos'); await page.keyboard.press('Tab'); await page.keyboard.press('Tab'); await page.keyboard.press('Tab');
  const fo = await page.evaluate(() => { const e = document.activeElement; const c = getComputedStyle(e); return { quien: e.tagName + '.' + e.className, outline: c.outlineStyle + ' ' + c.outlineWidth, sombra: c.boxShadow.slice(0, 60) }; });
  ok('teclado: el elemento enfocado se distingue', (fo.outline && !/none|0px/.test(fo.outline)) || /rgb/.test(fo.sombra), fo);
  const fd = await page.evaluate(() => { const d = document.querySelector('.dock .dk'); d.focus(); return d.matches(':focus-visible') ? getComputedStyle(d).outlineStyle + ' ' + getComputedStyle(d).outlineWidth : 'no focus-visible'; });
  ok('teclado: foco visible en el dock', !/none|0px|no focus/.test(fd), fd);
  // 6 · botón atrás del navegador
  await vista(page, 'clientes'); await vista(page, 'registros');
  const url0 = page.url(); await page.goBack().catch(() => {}); await page.waitForTimeout(600);
  const tras = await page.evaluate(() => (document.querySelector('.view.active') || {}).id || 'FUERA').catch(() => 'FUERA DE LA APP');
  ok('botón atrás: vuelve a la vista anterior (no sale de la app)', tras === 'view-clientes', tras + ' · ' + page.url());
  if (!/127\.0\.0\.1/.test(page.url())) await page.goto('http://127.0.0.1:3000');
  await page.waitForFunction(() => typeof ME !== 'undefined' && ME && document.querySelector('.view.active'), null, { timeout: 15000 });
  // 7 · recargar conserva la vista
  await vista(page, 'productos'); await page.reload({ waitUntil: 'networkidle' }); await page.waitForFunction(() => typeof ME !== 'undefined' && ME && document.querySelector('.view.active'), null, { timeout: 15000 });
  const v2 = await page.evaluate(() => document.querySelector('.view.active').id);
  ok('recargar conserva la vista en la que estabas', v2 === 'view-productos', v2);
  // 8 · editor de pedido: cerrar con cambios sin guardar avisa
  let dialogo = null; page.on('dialog', d => { dialogo = d.message(); d.dismiss(); });
  await page.evaluate(() => abrirNuevo()); await page.waitForTimeout(700);
  await page.fill('#f-nom', 'Cliente a medio escribir'); await page.evaluate(() => cerrar()); await page.waitForTimeout(400);
  const sigue = await page.evaluate(() => document.getElementById('ovP').classList.contains('open'));
  ok('editor: cerrar con cambios sin guardar pregunta antes', !!dialogo || sigue, { dialogo, sigueAbierto: sigue });
  await page.evaluate(() => document.getElementById('ovP').classList.remove('open'));
  // 9 · exportar CSV
  const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 8000 }).catch(() => null), page.evaluate(() => { abrirExp(); const bt = [...document.querySelectorAll('#ovExp button')].find(x => /csv/i.test(x.textContent)); bt.click(); })]);
  ok('exportar CSV descarga un archivo', !!dl, dl ? dl.suggestedFilename() : 'sin descarga');
  await page.evaluate(() => document.querySelectorAll('.overlay.open').forEach(o => o.classList.remove('open')));
  // 10 · buscador global abre un resultado
  await vista(page, 'pedidos'); const inp = page.locator('#s-inp'); await inp.click(); await inp.fill('sam'); await page.waitForTimeout(900);
  const res = await page.evaluate(() => document.querySelectorAll('#gb-panel [onclick], #gb-panel .gb-item, #gb-panel .gb-r').length);
  ok('buscador global: muestra resultados', res > 0, res);
  await page.keyboard.press('Escape');
  ok('sin errores de consola en la sonda', errores.length === 0, errores.slice(0, 4));
  ok('sin respuestas de error del servidor', malas.length === 0, [...new Set(malas)].slice(0, 6));
  await b.close();
  console.log(`\n${bien} ok · ${mal} fallas`);
})().catch(e => { console.error('ERROR', e.message); process.exit(2); });
