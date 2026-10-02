// Verificación de PRODUCCIÓN tras publicar. SOLO LECTURA: no crea, edita ni borra nada.
// El PIN se lee de RESPALDOS-BD/pin.txt y nunca se imprime.
const fs = require('fs'), path = require('path');
const { chromium } = require('I:/PROYECTOS CLAUDE/AGENCIA PEDIDOS/.pw-mcp/node_modules/playwright-core');
const BASE = 'https://agencia-pedidos-production.up.railway.app';
const CAP = path.join(__dirname, 'cap');
let bien = 0, mal = 0;
const ok = (n, c, d) => { c ? bien++ : mal++; console.log((c ? '  ok   ' : ' FALLA ') + n + (d ? '  → ' + d : '')); };
(async () => {
  const pin = fs.readFileSync('I:/PROYECTOS CLAUDE/AGENCIA PEDIDOS/RESPALDOS-BD/pin.txt', 'utf8').split(/\r?\n/)[0].trim();
  const lg = await (await fetch(BASE + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pin }) })).json();
  if (!lg.token) throw new Error('no hay token');
  const H = { Authorization: 'Bearer ' + lg.token };
  const get = async r => { const x = await fetch(BASE + '/api' + r, { headers: H }); return { st: x.status, j: await x.json().catch(() => null) }; };

  const html = await (await fetch(BASE + '/')).text();
  ok('la portada es Coral Line', /<title>CORAL LINE/.test(html) && html.includes('dk-luz') && html.includes('pisoE'));
  const f = await fetch(BASE + '/fonts/OstrichSans-Heavy.woff2');
  ok('la tipografía de marca se sirve como fuente', /woff2|font|octet/.test(f.headers.get('content-type') || ''), f.headers.get('content-type'));
  const fav = await fetch(BASE + '/favicon.svg');
  ok('favicon', /svg/.test(fav.headers.get('content-type') || ''), fav.headers.get('content-type'));

  // barrido de octubre: compresión, rutas inexistentes, robots, iconos
  const cr = (ruta, hd = {}) => new Promise((res, rej) => require('https').get(BASE + ruta, { headers: hd }, r => { const b = []; r.on('data', c => b.push(c)); r.on('end', () => res({ st: r.statusCode, h: r.headers, n: Buffer.concat(b).length })); }).on('error', rej));
  const comp = await cr('/', { 'accept-encoding': 'gzip, br' });
  ok('la app viaja comprimida', /br|gzip/.test(comp.h['content-encoding'] || '') && comp.n < 260000, (comp.h['content-encoding'] || 'sin comprimir') + ' · ' + Math.round(comp.n / 1024) + ' KB');
  ok('cabeceras: noindex y HSTS', /noindex/.test(comp.h['x-robots-tag'] || '') && !!comp.h['strict-transport-security'], comp.h['x-robots-tag'] + ' · ' + comp.h['strict-transport-security']);
  const rob = await cr('/robots.txt'); ok('robots.txt real', rob.st === 200 && /text\/plain/.test(rob.h['content-type']), rob.st + ' ' + rob.h['content-type']);
  const nx = await cr('/uploads/no-existe.png'); ok('una imagen que falta responde 404 (no la app entera)', nx.st === 404 && nx.n < 200, nx.st + ' ' + nx.n + 'b');
  const man = await cr('/manifest.webmanifest'), ico = await cr('/apple-touch-icon.png'); ok('manifiesto e icono de la app', man.st === 200 && ico.st === 200 && /png/.test(ico.h['content-type']), man.h['content-type']);
  const ne = await get('/no-existe'); ok('ruta de API inexistente → 404', ne.st === 404, ne.st);
  const cfg = await get('/configuracion');
  ok('configuración responde con los campos nuevos', cfg.st === 200 && 'piel_intensidad' in cfg.j && 'banner_ruta' in cfg.j && 'banner_texto' in cfg.j,
    `${cfg.j.color_primario} ${cfg.j.color_acento} · intensidad ${cfg.j.piel_intensidad} · banner «${cfg.j.banner_ruta}»`);
  const d = await get('/dashboard?periodo=anio');
  ok('Dashboard: reporte del año con 12 meses', d.st === 200 && Array.isArray(d.j.serie) && d.j.serie.length === 12, 'activos ' + d.j.kpis.activos);
  const e = await get('/dashboard/entregas');
  ok('Dashboard: calendario de entregas', e.st === 200 && /^\d{4}-\d{2}$/.test(e.j.mes), e.j.mes);
  const p = await get('/pedidos');
  ok('los pedidos siguen ahí', p.st === 200 && Array.isArray(p.j) && p.j.length > 0, p.j.length + ' pedidos visibles');
  const c = await get('/clientes');
  ok('los clientes siguen ahí', c.st === 200 && Array.isArray(c.j) && c.j.length > 0, c.j.length + ' clientes');
  const info = await get('/app-info');
  if (info.st === 200) ok('nombre de la app', JSON.stringify(info.j).includes('CORAL LINE'), JSON.stringify(info.j).slice(0, 90));

  const b = await chromium.launch({ executablePath: 'C:/Users/ADMIN/AppData/Local/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-win64/chrome-headless-shell.exe' });
  for (const [nom, w, h, modo] of [['prod-dia', 1920, 950, 'dia'], ['prod-noche', 1920, 950, 'noche'], ['prod-movil', 390, 844, 'dia']]) {
    const ctx = await b.newContext({ viewport: { width: w, height: h } });
    const page = await ctx.newPage(); const err = [];
    page.on('pageerror', x => err.push('pageerror: ' + x.message));
    page.on('console', m => { if (m.type() === 'error') err.push(m.text().slice(0, 160)); });
    await page.addInitScript(([tk, modo]) => { localStorage.setItem('grafia_token', tk); localStorage.setItem('temaModo', modo); }, [lg.token, modo]);
    await page.goto(BASE, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => typeof ME !== 'undefined' && ME && document.querySelector('.view.active'), null, { timeout: 20000 });
    await page.evaluate(() => document.fonts.ready); await page.waitForTimeout(1500);
    const s = await page.evaluate(() => ({ hash: location.hash, vista: document.querySelector('.view.active').id, luz: !!document.querySelector('.con-luz'), kpis: document.querySelectorAll('#db-kpis .db-kpi').length,
      fuente: document.fonts.check("12px 'Ostrich Sans'") }));
    ok(`${nom}: abre en el Dashboard, con la luz del dock y sin errores`, s.vista === 'view-dashboard' && s.luz && s.kpis >= 4 && err.length === 0, JSON.stringify(s) + ' ' + err.join(' | '));
    await page.screenshot({ path: path.join(CAP, nom + '.png') });
    if (nom === 'prod-dia') { await page.evaluate(() => showView('pedidos')); await page.waitForTimeout(1200); await page.screenshot({ path: path.join(CAP, 'prod-pedidos.png') }); }
    await ctx.close();
  }
  await b.close();
  console.log(`\n${bien} ok · ${mal} fallas`);
  process.exit(mal ? 1 : 0);
})().catch(e => { console.error('ERROR', e.message); process.exit(2); });
