// Dibuja cada página con el visor oficial de draw.io (viewer-static.min.js) dentro de una página
// local, y guarda una captura PNG para revisar y compartir. El diagrama no sale del computador:
// solo se descarga el programa del visor.
// Uso: node tools/diagramas/vista.cjs [carpeta] [páginas, p. ej. 1,3]
const fs = require('fs');
const path = require('path');
const { chromium } = require('@playwright/test');

const dir = process.argv[2] || path.join(__dirname, '..', '..', 'docs', 'diagramas');
const only = process.argv[3] ? process.argv[3].split(',').map(Number) : null;
const attr = (s) => s.replace(/&/g, '&amp;').replace(/'/g, '&#39;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

(async () => {
  const b = await chromium.launch({ channel: 'msedge' });
  for (let i = 1; i <= 5; i++) {
    if (only && !only.includes(i)) continue;
    const xml = fs.readFileSync(path.join(dir, `.pagina-${i}.drawio`), 'utf8');
    const w = Number(/pageWidth="(\d+)"/.exec(xml)[1]);
    const h = Number(/pageHeight="(\d+)"/.exec(xml)[1]);
    const cfg = JSON.stringify({ xml, toolbar: '', nav: false, resize: true, lightbox: false, border: 20 });
    const html = `<!doctype html><html><head><meta charset="utf-8"><style>body{margin:0;background:#F0EEE9}</style></head><body><div class="mxgraph" data-mxgraph='${attr(cfg)}'></div><script src="https://viewer.diagrams.net/js/viewer-static.min.js"></script></body></html>`;
    const tmp = path.join(dir, `.vista-${i}.html`);
    fs.writeFileSync(tmp, html);
    const page = await b.newPage({ viewport: { width: w + 40, height: h + 40 }, deviceScaleFactor: 1 });
    await page.goto('file:///' + tmp.replace(/\\/g, '/'), { waitUntil: 'load', timeout: 90000 });
    await page.waitForSelector('.mxgraph svg', { timeout: 60000 });
    await page.waitForTimeout(4000);
    const out = path.join(dir, `vista-${i}.png`);
    await page.locator('.mxgraph').screenshot({ path: out });
    console.log('vista', out);
    await page.close();
    fs.unlinkSync(tmp);
  }
  await b.close();
})().catch((e) => {
  console.error('ERROR', e.message.slice(0, 300));
  process.exit(1);
});
