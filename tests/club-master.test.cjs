// Mastering-Stil „Club“: lauter Testmix (Kick 4/4 mit Sub, Bass, Pad, Hats) auf −8 LUFS ±0,7, True Peak ≤ −1 dBTP;
// Bass-Mono (Seite unter 80 Hz ≥ 30 dB weg, über 300 Hz unverändert, Mitte unberührt); Kick-Transiente gegen einen
// harten Limiter ohne Clipper bei gleicher Lautheit; Wiedergabe = Export; die vier alten Stile bitgleich; UI mit fünftem
// Chip am Desktop und Handy (Tippflächen ≥ 44 px, nichts abgeschnitten); keine Konsolenfehler.
// node tests/club-master.test.cjs [--shots]   (SHOT_DIR=… für die Bilder, CLUB_WAV_DIR=… für Hörproben)
const path = require('path');
const fs = require('fs');
const { pathToFileURL } = require('url');
const { openApp, createChecker } = require('./harness.cjs');

const SHOTS = process.argv.includes('--shots');
const SHOT_DIR = process.env.SHOT_DIR || '.';
const WAV_DIR = process.env.CLUB_WAV_DIR || '';
const { check, finish } = createChecker();

// Fingerabdruck der vier bisherigen Stile, gerechnet mit dem Stand vor „Club“ (Commit 9b91aff):
// [Energie, gewichtete Seitensumme, L[50000], R[90001]] nach MasterTone(pre 1,6) → TruePeakLimiter(drive 2,5)
const BEFORE = {
  balanced: [18199.65616847688, -588.171561568402, 0.04060348868370056, -0.22466927766799927],
  warm: [16812.026669204446, -410.38637325528975, 0.09990892559289932, -0.20089221000671387],
  bright: [16966.365794658832, -825.3129455626558, -0.020791662856936455, -0.22981421649456024],
  loud: [16424.16273295702, -550.768605154924, 0.032614998519420624, -0.1898932158946991],
};

async function fingerprints() {
  const M = await import(pathToFileURL(path.join(__dirname, '../src/dsp/master-core.js')).href);
  const sr = 44100;
  const n = 3 * sr;
  let seed = 777;
  const rnd = () => { seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const L = new Float32Array(n);
  const R = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    const tb = t % 0.5;
    const kick = Math.exp(-tb * 12) * Math.sin(2 * Math.PI * (50 * tb + (80 * (1 - Math.exp(-tb * 30))) / 30));
    const nz = (rnd() * 2 - 1) * 0.1;
    L[i] = 0.6 * kick + nz + 0.2 * Math.sin(2 * Math.PI * 70 * t) + 0.1 * Math.sin(2 * Math.PI * 1234 * t);
    R[i] = 0.6 * kick - 0.5 * nz + 0.1 * Math.sin(2 * Math.PI * 3456 * t);
  }
  const out = {};
  for (const id of Object.keys(BEFORE)) {
    const tone = new M.MasterTone(sr, id);
    const lim = new M.TruePeakLimiter(sr, id);
    const tl = new Float32Array(128); const tr = new Float32Array(128); const ol = new Float32Array(n); const or = new Float32Array(n);
    for (let i = 0; i < n; i += 128) {
      const m = Math.min(128, n - i);
      tone.process(L.subarray(i, i + m), R.subarray(i, i + m), tl, tr, m, 1.6);
      lim.process(tl, tr, ol.subarray(i, i + m), or.subarray(i, i + m), m, 2.5);
    }
    let e = 0; let w = 0;
    for (let i = 0; i < n; i++) { e += ol[i] * ol[i] + or[i] * or[i]; w += (i % 97) * (ol[i] - or[i]); }
    out[id] = [e, w, ol[50000], or[90001]];
  }
  return { out, lat: { balanced: M.masterLatency(sr), loud: M.masterLatency(sr, 'loud'), club: M.masterLatency(sr, 'club') } };
}

// Läuft im Browser: Testmix, ein Takt bei 125 BPM je Spur (Kick mit Sub und Klick, Bass auf der Achtel, breites Pad mit
// Sidechain-Ducken, Hats als Sechzehntel); fester Seed
function registerClubMix() {
  const { library } = window.loopwerk;
  const sr = 44100;
  const spb = 60 / 125;
  const n = Math.round(4 * spb * sr);
  let seed = 4242;
  const rnd = () => { seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const mk = () => new AudioBuffer({ numberOfChannels: 2, length: n, sampleRate: sr });
  const kick = mk(); const bass = mk(); const pad = mk(); const hats = mk();
  const ch = (b) => [b.getChannelData(0), b.getChannelData(1)];
  const [kl, kr] = ch(kick); const [bl, br] = ch(bass); const [pl, pr] = ch(pad); const [hl, hr] = ch(hats);
  for (let b = 0; b < 4; b++) {
    const s0 = Math.round(b * spb * sr);
    let ph = 0;
    for (let i = 0; i < Math.round(0.42 * sr) && s0 + i < n; i++) {
      const t = i / sr;
      const f = 50 + 130 * Math.exp(-t * 30);
      ph += (2 * Math.PI * f) / sr;
      const env = Math.exp(-t * 7) * Math.min(1, (0.42 - t) / 0.03);
      const click = (rnd() * 2 - 1) * Math.exp(-t * 700) * 0.3;
      const v = 0.7 * env * Math.sin(ph) + click;
      kl[s0 + i] += v; kr[s0 + i] += v;
    }
    const s1 = Math.round((b + 0.5) * spb * sr);
    for (let i = 0; i < Math.round(0.22 * sr) && s1 + i < n; i++) {
      const t = i / sr;
      const env = Math.min(1, t / 0.004) * Math.exp(-t * 7) * Math.min(1, (0.22 - t) / 0.01);
      let v = 0;
      for (let k = 1; k <= 6; k++) v += Math.sin(2 * Math.PI * 55 * k * t) / k;
      v *= 0.5 * env;
      bl[s1 + i] += v; br[s1 + i] += v;
    }
  }
  const notes = [110, 220, 261.63, 329.63];
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    const edge = Math.min(1, i / (0.01 * sr), (n - 1 - i) / (0.01 * sr));
    let l = 0; let r = 0;
    for (const f of notes) {
      for (let k = 1; k <= 4; k++) {
        l += Math.sin(2 * Math.PI * f * 1.003 * k * t) / k;
        r += Math.sin(2 * Math.PI * f * 0.997 * k * t + 0.7) / k;
      }
    }
    const duck = 1 - 0.75 * Math.exp(-((t % spb) / 0.08));
    pl[i] = 0.11 * l * edge * duck; pr[i] = 0.11 * r * edge * duck;
  }
  for (let k = 0; k < 16; k++) {
    const s0 = Math.round((k * spb * sr) / 4);
    const open = k % 4 === 2;
    const len = Math.round((open ? 0.18 : 0.05) * sr);
    let p1 = 0; let p2 = 0;
    const pan = k % 2 ? 0.7 : 1;
    for (let i = 0; i < len && s0 + i < n; i++) {
      const t = i / sr;
      const x = rnd() * 2 - 1;
      const y = x - 2 * p1 + p2; p2 = p1; p1 = x;
      const v = 0.14 * y * Math.exp(-t * (open ? 18 : 70)) * Math.min(1, (len - i) / 40);
      hl[s0 + i] += v * pan; hr[s0 + i] += v * (1.7 - pan);
    }
  }
  for (const [id, name, buffer] of [['cm-kick', 'Club Kick', kick], ['cm-bass', 'Club Bass', bass], ['cm-pad', 'Club Pad', pad], ['cm-hats', 'Club Hats', hats]]) {
    library.register({ id, name, category: 'fx', lengthBeats: 4, bpm: 125, buffer });
  }
  // Sinus nur links (Mitte = Seite) bzw. in der Mitte, leise (unter Kompressor, Clipper und Limiter): Bass-Mono messen
  for (const f of [40, 60, 80, 300, 500, 1000, 3000, 8000]) {
    const b = mk();
    const [l] = ch(b);
    for (let i = 0; i < n; i++) l[i] = 0.05 * Math.sin((2 * Math.PI * f * i) / sr);
    library.register({ id: `cm-left-${f}`, name: `Links ${f}`, category: 'fx', lengthBeats: 4, bpm: 125, buffer: b });
  }
  const mono = mk();
  const [ml, mr] = ch(mono);
  for (let i = 0; i < n; i++) ml[i] = mr[i] = 0.025 * Math.sin((2 * Math.PI * 60 * i) / sr);
  library.register({ id: 'cm-mid-60', name: 'Mitte 60', category: 'fx', lengthBeats: 4, bpm: 125, buffer: mono });
}

// Läuft im Browser: Hilfen
function helpers() {
  window.cm = {
    async project(sampleIds, bars = 8, mastering = null) {
      const m = await import('/src/model.js');
      const p = m.createEmptyProject();
      p.bpm = 125;
      p.tracks = p.tracks.slice(0, sampleIds.length).map((t, k) => ({ ...t, id: `t${k + 1}`, volume: 1, pan: 0, mute: false, solo: false, fx: null, clips: [] }));
      sampleIds.forEach((sid, k) => { for (let b = 0; b < bars; b++) p.tracks[k].clips.push({ id: `c${k}-${b}`, sampleId: sid, startBeat: b * 4, lengthBeats: 4, offsetBeats: 0 }); });
      p.master = { volume: 1, fx: null, ...(mastering ? { mastering } : {}) };
      p.keyChanges = [];
      p.loop = { on: false, startBeat: 0, endBeat: 4 };
      p.lengthBars = Math.max(8, bars);
      return p;
    },
    // Betrag der Frequenz f im Fenster (Goertzel), Mitte und Seite
    tone(buf, f, from, to) {
      const sr = buf.sampleRate;
      const l = buf.getChannelData(0); const r = buf.getChannelData(1);
      const a = Math.round(from * sr); const e = Math.round(to * sr);
      const g = (pick) => {
        let re = 0; let im = 0;
        for (let i = a; i < e; i++) { const w = (2 * Math.PI * f * i) / sr; const v = pick(i); re += v * Math.cos(w); im += v * Math.sin(w); }
        return (2 * Math.hypot(re, im)) / (e - a);
      };
      return { mid: g((i) => (l[i] + r[i]) / 2), side: g((i) => (l[i] - r[i]) / 2) };
    },
    // Crest-Faktor (dB) der Mitte im Fenster [Einsatz, Einsatz + win] je Kick, gemittelt
    crest(l, r, onsets, win) {
      const vals = onsets.map((s) => {
        const e = s + win;
        let p = 0; let q = 0;
        for (let i = s; i < e; i++) { const v = (l[i] + r[i]) / 2; p = Math.max(p, Math.abs(v)); q += v * v; }
        return 20 * Math.log10(p / Math.sqrt(q / win));
      });
      return vals.reduce((a, b) => a + b, 0) / vals.length;
    },
  };
}

const measureTargets = (sel) => [...document.querySelectorAll(sel)].filter((n) => n.offsetParent && !n.disabled).map((n) => {
  const b = n.getBoundingClientRect();
  const hit = (x, y) => { const h = document.elementFromPoint(x, y); return !!h && (h === n || n.contains(h)); };
  const cx = b.left + b.width / 2; const cy = b.top + b.height / 2;
  const ok = hit(cx, cy) && hit(cx, b.top + 2) && hit(cx, b.bottom - 2) && hit(b.left + 2, cy) && hit(b.right - 2, cy);
  return { label: n.id || n.className, w: Math.round(b.width), h: Math.round(b.height), ok };
});
// Chips: Text ganz sichtbar (kein Auslassungszeichen), innerhalb der Gruppe und des Bildschirms
const chipFit = (prefix) => {
  const box = document.querySelector(`#${prefix} .mst-styles`);
  if (!box || !box.offsetParent) return null;
  const g = box.getBoundingClientRect();
  const chips = [...box.querySelectorAll('.mst-style')].map((c) => {
    const b = c.getBoundingClientRect();
    return { id: c.dataset.style, text: c.textContent, title: c.title, sw: c.scrollWidth, cw: c.clientWidth, l: b.left, r: b.right, w: Math.round(b.width), h: Math.round(b.height) };
  });
  return { chips, box: { l: g.left, r: g.right, w: Math.round(g.width) }, vw: innerWidth, fits: chips.every((c) => c.sw <= c.cw + 1 && c.l >= g.left - 1 && c.r <= g.right + 1 && c.r <= innerWidth && c.l >= 0) };
};
const overflow = (page) => page.evaluate(() => ({ doc: document.documentElement.scrollWidth - innerWidth, body: document.body.scrollWidth - innerWidth, app: document.getElementById('app').scrollWidth - document.getElementById('app').clientWidth }));
const noOverflow = (o) => o.doc <= 0 && o.body <= 0 && o.app <= 0;

(async () => {
  // ---------- Die vier alten Stile: bitgleich zum Stand vor „Club“ ----------
  const fp = await fingerprints();
  for (const id of Object.keys(BEFORE)) {
    const rel = Math.max(...BEFORE[id].map((v, k) => Math.abs(fp.out[id][k] - v) / Math.max(1e-9, Math.abs(v))));
    check(`Stil „${id}“ unverändert (Fingerabdruck der Kette, relative Abweichung ≤ 1e-12)`, rel <= 1e-12, `max rel Δ = ${rel.toExponential(2)}`);
  }
  check('Latenz der alten Stile unverändert (237 Abtastwerte), Club mit Clipper-Filtern länger', fp.lat.balanced === 237 && fp.lat.loud === 237 && fp.lat.club > 237, JSON.stringify(fp.lat));

  let app = await openApp({ viewport: { width: 1440, height: 900 } });
  let page = app.page;
  try {
    await page.evaluate(registerClubMix);
    await page.evaluate(helpers);

    // ---------- Lautheit und True Peak ----------
    const lv = await page.evaluate(async (wantWav) => {
      const { library } = window.loopwerk;
      const L = await import('/src/dsp/loudness.js');
      const X = await import('/src/export.js');
      const ids = ['cm-kick', 'cm-bass', 'cm-pad', 'cm-hats'];
      const meas = (a) => { const chs = [a.getChannelData(0), a.getChannelData(1)]; return { lufs: L.integratedLoudness(chs, 44100), tp: L.truePeak(chs, { factor: 16, half: 32 }), tp8: L.truePeak(chs, { factor: 8, half: 16 }) }; };
      const toB64 = async (blob) => { const u = new Uint8Array(await blob.arrayBuffer()); let s = ''; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000)); return btoa(s); };
      const raw = await X.exportSong(await window.cm.project(ids), library, { tail: false, mastering: false });
      // Rohmix ohne Schutz-Limiter messen (der Export oben hat ihn, als Hörprobe „ohne Mastering“)
      const bare = await window.loopwerk.renderProject(await window.cm.project(ids), library, { toBeat: 32, limiter: false, mastering: false });
      const out = { raw: meas(bare), wav: {} };
      if (wantWav) out.wav.roh = await toB64(raw.blob);
      for (const style of ['balanced', 'loud', 'club']) {
        const res = await X.exportSong(await window.cm.project(ids, 8, { on: true, style }), library, { tail: false });
        out[style] = { ...meas(res.audio), pre: res.analysis.pre, drive: res.analysis.drive, an: res.analysis.outLufs };
        if (wantWav) out.wav[style] = await toB64(res.blob);
        if (style === 'club') {
          const a = res.audio;
          window.cm.clubOut = [a.getChannelData(0).slice(), a.getChannelData(1).slice()];
        }
      }
      return out;
    }, !!WAV_DIR);
    if (WAV_DIR) {
      fs.mkdirSync(WAV_DIR, { recursive: true });
      for (const [k, name] of [['roh', 'club-0-ohne-mastering'], ['balanced', 'club-1-ausgewogen'], ['loud', 'club-2-laut'], ['club', 'club-3-club']]) {
        fs.writeFileSync(path.join(WAV_DIR, `${name}.wav`), Buffer.from(lv.wav[k], 'base64'));
      }
    }
    const f2 = (v) => v.toFixed(2);
    check('Testmix ohne Mastering ist laut, aber dynamisch (Spitze über 0 dBFS, PLR > 10 dB)', lv.raw.tp > 0 && lv.raw.tp - lv.raw.lufs > 10, `${f2(lv.raw.lufs)} LUFS, ${f2(lv.raw.tp)} dBTP`);
    check('Club: integrierte Lautheit −8 LUFS ±0,7', Math.abs(lv.club.lufs + 8) <= 0.7, `${f2(lv.club.lufs)} LUFS (Analyse ${f2(lv.club.an)}, pre ${f2(lv.club.pre)} dB, drive ${f2(lv.club.drive)} dB)`);
    check('Club: True Peak ≤ −1 dBTP (16× überabgetastet)', lv.club.tp <= -1, `${f2(lv.club.tp)} dBTP (8×: ${f2(lv.club.tp8)})`);
    check('Club ist lauter als Laut und Ausgewogen', lv.club.lufs > lv.loud.lufs + 1 && lv.loud.lufs > lv.balanced.lufs + 2, `Ausgewogen ${f2(lv.balanced.lufs)} · Laut ${f2(lv.loud.lufs)} · Club ${f2(lv.club.lufs)}`);
    check('Laut und Ausgewogen treffen weiter ihr Ziel (±1 LU), True Peak < −1', Math.abs(lv.loud.lufs + 10) <= 1 && Math.abs(lv.balanced.lufs + 14) <= 1 && lv.loud.tp < -1 && lv.balanced.tp < -1, JSON.stringify({ balanced: lv.balanced, loud: lv.loud }));

    // ---------- Kick-Transiente: Club gegen harten Limiter ohne Clipper, gleiche Lautheit ----------
    const kick = await page.evaluate(async () => {
      const { library, renderProject } = window.loopwerk;
      const L = await import('/src/dsp/loudness.js');
      const M = await import('/src/dsp/master-core.js');
      const sr = 44100;
      const p = await window.cm.project(['cm-kick', 'cm-bass', 'cm-pad', 'cm-hats']);
      const r = await renderProject(p, library, { toBeat: 32, analysis: true });
      const [xl, xr] = r.x;
      const n = xl.length;
      const g = Math.pow(10, (M.MASTER_REF - L.integratedLoudness([xl, xr], sr)) / 20);
      const il = new Float32Array(n); const ir = new Float32Array(n);
      for (let i = 0; i < n; i++) { il[i] = xl[i] * g; ir[i] = xr[i] * g; }
      // Nur der True-Peak-Limiter (dieselbe Vorausschau), Rückkehr in `rel` Sekunden
      const hard = (driveDb, rel) => {
        const lim = new M.TruePeakLimiter(sr, 'loud');
        lim.rel = 1 - Math.exp(-1 / (rel * sr));
        const ol = new Float32Array(n); const or = new Float32Array(n);
        const d = Math.pow(10, driveDb / 20);
        for (let i = 0; i < n; i += 128) { const m = Math.min(128, n - i); lim.process(il.subarray(i, i + m), ir.subarray(i, i + m), ol.subarray(i, i + m), or.subarray(i, i + m), m, d); }
        return { chs: [ol, or], lat: lim.latency };
      };
      const lufs = (chs) => L.integratedLoudness(chs, sr);
      // Mit der Rückkehr von „Laut“ (60 ms) schafft der Limiter allein −8 LUFS nicht – höchstens:
      const maxSlow = lufs(hard(30, 0.06).chs);
      // Harter Limiter: 8 ms Rückkehr, Verstärkung gesucht bis −8 LUFS ±0,1
      let d0 = 10; let l0 = lufs(hard(d0, 0.008).chs);
      let d = 16; let l = lufs(hard(d, 0.008).chs);
      for (let it = 0; it < 10 && Math.abs(l + 8) > 0.1; it++) {
        const slope = Math.max(0.1, (l - l0) / (d - d0));
        d0 = d; l0 = l;
        d = Math.min(40, d + (-8 - l) / slope);
        l = lufs(hard(d, 0.008).chs);
      }
      const h = hard(d, 0.008);
      const spb = 60 / 125;
      const beats = Array.from({ length: 30 }, (_, k) => k + 1);
      const on = (lat) => beats.map((k) => Math.round(k * spb * sr) + lat);
      const [cl, cr] = window.cm.clubOut;
      const w10 = Math.round(0.01 * sr); const w30 = Math.round(0.03 * sr);
      return {
        maxSlow, hardDrive: d, hardLufs: l, clubLufs: lufs([cl, cr]), hardTp: L.truePeak(h.chs),
        club: { c10: window.cm.crest(cl, cr, on(0), w10), c30: window.cm.crest(cl, cr, on(0), w30) },
        hard: { c10: window.cm.crest(h.chs[0], h.chs[1], on(h.lat), w10), c30: window.cm.crest(h.chs[0], h.chs[1], on(h.lat), w30) },
        raw: { c10: window.cm.crest(xl, xr, on(0), w10), c30: window.cm.crest(xl, xr, on(0), w30) },
      };
    });
    const kd = JSON.stringify({ ...kick, maxSlow: f2(kick.maxSlow), hardDrive: f2(kick.hardDrive), hardLufs: f2(kick.hardLufs), clubLufs: f2(kick.clubLufs) });
    check('Vergleich in derselben Lautheit: harter Limiter (8 ms) auf −8 LUFS ±0,1, Club im Ziel', Math.abs(kick.hardLufs + 8) <= 0.1 && Math.abs(kick.clubLufs + 8) <= 0.7, kd);
    check('Limiter allein mit 60 ms Rückkehr schafft −8 LUFS nicht (Lautheit braucht den Clipper)', kick.maxSlow < -8.5, `höchstens ${f2(kick.maxSlow)} LUFS bei 30 dB Verstärkung`);
    check('Kick-Transiente (Crest 30 ms ab Einsatz): Club ≥ 1 dB über hartem Limiter', kick.club.c30 - kick.hard.c30 >= 1, `Club ${f2(kick.club.c30)} dB · harter Limiter ${f2(kick.hard.c30)} dB · Mix vorher ${f2(kick.raw.c30)} dB`);
    check('Kick-Transiente (Crest 10 ms ab Einsatz): Club ≥ 0,5 dB über hartem Limiter', kick.club.c10 - kick.hard.c10 >= 0.5, `Club ${f2(kick.club.c10)} dB · harter Limiter ${f2(kick.hard.c10)} dB · Mix vorher ${f2(kick.raw.c10)} dB`);

    // ---------- Bass-Mono ----------
    const bm = await page.evaluate(async () => {
      const { library, renderProject } = window.loopwerk;
      const out = {};
      const db = (v) => 20 * Math.log10(v + 1e-12);
      for (const style of ['club', 'balanced']) {
        out[style] = {};
        for (const f of [40, 60, 80, 300, 500, 1000, 3000, 8000]) {
          const p = await window.cm.project([`cm-left-${f}`], 1, { on: true, style });
          const a = await renderProject(p, library, { mastering: { pre: 0, drive: 0 }, toBeat: 4 });
          const t = window.cm.tone(a, f, 0.6, 1.6);
          out[style][f] = db(t.side) - db(t.mid);
        }
      }
      // Mitte unberührt: links allein (Mitte 0,025) und mittig (0,025) ergeben dieselbe Mitte
      const mid = async (id) => window.cm.tone(await renderProject(await window.cm.project([id], 1, { on: true, style: 'club' }), library, { mastering: { pre: 0, drive: 0 }, toBeat: 4 }), 60, 0.6, 1.6);
      const a = await mid('cm-left-60'); const b = await mid('cm-mid-60');
      out.midDiff = db(a.mid) - db(b.mid);
      out.monoSide = db(b.side) - db(b.mid);
      return out;
    });
    const low = [40, 60, 80].map((f) => bm.club[f]);
    const high = [300, 500, 1000, 3000, 8000].map((f) => bm.club[f]);
    check('Club Bass-Mono: Seite unter 80 Hz ≥ 30 dB unter der Mitte (40/60/80 Hz)', low.every((v) => v <= -30), JSON.stringify(low.map(f2)));
    check('Club Bass-Mono: Seite über 300 Hz unverändert (±0,5 dB, 300 Hz … 8 kHz)', high.every((v) => Math.abs(v) <= 0.5), JSON.stringify(high.map(f2)));
    check('Club Bass-Mono: Mitte unberührt (±0,01 dB)', Math.abs(bm.midDiff) <= 0.01 && bm.monoSide < -60, `Δ Mitte ${bm.midDiff.toFixed(4)} dB, Seite bei Mono ${f2(bm.monoSide)} dB`);
    check('Ausgewogen behält die alte, weichere Bass-Weiche (80 Hz > −30 dB, 300 Hz < −0,5 dB)', bm.balanced[80] > -30 && bm.balanced[300] < -0.5, JSON.stringify(bm.balanced));

    // ---------- Wiedergabe = Export (bestehende Methode) ----------
    const rt = await page.evaluate(async () => {
      const { store, engine, library, renderProject, mastering } = window.loopwerk;
      const p = await window.cm.project(['cm-kick', 'cm-bass', 'cm-pad', 'cm-hats'], 4, { on: true, style: 'club' });
      store.replace(p);
      await engine._ensure();
      await mastering.now();
      const an = mastering.state.analysis;
      await new Promise((r) => setTimeout(r, 1500));
      const node = engine.mix.mst?.node;
      const db = (v) => 20 * Math.log10(v);
      const X = await import('/src/export.js');
      const M = await import('/src/dsp/master-core.js');
      const exp = await X.exportSong(store.project, library, { tail: false });
      const again = await renderProject(store.project, library, { mastering: engine.mix.gains, toBeat: exp.toBeat, compensate: true });
      let diff = 0;
      for (let c = 0; c < 2; c++) { const a = exp.audio.getChannelData(c); const b = again.getChannelData(c); for (let i = 0; i < a.length; i++) diff = Math.max(diff, Math.abs(a[i] - b[i])); }
      // kurz abspielen: die Kette läuft im Worklet ohne Fehler
      engine.play?.();
      await new Promise((r) => setTimeout(r, 800));
      const beat = engine.currentBeat?.() ?? 0;
      engine.stop?.();
      const sr = engine.ctx.sampleRate;
      return {
        has: !!node, style: engine.mix.mst?.style, pre: db(node.parameters.get('pre').value), drive: db(node.parameters.get('drive').value),
        an: { pre: an.pre, drive: an.drive, style: an.style }, ex: { pre: exp.analysis.pre, drive: exp.analysis.drive }, diff, beat,
        delay: engine.playbackDelay(), want: M.masterLatency(sr, 'club') / sr,
      };
    });
    check('Wiedergabe: Mastering-Knoten „club“ in der Summe, Verstärkungen der Analyse', rt.has && rt.style === 'club' && rt.an.style === 'club' && Math.abs(rt.pre - rt.an.pre) < 0.05 && Math.abs(rt.drive - rt.an.drive) < 0.05, JSON.stringify(rt));
    check('Export rechnet dieselben Verstärkungen wie die Wiedergabe', Math.abs(rt.ex.pre - rt.an.pre) < 0.01 && Math.abs(rt.ex.drive - rt.an.drive) < 0.01, JSON.stringify(rt));
    check('Export = Wiedergabe-Kette mit diesen Verstärkungen (Abweichung < 1e-6)', rt.diff < 1e-6, `max |Δ| = ${rt.diff}`);
    check('Latenzausgleich der Aufnahme kennt die längere Club-Kette', Math.abs(rt.delay - rt.want) < 1e-9, JSON.stringify({ delay: rt.delay, want: rt.want }));
    check('Wiedergabe mit Club läuft (Position wandert)', rt.beat > 0.5, `Schlag ${rt.beat}`);

    // ---------- Bedienung Desktop: Inspektor „Song“ und Export-Klappfeld ----------
    await page.evaluate(() => { const { store, ui } = window.loopwerk; store.setMastering({ on: true, style: 'balanced' }); ui.select(null); ui.selectTrack(null); window.loopwerk.side?.show('datei', { save: false }); }); // Layout „reiter“: Mastering liegt im Reiter Datei
    await page.waitForTimeout(300);
    const desk = await page.evaluate(chipFit, 'insp-mst');
    check('Desktop Inspektor: fünf Stil-Chips, „Club“ als fünfter, Tooltip „Club · Ziel −8 LUFS“',
      desk && desk.chips.length === 5 && desk.chips[4].id === 'club' && desk.chips[4].text === 'Club' && desk.chips[4].title === 'Club · Ziel −8 LUFS', JSON.stringify(desk));
    check('Desktop Inspektor: kein Chip abgeschnitten, alle in der Gruppe; Club nimmt die ganze Zeile', desk?.fits && Math.abs(desk.chips[4].w - desk.box.w) <= 2, JSON.stringify(desk));
    await page.click('#insp-mst-style-club');
    await page.waitForTimeout(200);
    const st = await page.evaluate(() => ({ m: window.loopwerk.store.project.master.mastering, pressed: document.getElementById('insp-mst-style-club').getAttribute('aria-pressed'), others: [...document.querySelectorAll('#insp-mst .mst-style[aria-pressed="true"]')].length }));
    check('Desktop: „Club“ anklicken wählt den Stil (Store, aria-pressed)', st.m.style === 'club' && st.m.on && st.pressed === 'true' && st.others === 1, JSON.stringify(st));
    if (SHOTS) {
      await page.waitForTimeout(400);
      const box = await page.locator('#insp-mst').boundingBox();
      await page.screenshot({ path: path.join(SHOT_DIR, 'club-desktop.png') });
      if (box) await page.screenshot({ path: path.join(SHOT_DIR, 'club-desktop-mastering.png'), clip: { x: Math.max(0, box.x - 24), y: Math.max(0, box.y - 24), width: box.width + 48, height: box.height + 48 } });
    }
    await page.click('#export-btn');
    await page.waitForTimeout(400);
    const ex = await page.evaluate(chipFit, 'ex-mst');
    check('Desktop Export-Klappfeld: fünf Chips, Club gewählt, nichts abgeschnitten', ex && ex.chips.length === 5 && ex.fits && await page.evaluate(() => document.getElementById('ex-mst-style-club').getAttribute('aria-pressed') === 'true'), JSON.stringify(ex));
    check('Keine Fehler in der Konsole (Desktop)', app.errors.length === 0, app.errors.join(' | '));
  } catch (e) {
    check('Ablauf ohne Ausnahme (Desktop)', false, e.stack);
  } finally {
    await app.close();
  }

  // ---------- Handy: Fach „Song“ und Export-Fach ----------
  for (const w of [360, 390]) {
    app = await openApp({ viewport: { width: w, height: 760 }, hasTouch: true, deviceScaleFactor: 2 });
    page = app.page;
    try {
      await page.tap('#tab-song');
      await page.waitForTimeout(500);
      // Das Beispiel startet seit ADR 013 mit Mastering an: nur einschalten, wenn es aus ist
      if (!(await page.evaluate(() => window.loopwerk.store.project.master?.mastering?.on))) await page.tap('#song-mst-on');
      await page.waitForTimeout(300);
      await page.evaluate(() => document.getElementById('song-mst-style-club').scrollIntoView({ block: 'center' }));
      await page.waitForTimeout(300);
      const fit = await page.evaluate(chipFit, 'song-mst');
      check(`Handy ${w} px Fach „Song“: fünf Chips, nichts abgeschnitten oder übergelaufen`, fit && fit.chips.length === 5 && fit.fits && noOverflow(await overflow(page)), JSON.stringify({ fit, o: await overflow(page) }));
      const t = await page.evaluate(measureTargets, '#song-mst button');
      check(`Handy ${w} px Fach „Song“: Tippflächen Mastering ≥ 44 px`, t.length === 6 && t.every((x) => x.w >= 44 && x.h >= 44 && x.ok), JSON.stringify(t));
      await page.tap('#song-mst-style-club');
      await page.waitForTimeout(200);
      check(`Handy ${w} px: „Club“ antippen wählt den Stil`, await page.evaluate(() => window.loopwerk.store.project.master.mastering.style === 'club'));
      if (SHOTS) await page.screenshot({ path: path.join(SHOT_DIR, `club-handy-${w}-song.png`) });
      await page.evaluate(() => window.loopwerk.ui.setDock('export'));
      await page.waitForTimeout(900);
      await page.evaluate(() => document.getElementById('ex-mst-style-club').scrollIntoView({ block: 'center' }));
      await page.waitForTimeout(300);
      const exf = await page.evaluate(chipFit, 'ex-mst');
      // (der Schalter liegt nach dem Scrollen zum Club-Chip teils unter dem Fachkopf – geprüft wird er im Fach „Song“)
      const et = await page.evaluate(measureTargets, '#ex-mst .mst-style');
      check(`Handy ${w} px Export-Fach: fünf Chips passen, Tippflächen ≥ 44 px`, exf && exf.chips.length === 5 && exf.fits && et.length === 5 && et.every((x) => x.w >= 44 && x.h >= 44 && x.ok) && noOverflow(await overflow(page)), JSON.stringify({ exf, et }));
      if (SHOTS) await page.screenshot({ path: path.join(SHOT_DIR, `club-handy-${w}-export.png`) });
      check(`Keine Fehler in der Konsole (Handy ${w})`, app.errors.length === 0, app.errors.join(' | '));
    } catch (e) {
      check(`Ablauf ohne Ausnahme (Handy ${w})`, false, e.stack);
    } finally {
      await app.close();
    }
  }
  finish();
})();
