// Krachwerk Scheibe 5, Engine-Teil: Zutatenliste (src/recipe.js ingredients) und WAV-Kommentar (encodeWav { info }).
// node tests/ingredients.test.cjs
const { openApp, createChecker } = require('./harness.cjs');

const { check, finish } = createChecker();

(async () => {
  const app = await openApp();
  const { page } = app;
  try {
    const r = await page.evaluate(async () => {
      const { encodeWav } = await import('./src/wav.js');
      const { ingredients } = await import('./src/recipe.js');
      const { infoOf } = await import('./src/export.js');
      const sr = 44100;
      const vals = [0, 0.5, -0.25, 0.123456, -0.987654, 0.3, -0.7];
      const b = new AudioBuffer({ numberOfChannels: 2, length: vals.length, sampleRate: sr });
      b.getChannelData(0).set(vals);
      b.getChannelData(1).set(vals.map((v) => -v));
      const out = {};
      for (const bits of [16, 24, 32]) {
        const plain = await encodeWav(b, { bits }).arrayBuffer();
        const info = { title: 'Mein Song', software: 'Krachwerk', comment: 'Bumm: Körper · Aufnahme\nKlatsch: Dinge' };
        const tagged = await encodeWav(b, { bits, info }).arrayBuffer();
        const ctx = new OfflineAudioContext(2, vals.length, sr);
        const dec = await ctx.decodeAudioData(tagged.slice(0));
        const ref = await new OfflineAudioContext(2, vals.length, sr).decodeAudioData(plain.slice(0));
        const same = dec.length === ref.length && [0, 1].every((c) => dec.getChannelData(c).every((v, i) => v === ref.getChannelData(c)[i]));
        const dv = new DataView(tagged);
        // LIST/INFO suchen
        let pos = 12, found = null;
        while (pos + 8 <= dv.byteLength) {
          const id = String.fromCharCode(...new Uint8Array(tagged, pos, 4)), size = dv.getUint32(pos + 4, true);
          if (id === 'LIST') found = { pos, size, type: String.fromCharCode(...new Uint8Array(tagged, pos + 8, 4)) };
          pos += 8 + size + (size & 1);
        }
        const text = new TextDecoder().decode(new Uint8Array(tagged, found?.pos ?? 0, (found?.size ?? 0) + 8));
        out[bits] = { same, riff: dv.getUint32(4, true) === tagged.byteLength - 8, found: !!found && found.type === 'INFO', icmt: text.includes('ICMT') && text.includes('Klatsch: Dinge'), isft: text.includes('ISFT') && text.includes('Krachwerk'), grew: tagged.byteLength > plain.byteLength, end: pos === tagged.byteLength };
      }
      // lange Kommentare werden gekürzt (ICMT ≤ 2000 Zeichen)
      const long = await encodeWav(b, { info: { comment: 'x'.repeat(5000) } }).arrayBuffer();
      const lb = new Uint8Array(long);
      let icmt = -1;
      for (let i = 0; i < lb.length - 4; i++) if (lb[i] === 73 && lb[i + 1] === 67 && lb[i + 2] === 77 && lb[i + 3] === 84) { icmt = i; break; }
      const icmtSize = new DataView(long).getUint32(icmt + 4, true);

      // Zutatenliste: 3 eigene Geräusche (eins als Variante), 1 fremdes Sample
      const { library } = window.loopwerk;
      const M = window.__M ?? (await import('./src/model.js'));
      const mk = (id, name, from = 'mic', extra = {}) => library.add({ id, name, category: 'own', kind: 'oneshot', origin: 'Eigene', made: { cls: null, tags: [], from }, orig: new AudioBuffer({ numberOfChannels: 1, length: 4410, sampleRate: sr }), duration: 0.1, created: 1.7e12, ...extra });
      await mk('own-i1', 'Bumm'); await mk('own-i2', 'Klatsch'); await mk('own-i3', 'Zisch');
      const p = M.createEmptyProject({ tracks: 2, bpm: 92 });
      p.name = 'Mein Song';
      p.recipes = { 'own-i1': { reverse: true }, 'vr-i2': { parent: 'own-i2', stretch: 1.5 } };
      library.add({ id: 'vr-i2', name: 'Klatsch lang', category: 'own', kind: 'oneshot', origin: 'Eigene', made: { cls: null, tags: [], from: 'mic' }, parentId: 'own-i2', orig: new AudioBuffer({ numberOfChannels: 1, length: 4410, sampleRate: sr }), duration: 0.1, created: 1.7e12 });
      const clip = (sampleId, startBeat) => ({ id: 'c' + startBeat, sampleId, startBeat, lengthBeats: 4, gain: 1, z: 0 });
      p.tracks[0].clips = [clip('own-i1', 0), clip('own-i1', 4), clip('vr-i2', 8)];
      p.tracks[1].clips = [clip('own-i3', 0)];
      const z = ingredients(p, library, { app: 'Krachwerk' });
      const empty = ingredients(M.createEmptyProject({ tracks: 1, bpm: 90 }), library);
      const loop = library.list().find((s) => s.category !== 'own');
      let withForeign = null;
      if (loop) { const p2 = { ...p, tracks: [{ ...p.tracks[0], clips: [...p.tracks[0].clips, clip(loop.id, 12)] }, p.tracks[1]] }; withForeign = ingredients(p2, library); }
      const info = infoOf(p, library);
      return { out, icmtSize, z: { head: z.head, summary: z.summary, lines: z.lines, own: z.own.length, foreign: z.foreign.length }, empty: empty.summary, withForeign: withForeign && { summary: withForeign.summary, foreign: withForeign.foreign.length }, info: { title: info.title, software: info.software, hasList: info.comment.includes('Zisch:') } };
    });
    for (const bits of [16, 24, 32]) {
      const o = r.out[bits];
      check(`WAV ${bits}: INFO-Block (LIST/INFO mit ISFT und ICMT) lesbar, RIFF-Größe stimmt, Samples bitgleich zur Fassung ohne info`, o.same && o.riff && o.found && o.icmt && o.isft && o.grew && o.end, JSON.stringify(o));
    }
    check('WAV: ICMT höchstens 2000 Zeichen', r.icmtSize <= 2001, `${r.icmtSize}`);
    check('Zutatenliste: Kopf „Krachwerk · Mein Song · 92 BPM · Am“', r.z.head === 'Krachwerk · Mein Song · 92 BPM · Am', r.z.head);
    check('Zutatenliste: 3 Geräusche (Variante zählt zu ihrem Sound), 0 fremde Samples', r.z.own === 3 && r.z.foreign === 0 && r.z.summary === '3 Geräusche · 0 fremde Samples', r.z.summary);
    check('Zutatenliste: je Sound eine Zeile „Name: Stammbaum“ mit Schritten (rückwärts, gedehnt)', r.z.lines.length === 3 && /^Bumm: .*rückwärts/.test(r.z.lines[0]) && /^Klatsch: .*gedehnt 150 %/.test(r.z.lines[1]) && /^Zisch: Dinge · Aufnahme/.test(r.z.lines[2]), r.z.lines.join(' | '));
    check('Zutatenliste: leerer Song „0 Geräusche · 0 fremde Samples“', r.empty === '0 Geräusche · 0 fremde Samples', r.empty);
    check('Zutatenliste: mitgeliefertes Sample zählt als fremd', r.withForeign === null || (r.withForeign.foreign === 1 && /1 fremdes Sample/.test(r.withForeign.summary)), JSON.stringify(r.withForeign));
    check('infoOf: Titel, Programm „Krachwerk“, Liste im Kommentar', r.info.title === 'Mein Song' && r.info.software === 'Krachwerk' && r.info.hasList, JSON.stringify(r.info));
    check('Konsole ohne Fehler', app.errors.length === 0, app.errors.join(' | '));
  } catch (err) {
    check('Ablauf ohne Ausnahme', false, err.stack || err.message);
  } finally {
    await app.close();
    finish();
  }
})();
