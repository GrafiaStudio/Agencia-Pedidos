// Banner propio: subir por la interfaz (se reduce a WebP), verlo en el Dashboard, quitarlo
const { abrir, vista, foto, token, BASE } = require('./pw.js');
(async () => {
  const res = [], ok = (n, c, d) => { res.push((c ? '  ok   ' : ' FALLA ') + n + (d !== undefined && d !== '' ? '  → ' + d : '')); return c; };
  const { b, page, errores } = await abrir();
  await vista(page, 'configuracion');
  ok('Configuración: hay vista previa del banner', await page.evaluate(() => !!document.querySelector('#cfg-ban-prev .db-ban-logo')));
  ok('sin banner: no se muestra «Quitar imagen»', await page.evaluate(() => getComputedStyle(document.getElementById('cfg-ban-quitar')).display === 'none'));
  const [resp] = await Promise.all([page.waitForResponse(r => r.url().includes('/api/configuracion/banner') && r.request().method() === 'POST'),
    page.setInputFiles('#cfg-ban-inp', 'I:/PROYECTOS CLAUDE/AGENCIA PEDIDOS/marca y referencias/fondo.png')]);
  const j = await resp.json(); await page.waitForTimeout(600);
  ok('subida aceptada como WebP reducido', resp.status() === 200 && /\.webp$/.test(j.banner_ruta), resp.status() + ' ' + j.banner_ruta);
  const peso = await page.evaluate(async r => { const x = await fetch(r); return { tipo: x.headers.get('content-type'), kb: Math.round((await x.blob()).size / 1024) }; }, j.banner_ruta);
  ok('el archivo servido es imagen liviana', /image\/webp/.test(peso.tipo) && peso.kb < 400, JSON.stringify(peso));
  await page.fill('#cfg-ban-txt', 'ZZ Estudio creativo · Queremal');
  await page.evaluate(() => guardarConfiguracion()); await page.waitForTimeout(900);
  await foto(page, 'ban-config');
  await vista(page, 'dashboard'); await page.waitForTimeout(800);
  const dbb = await page.evaluate(() => { const e = document.getElementById('db-banner'); return { img: e.classList.contains('con-imagen'), txt: e.querySelector('.db-ban-txt').textContent }; });
  ok('el Dashboard muestra la imagen y la frase', dbb.img && /ZZ Estudio/.test(dbb.txt), JSON.stringify(dbb));
  await foto(page, 'ban-dashboard');
  await vista(page, 'configuracion'); await page.evaluate(() => quitarBannerCfg()); await page.waitForTimeout(600);
  await page.fill('#cfg-ban-txt', ''); await page.evaluate(() => guardarConfiguracion()); await page.waitForTimeout(800);
  const c = await page.evaluate(async () => await api('GET', '/configuracion'));
  ok('quitar: vuelve el banner de Coral Line', c.banner_ruta === '' && c.banner_texto === '', JSON.stringify([c.banner_ruta, c.banner_texto]));
  ok('sin errores de consola', errores.length === 0, errores.slice(0, 3).join(' | '));
  console.log(res.join('\n')); await b.close(); process.exit(res.some(r => r.startsWith(' FALLA')) ? 1 : 0);
})().catch(e => { console.error('FALLO', e.message); process.exit(1); });
