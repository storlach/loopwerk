// Gemeinsame Test-Hilfen: Server + Browser starten, Prüfungen sammeln, Testsignale registrieren.
const { chromium } = require('playwright');
const { start } = require('./serve.cjs');

// init: Funktion, die vor dem Laden der Seite im Browser läuft (page.addInitScript), z. B. eine MIDI-Attrappe.
// Ältere Tests erwarten das Regal mit offener Gruppe „Drums“ und sichtbare Tonart-/Akkordzeilen; die App startet
// inzwischen mit allem zu. fresh: true lässt den echten Startzustand.
async function openApp({ viewport = { width: 1400, height: 820 }, args = [], hasTouch = false, deviceScaleFactor = 1, init = null, fresh = false } = {}) {
  const server = await start();
  const url = `http://127.0.0.1:${server.address().port}/`;
  const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required', ...args] });
  const page = await browser.newPage({ viewport, hasTouch, isMobile: hasTouch, deviceScaleFactor });
  const errors = [];
  wrapSide(page);
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  if (!fresh) await legacyStart(page);
  if (init) await page.addInitScript(init);
  await page.goto(url);
  await page.waitForFunction(() => window.loopwerk?.ready, null, { timeout: 15000 });
  // Katalog-Sounds lädt die App im Hintergrund nach; Tests sollen mit vollständiger Bibliothek starten
  await page.evaluate(() => window.loopwerk.library.catalogReady);
  await page.evaluate(registerTestSamples);
  return {
    page, browser, url, errors,
    async close() { await browser.close(); server.close(); },
  };
}

// Layout „reiter“ (Loopwerk, Desktop): Bedienelemente liegen in der rechten Leiste je nach Reiter (Datei · Sounds · Mixer).
// Wie ein Mensch den Reiter anklickt, bevor er den Knopf bedient: page.click & Co. wählen vorher den Reiter, in dem das Element liegt.
// Nur für Selektoren als Text; ohne Leiste (Krachwerk, Handy) tut es nichts.
async function revealSide(page, sel) {
  if (typeof sel !== 'string') return;
  try {
    await page.evaluate((s) => {
      const side = document.getElementById('side');
      if (!side || !side.getClientRects().length) return;
      let n = null;
      try { n = document.querySelector(s); } catch { return; }
      if (!n) return;
      const tab = n.closest('.side-sounds') ? 'sounds' : n.closest('.insp-for-mixer, #side-mixer') ? 'mixer' : n.closest('.insp-for-datei, #side-datei, #side-datei-neu, #side-datei-liste') ? 'datei' : null;
      if (tab && document.getElementById('app').dataset.side !== tab) document.getElementById(`side-tab-${tab}`).click();
    }, sel);
  } catch { /* Seite lädt gerade */ }
}
const AKTIONEN = ['click', 'dblclick', 'fill', 'selectOption', 'check', 'uncheck', 'hover', 'press', 'type', 'focus', 'tap'];
// Locator-Ketten (page.locator(a).filter(…).locator(b).click()): der Wurzel-Selektor entscheidet über den Reiter
function wrapLocator(page, loc, root) {
  return new Proxy(loc, {
    get(t, p) {
      const v = t[p];
      if (typeof v !== 'function') return v;
      return (...a) => {
        if (AKTIONEN.includes(p)) return revealSide(page, root).then(() => v.apply(t, a));
        const r = v.apply(t, a);
        return r && typeof r === 'object' && typeof r.filter === 'function' && typeof r.click === 'function' ? wrapLocator(page, r, root) : r;
      };
    },
  });
}
function wrapSide(page) {
  const loc = page.locator.bind(page);
  page.locator = (sel, ...rest) => wrapLocator(page, loc(sel, ...rest), sel);
  for (const m of ['click', 'dblclick', 'fill', 'selectOption', 'check', 'uncheck', 'hover', 'press', 'type', 'focus', 'tap', 'dragAndDrop']) {
    const orig = page[m].bind(page);
    page[m] = async (sel, ...rest) => { await revealSide(page, sel); return orig(sel, ...rest); };
  }
}

// Wie früher starten: Regal-Gruppe „Drums“ offen, Tonart- und Akkordzeile sichtbar (für Tests mit eigenem Browser)
async function legacyStart(page) {
  await page.addInitScript(() => {
    try {
      if (!sessionStorage.getItem('loopwerk.shelfOpen')) sessionStorage.setItem('loopwerk.shelfOpen', '["drums"]');
      if (!localStorage.getItem('loopwerk.harmonyRows')) localStorage.setItem('loopwerk.harmonyRows', 'on');
    } catch { /* egal */ }
  });
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

// Desktop-Bedienung: Knöpfe, die in Menüs, Reitern oder unter „Erstellen“ liegen, erst sichtbar machen
async function reveal(page, sel) {
  await page.evaluate((s) => {
    const n = document.querySelector(s);
    if (!n) return;
    // Desktop (Umbau Scheibe 4): der Clip-Editor liegt als Karte über allem anderen; was außerhalb liegt, braucht ihn zu
    const lw = window.loopwerk;
    if (lw?.overlay?.open && !n.closest('#clip-overlay, .deck, .tip, #hint')) lw.ui.setDock(null);
    // Clip-Editor: Tonhöhe, Autotune, Trennen, Loop sind eingeklappt
    if (n.closest('#ed-tools')?.hidden) document.getElementById('clip-more').click();
    const pop = n.closest('.pop');
    if (pop && pop.hidden) pop.parentElement.querySelector('button').click();
    if (n.closest('.create-panel') && document.querySelector('.shelf').dataset.left !== 'create') document.getElementById('ltab-create').click();
    if (n.closest('.shelf-head, .shelf-list, #library') && document.querySelector('.shelf').dataset.left === 'create') document.getElementById('ltab-sounds').click();
    // Regal-Gruppen starten geschlossen: die Gruppe des Eintrags aufklappen
    const items = n.closest('.shelf-items');
    if (items?.hidden) items.closest('.shelf-group')?.querySelector('.shelf-cat')?.click();
  }, sel);
}
const clickR = async (page, sel) => { await reveal(page, sel); await page.click(sel); };
const selectR = async (page, sel, value) => { await reveal(page, sel); await page.selectOption(sel, value); };
const fillR = async (page, sel, value) => { await reveal(page, sel); await page.fill(sel, value); };
// Beat/Melodie/Einsingen über die Karten unter „Erstellen“
// Desktop: ein offener Editor liegt als Karte über dem Regal (modal) und muss erst zu – wie für die Person, die zuerst schließt
const createCard = async (page, kind) => {
  await page.evaluate(() => { const lw = window.loopwerk; if (lw.overlay?.open) lw.ui.setDock(null); });
  await clickR(page, `.ccard[data-create="${kind}"]`);
};
// Effekt einer Spur ein-/ausschalten: Spur im Inspektor zeigen, Schalter klicken
async function toggleFx(page, trackId, fxId) {
  await page.evaluate((id) => window.loopwerk.ui.selectTrack(id), trackId);
  await page.click(`#fx-${fxId}-on`);
}

// ZIP in Node lesen (Sicherung, Song-ZIP aus Krachwerk): [{ name, method, crc, size, data: Buffer, crcOk }]
function readZipFile(buf) {
  const zlib = require('zlib');
  let end = buf.length - 22;
  while (end >= 0 && buf.readUInt32LE(end) !== 0x06054b50) end--;
  if (end < 0) throw new Error('keine ZIP-Datei');
  const count = buf.readUInt16LE(end + 10);
  let p = buf.readUInt32LE(end + 16);
  const out = [];
  for (let i = 0; i < count; i++) {
    const method = buf.readUInt16LE(p + 10), crc = buf.readUInt32LE(p + 16), csize = buf.readUInt32LE(p + 20), size = buf.readUInt32LE(p + 24);
    const nameLen = buf.readUInt16LE(p + 28), extra = buf.readUInt16LE(p + 30), comment = buf.readUInt16LE(p + 32), at = buf.readUInt32LE(p + 42);
    const name = buf.subarray(p + 46, p + 46 + nameLen).toString('utf8');
    const start = at + 30 + buf.readUInt16LE(at + 26) + buf.readUInt16LE(at + 28);
    const raw = buf.subarray(start, start + csize);
    const data = method === 8 ? zlib.inflateRawSync(raw) : raw;
    out.push({ name, method, crc, size, data, crcOk: zlib.crc32(data) === crc });
    p += 46 + nameLen + extra + comment;
  }
  return out;
}

// Gespeicherte Projektdatei lesen: JSON (Loopwerk) oder Song-ZIP (Krachwerk, Spec krachwerk-3 §5). Bei der ZIP kommt
// das Song-JSON zurück, ownSounds = Sound-Metadaten aus werkstatt.json (wie die eingebetteten Sounds der JSON-Datei)
function readSaved(file) {
  const fs = require('fs');
  const buf = fs.readFileSync(file);
  if (buf.readUInt32LE(0) !== 0x04034b50) return JSON.parse(buf.toString('utf8'));
  const entries = readZipFile(buf);
  const man = JSON.parse(entries.find((e) => e.name === 'werkstatt.json').data.toString('utf8'));
  const song = man.songs.find((s) => s.current) ?? man.songs[0];
  const json = JSON.parse(entries.find((e) => e.name === song.file).data.toString('utf8'));
  return { ...json, ownSounds: man.sounds, zip: { manifest: man, entries } };
}

// Desktop (Umbau Scheibe 4): die Clip-Einstellungen (Lautstärke, Ein-/Ausblenden, Geschwindigkeit, Sound-Tempo, Tonart …) stehen im Clip-Editor.
// Öffnet ihn für den Clip wie der Doppelklick (Auswahl + Editor); Beat und Melodie öffnen den Pattern-Editor. Schließen: closeClipSettings.
async function openClipSettings(page, clipId) {
  await page.evaluate((id) => {
    const lw = window.loopwerk;
    lw.ui.select(id);
    const c = lw.store.findClip(id)?.clip;
    const pid = c && lw.library.get(c.sampleId)?.patternId;
    if (pid) lw.patternEditor.open(pid); else lw.editor.open(id);
  }, clipId);
  await page.waitForSelector('#clip-overlay:not([hidden]) .insp-clip:not([hidden])', { state: 'visible', timeout: 15000 });
  await page.waitForTimeout(260); // Einflug der Karte
}
const closeClipSettings = (page) => page.evaluate(() => window.loopwerk.ui.setDock(null));

module.exports = {
  openClipSettings, closeClipSettings,
  revealSide, legacyStart, openApp, createChecker, makeWav, reveal, clickR, selectR, fillR, createCard, toggleFx, readZipFile, readSaved };
