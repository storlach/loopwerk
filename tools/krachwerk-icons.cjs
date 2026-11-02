// Rendert assets/icons/krachwerk.svg zu PNG (512, 180 für iOS, 32 für den Tab). Einmal nach Änderungen am SVG:
// node tools/krachwerk-icons.cjs
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const DIR = path.resolve(__dirname, '..', 'assets', 'icons');
(async () => {
  const svg = fs.readFileSync(path.join(DIR, 'krachwerk.svg'), 'utf8');
  const browser = await chromium.launch();
  for (const size of [512, 180, 32]) {
    const page = await browser.newPage({ viewport: { width: size, height: size } });
    await page.setContent(`<html><body style="margin:0;background:transparent">${svg.replace('<svg ', `<svg width="${size}" height="${size}" `)}</body></html>`);
    await page.screenshot({ path: path.join(DIR, `krachwerk-${size}.png`), omitBackground: true });
    await page.close();
  }
  await browser.close();
  console.log('Icons geschrieben:', DIR);
})();
