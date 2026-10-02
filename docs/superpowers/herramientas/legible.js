// Barrido de legibilidad: por cada pantalla guarda captura + la lista de textos visibles (color y caja).
// Luego legible.py mide el contraste REAL de cada texto contra el píxel de fondo de la captura.
// Uso: node legible.js <dia|noche> [ancho alto]
const { abrir, vista, foto, VISTAS, CAP } = require('./pw.js');
const fs = require('fs'), path = require('path');
const modo = process.argv[2] || 'noche', ancho = +process.argv[3] || 1920, alto = +process.argv[4] || 950;
const RECOGE = `(() => {
  const out = [], vw = innerWidth, vh = innerHeight;
  const tapa = e => { // ¿el elemento es lo que realmente se ve en su centro? (descarta lo tapado por ventanas)
    const r = e.getBoundingClientRect(), t = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return t && (t === e || e.contains(t)); };
  document.querySelectorAll('body *').forEach(e => {
    if (e.closest('svg') || e.tagName === 'OPTION' || e.tagName === 'SCRIPT' || e.tagName === 'STYLE') return;
    const esIcono = e.tagName === 'I' && /ti/.test(e.className);
    const tieneTexto = [...e.childNodes].some(n => n.nodeType === 3 && n.textContent.trim());
    const esCampo = ['INPUT', 'TEXTAREA', 'SELECT'].includes(e.tagName) && e.type !== 'checkbox' && e.type !== 'radio' && e.type !== 'range' && e.type !== 'color' && e.type !== 'file';
    if (!tieneTexto && !esCampo && !esIcono) return;
    const r = e.getBoundingClientRect();
    // caja del TEXTO (no del elemento): el fondo real es el que rodea a las letras
    let tb = null;
    if (tieneTexto) { const rg = document.createRange(); const nodos = [...e.childNodes].filter(n => n.nodeType === 3 && n.textContent.trim());
      let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9; nodos.forEach(n => { rg.selectNodeContents(n); [...rg.getClientRects()].forEach(q => { if (q.width < 1) return; x0 = Math.min(x0, q.left); y0 = Math.min(y0, q.top); x1 = Math.max(x1, q.right); y1 = Math.max(y1, q.bottom); }); });
      // ¿hay un elemento visible pegado a la izquierda o a la derecha del texto? (icono, negrita…) → ese lado no sirve para medir el fondo
      const hijos = [...e.childNodes].filter(n => n.nodeType === 1 ? n.getClientRects().length : n.textContent.trim());
      const iz = hijos[0] && hijos[0].nodeType === 1, de = hijos[hijos.length - 1] && hijos[hijos.length - 1].nodeType === 1;
      if (x1 > x0) tb = { x: Math.round(x0), y: Math.round(y0), w: Math.round(x1 - x0), h: Math.round(y1 - y0), iz, de }; }
    if (r.width < 4 || r.height < 4 || r.left < 0 || r.top < 0 || r.right > vw || r.bottom > vh || !e.offsetParent) return;
    const c = getComputedStyle(e); if (c.visibility === 'hidden' || +c.opacity === 0) return;
    if (!tapa(e)) return;
    let op = 1, p = e; while (p && p !== document.body) { op *= +getComputedStyle(p).opacity; p = p.parentElement; }
    let color = c.color, txt = (e.textContent || '').trim().slice(0, 26);
    if (esCampo) { if (!e.value) { color = getComputedStyle(e, '::placeholder').color; txt = '[ejemplo] ' + (e.placeholder || ''); } else txt = e.tagName === 'SELECT' ? e.options[e.selectedIndex].text : e.value; }
    if (esIcono) txt = '[icono] ' + e.className.replace('ti ', '');
    const bgA = (() => { const m = c.backgroundColor.match(/[0-9.]+/g) || []; return m.length === 4 ? +m[3] : (m.length === 3 ? 1 : 0); })();
    const bw = parseFloat(c.borderTopWidth) || 0, propio = bgA > .02 || c.backgroundImage !== 'none' || bw > 0;
    out.push({ k: ((e.className && e.className.toString().split(' ')[0]) || e.tagName).slice(0, 24), txt, color, fs: parseFloat(c.fontSize), fw: parseInt(c.fontWeight, 10), op: +op.toFixed(2), icono: esIcono,
      propio, bw, pl: parseFloat(c.paddingLeft) || 0, pt: parseFloat(c.paddingTop) || 0, tb,
      x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) });
  });
  return out;
})()`;
(async () => {
  const { b, page, errores } = await abrir({ ancho, alto, modo });
  const guarda = async nombre => { const f = await foto(page, `leg-${modo}-${nombre}`); fs.writeFileSync(f.replace('.png', '.json'), JSON.stringify(await page.evaluate(RECOGE))); };
  for (const v of VISTAS) { await vista(page, v); await guarda(v); }
  // pestañas de Configuración y de Producción
  await vista(page, 'configuracion');
  for (const t of ['preferencias', 'pedidos', 'etiquetas', 'estados', 'ia', 'usuarios']) { await page.evaluate(t => showCfgTab(t), t); await page.waitForTimeout(400); await guarda('cfg-' + t); }
  await vista(page, 'produccion');
  for (const t of ['lista', 'calendario', 'cronograma', 'agenda', 'metricas']) { await page.evaluate(t => prodSetVista(t), t); await page.waitForTimeout(500); await guarda('prod-' + t); }
  await page.evaluate(() => prodSetVista('kanban'));
  // editores y ventanas
  const peds = await page.evaluate(async () => (await api('GET', '/pedidos')).map(p => ({ id: p.id, n: (p.encargos || []).length, c: p.cerrado, q: p.es_cotizacion })));
  const ped = peds.filter(p => !p.c && !p.q).sort((a, b) => b.n - a.n)[0];
  await page.evaluate(id => abrirEditar(id), ped.id); await page.waitForTimeout(1300); await guarda('editor-pedido');
  await page.evaluate(() => { const m = document.querySelector('#ovP .mbody'); m.scrollTop = m.scrollHeight; }); await page.waitForTimeout(400); await guarda('editor-pedido-abajo');
  await page.evaluate(() => document.getElementById('ovP').classList.remove('open'));
  const cerrado = peds.find(p => p.c); if (cerrado) { await page.evaluate(id => abrirEditar(id), cerrado.id); await page.waitForTimeout(1200); await guarda('editor-pedido-cerrado'); await page.evaluate(() => document.getElementById('ovP').classList.remove('open')); }
  const prods = await page.evaluate(async () => (await api('GET', '/productos')).map(p => ({ id: p.id, modo: p.tipo_precio || '' })));
  for (const [nom, re] of [['variantes', /variant/i], ['medidas', /medid/i], ['hoja', /pliego/i], ['escalonado', /escalon/i], ['promo', /regla/i]]) { const p = prods.find(p => re.test(p.modo)); if (!p) continue;
    await page.evaluate(id => abrirEditarProducto(id), p.id); await page.waitForTimeout(1300); await guarda('editor-producto-' + nom); await page.evaluate(() => document.getElementById('ovProd').classList.remove('open')); }
  await vista(page, 'pedidos');
  await page.evaluate(() => abrirPerfil()); await page.waitForTimeout(350); await guarda('ventana-perfil'); await page.evaluate(() => cerrarPerfil());
  await page.evaluate(() => iaAbrir()); await page.waitForTimeout(500); await guarda('asistente'); await page.evaluate(() => iaCerrar());
  await page.evaluate(() => toggleCampana()); await page.waitForTimeout(300); await guarda('campana'); await page.evaluate(() => document.getElementById('bell-panel').classList.remove('open'));
  await page.evaluate(() => abrirExp()); await page.waitForTimeout(350); await guarda('ventana-exportar'); await page.evaluate(() => document.querySelectorAll('.overlay.open').forEach(o => o.classList.remove('open')));
  console.log('pantallas guardadas:', fs.readdirSync(CAP).filter(f => f.startsWith(`leg-${modo}-`) && f.endsWith('.json')).length, '| errores de consola:', errores.length, errores.slice(0, 3));
  await b.close();
})().catch(e => { console.error('FALLO', e.message); process.exit(1); });
