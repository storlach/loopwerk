#!/usr/bin/env node
// Misst, was ein Effekt beim Einschalten mit dem Pegel macht (Lautheit, Spitze) und wie der Hall liegt (Nachhall zum
// Direktsignal, Seite/Mitte, Korrelation, Tiefen, Flachheit, Schwerpunkt, Nachhallzeit). Offline-Rendering wie der Export.
// Aufruf: node tools/klang/effekt-messen.cjs [--teil einschalten,hall,echo] [--sounds id,id] [--json datei]
// Beispiel: node tools/klang/effekt-messen.cjs --teil einschalten
const fs = require('fs');
const path = require('path');
const { openApp } = require('../../tests/harness.cjs');

const HELP = `Pegel und Raum der Effekte messen (Klanganalyse W3/K3).

  node tools/klang/effekt-messen.cjs [Optionen]

  --teil einschalten,hall,echo   was gemessen wird (Voreinstellung: alles)
  --sounds a,b,c            Bibliotheks-Sounds für "einschalten" (Voreinstellung: die vier der Klanganalyse)
  --json datei              Ergebnis zusätzlich als JSON schreiben
  --help                    diese Hilfe

"einschalten": Lautheitsänderung in LU gegen trocken (Fader 1, ohne Limiter) für Kompressor, Verzerrer (alle Arten), Hall,
Echo und die Effekt-Patches aus "Klang aus Beschreibung". "hall": Impulsantwort von Insert (Voreinstellung) und Bus
(Send 50 %, Bus 80 %), Nachhall auf einer Fläche (chords-pad) als Abstand zum Direktsignal. "echo": Impulsantwort des
Echos (Insert-Voreinstellung und Bus) nur nass – Seite/Mitte, Korrelation, Energie links zu rechts, Lage der ersten
Wiederholungen je Kanal –, dazu die Lautheit mit Echo auf den Sounds gegen trocken.
Exit 0 = gemessen (das Skript urteilt nicht), 1 = Bedien- oder Renderfehler.`;

function fail(m) { console.error('Fehler: ' + m + '\n\n' + HELP); process.exit(1); }
const a = process.argv.slice(2);
if (a.includes('--help') || a.includes('-h')) { console.log(HELP); process.exit(0); }
const o = { teil: ['einschalten', 'hall', 'echo'], sounds: ['gen-house-groove', 'chords-pad', 'bass-prog', 'synth-arp-prog'], json: null };
for (let i = 0; i < a.length; i++) {
  const v = () => { const x = a[++i]; if (x == null || x.startsWith('--')) fail(`${a[i - 1]} braucht einen Wert`); return x; };
  if (a[i] === '--teil') o.teil = v().split(',');
  else if (a[i] === '--sounds') o.sounds = v().split(',');
  else if (a[i] === '--json') o.json = path.resolve(v());
  else fail(`unbekanntes Argument ${a[i]}`);
}
if (o.teil.some((t) => !['einschalten', 'hall', 'echo'].includes(t))) fail('--teil: einschalten, hall und/oder echo');

(async () => {
  const app = await openApp({ fresh: true });
  const { page } = app;
  page.setDefaultTimeout(0);
  let res;
  try {
    res = await page.evaluate(async ({ o }) => {
      const { library, renderProject } = window.loopwerk;
      const FX = await import('./src/effects.js');
      const L = await import('./src/dsp/loudness.js');
      const F = await import('./src/dsp/fft.js');
      const { createEmptyProject } = await import('./src/model.js');
      const sr = 44100;
      const lufs = (b) => L.integratedLoudness([b.getChannelData(0), b.getChannelData(1)], b.sampleRate);
      const peakDb = (b) => { let p = 0; for (let c = 0; c < 2; c++) for (const x of b.getChannelData(c)) p = Math.max(p, Math.abs(x)); return 20 * Math.log10(p + 1e-12); };
      const dB = (x) => 10 * Math.log10(x + 1e-30);
      const r2 = (x) => Math.round(x * 100) / 100;
      const out = {};
      const project = (sid, fx, beats = 16) => {
        const p = createEmptyProject({ tracks: 1, bpm: 120 });
        p.tracks[0].volume = 1;
        p.tracks[0].clips.push({ id: 'c1', sampleId: sid, startBeat: 0, lengthBeats: beats, offsetBeats: 0 });
        if (fx) p.tracks[0].fx = fx;
        return p;
      };
      const fxWith = (id, patch) => { const fx = FX.defaultFx(); fx[id] = { ...fx[id], on: true, ...patch }; return fx; };
      if (o.teil.includes('einschalten')) {
        await library.ensureMany(o.sounds);
        const cases = {
          'Kompressor': ['comp', {}], 'Kompressor 80 %': ['comp', { amount: 0.8 }], 'fett (Kompressor 60 %)': ['comp', { amount: 0.6 }],
          'Verzerrer Warm': ['drive', {}], 'Hart': ['drive', { type: 'hard' }], 'Fuzz': ['drive', { type: 'fuzz' }], 'Bitcrusher': ['drive', { type: 'crush' }],
          'Amp Crunch': ['drive', { type: 'amp-crunch' }], 'Amp Lead': ['drive', { type: 'amp-lead' }], 'Amp Metal': ['drive', { type: 'amp-metal' }],
          'stark verzerrt': ['drive', { drive: 0.8 }], 'Hall': ['hall', {}], 'Echo': ['echo', {}], 'Filter': ['filter', {}],
        };
        out.einschalten = {};
        for (const sid of o.sounds) {
          const dry = await renderProject(project(sid), library, { toBeat: 16, limiter: false, tailSeconds: 1 });
          const l0 = lufs(dry), p0 = peakDb(dry);
          out.einschalten[sid] = { trocken: { lufs: r2(l0), spitze: r2(p0) } };
          for (const [name, [id, patch]] of Object.entries(cases)) {
            const b = await renderProject(project(sid, fxWith(id, patch)), library, { toBeat: 16, limiter: false, tailSeconds: 1 });
            out.einschalten[sid][name] = { dLU: r2(lufs(b) - l0), dSpitze: r2(peakDb(b) - p0) };
          }
        }
      }
      if (o.teil.includes('hall')) {
        out.hall = {};
        const N = 8192, win = F.hann(N);
        const ir = async (params, asBus, gain) => {
          const ctx = new OfflineAudioContext(2, sr * 5, sr);
          const b = ctx.createBuffer(1, 1, sr); b.getChannelData(0)[0] = 1;
          const s = ctx.createBufferSource(); s.buffer = b;
          const g = ctx.createGain(); g.gain.value = gain; g.channelCount = 2; g.channelCountMode = 'explicit';
          const u = FX.EFFECTS.find((e) => e.id === 'hall').create(ctx, { dry: !asBus });
          u.set({ ...FX.defaultFx().hall, ...params }, null, 0.5, 0);
          s.connect(g).connect(u.input); u.output.connect(ctx.destination); s.start(0);
          const y = await ctx.startRendering();
          const Lc = y.getChannelData(0).slice(), Rc = y.getChannelData(1).slice();
          if (!asBus) { Lc[0] -= 1; Rc[0] -= 1; }
          let e = 0, m = 0, sd = 0, lr = 0, ll = 0, rr = 0;
          for (let i = 0; i < Lc.length; i++) { e += (Lc[i] ** 2 + Rc[i] ** 2) / 2; m += ((Lc[i] + Rc[i]) / 2) ** 2; sd += ((Lc[i] - Rc[i]) / 2) ** 2; }
          for (let i = Math.round(0.03 * sr); i < sr; i++) { lr += Lc[i] * Rc[i]; ll += Lc[i] ** 2; rr += Rc[i] ** 2; }
          const sch = new Float64Array(Lc.length); let acc = 0;
          for (let i = Lc.length - 1; i >= 0; i--) { acc += Lc[i] ** 2 + Rc[i] ** 2; sch[i] = acc; }
          const tAt = (lvl) => { for (let i = 0; i < sch.length; i++) if (10 * Math.log10(sch[i] / sch[0]) < lvl) return i / sr; return null; };
          const re = new Float64Array(N), im = new Float64Array(N), st = Math.round(0.03 * sr);
          for (let i = 0; i < N; i++) re[i] = Lc[st + i] * win[i];
          F.fft(re, im);
          const P = (k) => re[k] * re[k] + im[k] * im[k];
          const band = (f0, f1) => { let s2 = 0, c = 0; for (let k = Math.round(f0 * N / sr); k < Math.round(f1 * N / sr); k++) { s2 += P(k); c++; } return s2 / c; };
          let lg = 0, ar = 0, n = 0;
          for (let k = Math.round(300 * N / sr); k < Math.round(6000 * N / sr); k++) {
            const w = Math.max(2, Math.round(k * 0.115)); let sm = 0, c = 0;
            for (let j = k - w; j <= k + w; j++) { sm += P(j); c++; }
            const q = P(k) / (sm / c) + 1e-30; lg += Math.log(q); ar += q; n++;
          }
          let cen = 0, cw = 0; for (let k = 1; k < N / 2; k++) { cen += P(k) * k * sr / N; cw += P(k); }
          const t5 = tAt(-5), t35 = tAt(-35);
          return { nachhallDb: r2(dB(e)), seiteMitteDb: r2(dB(sd / m)), korrelation: r2(lr / Math.sqrt(ll * rr)), tiefenDb: r2(dB(band(50, 110) / band(800, 1600))),
            flachheit: r2(Math.exp(lg / n) / (ar / n)), schwerpunktHz: Math.round(cen / cw), rt60: t5 != null && t35 != null ? r2(2 * (t35 - t5)) : null };
        };
        await library.ensureMany(['chords-pad']);
        const pad = async (fx, sends) => {
          const p = project('chords-pad', fx);
          if (sends) { p.tracks[0].sends = sends; p.buses = { hall: { volume: 0.8 } }; }
          return renderProject(p, library, { toBeat: 16, limiter: false, tailSeconds: 3 });
        };
        const dry = await pad(null);
        const wetOf = (w) => {
          let ed = 0, ew = 0, mt = 0, stt = 0;
          for (let c = 0; c < 2; c++) { const x = dry.getChannelData(c), y = w.getChannelData(c); for (let i = 0; i < x.length; i++) { ed += x[i] ** 2; ew += (y[i] - x[i]) ** 2; } }
          const Lw = w.getChannelData(0), Rw = w.getChannelData(1);
          for (let i = 0; i < Lw.length; i++) { mt += (Lw[i] + Rw[i]) ** 2; stt += (Lw[i] - Rw[i]) ** 2; }
          return { flaecheNachhallDb: r2(dB(ew / ed)), flaecheBreite: Math.round(1000 * stt / (mt + stt)) / 1000 };
        };
        out.hall.Insert = { ...(await ir({}, false, 1)), ...wetOf(await pad(fxWith('hall', {}))) };
        out.hall['Bus (Send 50 %)'] = { ...(await ir({ size: 0.6, mix: 1 }, true, 0.4)), ...wetOf(await pad(null, { hall: 0.5 })) };
      }
      if (o.teil.includes('echo')) {
        out.echo = {};
        // Impulsantwort nur nass: mono Impuls in der Mitte, 120 BPM (spb 0,5)
        const eir = async (params, asBus) => {
          const ctx = new OfflineAudioContext(2, sr * 4, sr);
          const b = ctx.createBuffer(1, 1, sr); b.getChannelData(0)[0] = 1;
          const s = ctx.createBufferSource(); s.buffer = b;
          const g = ctx.createGain(); g.channelCount = 2; g.channelCountMode = 'explicit';
          const u = FX.EFFECTS.find((e) => e.id === 'echo').create(ctx, { dry: !asBus });
          u.set({ ...FX.defaultFx().echo, ...params }, null, 0.5, 0);
          s.connect(g).connect(u.input); u.output.connect(ctx.destination); s.start(0);
          const y = await ctx.startRendering();
          const Lc = y.getChannelData(0).slice(), Rc = y.getChannelData(1).slice();
          if (!asBus) { Lc[0] -= 1; Rc[0] -= 1; }
          let el = 0, er = 0, m = 0, sd = 0, lr = 0;
          for (let i = 0; i < Lc.length; i++) { el += Lc[i] ** 2; er += Rc[i] ** 2; m += ((Lc[i] + Rc[i]) / 2) ** 2; sd += ((Lc[i] - Rc[i]) / 2) ** 2; lr += Lc[i] * Rc[i]; }
          // Erste drei Wiederholungen: Spitze je Kanal in einem Fenster um k · Zeit
          const t = (FX.ECHO_TIMES.find((x) => x.id === (params.time ?? FX.defaultFx().echo.time))?.beats ?? 0.75) * 0.5;
          const taps = [1, 2, 3].map((k) => {
            const c = Math.round(k * t * sr); let pl = 0, pr = 0;
            for (let i = c - 400; i < c + 1200; i++) { pl = Math.max(pl, Math.abs(Lc[i])); pr = Math.max(pr, Math.abs(Rc[i])); }
            return `${k}: L ${r2(20 * Math.log10(pl + 1e-12))} / R ${r2(20 * Math.log10(pr + 1e-12))} dB`;
          });
          return { seiteMitteDb: r2(dB(sd / m)), korrelation: r2(lr / Math.sqrt(el * er + 1e-30)), linksZuRechtsDb: r2(dB(el / (er + 1e-30))), nassDb: r2(dB((el + er) / 2)), wiederholungen: taps.join(' · ') };
        };
        out.echo.Insert = await eir({}, false);
        out.echo['Bus (Zeit 1/8d, 40 %)'] = await eir({ mix: 1, feedback: 0.4 }, true);
        await library.ensureMany(o.sounds);
        for (const sid of o.sounds) {
          const dry = await renderProject(project(sid), library, { toBeat: 16, limiter: false, tailSeconds: 1 });
          const wet = await renderProject(project(sid, fxWith('echo', {})), library, { toBeat: 16, limiter: false, tailSeconds: 1 });
          const Lw = wet.getChannelData(0), Rw = wet.getChannelData(1);
          let mt = 0, stt = 0; for (let i = 0; i < Lw.length; i++) { mt += (Lw[i] + Rw[i]) ** 2; stt += (Lw[i] - Rw[i]) ** 2; }
          out.echo[`Insert auf ${sid}`] = { dLU: r2(lufs(wet) - lufs(dry)), breiteDb: r2(dB(stt / mt)) };
        }
      }
      return out;
    }, { o });
  } catch (e) {
    console.error('Fehler beim Rendern: ' + (e.message || e).split('\n')[0]);
    await app.close();
    process.exit(1);
  }
  if (res.einschalten) {
    for (const [sid, r] of Object.entries(res.einschalten)) {
      console.log(`\n${sid}: trocken ${r.trocken.lufs} LUFS, Spitze ${r.trocken.spitze} dBFS`);
      for (const [k, m] of Object.entries(r)) if (k !== 'trocken') console.log(`  ${k.padEnd(28)} ${m.dLU >= 0 ? '+' : ''}${m.dLU.toFixed(2)} LU   Spitze ${m.dSpitze >= 0 ? '+' : ''}${m.dSpitze.toFixed(2)} dB`);
    }
  }
  if (res.hall) {
    console.log('\nHall');
    for (const [k, m] of Object.entries(res.hall)) console.log(`  ${k.padEnd(20)} ${Object.entries(m).map(([a2, b2]) => `${a2} ${b2}`).join(' · ')}`);
  }
  if (res.echo) {
    console.log('\nEcho');
    for (const [k, m] of Object.entries(res.echo)) console.log(`  ${k.padEnd(28)} ${Object.entries(m).map(([a2, b2]) => `${a2} ${b2}`).join(' · ')}`);
  }
  if (o.json) fs.writeFileSync(o.json, JSON.stringify(res, null, 1));
  if (app.errors.length) console.error('Konsolenfehler: ' + app.errors.slice(0, 3).join(' | '));
  await app.close();
  process.exit(app.errors.length ? 1 : 0);
})();
