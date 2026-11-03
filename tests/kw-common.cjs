// Gemeinsame Hilfen der Krachwerk-Abschlusstests (Scheibe 5): Fake-Mikrofon-Dateien, Seite öffnen, Szenen.
const fs = require('fs');

const PHONE = { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 };
const DESK = { viewport: { width: 1400, height: 820 } };

function wavHeader(n, sr = 48000) {
  const buf = Buffer.alloc(44 + n * 2);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * 2, 4); buf.write('WAVE', 8); buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22); buf.writeUInt32LE(sr, 24);
  buf.writeUInt32LE(sr * 2, 28); buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34); buf.write('data', 36); buf.writeUInt32LE(n * 2, 40);
  return buf;
}

// 1 s Stille, ein „Bumm“ (Kick, 0,4 s), dann Stille – laut genug für Stopp nach Stille
function micWav(file, { gain = 0.3, seconds = 5 } = {}) {
  const sr = 48000, n = sr * seconds;
  const buf = wavHeader(n, sr);
  let ph = 0;
  for (let i = 0; i < n; i++) {
    let v = 0;
    const k = i - sr;
    if (k >= 0 && k < sr * 0.4) { const f = 46 + 119 * Math.exp(-k / (sr * 0.03)); ph += 2 * Math.PI * f / sr; v = gain * Math.sin(ph) * Math.exp(-k / (sr * 0.09)); }
    buf.writeInt16LE(Math.round(v * 32767), 44 + i * 2);
  }
  fs.writeFileSync(file, buf);
}

// 0,8 s Stille, dann alle 0,7 s ein Schlag (Kick, Snare, Hi-Hat, Kick, Snare, Hi-Hat), dann Stille („Klatsch dein Kit“)
function clapWav(file) {
  const sr = 48000, n = sr * 10;
  const buf = wavHeader(n, sr);
  let seed = 11;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1;
  const d = new Float32Array(n);
  const hit = (kind, at) => {
    const o = Math.round(sr * at);
    let ph = 0, prev = 0, y1 = 0, y2 = 0;
    const r = 0.97, w = 2 * Math.PI * 1500 / sr, a1 = 2 * r * Math.cos(w), a2 = -r * r;
    for (let i = 0; i < sr * 0.3 && o + i < n; i++) {
      let v = 0;
      if (kind === 0) { const f = 46 + 119 * Math.exp(-i / (sr * 0.03)); ph += 2 * Math.PI * f / sr; v = 0.5 * Math.sin(ph) * Math.exp(-i / (sr * 0.09)); }
      else if (kind === 1) { const y = rnd() * 0.12 + a1 * y1 + a2 * y2; y2 = y1; y1 = y; v = 0.8 * y * Math.exp(-i / (sr * 0.06)); }
      else { const x = rnd(); v = (x - prev) * 0.45 * Math.exp(-i / (sr * 0.018)); prev = x; }
      d[o + i] += v;
    }
  };
  for (let k = 0; k < 6; k++) hit(k % 3, 0.8 + 0.7 * k);
  for (let i = 0; i < n; i++) buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, d[i] + 0.001 * rnd())) * 32767), 44 + i * 2);
  fs.writeFileSync(file, buf);
}

// Krachwerk öffnen; init: Funktion(en), die vor dem Start im Browser laufen (gleicher Ursprung, App noch nicht gestartet)
async function openKw(base, context, { init = null, initArg = null, path: kwPath = '/werkstatt/', wait = true } = {}) {
  const page = await context.newPage();
  const errors = [];
  const requests = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('request', (r) => requests.push(r.url()));
  if (init) {
    await page.goto(`${base}${kwPath}manifest.webmanifest`);
    for (const f of [].concat(init)) await page.evaluate(f, initArg);
  }
  const t0 = Date.now();
  await page.goto(`${base}${kwPath}`);
  if (wait) await page.waitForFunction(() => window.loopwerk?.ready, null, { timeout: 30000 });
  return { page, errors, requests, startMs: Date.now() - t0 };
}

// Zwei eigene Sounds („Bumm“, „Klatsch“) auf zwei Spuren, je ein Takt; Rückgabe: ids
function seedTwo(page) {
  return page.evaluate(async () => {
    const lw = window.loopwerk;
    const mk = async (n, f) => {
      const b = new AudioBuffer({ numberOfChannels: 1, length: 22050, sampleRate: 44100 });
      const d = b.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = 0.6 * Math.sin(i / f) * Math.exp(-i / 5000);
      return lw.own.create({ name: n, buffer: b, source: 'Aufnahme', from: 'mic', cls: null, tags: [] });
    };
    const a = await mk('Bumm', 20);
    const b = await mk('Klatsch', 6);
    lw.store.addClip(lw.store.project.tracks[0].id, a.id, 0, 4);
    lw.store.addClip(lw.store.project.tracks[1].id, b.id, 4, 4);
    return { a: a.id, b: b.id };
  });
}

// Song-Werkbank öffnen: Handy = Lesezeile, Desktop = Songname
async function openSong(page, phone) {
  if (phone) await page.tap('#deck-name'); else await page.click('#project-menu-btn');
  await page.waitForFunction(() => document.querySelector('#sb-name')?.getClientRects().length > 0, null, { timeout: 5000 });
  await page.waitForTimeout(450);
}

const visible = (page, sel) => page.evaluate((q) => { const e = document.querySelector(q); return !!e && e.getClientRects().length > 0 && !e.closest('[hidden]'); }, sel);

// Weißglut: sichtbare Flächen in der Farbe --amber (ohne Marke und Logo)
function whiteHot(page) {
  return page.evaluate(() => {
    const probe = document.createElement('i');
    probe.style.background = 'var(--amber)';
    document.body.append(probe);
    const amber = getComputedStyle(probe).backgroundColor;
    probe.remove();
    const hits = [];
    for (const e of document.body.querySelectorAll('*')) {
      if (!e.getClientRects().length || e.closest('[hidden]') || e.closest('.playhead, #brand-bars, .splash, #boot, .lens, .ph-grip, .ruler-mark')) continue;
      const r = e.getBoundingClientRect();
      if (r.width < 6 || r.height < 6 || r.right < 0 || r.bottom < 0 || r.left > innerWidth || r.top > innerHeight) continue;
      if (getComputedStyle(e).backgroundColor === amber) hits.push(`${e.tagName.toLowerCase()}${e.id ? '#' + e.id : ''}${e.className && typeof e.className === 'string' ? '.' + e.className.split(' ')[0] : ''}`);
    }
    return hits;
  });
}

module.exports = { PHONE, DESK, micWav, clapWav, openKw, seedTwo, openSong, visible, whiteHot };
