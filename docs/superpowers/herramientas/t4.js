// Tarea 4 · atmósfera, vidrio, campos y lo que flota
const { abrir, vista, foto } = require('./pw.js');
(async () => {
  const res = [], ok = (n, c, d) => { res.push((c ? '  ok   ' : ' FALLA ') + n + (d !== undefined ? '  → ' + d : '')); return c; };
  const { b, page, errores } = await abrir();
  const cs = (sel, prop) => page.evaluate(([s, p]) => { const e = document.querySelector(s); return e ? getComputedStyle(e)[p] : null; }, [sel, prop]);
  const flotaBien = async sel => { const bg = await cs(sel, 'backgroundColor'), bf = await cs(sel, 'backdropFilter'); return alfaMin(bg) === 1 || /blur/.test(bf || ''); };
  const alfaMin = c => { const m = (c || '').match(/rgba?\(([^)]+)\)/); if (!m) return 1; const p = m[1].split(',').map(Number); return p.length === 4 ? p[3] : 1; };
  await vista(page, 'dashboard');
  ok('fondo del body = atmósfera', ((await cs('body', 'backgroundImage')).match(/gradient/g) || []).length >= 5);
  ok('tarjeta del Dashboard es vidrio (degradado translúcido)', /gradient/.test(await cs('.db-card', 'backgroundImage')), (await cs('.db-card', 'backgroundImage')).slice(0, 60));
  ok('tarjeta con borde de vidrio (color visible)', alfaMin(await cs('.db-card', 'borderTopColor')) > .2 && (await cs('.db-card', 'borderTopStyle')) === 'solid', await cs('.db-card', 'borderTopColor'));
  ok('indicador principal = vidrio fuerte', /gradient/.test(await cs('.db-kpi.fuerte', 'backgroundImage')));
  ok('barra superior transparente arriba', (await cs('.topbar', 'backdropFilter')) === 'none');
  await page.evaluate(() => { document.body.style.minHeight = '3000px'; window.scrollTo(0, 400); }); await page.waitForTimeout(400);
  ok('barra superior con desenfoque al desplazar', /blur/.test(await cs('.topbar', 'backdropFilter') || ''), await cs('.topbar', 'backdropFilter'));
  await page.evaluate(() => { window.scrollTo(0, 0); document.body.style.minHeight = ''; });
  await foto(page, 't4-dashboard');
  await vista(page, 'pedidos');
  ok('tabla de pedidos es vidrio', /gradient/.test(await cs('.ped-table', 'backgroundImage') || ''));
  ok('campo de texto translúcido', alfaMin(await cs('#s-inp', 'backgroundColor')) < 1, await cs('#s-inp', 'backgroundColor'));
  await foto(page, 't4-pedidos');
  // ── Review Focus 3 · lo que flota sobre contenido NO puede transparentarse ──
  await page.evaluate(() => toggleCampana());
  await page.waitForTimeout(250);
  ok('campana: vidrio con desenfoque (o fondo opaco)', await flotaBien('#bell-panel'), (await cs('#bell-panel', 'backdropFilter')));
  await foto(page, 't4-campana');
  await page.evaluate(() => document.getElementById('bell-panel').classList.remove('open'));
  await page.fill('#s-inp', 'sam'); await page.waitForTimeout(1300);
  const gbAbierto = await page.evaluate(() => { const g = document.getElementById('gb-panel'); return g && getComputedStyle(g).display !== 'none'; });
  ok('buscador global: se abre', gbAbierto);
  ok('buscador global: vidrio con desenfoque (o fondo opaco)', await flotaBien('#gb-panel'), (await cs('#gb-panel', 'backdropFilter')));
  await foto(page, 't4-buscador');
  await page.fill('#s-inp', ''); await page.keyboard.press('Escape');
  await page.evaluate(() => iaAbrir()); await page.waitForTimeout(500);
  ok('asistente: vidrio con desenfoque (o fondo opaco)', await flotaBien('.ia-panel'), (await cs('.ia-panel', 'backdropFilter')));
  await foto(page, 't4-asistente');
  await page.evaluate(() => iaCerrar());
  // ventana normal (perfil) y editor de pedido a pantalla completa
  await page.evaluate(() => abrirPerfil()); await page.waitForTimeout(300);
  ok('ventana: vidrio con desenfoque (o fondo opaco)', await flotaBien('#ovPerfil .modal'), (await cs('#ovPerfil .modal', 'backdropFilter')));
  await foto(page, 't4-ventana');
  await page.evaluate(() => cerrarPerfil());
  const id = await page.evaluate(async () => { const r = await api('GET', '/pedidos'); return (r.find(p => !p.es_cotizacion && !p.cerrado) || r[0]).id; });
  await page.evaluate(id => abrirEditar(id), id); await page.waitForTimeout(1200);
  ok('editor de pedido: muestra la atmósfera', ((await cs('#ovP', 'backgroundImage')).match(/gradient/g) || []).length >= 5);
  await foto(page, 't4-editor-pedido');
  await page.evaluate(() => { document.getElementById('ovP').classList.remove('open'); });
  for (const v of ['productos', 'produccion', 'configuracion', 'registros', 'bitacora', 'costos']) { await vista(page, v); await foto(page, 't4-' + v); }
  console.log(res.join('\n')); console.log('errores de consola:', errores.length, errores.slice(0, 4));
  await b.close(); process.exit(res.some(r => r.startsWith(' FALLA')) || errores.length ? 1 : 0);
})().catch(e => { console.error('FALLO', e.message); process.exit(1); });
