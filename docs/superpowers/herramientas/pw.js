// Arnés de navegador para verificar la piel. Usa el Playwright que ya trae el MCP del proyecto.
const { chromium } = require('I:/PROYECTOS CLAUDE/AGENCIA PEDIDOS/.pw-mcp/node_modules/playwright-core');
const path = require('path');
const BASE = 'http://127.0.0.1:3000';            // OJO: localhost:3000 lo ocupa otro programa en esta máquina
const CAP = process.env.CAP_DIR || path.join(__dirname, 'cap');
const VISTAS = ['dashboard', 'pedidos', 'clientes', 'registros', 'productos', 'costos', 'produccion', 'inventario', 'bitacora', 'archivo', 'ayuda', 'configuracion'];
async function token(cred) {
  const r = await fetch(BASE + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cred || { pin: '1234' }) });
  const j = await r.json();
  if (!j.token) throw new Error('NO HAY TOKEN: ' + JSON.stringify(j));   // nunca caer al de admin en silencio
  return j.token;
}
async function abrir({ ancho = 1920, alto = 950, modo = 'dia', cred, sinSesion = false } = {}) {
  const b = await chromium.launch({ executablePath: 'C:/Users/ADMIN/AppData/Local/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-win64/chrome-headless-shell.exe' });
  const ctx = await b.newContext({ viewport: { width: ancho, height: alto } });
  const page = await ctx.newPage();
  const errores = [];
  page.on('pageerror', e => errores.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errores.push('console: ' + m.text().slice(0, 200)); });
  if (!sinSesion) {
    const tk = await token(cred);
    await page.addInitScript(([tk, modo]) => { localStorage.setItem('grafia_token', tk); localStorage.setItem('temaModo', modo); }, [tk, modo]);
  } else {
    await page.addInitScript(modo => { localStorage.setItem('temaModo', modo); }, modo);
  }
  await page.goto(BASE, { waitUntil: 'networkidle' });
  if (!sinSesion) await page.waitForFunction(() => typeof ME !== 'undefined' && ME && document.querySelector('.view.active'), null, { timeout: 15000 });
  await page.evaluate(() => document.fonts.ready);
  return { b, page, errores };
}
async function vista(page, v) {
  await page.evaluate(v => showView(v), v);
  await page.waitForTimeout(900);
}
async function foto(page, nombre, opts = {}) {
  const f = path.join(CAP, nombre + '.png');
  await page.screenshot({ path: f, ...opts });
  return f;
}
module.exports = { abrir, vista, foto, token, BASE, CAP, VISTAS };
