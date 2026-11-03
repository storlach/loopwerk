// WAV mit 16/24 Bit und 32 Bit Gleitkomma: genaue Rückwandlung, Gleitkomma behält Werte über 0 dBFS;
// Stems ohne Summe stellen WAV 32 Bit voreingestellt ein. node tests/wav-bits.test.cjs
const { openApp, createChecker } = require('./harness.cjs');

const { check, finish } = createChecker();

(async () => {
  const app = await openApp();
  const { page } = app;
  try {
    const r = await page.evaluate(async () => {
      const { encodeWav } = await import('./src/wav.js');
      const sr = 44100;
      const vals = [0, 0.5, -0.25, 0.123456, -0.987654, 1.5, -2];
      const b = new AudioBuffer({ numberOfChannels: 2, length: vals.length, sampleRate: sr });
      b.getChannelData(0).set(vals);
      b.getChannelData(1).set(vals.map((v) => -v));
      const out = {};
      for (const bits of [16, 24, 32]) {
        const blob = encodeWav(b, { bits });
        const ab = await blob.arrayBuffer();
        const dv = new DataView(ab);
        const ctx = new OfflineAudioContext(2, vals.length, sr);
        const dec = await ctx.decodeAudioData(ab.slice(0));
        const d0 = [...dec.getChannelData(0)], d1 = [...dec.getChannelData(1)];
        out[bits] = { tag: dv.getUint16(20, true), bitsField: dv.getUint16(34, true), size: ab.byteLength, d0, d1, len: dec.length };
      }
      return { vals, out };
    });
    const err = (bits, k) => Math.max(...r.vals.slice(0, 5).map((v, i) => Math.abs(r.out[bits][k][i] - (k === 'd0' ? v : -v))));
    check('16 Bit: PCM, kleine Abweichung (< 1/32768), Werte über 0 dBFS abgeschnitten', r.out[16].tag === 1 && r.out[16].bitsField === 16 && err(16, 'd0') < 1 / 32768 + 1e-6 && Math.abs(r.out[16].d0[5] - 1) < 1e-3, JSON.stringify(r.out[16].d0));
    check('24 Bit: PCM, Abweichung < 1/8 Mio., Werte über 0 dBFS abgeschnitten', r.out[24].tag === 1 && r.out[24].bitsField === 24 && err(24, 'd0') < 2e-7 && err(24, 'd1') < 2e-7 && Math.abs(r.out[24].d0[5] - 1) < 1e-5, JSON.stringify(r.out[24].d0));
    check('32 Bit Gleitkomma: verlustfrei, auch über 0 dBFS (1,5 und −2 bleiben)', r.out[32].tag === 3 && r.out[32].bitsField === 32 && err(32, 'd0') < 1e-7 && Math.abs(r.out[32].d0[5] - 1.5) < 1e-6 && Math.abs(r.out[32].d0[6] + 2) < 1e-6, JSON.stringify(r.out[32].d0));
    check('Dateigrößen passen zur Bittiefe (Kopf + Frames × Kanäle × Bytes)', r.out[16].size === 44 + 7 * 2 * 2 && r.out[24].size === 44 + 7 * 2 * 3 && r.out[32].size === 58 + 7 * 2 * 4, JSON.stringify([r.out[16].size, r.out[24].size, r.out[32].size]));

    // Export-Fach: drei WAV-Wahlknöpfe; Stems ohne Summe stellen 32 Bit ein
    await page.evaluate(() => window.loopwerk.ui.setDock('export'));
    await page.waitForTimeout(300);
    const opts = await page.evaluate(() => [...document.querySelectorAll('input[name="ex-format"]')].map((n) => n.value));
    check('Export-Fach: WAV 16, 24, 32 Bit und MP3 zur Wahl', JSON.stringify(opts) === '["wav","wav24","wav32","mp3"]', JSON.stringify(opts));
    await page.check('#ex-stems');
    const f1 = await page.evaluate(() => document.querySelector('input[name="ex-format"]:checked').value);
    check('Einzelspuren ohne Summe: WAV springt auf 32 Bit Gleitkomma', f1 === 'wav32', f1);
    await page.check('#ex-format-mp3');
    await page.uncheck('#ex-stems');
    await page.check('#ex-stems');
    const f2 = await page.evaluate(() => document.querySelector('input[name="ex-format"]:checked').value);
    check('… aber nur, wenn 16 Bit gewählt war (MP3 bleibt MP3)', f2 === 'mp3', f2);
    check('Keine Fehler in der Konsole', app.errors.length === 0, app.errors.join(' | '));
  } catch (e) {
    check('Ablauf ohne Ausnahme', false, e.stack);
  }
  await app.close();
  finish();
})();
