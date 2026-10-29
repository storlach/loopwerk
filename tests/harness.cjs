// Gemeinsame Test-Hilfen: Server + Browser starten, Prüfungen sammeln, Testsignale registrieren.
const { chromium } = require('playwright');
const { start } = require('./serve.cjs');

async function openApp({ viewport = { width: 1400, height: 820 } } = {}) {
  const server = await start();
  const url = `http://127.0.0.1:${server.address().port}/`;
  const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  const page = await browser.newPage({ viewport });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(url);
  await page.waitForFunction(() => window.loopwerk?.ready, null, { timeout: 15000 });
  await page.evaluate(registerTestSamples);
  return {
    page, browser, url, errors,
    async close() { await browser.close(); server.close(); },
  };
}

// Läuft im Browser: Impuls (1 Takt, Impuls auf Frame 0) und Gleichspannung (1 Takt, Wert 1).
function registerTestSamples() {
  const { library } = window.loopwerk;
  const sr = 44100;
  const make = (fill) => {
    const buf = new AudioBuffer({ numberOfChannels: 2, length: 2 * sr, sampleRate: sr });
    for (let c = 0; c < 2; c++) fill(buf.getChannelData(c));
    return buf;
  };
  library.register({ id: 'test-click', name: 'Klick', category: 'fx', lengthBeats: 4, bpm: 120, buffer: make((d) => { d[0] = 1; }) });
  library.register({ id: 'test-dc', name: 'Gleichspannung', category: 'fx', lengthBeats: 4, bpm: 120, buffer: make((d) => d.fill(1)) });
}

function createChecker() {
  const results = [];
  const check = (name, ok, detail = '') => {
    results.push({ name, ok });
    console.log(`${ok ? '✔' : '✘'} ${name}${detail ? '  — ' + detail : ''}`);
  };
  const finish = () => {
    const failed = results.filter((r) => !r.ok).length;
    console.log(`\n${results.length - failed}/${results.length} bestanden`);
    process.exitCode = failed ? 1 : 0;
  };
  return { check, finish };
}

module.exports = { openApp, createChecker };
