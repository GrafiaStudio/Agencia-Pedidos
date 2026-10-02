// Genera los iconos de la app desde el isotipo del favicon (fondo Deep Teal, trazo Hielo).
const { chromium } = require('I:/PROYECTOS CLAUDE/AGENCIA PEDIDOS/.pw-mcp/node_modules/playwright-core');
const fs = require('fs');
const PUB = 'I:/PROYECTOS CLAUDE/AGENCIA PEDIDOS/agencia/public/';
const svg = fs.readFileSync(PUB + 'favicon.svg', 'utf8');
const g = svg.match(/<g fill="#0A2E3B">([\s\S]*)<\/g>/)[1];
const vb = svg.match(/viewBox="([^"]+)"/)[1].split(' ').map(Number);
const hoja = (lado, escala) => { const cx = vb[0] + vb[2] / 2, cy = vb[1] + vb[3] / 2, w = vb[2] / escala;
  return `<html><body style="margin:0;background:#0A2E3B"><svg xmlns="http://www.w3.org/2000/svg" width="${lado}" height="${lado}" viewBox="${cx - w / 2} ${cy - w / 2} ${w} ${w}"><defs><radialGradient id="f" cx="30%" cy="18%" r="95%"><stop offset="0" stop-color="#14566A"/><stop offset="1" stop-color="#0A2E3B"/></radialGradient></defs><rect x="${cx - w / 2}" y="${cy - w / 2}" width="${w}" height="${w}" fill="url(#f)"/><g fill="#E9FFFE">${g}</g></svg></body></html>`; };
(async () => {
  const b = await chromium.launch({ executablePath: 'C:/Users/ADMIN/AppData/Local/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-win64/chrome-headless-shell.exe' });
  for (const [nombre, lado, escala] of [['apple-touch-icon.png', 180, 1.12], ['icon-192.png', 192, 1.12], ['icon-512.png', 512, 1.12], ['icon-maskable-512.png', 512, 0.86]]) {
    const p = await b.newPage({ viewport: { width: lado, height: lado } }); await p.setContent(hoja(lado, escala)); await p.screenshot({ path: PUB + nombre }); await p.close();
    console.log(nombre, Math.round(fs.statSync(PUB + nombre).size / 1024) + ' KB'); }
  await b.close();
})();
