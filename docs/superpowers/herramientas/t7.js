// Tarea 7 · marca en el ingreso y en el menú, sin emojis
const { abrir, vista, foto } = require('./pw.js');
const fs = require('fs');
(async () => {
  const res = [], ok = (n, c, d) => { res.push((c ? '  ok   ' : ' FALLA ') + n + (d !== undefined && d !== '' ? '  → ' + d : '')); return c; };
  const html = fs.readFileSync('I:/PROYECTOS CLAUDE/AGENCIA PEDIDOS/agencia/public/index.html', 'utf8');
  ok('sin emojis en la interfaz', !/[\u{1F300}-\u{1FAFF}\u2600\u2601\u26A1]/u.test(html.replace(/\/\*[\s\S]*?\*\//g, '')), (html.replace(/\/\*[\s\S]*?\*\//g, '').match(/[\u{1F300}-\u{1FAFF}\u2600\u26A1]/gu) || []).join(' '));
  ok('el logo en base64 ya no viaja en el HTML', !/id="sbLogoImg" src="data:image/.test(html), Math.round(html.length / 1024) + ' KB');
  // ingreso (sin sesión), día y noche
  for (const modo of ['dia', 'noche']) {
    const { b, page, errores } = await abrir({ sinSesion: true, modo });
    await page.waitForSelector('#pinScreen', { state: 'visible' });
    const r = await page.evaluate(() => { const l = document.querySelector('.pin-logo'), c = getComputedStyle(document.getElementById('pinScreen')), bx = l && l.getBoundingClientRect();
      return { logo: !!l && bx.width > 100 && bx.height > 60, fondo: (c.backgroundImage.match(/gradient/g) || []).length, h2: !!document.querySelector('.pin-box h2'), texto: document.querySelector('.pin-box').innerText.slice(0, 60) }; });
    ok('ingreso (' + modo + '): logo Coral Line visible', r.logo); ok('ingreso (' + modo + '): fondo de atmósfera', r.fondo >= 5, r.fondo);
    ok('ingreso (' + modo + '): ya no dice GRAFÍA', !r.h2 && !/GRAF/i.test(r.texto), r.texto.replace(/\n/g, ' / '));
    ok('ingreso (' + modo + '): sin errores de consola', errores.filter(e => !/401/.test(e)).length === 0, errores.slice(0, 2).join(' | '));
    await foto(page, 't7-ingreso-' + modo);
    // entrar de verdad con el PIN, por la interfaz
    if (modo === 'dia') { await page.evaluate(() => mostrarLoginPin()); await page.fill('#pinInput', '1234'); await page.evaluate(() => intentarPin());
      await page.waitForFunction(() => typeof ME !== 'undefined' && ME && document.querySelector('.view.active'), null, { timeout: 15000 });
      ok('ingreso: el PIN sigue entrando', await page.evaluate(() => getComputedStyle(document.getElementById('pinScreen')).display === 'none')); }
    await b.close();
  }
  // menú: el negocio «main» tiene logo_ruta apuntando a un archivo que no existe en local → debe caer a Coral Line
  const { b, page, errores } = await abrir();
  await page.waitForTimeout(600);
  const m = await page.evaluate(() => ({ ruta: CFG.logo_ruta, img: getComputedStyle(document.getElementById('sbLogoImg')).display, cl: getComputedStyle(document.getElementById('sbLogoCL')).display, ancho: document.getElementById('sbLogoCL').getBoundingClientRect().width }));
  // se fuerza un archivo que no existe (el negocio local puede tener un logo real subido)
  const tl = await page.evaluate(async () => { const im = document.getElementById('tbLogo'); im.hidden = false; im.src = '/uploads/no-existe-' + Date.now() + '.webp';
    await new Promise(r => { im.addEventListener('error', r, { once: true }); setTimeout(r, 3000); }); return { oculto: im.hidden }; });
  ok('logo del negocio junto al saludo: si su archivo no carga, se oculta (no imagen rota)', tl.oculto === true, JSON.stringify(tl));
  // con un logo que sí carga, se ve el del negocio
  await page.evaluate(() => { CFG.logo_ruta = '/favicon.svg'; aplicarPerfilNegocio(); }); await page.waitForTimeout(500);
  const m2 = await page.evaluate(() => ({ img: getComputedStyle(document.getElementById('sbLogoImg')).display, cl: getComputedStyle(document.getElementById('sbLogoCL')).display }));
  const tl2 = await page.evaluate(() => { const e = document.getElementById('tbLogo'); return { visible: !e.hidden && e.getBoundingClientRect().width > 10 }; });
  ok('logo del negocio junto al saludo cuando sí carga', tl2.visible, JSON.stringify(tl2));
  await vista(page, 'dashboard');
  const sal = await page.evaluate(() => document.getElementById('tb-title').textContent);
  ok('saludo sin emoji', !/[\u{1F300}-\u{1FAFF}]/u.test(sal), sal);
  await vista(page, 'ayuda'); await page.waitForTimeout(500);
  ok('Ayuda (acerca de) nombra a CORAL LINE', await page.evaluate(async () => { await cargarAppInfo(); return /CORAL LINE/.test(document.getElementById('ayuda-info-body').textContent); }));
  await vista(page, 'pedidos'); await foto(page, 't7-menu');
  console.log(res.join('\n')); console.log('errores de consola:', errores.length, errores.slice(0, 3));
  await b.close(); process.exit(res.some(r => r.startsWith(' FALLA')) ? 1 : 0);
})().catch(e => { console.error('FALLO', e.message); process.exit(1); });
