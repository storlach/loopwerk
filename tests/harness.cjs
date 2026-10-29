// Gemeinsame Test-Hilfen: Server + Browser starten, Prüfungen sammeln, Testsignale registrieren.
const { chromium } = require('playwright');
const { start } = require('./serve.cjs');

async function openApp({ viewport = { width: 1400, height: 820 }, args = [], hasTouch = false, deviceScaleFactor = 1 } = {}) {
  const server = await start();
  const url = `http://127.0.0.1:${server.address().port}/`;
  const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required', ...args] });
  const page = await browser.newPage({ viewport, hasTouch, isMobile: hasTouch, deviceScaleFactor });
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

// Erzeugt eine 16-Bit-Stereo-WAV-Datei (Sinus) als Buffer – für Import-Tests
function makeWav(seconds, freq = 440, sampleRate = 44100) {
  const n = Math.round(seconds * sampleRate);
  const buf = Buffer.alloc(44 + n * 4);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * 4, 4); buf.write('WAVE', 8); buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(2, 22); buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(sampleRate * 4, 28); buf.writeUInt16LE(4, 32); buf.writeUInt16LE(16, 34); buf.write('data', 36); buf.writeUInt32LE(n * 4, 40);
  for (let i = 0; i < n; i++) {
    const v = Math.round(Math.sin(2 * Math.PI * freq * i / sampleRate) * 0.5 * 32767);
    buf.writeInt16LE(v, 44 + i * 4); buf.writeInt16LE(v, 46 + i * 4);
  }
  return buf;
}

module.exports = { openApp, createChecker, makeWav };
