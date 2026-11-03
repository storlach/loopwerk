// Raumlicht hinter den Spuren: nach Frequenz aufgeteilt (Bass unten, Höhen oben), Lichtwelle an der Marke,
// Nachglühen nach lauten Stellen – weich (Bild-zu-Bild-Sprünge begrenzt), ruhig bei reduzierter Bewegung, billig.
// node tests/ambient.test.cjs [--shots]   (SHOT_DIR=… für die Bilder)
const path = require('path');
const { openApp, createChecker } = require('./harness.cjs');

const { check, finish } = createChecker();
const SHOTS = process.argv.includes('--shots');
const SHOT_DIR = process.env.SHOT_DIR || '.';

// Läuft im Browser: Testklänge – tiefer Sinus (Bass), Rauschen nur in den Höhen, leise→laut (Drop)
function registerSounds() {
  const { library } = window.loopwerk;
  const sr = 44100;
  const make = (id, category, seconds, fill) => {
    const buf = new AudioBuffer({ numberOfChannels: 2, length: Math.round(seconds * sr), sampleRate: sr });
    for (let c = 0; c < 2; c++) fill(buf.getChannelData(c));
    library.register({ id, name: id, category, lengthBeats: seconds * 2, bpm: 120, buffer: buf });
  };
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1;
  make('amb-sub', 'bass', 8, (d) => { for (let i = 0; i < d.length; i++) d[i] = 0.5 * Math.sin((2 * Math.PI * 55 * i) / sr); });
  make('amb-hiss', 'fx', 8, (d) => {
    // zweimal abgeleitetes Rauschen: Energie fast nur über 4 kHz
    let a = 0, b = 0;
    for (let i = 0; i < d.length; i++) { const x = rnd(); const y = x - a; a = x; d[i] = 0.12 * (y - b); b = y; }
  });
  make('amb-drop', 'synth', 8, (d) => {
    for (let i = 0; i < d.length; i++) {
      const t = i / sr;
      const v = Math.sin(2 * Math.PI * 330 * t) + 0.5 * Math.sin(2 * Math.PI * 660 * t) + 0.6 * Math.sin(2 * Math.PI * 70 * t);
      d[i] = (t < 4 ? 0.012 : 0.4) * v;
    }
  });
}

// Läuft im Browser: einen Testklang allein auf einer eigenen Spur ab Schlag 0 spielen
async function solo(sampleId) {
  const { store, engine } = window.loopwerk;
  engine.pause();
  await new Promise((r) => setTimeout(r, 300));
  let t = store.project.tracks.find((x) => x.name === 'Raumlicht-Test');
  if (!t) { const id = store.addTrack(); store.setTrack(id, { name: 'Raumlicht-Test' }); t = store.track(id); }
  if (t.clips.length) store.deleteClips(t.clips.map((c) => c.id));
  store.addClip(t.id, sampleId, 0, 16);
  for (const x of store.project.tracks) store.setTrack(x.id, { solo: x.id === t.id, mute: false });
  store.setLoop({ on: false });
  engine.setPosition(0);
  engine.play();
}

// Läuft im Browser: Helligkeit (Licht über dem Grund, 0…255) oben/unten und an Stellen der Fläche
function sample() {
  const { data: d, W, H } = window.loopwerk.glow.readRoom();
  const lum = (x, y) => { const i = (y * W + x) * 4; return ((0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]) * d[i + 3]) / 255; };
  const area = (x0, x1, y0, y1) => { let s = 0, n = 0; for (let y = Math.max(0, y0 | 0); y < Math.min(H, y1); y++) for (let x = Math.max(0, x0 | 0); x < Math.min(W, x1); x++) { s += lum(x, y); n++; } return n ? s / n : 0; };
  let sat = 0;
  // Farbigkeit des sichtbaren Lichts (vormultipliziert, sonst zählen fast durchsichtige Punkte)
  for (let i = 0; i < d.length; i += 4) sat = Math.max(sat, ((Math.max(d[i], d[i + 1], d[i + 2]) - Math.min(d[i], d[i + 1], d[i + 2])) * d[i + 3]) / 255);
  const st = window.loopwerk.glow.state;
  const mx = Math.round(st.room.x);
  return {
    mid: area(W * 0.35, W * 0.65, H * 0.35, H * 0.65),
    edge: (area(0, W * 0.06, 0, H) + area(W * 0.94, W, 0, H) + area(0, W, 0, H * 0.06) + area(0, W, H * 0.94, H)) / 4,
    W, H, all: area(0, W, 0, H), top: area(0, W, 0, H / 4), bottom: area(0, W, (H * 3) / 4, H), sat,
    left: area(W * 0.03, W * 0.2, H * 0.6, H), right: area(W * 0.8, W * 0.97, H * 0.6, H),
    // im oberen Viertel: dort reicht die Spektrum-Wand nicht hin, die Säule an der Marke schon
    atMark: mx >= 0 ? area(mx - 2, mx + 3, H * 0.08, H * 0.24) : 0,
    far: mx >= 0 ? area(mx > W / 2 ? mx - W * 0.4 - 2 : mx + W * 0.4 - 2, mx > W / 2 ? mx - W * 0.4 + 3 : mx + W * 0.4 + 3, H * 0.08, H * 0.24) : 0,
    room: st.room, roomCost: st.roomCost,
  };
}

// Läuft im Browser: Verlauf je Raumlicht-Bild über ms (mittlere Helligkeit, Zustand)
function record(ms) {
  return new Promise((res) => {
    const rows = [];
    let lastN = -1;
    const t0 = performance.now();
    const f = (now) => {
      const st = window.loopwerk.glow.state;
      if (st.room.n !== lastN) {
        lastN = st.room.n;
        const d = window.loopwerk.glow.readRoom().data;
        let s = 0;
        for (let i = 0; i < d.length; i += 4) s += ((0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]) * d[i + 3]) / 255;
        rows.push({ t: now - t0, m: s / (d.length / 4), glow: Math.max(...st.room.glow), col: st.room.col, waves: st.room.waves });
      }
      if (now - t0 < ms) requestAnimationFrame(f); else res(rows);
    };
    requestAnimationFrame(f);
  });
}

// größter Helligkeitssprung je Raumlicht-Bild (auf 50 ms bezogen, falls ein Bild ausfiel)
const jumps = (rows) => rows.slice(1).map((r, i) => Math.abs(r.m - rows[i].m) * Math.min(1, 50 / Math.max(1, r.t - rows[i].t)));
// Flackern: Helligkeit kehrt von Bild zu Bild deutlich um (hoch, runter, hoch …)
const flicker = (rows) => { const d = rows.slice(1).map((r, i) => r.m - rows[i].m); let n = 0; for (let i = 1; i < d.length; i++) if (d[i] * d[i - 1] < 0 && Math.abs(d[i]) > 1.5 && Math.abs(d[i - 1]) > 1.5) n++; return n; };
const stats = (js) => { const s = [...js].sort((a, b) => a - b); return { max: +s[s.length - 1].toFixed(2), p95: +s[Math.floor(s.length * 0.95)].toFixed(2) }; };

(async () => {
  const app = await openApp({ viewport: { width: 1400, height: 900 } });
  const { page, errors } = app;
  try {
    await page.evaluate(registerSounds);
    const wait = (ms) => page.waitForTimeout(ms);

    // ---------- Still: Anthrazit, keine Farbe ----------
    await wait(400);
    const idle = await page.evaluate(sample);
    check('Still: kein Farblicht, nur Anthrazit', idle.sat < 24 && idle.room.band.every((b) => b < 0.01) && idle.room.waves === 0, JSON.stringify({ sat: idle.sat, band: idle.room.band }));

    // ---------- Nach Frequenz: Bass unten, Höhen oben ----------
    await page.evaluate(solo, 'amb-sub');
    await wait(2600);
    const bass = await page.evaluate(sample);
    await page.evaluate(solo, 'amb-hiss');
    await wait(2600);
    const high = await page.evaluate(sample);
    check('Bass füllt das Bassband, nicht die Höhen', bass.room.band[0] > 0.5 && bass.room.band[2] < 0.15, JSON.stringify(bass.room.band));
    check('Höhen füllen das Höhenband, nicht den Bass', high.room.band[2] > 0.4 && high.room.band[0] < 0.15, JSON.stringify(high.room.band));
    const dB = { top: bass.top - idle.top, bottom: bass.bottom - idle.bottom };
    const dH = { left: high.left - idle.left, right: high.right - idle.right };
    const dBl = { left: bass.left - idle.left, right: bass.right - idle.right };
    check('Bass färbt unten deutlich stärker als oben', dB.bottom > 1.5 * Math.max(1, dB.top), JSON.stringify(dB));
    // Spektrum-Wand: Frequenzen von links (tief) nach rechts (hoch)
    check('Höhen leuchten rechts stärker als links', dH.right > 1.3 * Math.max(1, dH.left), JSON.stringify(dH));
    check('Bass leuchtet links stärker als rechts', dBl.left > 1.3 * Math.max(1, dBl.right), JSON.stringify(dBl));

    // ---------- Lichtwelle an der Marke ----------
    // Rand-Glühen: die Mitte (Clips) bleibt ruhig, das Licht sitzt an den Rändern
    const calmMid = await page.evaluate(sample);
    check('Mitte bleibt ruhig: Ränder deutlich heller als die Mitte', calmMid.edge > 1.6 * calmMid.mid, JSON.stringify({ mid: +calmMid.mid.toFixed(1), edge: +calmMid.edge.toFixed(1) }));
    const ph = await page.evaluate(() => {
      const r = document.querySelector('.playhead').getBoundingClientRect();
      return { want: ((r.left + r.width / 2) / window.innerWidth) * window.loopwerk.glow.state.room.w, got: window.loopwerk.glow.state.room.x };
    });
    check('Licht sitzt an der Abspielmarke', Math.abs(ph.want - ph.got) < 3, JSON.stringify(ph));
    const waveRows = await page.evaluate(record, 2600);
    const waves = Math.max(...waveRows.map((r) => r.waves));
    check('Je Takt breitet sich eine Welle von der Marke aus', waves >= 1, String(waves));
    if (SHOTS) await page.screenshot({ path: path.join(SHOT_DIR, 'ambient-hoehen.png') });

    // folgt beim Scrollen
    const scrolled = await page.evaluate(() => new Promise((res) => {
      const a = document.querySelector('.arranger');
      const before = window.loopwerk.glow.state.room.x;
      a.scrollLeft += 120;
      setTimeout(() => {
        const r = document.querySelector('.playhead').getBoundingClientRect();
        res({ before, after: window.loopwerk.glow.state.room.x, want: ((r.left + r.width / 2) / window.innerWidth) * window.loopwerk.glow.state.room.w, sl: a.scrollLeft });
      }, 400);
    }));
    check('Lichtwelle folgt beim Scrollen', Math.abs(scrolled.after - scrolled.want) < 3, JSON.stringify(scrolled));

    // weich beim Loop-Sprung
    await page.evaluate(() => { const { store, engine } = window.loopwerk; store.setLoop({ on: true, startBeat: 0, endBeat: 4 }); engine.setPosition(2.5); });
    const loopRows = await page.evaluate(record, 3000);
    const lj = stats(jumps(loopRows));
    check('Loop-Sprung: Licht blendet weich über (kein Sprung)', lj.max < 4, JSON.stringify(lj));
    await page.evaluate(() => window.loopwerk.store.setLoop({ on: false }));

    // ---------- Nachglühen nach einem Drop ----------
    await page.evaluate(solo, 'amb-drop');
    const drop = await page.evaluate(record, 7500);
    const peak = Math.max(...drop.map((r) => r.glow));
    const lit = drop.filter((r) => r.glow > 0.08);
    const span = lit.length ? (lit[lit.length - 1].t - lit[0].t) / 1000 : 0;
    const quietGlow = Math.max(...drop.filter((r) => r.t < 3500).map((r) => r.glow));
    const gUp = Math.max(...drop.slice(1).map((r, i) => r.glow - drop[i].glow));
    check('Drop hinterlässt ein Nachglühen', peak > 0.25 && quietGlow < 0.05, JSON.stringify({ peak: +peak.toFixed(2), quietGlow }));
    check('Nachglühen löst sich über mindestens 1,5 s auf', span >= 1.5 && span < 4.5, `${span.toFixed(2)} s`);
    check('Nachglühen blitzt nicht (steigt weich)', gUp < 0.1, gUp.toFixed(3));
    // ohne die ersten 400 ms: da schaltet der Test vom vorigen Testklang um (neuer Start), nicht der Drop
    const settled = drop.filter((r) => r.t > 400);
    const dj = stats(jumps(settled));
    check('Drop: Licht steigt gleichmäßig, ohne Sprung und Flackern', dj.max < 6 && flicker(settled) <= 1, JSON.stringify({ ...dj, flicker: flicker(settled) }));

    // ---------- Bild-zu-Bild: Beispielsong von vorn ----------
    await page.evaluate(() => {
      const { store, engine } = window.loopwerk;
      engine.pause();
      for (const x of store.project.tracks) store.setTrack(x.id, { solo: false, mute: x.name === 'Raumlicht-Test' });
      engine.setPosition(0);
      engine.play();
    });
    const song = await page.evaluate(record, 6000);
    const sj = stats(jumps(song));
    const fps = song.length / 6;
    // Das Punktraster reagiert bewusst auf Schläge (Martins Wunsch): einzelne Sprünge bis 6, aber kein Flackern
    check('Weich: Bild-zu-Bild-Sprung des Raumlichts begrenzt, kein Flackern', sj.max < 6 && sj.p95 < 3 && flicker(song) <= 2, JSON.stringify({ ...sj, flicker: flicker(song) }));
    const gpu = await page.evaluate(() => window.loopwerk.glow.state.shader);
    check('Raumlicht läuft als Shader (WebGL 2)', gpu);
    check('Raumlicht zeichnet höchstens 30 Bilder pro Sekunde', fps <= 31 && fps >= 12, fps.toFixed(1));
    const rc = await page.evaluate(() => window.loopwerk.glow.state.roomCost);
    check('Raumlicht kostet wenig Rechenzeit (< 1,5 ms je Bild)', rc < 1.5, rc.toFixed(2) + ' ms');
    const lum = await page.evaluate(sample);
    check('Mit Musik: Ränder heller als die Mitte (umgekehrte Vignette)', lum.edge > 1.6 * lum.mid, JSON.stringify({ mid: +lum.mid.toFixed(1), edge: +lum.edge.toFixed(1) }));
    if (SHOTS) await page.screenshot({ path: path.join(SHOT_DIR, 'ambient-desktop.png') });

    // ---------- Stopp: sanft aus ----------
    await page.evaluate(() => window.loopwerk.engine.pause());
    const stop = await page.evaluate(record, 3600);
    const tj = stats(jumps(stop));
    const end = await page.evaluate(sample);
    check('Nach dem Stopp blendet das Raumlicht sanft aus', tj.max < 3.5 && end.room.K < 0.005 && end.room.vig < 0.02 && end.room.col < 0.02, JSON.stringify({ tj, col: end.room.col, K: end.room.K, vig: end.room.vig }));
    check('Nach dem Stopp wieder Anthrazit', end.sat < 24, String(end.sat));

    // ---------- Reduzierte Bewegung: ruhig ----------
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.evaluate(() => { window.loopwerk.engine.setPosition(0); window.loopwerk.engine.play(); });
    await wait(2500);
    const calm = await page.evaluate(record, 3000);
    const cj = stats(jumps(calm));
    check('Reduzierte Bewegung: ruhig, ohne Wellen und Nachglühen', cj.max < 1.6 && calm.every((r) => r.waves === 0 && r.glow < 0.01 && r.col < 0.01), JSON.stringify(cj));
    await page.evaluate(() => window.loopwerk.engine.pause());
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    check('Keine Konsolenfehler (Desktop)', errors.length === 0, errors.join(' | '));
  } finally {
    await app.close();
  }

  // ---------- Handy: Bildrate bleibt ----------
  const phone = await openApp({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true });
  try {
    const { page, errors } = phone;
    await page.evaluate(() => { window.loopwerk.engine.setPosition(0); window.loopwerk.engine.play(); });
    await page.waitForTimeout(1500);
    const m = await page.evaluate(() => new Promise((ok) => {
      const t = [];
      const n0 = window.loopwerk.glow.state.room.n;
      const f = (n) => {
        t.push(n);
        if (n - t[0] < 4000) requestAnimationFrame(f);
        else ok({ fps: (1000 * (t.length - 1)) / (t[t.length - 1] - t[0]), room: ((window.loopwerk.glow.state.room.n - n0) * 1000) / (t[t.length - 1] - t[0]), cost: window.loopwerk.glow.state.roomCost });
      };
      requestAnimationFrame(f);
    }));
    check('Handy: App läuft beim Spielen flüssig (≥ 50 Bilder/s)', m.fps >= 50, m.fps.toFixed(1));
    check('Handy: Raumlicht höchstens 30 Bilder/s und billig', m.room <= 31 && m.cost < 1.5, JSON.stringify({ room: +m.room.toFixed(1), cost: +m.cost.toFixed(2) }));
    const s = await page.evaluate(() => { const c = document.querySelector('.ambient'); return { w: c.width, h: c.height }; });
    check('Handy: Lichtfläche im Hochformat (Kreise bleiben rund)', s.h > s.w * 1.8, JSON.stringify(s));
    if (SHOTS) await page.screenshot({ path: path.join(SHOT_DIR, 'ambient-handy.png') });
    await page.evaluate(() => window.loopwerk.engine.pause());
    check('Keine Konsolenfehler (Handy)', errors.length === 0, errors.join(' | '));
  } finally {
    await phone.close();
  }
  finish();
})();
