// Pegel nach Lautheit und neue Mischung der Starter (ADR 013, Klanganalyse K1/K2/K3/W1/W4).
// 1. Jeder Sound, jedes Kit und jeder Melodie-Klang liegt auf der Ziel-Lautheit seiner Rolle (±2 LU oder an der Spitzengrenze).
// 2. Neue Beats und Melodien: Spitze ≤ 0 dBFS, Klänge liegen nah beieinander.
// 3. Starter und Beispiel: Drums führen, Tiefen/Höhen/Breite im Korridor, Sends nicht auf Kick und Bass, Mastering gesetzt
//    und jeder Stil hebt an.
// Aufruf: node tests/pegel.test.cjs [--nur rollen,neu,starter] [--starter pop,hiphop]
const { openApp, createChecker } = require('./harness.cjs');
const { measureAll, measureMix } = require('./pegel-mess.cjs');

const arg = (k) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1].split(',') : null; };
const only = arg('--nur');
const want = (k) => !only || only.includes(k);
const f1 = (x) => (Number.isFinite(x) ? x.toFixed(1) : String(x));

// Korridore je Starter (Refrain, Mastering wie gesetzt): Anteil der Energie unter 250 Hz und über 4 kHz in Prozent.
// Faustregel der Klanganalyse: über 2 kHz 3–12 %; Bass-Genres dürfen unten mehr haben, Lo-Fi und Ambient oben weniger.
const CORRIDOR = {
  house: { low: [45, 75], hi4k: [1.5, 10] },
  techno: { low: [45, 75], hi4k: [1, 10] },
  melodic: { low: [50, 85], hi4k: [0.3, 10] },
  breaks: { low: [45, 75], hi4k: [1.5, 10] },
  hiphop: { low: [50, 78], hi4k: [1.5, 10] },
  trap: { low: [50, 78], hi4k: [1.5, 10] },
  pop: { low: [40, 72], hi4k: [1.5, 10] },
  rock: { low: [35, 70], hi4k: [1.5, 12] },
  lofi: { low: [50, 80], hi4k: [0.8, 8] },
  ambient: { low: [30, 75], hi4k: [0.5, 10] },
  demo: { low: [35, 72], hi4k: [1.5, 12] },
};
const STARTERS = arg('--starter') ?? Object.keys(CORRIDOR);

(async () => {
  const { check, finish } = createChecker();
  const app = await openApp({ fresh: true });
  const { page } = app;
  page.setDefaultTimeout(1800000);
  try {
    const LV = await import('../src/levels.js');
    // ---------- 1. Rollen ----------
    if (want('rollen')) {
      const res = await measureAll(page);
      const rows = [...Object.entries(res.lib), ...Object.entries(res.kits).map(([k, v]) => ['Kit ' + k, v]), ...Object.entries(res.klaenge).map(([k, v]) => ['Klang ' + k, v])];
      const byRole = new Map();
      for (const [id, m] of rows) { if (!byRole.has(m.role)) byRole.set(m.role, []); byRole.get(m.role).push({ id, ...m }); }
      for (const [role, list] of byRole) {
        const t = LV.ROLE_TARGET[role];
        // Nur wer an der Spitzengrenze liegt, darf leiser bleiben (lauter ginge nur mit Übersteuern)
        const capped = list.filter((r) => r.peakDb >= LV.PEAK_MAX_DB - 0.05);
        const bad = list.filter((r) => Math.abs(r.loud - t) > 2 && !(r.loud < t && capped.includes(r)));
        const v = list.map((r) => r.loud).sort((a, b) => a - b);
        check(`Rolle ${role}: ${list.length} Sounds bei ${t} LUFS ±2 LU (oder an der Spitzengrenze)`, bad.length === 0,
          `${f1(v[0])} … ${f1(v[v.length - 1])}, an der Grenze ${capped.filter((r) => r.loud < t - 2).length}${bad.length ? ', daneben: ' + bad.slice(0, 6).map((r) => `${r.id} ${f1(r.loud)}`).join(', ') : ''}`);
        check(`Rolle ${role}: höchstens 5 % an der Spitzengrenze unter dem Ziel`, capped.filter((r) => r.loud < t - 2).length <= Math.ceil(list.length * 0.05));
        check(`Rolle ${role}: keine Spitze über ${LV.PEAK_MAX_DB} dBFS (Tabelle auf 0,1 dB gerundet)`, list.every((r) => r.peakDb <= LV.PEAK_MAX_DB + 0.06), f1(Math.max(...list.map((r) => r.peakDb))) + ' dBFS');
      }
      // Drums sind der Bezug: voller Loop über Bass, Flächen, Melodie
      const T = LV.ROLE_TARGET;
      check('Drums führen: Drum-Loop 0 … +6 LU über Bass, über Akkorden und Melodie', T.drums - T.bass >= 0 && T.drums - T.bass <= 6 && T.drums > T.chords && T.drums > T.synth,
        `Drums ${T.drums}, Bass ${T.bass}, Akkorde ${T.chords}, Melodie ${T.synth}`);
    }

    // ---------- 2. Neue Beats und Melodien (W4) ----------
    if (want('neu')) {
      const n = await page.evaluate(async () => {
        const I = await import('./src/instruments.js');
        const Lo = await import('./src/dsp/loudness.js');
        const { library } = window.loopwerk;
        const pk = (b) => { let p = 0; for (let c = 0; c < 2; c++) for (const x of b.getChannelData(c)) p = Math.max(p, Math.abs(x)); return 20 * Math.log10(p); };
        const lufs = (b) => Lo.integratedLoudness([b.getChannelData(0), b.getChannelData(1)], b.sampleRate);
        const beat = await I.renderPattern(I.newDrumPattern(1), 120, library);
        const full = I.newDrumPattern(2);
        for (const k of Object.keys(full.rows)) full.rows[k] = full.rows[k].map(() => 1);
        const dense = await I.renderPattern(full, 120, library);
        const kits = {};
        for (const kit of I.KITS) { const p = { ...I.newDrumPattern(3), kit: kit.id }; kits[kit.id] = pk((await I.renderPattern(p, 120, library)).buffer); }
        // dieselbe Melodie mit jedem Klang
        const notes = [57, 60, 64, 62, 60, 59, 57, 64].map((pitch, i) => ({ pitch, start: i, len: 0.9, vel: 0.9 }));
        const mel = {};
        // Akkord-Klänge (Fläche, Streicher, Orgel, Klavier, Gitarren) sind mit Akkorden eingepegelt (Rolle chords, Teil 1)
        for (const p of I.allPresets().filter((x) => x.category !== 'chords')) {
          if (p.sampled) await I.preparePreset(p.id);
          mel[p.id] = lufs((await I.renderPattern({ type: 'synth', name: 'm', bars: 2, preset: p.id, notes }, 120, library)).buffer);
        }
        return { beat: pk(beat.buffer), beatLufs: lufs(beat.buffer), dense: pk(dense.buffer), kits, mel };
      });
      check('Neuer Beat (Elektro) ≤ 0 dBFS Spitze (vorher +6,0)', n.beat <= 0, `${f1(n.beat)} dBFS, ${f1(n.beatLufs)} LUFS`);
      check('Voller Beat (alle Reihen, alle Schritte) ≤ 0 dBFS', n.dense <= 0, `${f1(n.dense)} dBFS`);
      check('Neuer Beat in jedem Kit ≤ 0 dBFS', Object.values(n.kits).every((v) => v <= 0), Object.entries(n.kits).map(([k, v]) => `${k} ${f1(v)}`).join(', '));
      const v = Object.entries(n.mel).sort((a, b) => a[1] - b[1]);
      let gap = 0;
      for (let i = 1; i < v.length; i++) gap = Math.max(gap, v[i][1] - v[i - 1][1]);
      const span = v[v.length - 1][1] - v[0][1];
      check('Dieselbe Melodie mit jedem Melodie- und Bass-Klang: Spanne ≤ 6 LU (vorher 21,9 über alle)', span <= 6, `${v[0][0]} ${f1(v[0][1])} … ${v[v.length - 1][0]} ${f1(v[v.length - 1][1])}`);
      check('Kein Klang liegt weit neben dem nächsten (Lücke ≤ 3 LU)', gap <= 3, `größte Lücke ${f1(gap)} LU`);
    }

    // ---------- 3. Starter und Beispiel ----------
    if (want('starter')) {
      for (const id of STARTERS) {
        const m = await measureMix(page, { id });
        const t = m.tracks;
        const lead = id === 'melodic' ? 'Kick' : 'Drums';
        const bass = t.Bass;
        const db = t[lead] - bass;
        const c = CORRIDOR[id];
        const name = id === 'demo' ? 'Beispiel' : id;
        if (id === 'ambient') check(`${name}: Drums höchstens 3 LU unter dem Bass (bewusst flächig)`, db >= -3, `${f1(t[lead])} − ${f1(bass)} = ${f1(db)} LU`);
        else check(`${name}: ${lead} führen, 0 … +6 LU über dem Bass (Refrain)`, db >= 0 && db <= 6.5, `${f1(t[lead])} − ${f1(bass)} = ${f1(db)} LU`);
        check(`${name}: Tiefen < 250 Hz im Korridor ${c.low.join('–')} %`, m.refrain.low >= c.low[0] && m.refrain.low <= c.low[1], `${m.refrain.low} %`);
        check(`${name}: Höhen > 4 kHz im Korridor ${c.hi4k.join('–')} %`, m.refrain.hi4k >= c.hi4k[0] && m.refrain.hi4k <= c.hi4k[1], `${m.refrain.hi4k} % (über 2 kHz ${m.refrain.hi2k} %)`);
        check(`${name}: Breite 0,05 … 0,3`, m.refrain.width >= 0.05 && m.refrain.width <= 0.3, String(m.refrain.width));
        check(`${name}: setzt Mastering`, m.mastering.on && !!m.mastering.style, JSON.stringify(m.mastering));
        const s = m.song;
        const lower = Object.entries(s).filter(([k, v]) => k !== 'ohne' && !(v >= s.ohne + 1));
        check(`${name}: ohne Mastering um −16 LUFS (−18 … −15)`, s.ohne >= -18 && s.ohne <= -15, `${s.ohne} LUFS`);
        check(`${name}: jeder Stil hebt an (mindestens +1 LU)`, lower.length === 0, Object.entries(s).map(([k, v]) => `${k} ${v}`).join(' · '));
        const isKickBass = (st) => /^(kick|bass)$/i.test(st.name);
        const sendOn = (st) => Object.values(st.sends).some((v) => v > 0);
        check(`${name}: Hall/Echo-Sends auf Akkorden/Melodie, nie auf Kick und Bass`, m.strips.some(sendOn) && !m.strips.some((st) => isKickBass(st) && sendOn(st)),
          m.strips.filter(sendOn).map((st) => st.name).join(', '));
        if (id !== 'melodic' && id !== 'demo') {
          const hp = (st) => st.fx.filter?.type === 'highpass';
          check(`${name}: Hochpass auf allem außer Drums (mit Kick) und Bass`, m.strips.filter((st) => !/^(drums|bass)$/i.test(st.name)).every(hp) && !m.strips.some((st) => /^bass$/i.test(st.name) && hp(st)),
            m.strips.map((st) => `${st.name}${hp(st) ? ' HP' : ''}`).join(', '));
        }
      }
    }
  } catch (err) {
    check('Test lief ohne Fehler', false, err.stack);
  }
  check('Keine Konsolenfehler', app.errors.length === 0, app.errors.slice(0, 3).join(' | '));
  await app.close();
  finish();
})();
