// Licht aus der Musik: unscharfer Hintergrund hinter der ganzen Seite – in Ruhe ein langsames, graues Wabern,
// mit den Sounds kommen Farbe und Rhythmus (Pegel × Farben der klingenden Clips). Dazu eine helle Lichtleiste
// ganz oben, Licht im Regal beim Vorhören und Leuchten mit Funken nur direkt an der Abspielmarke.

import { anySoloOf, isAbove, trackState, EPS } from '../model.js';
import { headW } from './arranger.js';

const CATS = ['drums', 'bass', 'chords', 'synth', 'fx', 'own'];
const BEHIND = 150; // px hinter der Marke: Platz für Funken
const AHEAD = 110; // vor der Marke: Platz für das Leuchten der Wellenform
const WAVE_GLOW = 90; // px vor und hinter der Marke, in denen die Wellenform aufleuchtet
const MAX_SPARKS = 70;

export function mountGlow({ engine, store, library, ui, root = document.querySelector('.arranger') }) {
  const grid = root?.querySelector('.arr-grid');
  if (!grid) return null;
  const amb = document.createElement('canvas');
  amb.className = 'ambient';
  amb.width = 48;
  amb.height = 30;
  amb.setAttribute('aria-hidden', 'true');
  document.body.prepend(amb);
  const beam = document.createElement('canvas');
  beam.className = 'beam';
  beam.setAttribute('aria-hidden', 'true');
  grid.append(beam);
  // Lichtleiste oben: ein schmaler Streifen und darunter sein weicher Schein
  const bar = document.createElement('canvas');
  bar.className = 'lightbar';
  bar.width = 96;
  bar.height = 1;
  const barGlow = document.createElement('canvas');
  barGlow.className = 'lightbar-glow';
  barGlow.width = 96;
  barGlow.height = 1;
  // Eingelassen wie ein LED-Band: dunkle Nut, darin der Lichtstreifen, nur ein knapper Schein nach unten
  const barWell = document.createElement('div');
  barWell.className = 'lightbar-well';
  for (const n of [barWell, bar, barGlow]) { n.setAttribute('aria-hidden', 'true'); document.body.append(n); }
  // Regal: nur die gewählte Zeile zeigt ihre Wellenform; beim Vorhören leuchtet sie bis zur Stelle, die gerade klingt
  const shelfEl = document.querySelector('.shelf');
  const rowWave = document.createElement('canvas');
  rowWave.className = 'loop-wave';
  rowWave.setAttribute('aria-hidden', 'true');
  const ac = amb.getContext('2d');
  const bc = beam.getContext('2d');
  const barC = bar.getContext('2d');
  const glowC = barGlow.getContext('2d');
  const rowC = rowWave.getContext('2d');
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');

  // Farben aus den Tokens (Hell/Dunkel), regelmäßig neu gelesen
  const rgb = {};
  let ambientMax = 0.5;
  let colorAge = Infinity;
  function readColors() {
    const cs = getComputedStyle(document.documentElement);
    for (const c of CATS) {
      ac.fillStyle = '#000';
      ac.fillStyle = cs.getPropertyValue(`--cat-${c}`).trim() || '#888';
      const h = ac.fillStyle;
      rgb[c] = /^#/.test(h) ? [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)) : [136, 136, 136];
    }
    ambientMax = parseFloat(cs.getPropertyValue('--ambient-max')) || 0.5;
    colorAge = 0;
  }

  const level = Object.fromEntries(CATS.map((c) => [c, 0]));
  const trackGlow = new Map();
  let amp = 0;
  let sparks = [];
  let last = performance.now();
  let frameNo = 0;
  let shown = false;
  let bw = 0;
  let bh = 0;

  // Clip, der auf einer Spur an dieser Stelle klingt (der obere bei Überlappung)
  function clipAt(track, beat) {
    let top = null;
    for (const c of track.clips) {
      if (c.startBeat > beat + EPS || c.startBeat + c.lengthBeats <= beat + EPS) continue;
      if (!top || isAbove(c, top, track.clips)) top = c;
    }
    return top;
  }

  function hide() {
    if (!shown) return;
    shown = false;
    beam.hidden = true;
    sparks = [];
  }

  let cost = 0;
  function frame(now) {
    requestAnimationFrame(frame);
    const t0 = performance.now();
    try { draw(now); } finally { cost += (performance.now() - t0 - cost) * 0.1; }
  }

  let preview = 0;
  function draw(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    const live = engine.playing;
    if (++colorAge > 60) readColors();
    // Raumlicht (Hintergrund, Leiste oben, Regal) läuft immer, gemächlich: höchstens 20 Bilder pro Sekunde
    if (frameNo++ % 3 === 0) drawRoom(now / 1000);
    drawRow();
    if (!live && !shown) return;

    const p = store.project;
    const beat = engine.heardBeat();
    const anySolo = anySoloOf(p);
    const hits = [];
    const target = Object.fromEntries(CATS.map((c) => [c, 0]));
    if (live) {
      for (const t of p.tracks) {
        const st = trackState(p, t);
        if (st.mute || (anySolo && !st.solo)) continue;
        const clip = clipAt(t, beat);
        if (!clip) continue;
        const s = library.get(clip.sampleId);
        const cat = CATS.includes(s?.colorCat ?? s?.category) ? (s.colorCat ?? s.category) : 'fx';
        const lv = engine.trackPeak(t.id);
        target[cat] += lv;
        hits.push({ trackId: t.id, cat, lv, clip });
      }
    }
    // schnell hoch, langsam zurück – wie eine Amplitude (nach dem Stopp blendet drawRoom sanft aus)
    if (live) {
      for (const c of CATS) level[c] += (target[c] - level[c]) * (target[c] > level[c] ? 0.5 : 0.06);
      const peak = engine.peakLevel();
      const db = peak > 0 ? 20 * Math.log10(peak) : -60;
      const a = Math.min(1, Math.max(0, (db + 36) / 36));
      amp += (a - amp) * (a > amp ? 0.45 : 0.08);
    }
    for (const h of hits) {
      const g = trackGlow.get(h.trackId) ?? 0;
      trackGlow.set(h.trackId, g + (h.lv - g) * (h.lv > g ? 0.6 : 0.15));
    }
    const hitIds = new Set(hits.map((h) => h.trackId));
    for (const [id, g] of trackGlow) if (!hitIds.has(id)) { if (g < 0.003) trackGlow.delete(id); else trackGlow.set(id, g * 0.85); }

    // Marke: aus, sobald Kern und Funken verglüht sind (der Hintergrund klingt unabhängig davon aus)
    if (!live && !sparks.length && !trackGlow.size) { hide(); return; }
    if (!shown) { shown = true; beam.hidden = false; }

    // ---------- Marke: Leuchten und Funken ----------
    const ppb = ui.pxPerBeat;
    const x = headW() + beat * ppb;
    const rowsEl = grid.querySelector('.rows');
    const top = rowsEl.offsetTop;
    const w = BEHIND + AHEAD;
    const h = Math.max(1, rowsEl.offsetHeight);
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    if (w !== bw || h !== bh) {
      bw = w;
      bh = h;
      beam.width = Math.round(w * dpr);
      beam.height = Math.round(h * dpr);
      beam.style.width = w + 'px';
      beam.style.height = h + 'px';
    }
    beam.style.transform = `translate(${x - BEHIND}px, ${top}px)`;
    bc.setTransform(dpr, 0, 0, dpr, 0, 0);
    bc.clearRect(0, 0, w, h);
    bc.globalCompositeOperation = 'lighter';
    for (const t of p.tracks) {
      const g = trackGlow.get(t.id);
      if (g === undefined) continue;
      const lane = grid.querySelector(`.lane[data-track-id="${t.id}"]`);
      if (!lane?.offsetParent) continue;
      const hit = hits.find((hh) => hh.trackId === t.id);
      // Kein Clip mehr unter der Marke: dort bleibt die Linie leise
      if (!hit) continue;
      const cat = hit?.cat ?? 'fx';
      const [r, gg, b] = rgb[cat] || [136, 136, 136];
      const y0 = lane.offsetTop - top;
      const lh = lane.offsetHeight;
      const I = Math.min(1, 0.3 + g * 3);
      // Hof: schmal, nur direkt an der Marke
      bc.save();
      bc.beginPath();
      bc.rect(0, y0 + 2, w, lh - 4);
      bc.clip();
      bc.translate(BEHIND, y0 + lh / 2);
      bc.scale(1, lh / 2 / 30);
      const grd = bc.createRadialGradient(0, 0, 0, 0, 0, 30);
      grd.addColorStop(0, `rgba(${r},${gg},${b},${I})`);
      grd.addColorStop(0.4, `rgba(${r},${gg},${b},${0.5 * I})`);
      grd.addColorStop(1, `rgba(${r},${gg},${b},0)`);
      bc.fillStyle = grd;
      bc.fillRect(-30, -30, 60, 60);
      bc.restore();
      // Wellenform vor und hinter der Marke leuchtet in der Clip-Farbe, zur Marke hin am hellsten
      if (hit?.clip) glowWave(hit.clip, lane, r, gg, b, I, dpr);
      // heller Kern mit Schein: nur wo die Marke einen Clip trifft (sonst bleibt die Linie leise)
      bc.save();
      bc.globalCompositeOperation = 'source-over';
      bc.shadowColor = 'rgba(255,255,255,0.9)';
      bc.shadowBlur = 10;
      bc.fillStyle = `rgba(255,255,255,${0.7 + 0.3 * I})`;
      bc.fillRect(BEHIND - 1, y0 + 2, 2, lh - 4);
      bc.restore();
      // Funken in der Clip-Farbe, meist gegen die Laufrichtung
      if (hit && !reduced.matches && sparks.length < MAX_SPARKS && Math.random() < I * 0.6) {
        const life = 0.35 + Math.random() * 0.5;
        sparks.push({
          x, y: y0 + 6 + Math.random() * (lh - 12), vx: -(25 + Math.random() * 110) * (Math.random() < 0.85 ? 1 : -0.4),
          vy: (Math.random() - 0.5) * 50, life, max: life, size: Math.random() < 0.3 ? 3 : 2, c: [r, gg, b],
        });
      }
    }
    sparks = sparks.filter((s) => (s.life -= dt) > 0);
    for (const s of sparks) {
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.vy *= 0.96;
      const k = s.life / s.max;
      const sx = s.x - (x - BEHIND);
      if (sx < -4 || sx > w + 4) continue;
      bc.fillStyle = `rgba(${s.c[0]},${s.c[1]},${s.c[2]},${k})`;
      bc.fillRect(Math.round(sx), Math.round(s.y), s.size, s.size);
    }
    bc.globalCompositeOperation = 'source-over';
  }

  // Ausschnitt der Wellenform um die Marke: maskiert (Mitte hell, Ränder weich) und mit Schein aufaddiert
  const off = document.createElement('canvas');
  const oc = off.getContext('2d');
  function glowWave(clip, lane, r, g, b, I, dpr) {
    const wave = lane.querySelector(`.clip[data-clip-id="${clip.id}"] .clip-wave`);
    if (!wave || !wave.width) return;
    const wr = wave.getBoundingClientRect();
    const br = beam.getBoundingClientRect();
    if (!wr.width || !br.width) return;
    const L = Math.max(0, br.left + BEHIND - WAVE_GLOW - wr.left);
    const Rr = Math.min(wr.width, br.left + BEHIND + WAVE_GLOW - wr.left);
    if (Rr <= L) return;
    const sw = Rr - L;
    const sx = wave.width / wr.width;
    off.width = Math.max(1, Math.round(sw * dpr));
    off.height = Math.max(1, Math.round(wr.height * dpr));
    oc.setTransform(1, 0, 0, 1, 0, 0);
    oc.globalCompositeOperation = 'source-over';
    oc.clearRect(0, 0, off.width, off.height);
    oc.drawImage(wave, L * sx, 0, sw * sx, wave.height, 0, 0, off.width, off.height);
    // nur die Striche behalten, nach außen ausblenden
    const cx = (br.left + BEHIND - wr.left - L) * dpr;
    const mask = oc.createLinearGradient(cx - WAVE_GLOW * dpr, 0, cx + WAVE_GLOW * dpr, 0);
    mask.addColorStop(0, 'rgba(0,0,0,0)');
    mask.addColorStop(0.5, 'rgba(0,0,0,1)');
    mask.addColorStop(1, 'rgba(0,0,0,0)');
    oc.globalCompositeOperation = 'destination-in';
    oc.fillStyle = mask;
    oc.fillRect(0, 0, off.width, off.height);
    const dx = wr.left + L - br.left;
    const dy = wr.top - br.top;
    bc.save();
    bc.globalCompositeOperation = 'lighter';
    bc.shadowColor = `rgba(${r},${g},${b},0.9)`;
    bc.shadowBlur = 8;
    bc.globalAlpha = 0.55 + 0.45 * I;
    bc.drawImage(off, dx, dy, sw, wr.height);
    // zweimal aufaddiert: die Striche glühen fast weiß
    bc.shadowBlur = 0;
    bc.globalAlpha = 0.5 * I;
    bc.drawImage(off, dx, dy, sw, wr.height);
    bc.restore();
  }

  // Wo jede Farbe gerade „steht“ (0…1 quer über den Raum), langsam wandernd
  const spot = (i, k, t, speed = 1) => [0.5 + 0.42 * Math.sin(t * 0.21 * speed + i * 1.7 + k * 2.9), 0.5 + 0.4 * Math.cos(t * 0.17 * speed + (i * 1.7 + k * 2.9) * 1.3)];
  const GREY = [150, 154, 166];

  function drawRoom(t) {
    // Musik hört auf: alle Farbe blendet über gut zwei Sekunden sanft aus (kein Sprung)
    if (!engine.playing) { for (const c of CATS) level[c] *= 0.955; amp *= 0.955; }
    const total = CATS.reduce((n, c) => n + level[c], 0);
    const presence = Math.min(1, total / 0.12);
    const loud = total > 0.0005 ? ambientMax * presence * (0.35 + 0.65 * amp) : 0;
    const still = reduced.matches ? 0 : t;

    // ---------- Hintergrund: Anthrazit-Wabern, darüber die Farben der klingenden Sounds ----------
    const W = amb.width;
    const H = amb.height;
    ac.clearRect(0, 0, W, H);
    for (let k = 0; k < 3; k++) {
      const [x, y] = spot(7, k, still, 0.35);
      const g = ac.createRadialGradient(x * W, y * H, 0, x * W, y * H, W * 0.55);
      g.addColorStop(0, `rgba(${GREY},${0.16 + 0.05 * Math.sin(still * 0.3 + k)})`);
      g.addColorStop(1, `rgba(${GREY},0)`);
      ac.fillStyle = g;
      ac.fillRect(0, 0, W, H);
    }
    if (loud > 0) {
      let mr = 0, mg = 0, mb = 0;
      for (const c of CATS) { const sh = level[c] / total; mr += rgb[c][0] * sh; mg += rgb[c][1] * sh; mb += rgb[c][2] * sh; }
      ac.fillStyle = `rgba(${mr | 0},${mg | 0},${mb | 0},${0.32 * loud})`;
      ac.fillRect(0, 0, W, H);
      CATS.forEach((c, i) => {
        const share = level[c] / total;
        if (share < 0.03) return;
        const [r, g, b] = rgb[c];
        for (let k = 0; k < 2; k++) {
          const [x, y] = spot(i, k, still);
          const rad = W * (0.22 + 0.6 * share);
          const grd = ac.createRadialGradient(x * W, y * H, 0, x * W, y * H, rad);
          grd.addColorStop(0, `rgba(${r},${g},${b},${Math.min(1, 1.1 * Math.sqrt(share)) * loud})`);
          grd.addColorStop(1, `rgba(${r},${g},${b},0)`);
          ac.fillStyle = grd;
          ac.fillRect(0, 0, W, H);
        }
      });
    }

    // ---------- Lichtleiste oben: dieselben Farben als LED-Band ----------
    for (const [c2, n] of [[barC, bar], [glowC, barGlow]]) {
      const BW = n.width;
      c2.clearRect(0, 0, BW, 1);
      c2.globalCompositeOperation = 'lighter';
      // nur bunt, Helligkeit nach dem Ausschlag – ohne Musik bleibt die Leiste dunkel
      if (loud > 0) {
        CATS.forEach((c, i) => {
          const share = level[c] / total;
          if (share < 0.03) return;
          const [r, g, b] = rgb[c];
          for (let k = 0; k < 2; k++) {
            const [x] = spot(i, k, still);
            const grd = c2.createRadialGradient(x * BW, 0.5, 0, x * BW, 0.5, BW * (0.18 + 0.5 * share));
            grd.addColorStop(0, `rgba(${r},${g},${b},${Math.min(1, (0.15 + 1.1 * amp) * Math.sqrt(share)) * presence})`);
            grd.addColorStop(1, `rgba(${r},${g},${b},0)`);
            c2.fillStyle = grd;
            c2.fillRect(0, 0, BW, 1);
          }
        });
      }
      c2.globalCompositeOperation = 'source-over';
    }

  }

  // ---------- Regal: Wellenform in der gewählten Zeile ----------
  let rowKey = '';
  function drawRow() {
    const id = ui.armedSampleId ?? engine.preview?.sampleId;
    const item = id && shelfEl?.querySelector(`.loop-item[data-sample-id="${CSS.escape(id)}"]`);
    const s = item && library.get(id);
    if (!s) {
      if (rowWave.isConnected) rowWave.remove();
      preview = 0;
      rowKey = '';
      return;
    }
    if (rowWave.parentNode !== item) { item.prepend(rowWave); rowKey = ''; }
    const pv = engine.preview?.sampleId === id ? engine.preview : null;
    const bands = pv ? engine.outputBands(4) : null;
    const lv = bands ? Math.min(1, (bands.reduce((x, y) => x + y, 0) / bands.length) * 1.6) : 0;
    preview += (lv - preview) * (lv > preview ? 0.6 : 0.12);
    const prog = pv?.when != null && engine.ctx ? Math.max(0, Math.min(1, (engine.ctx.currentTime - pv.when) / pv.duration)) : -1;
    const w = item.clientWidth;
    const h = item.clientHeight;
    // Ruhig und unverändert: nicht neu zeichnen
    const key = `${id}|${w}|${h}|${!!s.peaks}|${colorAge === 0 ? 'c' : ''}`;
    if (prog < 0 && preview < 0.005 && key === rowKey) return;
    rowKey = key;
    const dpr = window.devicePixelRatio || 1;
    if (rowWave.width !== Math.round(w * dpr) || rowWave.height !== Math.round(h * dpr)) {
      rowWave.width = Math.round(w * dpr);
      rowWave.height = Math.round(h * dpr);
    }
    const c = rowC;
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.clearRect(0, 0, w, h);
    const cat = CATS.includes(s.colorCat ?? s.category) ? (s.colorCat ?? s.category) : 'fx';
    const [r, g, b] = rgb[cat] || [136, 136, 136];
    const mid = h / 2;
    const px = prog >= 0 ? prog * w : -1;
    // Schein hinter der Stelle, die gerade klingt – stärker, je lauter
    if (px >= 0 && preview > 0.01) {
      const grd = c.createRadialGradient(px, mid, 0, px, mid, Math.max(40, w * 0.45));
      grd.addColorStop(0, `rgba(${r},${g},${b},${0.38 * preview})`);
      grd.addColorStop(1, `rgba(${r},${g},${b},0)`);
      c.fillStyle = grd;
      c.fillRect(0, 0, w, h);
    }
    const peaks = s.peaks;
    if (!peaks) {
      c.fillStyle = `rgba(${r},${g},${b},0.35)`;
      for (let x = 0; x < w; x += 6) c.fillRect(x, Math.round(mid), 3, 1);
      return;
    }
    // Lichtstriche wie in der Timeline: gespielt hell und leuchtend, der Rest gedämpft
    const PITCH = 2;
    const n = peaks.length;
    for (let x = 0; x < w; x += PITCH) {
      const k0 = Math.floor((x / w) * n);
      const k1 = Math.max(k0 + 1, Math.ceil(((x + PITCH) / w) * n));
      let m = 0;
      for (let k = k0; k < k1 && k < n; k++) m = Math.max(m, peaks[k]);
      const a = Math.max(0.5, Math.min(mid - 2, (m / 0.62) * (mid - 2)));
      const played = px >= 0 && x <= px;
      const near = px >= 0 ? Math.max(0, 1 - Math.abs(x - px) / 60) : 0;
      c.fillStyle = `rgba(${r},${g},${b},${played ? 0.55 + 0.45 * Math.max(near, preview) : 0.28})`;
      c.fillRect(x, Math.round(mid - a), 1, Math.max(1, Math.round(2 * a)));
    }
    if (px >= 0) {
      c.fillStyle = `rgba(${r},${g},${b},0.9)`;
      c.shadowColor = `rgba(${r},${g},${b},0.9)`;
      c.shadowBlur = 8;
      c.fillRect(Math.round(px), 2, 1, h - 4);
      c.shadowBlur = 0;
    }
  }

  readColors();
  beam.hidden = true;
  requestAnimationFrame(frame);
  return { get state() { return { shown, amp, cost, preview, sparks: sparks.length, levels: { ...level } }; } };
}
