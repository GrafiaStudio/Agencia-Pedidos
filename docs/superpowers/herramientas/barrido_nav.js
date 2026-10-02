// Barrido de maquetación y funcionamiento en el navegador. SOLO LEE: no guarda ni crea nada.
// Uso: node barrido_nav.js <ancho> <alto> [dia|noche]   → cap/bn-<ancho>-<modo>-<pantalla>.png + bn-<ancho>-<modo>.json
const { abrir, vista, foto, VISTAS, CAP } = require('./pw.js');
const fs = require('fs'), path = require('path');
const ancho = +process.argv[2] || 1920, alto = +process.argv[3] || 950, modo = process.argv[4] || 'dia';
const REVISA = `(() => {
  const vw = innerWidth, vh = innerHeight, out = { desbordeH: document.documentElement.scrollWidth - vw, fuera: [], cortado: [], chico: [], roto: [], vacio: [], solapa: [] };
  const vis = e => { const r = e.getBoundingClientRect(), c = getComputedStyle(e); return r.width > 0 && r.height > 0 && c.visibility !== 'hidden' && c.display !== 'none' && +c.opacity > .05; };
  const encima = e => { const r = e.getBoundingClientRect(); const x = Math.min(vw - 1, Math.max(0, r.left + r.width / 2)), y = Math.min(vh - 1, Math.max(0, r.top + r.height / 2)); const t = document.elementFromPoint(x, y); return t && (t === e || e.contains(t) || t.contains(e)); };
  const nom = e => (e.id ? '#' + e.id : e.tagName.toLowerCase() + (e.className && typeof e.className === 'string' ? '.' + e.className.trim().split(/\\s+/).slice(0, 2).join('.') : '')) ;
  const txt = e => (e.innerText || e.value || e.getAttribute('title') || e.getAttribute('aria-label') || '').trim().replace(/\\s+/g, ' ').slice(0, 40);
  const enScroll = e => { for (let p = e.parentElement; p; p = p.parentElement) { const c = getComputedStyle(p); if (/(auto|scroll)/.test(c.overflowX) && p.scrollWidth > p.clientWidth + 1) return true; } return false; };
  document.querySelectorAll('body *').forEach(e => {
    if (e.closest('svg') && e.tagName !== 'svg') return;
    if (!vis(e)) return;
    const r = e.getBoundingClientRect(), c = getComputedStyle(e);
    if (r.bottom < 0 || r.top > vh) return;
    // 1 · se sale por la derecha o la izquierda de la pantalla
    if ((r.right > vw + 2 || r.left < -2) && r.width < vw * 1.5 && !enScroll(e) && c.position !== 'fixed' && !e.closest('.dk-luz,.db-ban-marca,.atm,.ia-estrella') && encima(e)) out.fuera.push([nom(e), Math.round(r.left), Math.round(r.right), txt(e)]);
    // 2 · texto cortado sin puntos suspensivos
    const propio = [...e.childNodes].some(n => n.nodeType === 3 && n.textContent.trim().length > 1);
    if (propio && e.scrollWidth > e.clientWidth + 2 && /hidden|clip/.test(c.overflowX) && c.textOverflow !== 'ellipsis' && encima(e)) out.cortado.push([nom(e), e.clientWidth, e.scrollWidth, txt(e)]);
    if (propio && e.scrollHeight > e.clientHeight + 3 && /hidden|clip/.test(c.overflowY) && !c.webkitLineClamp.match(/[1-9]/) && e.clientHeight > 0 && encima(e)) out.cortado.push([nom(e) + ' (alto)', e.clientHeight, e.scrollHeight, txt(e)]);
    // 3 · blancos táctiles pequeños
    if (vw <= 768 && e.matches('button,a,[onclick],input:not([type=hidden]),select,[role=button]') && (r.width < 30 || r.height < 30) && encima(e)) out.chico.push([nom(e), Math.round(r.width) + 'x' + Math.round(r.height), txt(e)]);
    // 4 · imágenes rotas
    if (e.tagName === 'IMG' && e.complete && e.naturalWidth === 0) out.roto.push([nom(e), e.getAttribute('src')]);
    // 5 · botones sin nombre
    if (e.matches('button,[role=button]') && !txt(e) && encima(e)) out.vacio.push([nom(e), (e.querySelector('i,svg use') || {}).className?.baseVal || (e.querySelector('i') || {}).className || (e.querySelector('use') || { getAttribute() { return ''; } }).getAttribute('href')]);
  });
  // 6 · lo último del contenido, ¿queda tapado por el dock o la barra móvil?
  const barra = [...document.querySelectorAll('.dock,.mob-nav')].find(vis);
  const hayVentana = document.querySelector('.overlay.open');
  if (barra && !hayVentana) { const sc = document.scrollingElement; const y0 = sc.scrollTop; sc.scrollTop = sc.scrollHeight; const tb = barra.getBoundingClientRect().top;
    const v = document.querySelector('.view.active'); let ult = 0, quien = '';
    if (v) v.querySelectorAll('*').forEach(e => { if (!vis(e)) return; const r = e.getBoundingClientRect(); if (r.height > 0 && r.height < 400 && r.bottom > ult && r.width > 20) { ult = r.bottom; quien = nom(e); } });
    out.tapado = ult > tb + 2 ? [quien, Math.round(ult - tb)] : null; sc.scrollTop = y0; }
  for (const k of ['fuera', 'cortado', 'chico', 'vacio']) { const m = new Map(); out[k].forEach(x => { const key = x[0] + '|' + x[x.length - 1]; if (!m.has(key)) m.set(key, x); }); out[k] = [...m.values()].slice(0, 25); }
  return out;
})()`;
(async () => {
  const { b, page, errores } = await abrir({ ancho, alto, modo });
  const malas = []; page.on('response', r => { if (r.status() >= 400) malas.push(r.status() + ' ' + r.request().method() + ' ' + r.url().replace('http://127.0.0.1:3000', '')); });
  const res = {};
  const guarda = async nombre => { await foto(page, `bn-${ancho}-${modo}-${nombre}`); res[nombre] = await page.evaluate(REVISA); };
  const cierra = () => page.evaluate(() => document.querySelectorAll('.overlay.open').forEach(o => o.classList.remove('open')));
  const paso = async (nombre, fn, espera = 700) => { try { await fn(); await page.waitForTimeout(espera); await guarda(nombre); } catch (e) { res[nombre] = { error: e.message.slice(0, 200) }; } };
  for (const v of VISTAS) await paso(v, () => vista(page, v), 200);
  await vista(page, 'configuracion');
  for (const t of ['preferencias', 'pedidos', 'etiquetas', 'estados', 'ia', 'usuarios']) await paso('cfg-' + t, () => page.evaluate(t => showCfgTab(t), t), 450);
  await vista(page, 'produccion');
  for (const t of ['lista', 'calendario', 'cronograma', 'agenda', 'metricas']) await paso('prod-' + t, () => page.evaluate(t => prodSetVista(t), t), 550);
  await page.evaluate(() => prodSetVista('kanban'));
  await vista(page, 'pedidos');
  const peds = await page.evaluate(async () => (await api('GET', '/pedidos')).map(p => ({ id: p.id, n: (p.encargos || []).length, c: p.cerrado, q: p.es_cotizacion })));
  const ped = peds.filter(p => !p.c && !p.q).sort((a, b) => b.n - a.n)[0];
  await paso('editor-pedido', () => page.evaluate(id => abrirEditar(id), ped.id), 1300);
  await paso('editor-pedido-abajo', () => page.evaluate(() => { document.querySelectorAll('#ovP .mbody, #ovP .modal, #ovP .ed-col, #ovP [class*=col]').forEach(m => { if (m.scrollHeight > m.clientHeight) m.scrollTop = m.scrollHeight; }); }), 500);
  await cierra();
  const cot = peds.find(p => p.q && !p.c); if (cot) { await paso('editor-cotizacion', () => page.evaluate(id => abrirEditar(id), cot.id), 1200); await cierra(); }
  await paso('pedido-nuevo', () => page.evaluate(() => abrirNuevo()), 900); await cierra();
  const prods = await page.evaluate(async () => (await api('GET', '/productos')).map(p => ({ id: p.id, modo: p.tipo_precio || '' })));
  for (const [nom, re] of [['variantes', /variant/i], ['medidas', /medid/i], ['hoja', /pliego/i], ['escalonado', /escalon/i], ['promo', /regla/i]]) { const p = prods.find(p => re.test(p.modo)); if (!p) continue;
    await paso('producto-' + nom, () => page.evaluate(id => abrirEditarProducto(id), p.id), 1300); await cierra(); }
  await paso('producto-nuevo', () => page.evaluate(() => abrirNuevoProducto()), 900); await cierra();
  const cli = await page.evaluate(async () => { const c = await api('GET', '/clientes'); const con = c.find(x => (x.total_pedidos || x.pedidos || 0) > 0) || c[0]; return con && con.id; });
  if (cli) { await paso('cliente', () => page.evaluate(id => verCli(id), cli), 1000); await cierra(); }
  await paso('ventana-perfil', () => page.evaluate(() => abrirPerfil()), 400); await page.evaluate(() => cerrarPerfil());
  await paso('asistente', () => page.evaluate(() => iaAbrir()), 600); await page.evaluate(() => iaCerrar());
  await paso('campana', () => page.evaluate(() => toggleCampana()), 400); await page.evaluate(() => document.getElementById('bell-panel').classList.remove('open'));
  await paso('ventana-exportar', () => page.evaluate(() => abrirExp()), 400); await cierra();
  await paso('ventana-codigos', () => page.evaluate(() => abrirCodigos()), 700); await cierra();
  if (ancho <= 768) { await paso('hoja-todo', () => page.evaluate(() => abrirMas()), 500); await cierra(); }
  await paso('buscador', async () => { const i = page.locator('.search-b input').first(); await i.click(); await i.fill('a'); }, 900);
  await page.keyboard.press('Escape');
  fs.writeFileSync(path.join(CAP, `bn-${ancho}-${modo}.json`), JSON.stringify({ errores, malas, res }, null, 1));
  let n = 0; for (const [p, r] of Object.entries(res)) { if (r.error) { console.log(`  ${p}: NO SE PUDO ABRIR → ${r.error}`); n++; continue; }
    const l = []; if (r.desbordeH > 1) l.push('desborde horizontal ' + r.desbordeH + 'px'); if (r.fuera.length) l.push('fuera ' + r.fuera.length); if (r.cortado.length) l.push('cortado ' + r.cortado.length); if (r.chico.length) l.push('táctil chico ' + r.chico.length); if (r.roto.length) l.push('img rota ' + r.roto.length); if (r.vacio.length) l.push('botón sin nombre ' + r.vacio.length); if (r.tapado) l.push('tapado por la barra ' + r.tapado[1] + 'px');
    if (l.length) { n++; console.log(`  ${p}: ${l.join(' · ')}`); } }
  console.log(`[${ancho}x${alto} ${modo}] pantallas ${Object.keys(res).length} · con hallazgos ${n} · errores de consola ${errores.length} · respuestas ≥400: ${malas.length}`);
  errores.slice(0, 8).forEach(e => console.log('   consola:', e)); [...new Set(malas)].slice(0, 12).forEach(e => console.log('   red:', e));
  await b.close();
})().catch(e => { console.error('FALLO', e.message); process.exit(1); });
