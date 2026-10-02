const { abrir, vista, foto } = require('./pw.js');
const lum = h => { const c = [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16) / 255).map(v => v <= .03928 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4)); return .2126 * c[0] + .7152 * c[1] + .0722 * c[2]; };
(async () => {
  const { b, page, errores } = await abrir();
  const v = k => page.evaluate(k => getComputedStyle(document.documentElement).getPropertyValue('--' + k).trim(), k);
  const res = [], ok = (n, c, d) => { res.push((c ? '  ok   ' : ' FALLA ') + n + (d ? '  → ' + d : '')); return c; };
  ok('marca = Deep Teal', (await v('brand')).toUpperCase() === '#0A2E3B', await v('brand'));
  ok('luz = Coral Cyan', (await v('luz')).toUpperCase() === '#23D0D2', await v('luz'));
  ok('tinta oscura de día', lum(await v('navy')) < .06, await v('navy'));
  const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundImage);
  ok('fondo = atmósfera (varios degradados)', (bg.match(/gradient/g) || []).length >= 5, (bg.match(/gradient/g) || []).length + ' degradados');
  ok('existen tokens de vidrio', !!(await v('v1')) && !!(await v('v2')) && !!(await v('vf')) && !!(await v('campo')));
  await page.evaluate(() => alternarModoTema()); await page.waitForTimeout(200);
  ok('noche: tinta clara', lum(await v('navy')) > .5, await v('navy'));
  ok('noche: fondo oscuro', lum(await v('bg')) < .05, await v('bg'));
  ok('noche: contador claro', (await v('contador')).toUpperCase() === '#FF5F6B', await v('contador'));
  await page.evaluate(() => alternarModoTema()); await page.waitForTimeout(200);
  // Review Focus 1 · negocio con colores claros: ninguna tinta sobre marca puede ser clara
  await page.evaluate(() => { CFG.color_primario = '#F2D43B'; CFG.color_acento = '#FFE98A'; aplicarTemaColor(); });
  for (const k of ['brand-txt', 'acento-txt', 'vf-tinta', 'pri-tinta', 'sel-tinta', 'luz-tinta']) { const c = await v(k); ok('negocio claro · ' + k + ' es tinta oscura', lum(c) < .2, c); }
  await vista(page, 'dashboard'); await foto(page, 't2-negocio-claro');
  await page.evaluate(() => { CFG.color_primario = COLOR_FABRICA.primario; CFG.color_acento = COLOR_FABRICA.acento; aplicarTemaColor(); });
  await vista(page, 'dashboard'); await foto(page, 't2-dashboard');
  await vista(page, 'pedidos'); await foto(page, 't2-pedidos');
  console.log(res.join('\n')); console.log('errores de consola:', errores.length, errores.slice(0, 3));
  await b.close(); process.exit(res.some(r => r.startsWith(' FALLA')) || errores.length ? 1 : 0);
})().catch(e => { console.error('FALLO', e.message); process.exit(1); });
