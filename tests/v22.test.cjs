// Version 2.3: viel größere Bibliothek – VCSL-One-Shots (CC0) und erzeugte Loops, alles auf Abruf geladen.
// node tests/v22.test.cjs
const { openApp, createChecker } = require('./harness.cjs');

const { check, finish } = createChecker();

(async () => {
  const app = await openApp({ viewport: { width: 1440, height: 900 } });
  const { page } = app;
  try {
    // ---------- VCSL: jede Datei lädt, klingt und ist sauber lizenziert ----------
    const vc = await page.evaluate(async () => {
      const { library } = window.loopwerk;
      const list = library.list().filter((s) => s.id.startsWith('vc-'));
      await library.ensureMany(list.map((s) => s.id));
      const bad = [];
      for (const s of list) {
        const ok = s.buffer && !s.lazy && s.peaks?.length && s.license === 'CC0' && /creativecommons\.org\/publicdomain\/zero/.test(s.licenseUrl) && /^https:\/\/github\.com\/sgossner\/VCSL\//.test(s.source);
        let peak = 0;
        if (s.buffer) for (let c = 0; c < s.buffer.numberOfChannels; c++) for (const v of s.buffer.getChannelData(c)) peak = Math.max(peak, Math.abs(v));
        if (!ok || peak < 0.05 || peak > 1) bad.push(`${s.id}:${peak.toFixed(2)}`);
      }
      return { n: list.length, bad };
    });
    check('VCSL: mehr als 250 One-Shots', vc.n > 250, String(vc.n));
    check('VCSL: alle laden, klingen und tragen CC0-Lizenz mit Quelle', vc.bad.length === 0, vc.bad.slice(0, 10).join(', '));
    // Regal: große Gruppen in Abschnitte geteilt, Suche findet Tags
    const shelf = await page.evaluate(() => [...document.querySelectorAll('.shelf-sub')].map((n) => n.textContent.split(' ·')[0]));
    check('Regal: Drums in Loops, One-Shots, Percussion geteilt', ['Loops', 'One-Shots', 'Percussion'].every((x) => shelf.includes(x)), shelf.join(' | '));
    await page.fill('#shelf-search', 'conga');
    check('Suche findet Percussion über den Namen', /von/.test(await page.locator('#shelf-total').textContent()) && await page.locator('.loop-item').count() >= 3);
    await page.fill('#shelf-search', '');
    // ---------- Echte Instrumente (Sampler): jedes lädt, klingt, Lizenz stimmt ----------
    const inst = await page.evaluate(async () => {
      const sp = await import('./src/sampler.js');
      const out = [];
      for (const i of sp.sampledInstruments()) {
        const loaded = await sp.loadInstrument(i.id);
        const mid = i.zones[Math.floor(i.zones.length / 2)].midi;
        const ctx = new OfflineAudioContext(1, 44100 * 2, 44100);
        sp.playSampled(ctx, ctx.destination, loaded, mid, 0.01, 0.6, 1);
        const d = (await ctx.startRendering()).getChannelData(0);
        let peak = 0;
        for (const v of d) peak = Math.max(peak, Math.abs(v));
        out.push({ id: i.id, peak: Math.round(peak * 100) / 100, ok: i.license === 'CC0' && /VCSL/.test(i.origin) && /^https:\/\/github\.com\/sgossner\/VCSL/.test(i.source || '') });
      }
      return out;
    });
    check('Echte Instrumente: mindestens 12', inst.length >= 12, inst.map((x) => x.id).join(', '));
    check('Echte Instrumente: alle laden und klingen (Spitze 0,3–1,0), CC0 mit Quelle', inst.every((x) => x.ok && x.peak >= 0.3 && x.peak <= 1), JSON.stringify(inst.filter((x) => !(x.ok && x.peak >= 0.3 && x.peak <= 1))));
    check('Keine Fehler in der Konsole', app.errors.length === 0, app.errors.join(' | '));
  } catch (e) {
    check('Test lief ohne Ausnahme', false, e.stack);
  } finally {
    await app.close();
    finish();
  }
})();
