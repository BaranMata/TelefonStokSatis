// docs/diagrams/*.mmd (Mermaid) dosyalarını PNG ve SVG olarak çizer.
// Mermaid kütüphanesi CDN'den yüklenir; internet bağlantısı gerekir.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const dir = path.join(root, 'docs', 'diagrams');
const executablePath = [
  process.env.BROWSER,
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
].filter(Boolean).find((p) => fs.existsSync(p));

const browser = await puppeteer.launch({ executablePath, headless: true });
try {
  for (const file of fs.readdirSync(dir).filter((f) => f.endsWith('.mmd'))) {
    const page = await browser.newPage();
    await page.setViewport({ width: 2400, height: 1600, deviceScaleFactor: 3 });
    await page.setContent(`<!doctype html><html><body style="margin:0;background:#fff">
      <div id="d" style="display:inline-block;padding:16px"></div>
      <script src="https://cdn.jsdelivr.net/npm/mermaid@11.4.1/dist/mermaid.min.js"></script>
    </body></html>`, { waitUntil: 'networkidle0' });
    // Bir dosyada "%% ---" satırıyla ayrılmış birden fazla diyagram varsa alt alta tek görsel olarak çizilir
    // (geniş diyagramları A4 dikey sayfaya sığdırmak için).
    const parts = fs.readFileSync(path.join(dir, file), 'utf8').replace(/\r\n/g, '\n').split(/^%% ---$/m);
    const svg = await page.evaluate(async (codes) => {
      window.mermaid.initialize({ startOnLoad: false, theme: 'default', fontFamily: 'Segoe UI, sans-serif', er: { useMaxWidth: false }, flowchart: { useMaxWidth: false }, sequence: { useMaxWidth: false } });
      const host = document.getElementById('d');
      for (let i = 0; i < codes.length; i++) {
        const { svg } = await window.mermaid.render(`g${i}`, codes[i]);
        const box = document.createElement('div');
        box.style.marginBottom = i < codes.length - 1 ? '40px' : '0';
        box.innerHTML = svg;
        host.appendChild(box);
      }
      const svgs = [...host.querySelectorAll(':scope > div > svg')];
      if (svgs.length === 1) return svgs[0].outerHTML;
      // Parçaları tek bir SVG dosyasında üst üste yerleştir
      let y = 0;
      let width = 0;
      const inner = svgs.map((s) => {
        const r = s.getBoundingClientRect();
        const out = s.outerHTML.replace('<svg', `<svg x="0" y="${y}" width="${r.width}" height="${r.height}"`);
        y += r.height + 40;
        width = Math.max(width, r.width);
        return out;
      });
      return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${y - 40}" style="background:#fff">${inner.join('')}</svg>`;
    }, parts);
    const base = file.replace(/\.mmd$/, '');
    fs.writeFileSync(path.join(dir, `${base}.svg`), svg);
    const el = await page.$('#d');
    await el.screenshot({ path: path.join(dir, `${base}.png`) });
    console.log('✓', base);
    await page.close();
  }
} finally {
  await browser.close();
}
