// Ciclo de comparación: captura el Dashboard (y lo que se pida) a un tamaño dado
const { abrir, foto } = require('./pw.js');
const nombre = process.argv[2] || 'ciclo', ancho = +process.argv[3] || 1920, alto = +process.argv[4] || 950, modo = process.argv[5] || 'dia';
(async () => {
  const { b, page, errores } = await abrir({ ancho, alto, modo });
  await page.waitForTimeout(1500);
  const info = await page.evaluate(() => ({ vista: document.body.dataset.vista, scrollH: document.documentElement.scrollHeight, iaFija: !!document.querySelector('.ia-panel.ia-fija'), dbH: Math.round((document.getElementById('db') || {}).getBoundingClientRect?.().height || 0) }));
  await foto(page, nombre);
  console.log(JSON.stringify(info), '| errores:', errores.length, errores.slice(0, 4));
  await b.close();
})().catch(e => { console.error('FALLO', e.message); process.exit(1); });
