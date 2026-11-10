// Licht aus der Musik: unscharfer Hintergrund hinter der ganzen Seite – in Ruhe ein langsames, graues Wabern,
// mit den Sounds kommen Farbe und Rhythmus (Pegel × Farben der klingenden Clips). Dazu eine helle Lichtleiste
// ganz oben, Licht im Regal beim Vorhören und Leuchten mit Funken nur direkt an der Abspielmarke.

import { anySoloOf, isAbove, trackState, EPS } from '../model.js';
import { headW } from './arranger.js';
import { createRoomShader } from './room-shader.js';
import { createReact } from './room-react.js';

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
  // Shader, wenn der Browser WebGL 2 kann; sonst malt Canvas 2D dieselben Werte
  const shader = createRoomShader(amb);
  const react = createReact({ engine, colorOf: (cat) => rgb[cat] || [136, 136, 136] });
  let lastReact = null;
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
  const ac = shader ? document.createElement('canvas').getContext('2d') : amb.getContext('2d');
  const bc = beam.getContext('2d');
  const barC = bar.getContext('2d');
  const glowC = barGlow.getContext('2d');
  const rowC = rowWave.getContext('2d');
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');

  // Farben aus den Tokens (Hell/Dunkel), regelmäßig neu gelesen
  const rgb = {};
  let white = [255, 255, 255];
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
    ac.fillStyle = '#000';
    ac.fillStyle = cs.getPropertyValue('--beam').trim() || '#fff';
    if (/^#/.test(ac.fillStyle)) white = [1, 3, 5].map((i) => parseInt(ac.fillStyle.slice(i, i + 2), 16));
    colorAge = 0;
  }

  const level = Object.fromEntries(CATS.map((c) => [c, 0]));
  const trackGlow = new Map();
  let amp = 0;
  // Raumlicht: Anstieg und Nachklingen in Sekunden
  const GLOW_ATTACK = 0.12;
  const GLOW_RELEASE = 1.4;
  let sparks = [];
  let last = performance.now();
  let roomAt = -Infinity;
  let shown = false;
  let bw = 0;
  let bh = 0;
  let beamTf = '';

  // Clip, der auf einer Spur an dieser Stelle klingt (der obere bei Überlappung)
  function clipAt(track, beat) {
    let top = null;
    for (const c of track.clips) {
      if (c.mute || c.startBeat > beat + EPS || c.startBeat + c.lengthBeats <= beat + EPS) continue;
      if (!top || isAbove(c, top, track.clips)) top = c;
    }
    return top;
  }

  // Spuren, auf denen gerade etwas klingt, leuchten leise in ihrer Farbe (Spurkopf und Fläche, CSS --lit/--lit-c)
  const litRows = new Map(); // trackId → { row, v }
  const trackCat = new Map();
  function litTracks(p, hits) {
    for (const h of hits) trackCat.set(h.trackId, h.cat);
    const seen = new Set();
    for (const t of p.tracks) {
      const g = trackGlow.get(t.id) ?? 0;
      const v = Math.round(Math.min(1, g * 3) * 50) / 50;
      const prev = litRows.get(t.id);
      if (!v && !prev) continue;
      seen.add(t.id);
      if (prev && prev.v === v && prev.row.isConnected) continue;
      const row = (prev?.row?.isConnected && prev.row) || grid.querySelector(`.lane[data-track-id="${t.id}"]`)?.closest('.track-row');
      if (!row) continue;
      const [r, gg, b] = rgb[trackCat.get(t.id)] || [136, 136, 136];
      row.style.setProperty('--lit', String(v));
      row.style.setProperty('--lit-c', `${r} ${gg} ${b}`);
      if (v) litRows.set(t.id, { row, v });
      else { litRows.delete(t.id); row.style.removeProperty('--lit'); }
    }
    for (const [id, x] of litRows) if (!seen.has(id)) { x.row.style.removeProperty('--lit'); litRows.delete(id); }
  }

  function hide() {
    if (!shown) return;
    shown = false;
    for (const x of litRows.values()) x.row.style.removeProperty('--lit');
    litRows.clear();
    beam.hidden = true;
    sparks = [];
  }

  // Maße aus dem Layout (Spuren, Marke, Arranger) nur nach einer Layout-Änderung neu holen, nie je Bild
  const scroller = grid.parentElement;
  let geo = null;
  let scrollX = scroller.scrollLeft;
  const relayout = () => { geo = null; roomDirty = true; };
  root.addEventListener('arr-layout', relayout);
  scroller.addEventListener('scroll', () => { scrollX = scroller.scrollLeft; }, { passive: true });
  window.addEventListener('resize', relayout);
  new ResizeObserver(relayout).observe(root);
  ui.on?.(relayout);
  function measure() {
    if (geo) return geo;
    const rowsEl = grid.querySelector('.rows');
    const top = rowsEl.offsetTop;
    const lanes = new Map();
    for (const lane of grid.querySelectorAll('.lane[data-track-id]')) {
      if (lane.offsetParent) lanes.set(lane.dataset.trackId, { lane, y0: lane.offsetTop - top, h: lane.offsetHeight });
    }
    // Marke: Bildschirm-x = Versatz + Rasterposition − Scrollweite
    const ph = grid.querySelector('.playhead');
    const pr = ph?.getBoundingClientRect();
    const tx = parseFloat(/translateX\(([-\d.e]+)px\)/.exec(ph?.style.transform || '')?.[1]) || 0;
    scrollX = scroller.scrollLeft;
    const ar = root.getBoundingClientRect();
    geo = { top, h: Math.max(1, rowsEl.offsetHeight), lanes, phOff: pr ? pr.left + pr.width / 2 - tx + scrollX : null, ar: { left: ar.left, right: ar.right, top: ar.top, bottom: ar.bottom, height: ar.height }, inner: null };
    return geo;
  }
  // Wellenform eines Clips im Raster: Lage aus den Stilwerten des Arrangers (left/width), Ränder einmal gemessen
  function waveGeo(g, clip, lane) {
    const wave = lane.querySelector(`.clip[data-clip-id="${clip.id}"] .clip-wave`);
    if (!wave || !wave.width) return null;
    const node = wave.parentElement;
    if (!g.inner) {
      let x = 0, y = 0;
      for (let n = wave; n && n !== lane; n = n.offsetParent) { x += n.offsetLeft + (n === wave ? 0 : n.clientLeft); y += n.offsetTop + (n === wave ? 0 : n.clientTop); }
      const L = g.lanes.get(lane.dataset.trackId);
      g.inner = { dx: x - node.offsetLeft - wave.offsetLeft, dy: y, h: wave.offsetHeight, laneX: lane.offsetLeft, laneY: L ? L.y0 + g.top : lane.offsetTop };
    }
    const L = g.lanes.get(lane.dataset.trackId);
    const w = parseFloat(wave.style.width) || 0;
    return { wave, x: g.inner.laneX + (parseFloat(node.style.left) || 0) + g.inner.dx + (parseFloat(wave.style.left) || 0), y: (L ? L.y0 + g.top : g.inner.laneY) + g.inner.dy, w, h: g.inner.h };
  }

  // Raumlicht-Fassung: full wie gestaltet; lean (Software-Grafik) zeichnet in der Stille nicht weiter und beim Spielen
  // seltener; off zeigt nur noch die Lichtleiste. Bleibt das Bild über Sekunden zu langsam, eine Stufe herunter.
  const MODES = ['full', 'lean', 'off'];
  let mode = shader?.software ? 'lean' : 'full';
  let modeFixed = false;
  let roomDirty = true;
  let slowRoom = 0;
  let speedMs = 16;
  const SLOW_MS = 30; // gleitender Bildabstand: darüber gilt das Bild als zu langsam (unter etwa 33 Bilder/s)
  const SLOW_FOR = 3000; // so lange am Stück, bevor das Licht sparsamer wird
  function setMode(m) {
    mode = m;
    slowRoom = 0;
    amb.hidden = m === 'off';
    roomDirty = true;
  }
  function watchSpeed(dtMs, active) {
    speedMs += (Math.min(100, dtMs) - speedMs) * 0.1;
    if (modeFixed || mode === 'off' || document.hidden) { slowRoom = 0; return; }
    slowRoom = active && speedMs > SLOW_MS && (!shader || glFixed || glQ == null || glQ <= GL_LOW || shader.software) ? slowRoom + Math.min(250, dtMs) : 0;
    if (slowRoom > SLOW_FOR) setMode(MODES[MODES.indexOf(mode) + 1]);
  }

  let cost = 0;
  let roomCost = 0;
  function frame(now) {
    requestAnimationFrame(frame);
    const t0 = performance.now();
    try { draw(now); } finally { cost += (performance.now() - t0 - cost) * 0.1; }
  }

  let preview = 0;
  function draw(now) {
    const dtMs = now - last;
    const dt = Math.min(0.05, dtMs / 1000);
    last = now;
    const live = engine.playing;
    adaptQuality(dtMs, live);
    if (++colorAge > 60) readColors();
    // Raumlicht (Hintergrund, Leiste oben) läuft immer, gemächlich: höchstens 20 Bilder pro Sekunde, auch bei 120 Hz
    // Shader: 30 Bilder pro Sekunde, damit der Nebel fließt; in der Stille genügen 15
    const roomIdle = !live && (room.K || 0) < 0.002 && room.glow.every((g) => g < 0.01);
    const lean = mode !== 'full';
    watchSpeed(dtMs, !(lean && roomIdle));
    const every = lean ? 66 : shader ? (roomIdle ? 66 : shader.software ? 45 : 32) : 45;
    if (now - roomAt >= every && !(lean && roomIdle && !roomDirty)) {
      roomAt = now;
      roomDirty = false;
      const r0 = performance.now();
      drawRoom(now / 1000);
      roomCost += (performance.now() - r0 - roomCost) * 0.2;
    }
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
    // Weich hoch, lange zurück – wie ein Nachleuchten (Zeiten in Sekunden, unabhängig von der Bildrate);
    // nach dem Stopp blendet drawRoom sanft aus
    if (live) {
      const k = (tau) => 1 - Math.exp(-dt / tau);
      const up = k(GLOW_ATTACK), down = k(GLOW_RELEASE);
      for (const c of CATS) level[c] += (target[c] - level[c]) * (target[c] > level[c] ? up : down);
      const peak = engine.peakLevel();
      const db = peak > 0 ? 20 * Math.log10(peak) : -60;
      const a = Math.min(1, Math.max(0, (db + 36) / 36));
      amp += (a - amp) * (a > amp ? k(GLOW_ATTACK * 0.8) : k(GLOW_RELEASE * 0.85));
    }
    for (const h of hits) {
      const g = trackGlow.get(h.trackId) ?? 0;
      trackGlow.set(h.trackId, g + (h.lv - g) * (h.lv > g ? 0.6 : 0.15));
    }
    const hitIds = new Set(hits.map((h) => h.trackId));
    for (const [id, g] of trackGlow) if (!hitIds.has(id)) { if (g < 0.003) trackGlow.delete(id); else trackGlow.set(id, g * 0.85); }

    litTracks(p, hits);
    react.feed(hits);
    // Marke: aus, sobald Kern und Funken verglüht sind (der Hintergrund klingt unabhängig davon aus)
    if (!live && !sparks.length && !trackGlow.size) { hide(); return; }
    if (!shown) { shown = true; beam.hidden = false; }

    // ---------- Marke: Leuchten und Funken ----------
    const ppb = ui.pxPerBeat;
    const x = headW() + beat * ppb;
    const G = measure();
    const top = G.top;
    const w = BEHIND + AHEAD;
    const h = G.h;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    if (w !== bw || h !== bh) {
      bw = w;
      bh = h;
      beam.width = Math.round(w * dpr);
      beam.height = Math.round(h * dpr);
      beam.style.width = w + 'px';
      beam.style.height = h + 'px';
    }
    const tf = `translate(${x - BEHIND}px, ${top}px)`;
    if (tf !== beamTf) { beam.style.transform = tf; beamTf = tf; }
    bc.setTransform(dpr, 0, 0, dpr, 0, 0);
    bc.clearRect(0, 0, w, h);
    bc.globalCompositeOperation = 'lighter';
    for (const t of p.tracks) {
      const g = trackGlow.get(t.id);
      if (g === undefined) continue;
      const L = G.lanes.get(t.id);
      if (!L?.lane.isConnected) continue;
      const lane = L.lane;
      const hit = hits.find((hh) => hh.trackId === t.id);
      // Kein Clip mehr unter der Marke: dort bleibt die Linie leise
      if (!hit) continue;
      const cat = hit?.cat ?? 'fx';
      const [r, gg, b] = rgb[cat] || [136, 136, 136];
      const y0 = L.y0;
      const lh = L.h;
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
      if (hit?.clip) glowWave(G, hit.clip, lane, x, r, gg, b, I, dpr);
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
  function glowWave(G, clip, lane, x, r, g, b, I, dpr) {
    const wg = waveGeo(G, clip, lane);
    if (!wg || !wg.w) return;
    const wave = wg.wave;
    // alles im Raster gerechnet: Leinwand bei wg.x/wg.y, Strahl bei x − BEHIND / G.top
    const bl = x - BEHIND;
    const wr = { left: wg.x, top: wg.y, width: wg.w, height: wg.h };
    const br = { left: bl, top: G.top };
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

  // ---------- Raumlicht nach Frequenz: Bass unten, Mitten als Wolken, Höhen funkeln oben ----------
  // Bänder aus engine.spectrumDb() (dB) → 0…1; Spannen nach dem Spektrum typischer Mischungen (Höhen liegen tiefer)
  const BAND_DB = [[-58, -18], [-60, -20], [-84, -40]];
  // Welche Kategorie in welchem Band färbt (Bass, Mitten, Höhen) – nur Gewichte, die Farben kommen aus den Tokens
  const AFF = { drums: [0.8, 0.35, 1], bass: [1, 0.3, 0.1], chords: [0.2, 1, 0.4], synth: [0.3, 1, 0.6], fx: [0.3, 0.6, 1], own: [0.4, 1, 0.5] };
  const BAND_ATTACK = 0.1;
  const BAND_RELEASE = 1.3;
  const RISE_MAX = 1.0; // höchstens so viel Helligkeit (0…1) pro Sekunde dazu
  const fract = (x) => x - Math.floor(x);
  const STARS = Array.from({ length: 14 }, (_, i) => ({
    x: 0.04 + 0.92 * fract(i * 0.618 + 0.13), y: 0.03 + 0.27 * fract(i * 0.382 + 0.27) ** 1.3,
    w: 0.9 + 1.3 * fract(i * 0.77 + 0.4), ph: i * 2.3, s: 0.8 + 0.6 * fract(i * 0.29),
  }));
  const room = {
    t: 0, band: [0, 0, 0], fast: [-90, -90, -90], base: [-90, -90, -90], since: [9, 9, 9], warm: 0,
    hue: Object.fromEntries(CATS.map((c) => [c, 0])),
    glowT: [0, 0, 0], glow: [0, 0, 0], colX: -1, colI: 0, ghosts: [], waves: [], bar: null, lastBeat: 0, vig: 0,
  };
  let phEl = null;
  // Mischfarbe; quadrierte Gewichte, damit die kräftigste Farbe die Fläche trägt (statt Grau aus allen)
  const mixRGB = (w) => {
    let n = 0, r = 0, g = 0, b = 0;
    for (const c of CATS) { const k = w(c) ** 2; n += k; r += rgb[c][0] * k; g += rgb[c][1] * k; b += rgb[c][2] * k; }
    return n > 1e-6 ? [r / n, g / n, b / n] : null;
  };
  const toWhite = (c, k) => c.map((v, i) => v + (white[i] - v) * k);
  const css = (c, a) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${Math.max(0, Math.min(1, a)).toFixed(3)})`;
  // Weicher Abfall wie ein Lichtkegel (glockenförmig, ohne sichtbare Kante)
  const BELL = [[0, 1], [0.2, 0.86], [0.42, 0.55], [0.64, 0.25], [0.84, 0.07], [1, 0]];
  const soft = (c, a) => BELL.map(([o, f]) => [o, css(c, a * f)]);
  // Ellipse mit weichem Rand (Kreis im Einheitsmaß, gestreckt)
  function blob(x, y, rx, ry, stops) {
    ac.save();
    ac.translate(x, y);
    ac.scale(rx, ry);
    const g = ac.createRadialGradient(0, 0, 0, 0, 0, 1);
    for (const [o, c] of stops) g.addColorStop(o, c);
    ac.fillStyle = g;
    ac.fillRect(-1, -1, 2, 2);
    ac.restore();
  }

  // Bänder, Nachglühen, Marke: zeitbasiert fortschreiben (dt in Sekunden)
  function stepRoom(dt) {
    const live = engine.playing;
    const calm = reduced.matches;
    const k = (tau) => 1 - Math.exp(-dt / tau);
    const db = live ? engine.spectrumDb?.() : null;
    room.warm = live ? room.warm + dt : 0;
    for (let b = 0; b < 3; b++) {
      let target = 0;
      if (live) {
        if (db) {
          const [lo, hi] = BAND_DB[b];
          target = Math.max(0, Math.min(1, (db[b] - lo) / (hi - lo)));
          // Nachglühen: deutlicher Anstieg über die jüngsten Spitzen (Drop, Becken)
          const d = Math.max(lo - 12, db[b]);
          room.fast[b] += (d - room.fast[b]) * k(0.05);
          if (room.warm < 0.6) room.base[b] = Math.max(room.base[b] + (room.fast[b] - room.base[b]) * k(0.15), room.fast[b]);
          else room.base[b] += (room.fast[b] - room.base[b]) * k(room.fast[b] > room.base[b] ? 0.7 : 4);
          room.since[b] += dt;
          const rise = room.fast[b] - room.base[b];
          if (!calm && room.warm >= 0.6 && rise > 6 && room.since[b] > 1.2 && target > 0.2) {
            room.glowT[b] = Math.min(1, room.glowT[b] + 0.45 + (rise - 6) / 12);
            room.since[b] = 0;
          }
        } else target = amp;
      }
      // weich hoch, lange zurück; ruhig (reduzierte Bewegung) noch gemächlicher
      const up = k(calm ? 0.8 : BAND_ATTACK), down = k(live && !calm ? BAND_RELEASE : 2.5);
      // Anstieg zusätzlich begrenzt (je Sekunde), damit auch ein Drop nicht blitzt
      const v = room.band[b] + (target - room.band[b]) * (target > room.band[b] ? up : down);
      room.band[b] = Math.min(v, room.band[b] + RISE_MAX * dt);
      room.glowT[b] *= Math.exp(-dt / 1.0);
      const g = room.glow[b] + (room.glowT[b] - room.glow[b]) * k(room.glowT[b] > room.glow[b] ? 0.35 : 0.3);
      room.glow[b] = Math.min(g, room.glow[b] + RISE_MAX * 0.8 * dt);
    }
  }

  // Farbe der klingenden Clips breitet sich von der Marke aus (Welle je Takt) und zieht hinter ihr nach;
  // beim Loop-Sprung oder Weiterblättern blendet das alte Licht aus und das neue ein
  function drawWave(W, H, L, dt, mix, K) {
    const live = engine.playing;
    const k = (tau) => 1 - Math.exp(-dt / tau);
    const vw = window.innerWidth || 1, vh = window.innerHeight || 1;
    let x = -1, y0 = room.y0 ?? 0, y1 = room.y1 ?? H;
    if (live) {
      if (!phEl?.isConnected) phEl = grid.querySelector('.playhead');
      // Lage aus den gemerkten Maßen und der aktuellen Verschiebung der Marke (ohne Layout zu lesen)
      const G = measure();
      const ar = G.ar;
      if (phEl && G.phOff != null && ar.height) {
        const tx = parseFloat(/translateX\(([-\d.e]+)px\)/.exec(phEl.style.transform)?.[1]) || 0;
        const px = G.phOff + tx - scrollX;
        if (px >= ar.left && px <= ar.right) x = (px / vw) * W;
        y0 = (Math.max(0, ar.top) / vh) * H;
        y1 = (Math.min(vh, ar.bottom) / vh) * H;
        room.y0 = y0; room.y1 = y1;
      }
    }
    if (mix) room.colC = mix;
    const c = room.colC || GREY;
    const beat = live ? engine.heardBeat() : room.lastBeat;
    const jumped = live && (beat < room.lastBeat - 0.25 || beat > room.lastBeat + 2 || (x >= 0 && room.colX >= 0 && Math.abs(x - room.colX) > W * 0.06));
    if (jumped && room.colI > 0.01) room.ghosts.push({ x: room.colX, i: room.colI, c, y0, y1 });
    if (jumped) room.colI = 0;
    if (x >= 0) room.colX = x;
    const target = x >= 0 ? K * (0.35 + 0.65 * (room.amp || 0)) : 0;
    room.colI += (target - room.colI) * k(target > room.colI ? 0.25 : 0.5);
    const bar = Math.floor(beat / (store.project.beatsPerBar || 4) + 1e-6);
    if (live && !jumped && room.bar !== null && bar !== room.bar && x >= 0 && target > 0.02) {
      room.waves.push({ x, y: (y0 + y1) / 2, age: 0, a: target, c });
      if (room.waves.length > 4) room.waves.shift();
    }
    room.bar = live ? bar : null;
    room.lastBeat = beat;

    const LIFE = 1.8;
    room.waves = room.waves.filter((w) => (w.age += dt) < LIFE);
    room.ghosts = room.ghosts.filter((g) => (g.i *= Math.exp(-dt / 0.35)) > 0.01);
    // Wellenradius (Anteil der langen Seite) und Stärke: leise, nur ein Hauch je Takt
    const waveAt = (w) => { const u = w.age / LIFE; return { r: 0.04 + 0.55 * (1 - (1 - u) ** 2), a: 0.3 * w.a * Math.min(1, w.age / 0.25) * (1 - u) ** 2 }; };
    if (shader) return waveAt;
    ac.globalCompositeOperation = 'lighter';
    for (const w of room.waves) {
      const { r: rr, a } = waveAt(w);
      const r = L * rr;
      if (a < 0.005) continue;
      const wd = Math.min(r, L * 0.06 + 0.25 * r);
      const i0 = Math.max(0, (r - wd) / r);
      const i1 = Math.max(i0, (r - wd / 2) / r);
      blob(w.x, w.y, r, r * 0.85, [[0, css(w.c, 0)], [i0, css(w.c, 0)], [(i0 + i1) / 2, css(w.c, 0.5 * a)], [i1, css(w.c, a)], [(i1 + 1) / 2, css(w.c, 0.5 * a)], [1, css(w.c, 0)]]);
    }
    const column = (cx, ci, cc, a0, a1) => {
      const yc = (a0 + a1) / 2, ry = Math.max(4, ((a1 - a0) / 2) * 1.05);
      blob(cx - L * 0.07, yc, L * 0.11, ry, soft(cc, 0.7 * ci));
      blob(cx, yc, L * 0.04, ry * 0.9, soft(toWhite(cc, 0.2), 0.8 * ci));
    };
    for (const g of room.ghosts) column(g.x, g.i, g.c, g.y0, g.y1);
    if (room.colX >= 0 && room.colI > 0.01) column(room.colX, room.colI, c, y0, y1);
    ac.globalCompositeOperation = 'source-over';
  }

  // Alle Werte für den Shader sammeln (dieselben wie beim Malen mit Canvas 2D) und zeichnen
  // Shader rechnet in Bildschirmauflösung (bis 1,25 Bildpunkte je CSS-Pixel), sonst wirkt er verpixelt
  const GL_DPR = 1.25;
  const GL_MAX = 2400;
  const GL_LOW = 0.35; // kleinste Stufe für langsame Geräte
  const GL_SOFT = 0.25; // Software-Renderer (ohne Grafikchip): noch gröber, höchstens 22 Bilder/s
  let glQ = null;
  let glFixed = false;
  // Wird die App beim Spielen langsam (unter etwa 40 Bilder/s), rechnet der Shader schrittweise gröber
  let slowFor = 0, frameMs = 16;
  // Läuft es danach lange flüssig, geht es wieder eine Stufe hinauf (nicht bei Software-Renderern)
  let fastFor = 0;
  function adaptQuality(dtMs, live) {
    if (!shader || glFixed || glQ == null) return;
    frameMs += (Math.min(100, dtMs) - frameMs) * 0.1;
    slowFor = live && frameMs > 25 ? slowFor + dtMs : 0;
    fastFor = live && frameMs < 18 ? fastFor + dtMs : 0;
    const top = shader.software ? GL_SOFT : Math.min(GL_DPR, window.devicePixelRatio || 1);
    if (slowFor > 1500 && glQ > GL_LOW) { glQ = Math.max(GL_LOW, glQ * 0.7); slowFor = 0; fastFor = 0; frameMs = 16; }
    else if (fastFor > 20000 && glQ < top) { glQ = Math.min(top, glQ / 0.8); fastFor = 0; }
  }
  let flow = 0;
  function drawShader({ W, H, L, dt, mix, K, A, calm, still, hue }) {
    let waveAt = null;
    if (!calm) waveAt = drawWave(W, H, L, dt, mix, K);
    else { room.waves = []; room.ghosts = []; room.colI = 0; }
    const [b0, b1, b2] = room.band;
    const bandC = [0, 1, 2].map((b) => (mix && mixRGB((c) => hue[c] * AFF[c][b])) || mix || GREY);
    const clouds = [];
    if (mix && b1 > 0.01) {
      const sum = CATS.reduce((n, c) => n + hue[c] * AFF[c][1], 0);
      CATS.forEach((c, i) => {
        const share = (hue[c] * AFF[c][1]) / sum;
        const vis = Math.min(1, Math.max(0, (share - 0.05) / 0.2));
        if (vis < 0.01) return;
        const [x, y] = spot(i, 0, still, 0.8);
        const rad = (0.24 + 0.22 * share) * (0.75 + 0.35 * b1);
        const a = Math.min(1, (0.9 + 0.7 * share) * K * b1) * vis * vis * (3 - 2 * vis);
        clouds.push({ x: (x * W) / L, y: ((0.32 + 0.3 * y) * H) / L, r: rad, a: 0.7 * a, c: rgb[c] });
      });
    }
    const g = room.ghosts.reduce((m, x) => (x.i > (m?.i ?? 0) ? x : m), null);
    react.step(dt, engine.playing && !calm);
    const reactU = lastReact = { spec: react.spec, col: react.col };
    shader.draw({
      react: reactU,
      t: flow, K: mix ? K : 0, A, band: mix ? [b0, b1, b2] : [0, 0, 0], glow: mix ? room.glow : [0, 0, 0],
      c0: bandC[0], c1: bandC[1], c2: bandC[2], white, clouds,
      col: { x: room.colX >= 0 ? room.colX / W : -1, i: room.colI, y0: (room.y0 ?? 0) / H, y1: (room.y1 ?? H) / H, c: room.colC || GREY },
      ghost: g ? { x: g.x / W, i: g.i, y0: g.y0 / H, y1: g.y1 / H } : { x: -1, i: 0, y0: 0, y1: 1 },
      waves: waveAt ? room.waves.map((w) => ({ x: w.x / L, y: w.y / L, ...waveAt(w) })) : [],
      vig: room.vig, px: room.px || 1, idle: 0.13, grey: GREY, glowMax: ambientMax,
    });
  }

  function drawRoom(t) {
    const dt = Math.min(0.15, Math.max(0, t - room.t || 0.05));
    room.t = t;
    room.n = (room.n || 0) + 1;
    // Musik hört auf: alle Farbe blendet über gut zwei Sekunden sanft aus (kein Sprung)
    if (!engine.playing) { for (const c of CATS) level[c] *= 0.955; amp *= 0.955; }
    const total = CATS.reduce((n, c) => n + level[c], 0);
    const presence = Math.min(1, total / 0.12);
    const loud = total > 0.0005 ? ambientMax * presence * (0.35 + 0.65 * amp) : 0;
    const calm = reduced.matches;
    const still = calm ? 0 : t;
    stepRoom(dt);

    // Fläche passend zum Fenster (Kreise bleiben rund), lange Seite 160 px – der Browser zeichnet weich hoch
    const vw = window.innerWidth || 1, vh = window.innerHeight || 1;
    const Wn = vw >= vh ? 160 : Math.max(24, Math.round((160 * vw) / vh));
    const Hn = vw >= vh ? Math.max(24, Math.round((160 * vh) / vw)) : 160;
    if (shader) {
      const sc = Math.min(glQ ?? (glQ = shader.software ? GL_SOFT : Math.min(GL_DPR, window.devicePixelRatio || 1)), GL_MAX / Math.max(vw, vh));
      room.px = sc;
      const gw = Math.max(16, Math.round(vw * sc)), gh = Math.max(16, Math.round(vh * sc));
      if (amb.width !== gw || amb.height !== gh) { amb.width = gw; amb.height = gh; }
    } else if (amb.width !== Wn || amb.height !== Hn) { amb.width = Wn; amb.height = Hn; }
    // Raum-Maß für alle Werte (Marke, Wellen, Wolken): lange Seite 160
    const W = Wn;
    const H = Hn;
    const L = Math.max(W, H);
    room.W = W; room.H = H;

    // ---------- Hintergrund: Anthrazit-Wabern (still wie bisher) ----------
    if (!shader) ac.globalCompositeOperation = 'source-over';
    if (!shader) ac.clearRect(0, 0, W, H);
    for (let k = 0; k < (shader || mode === 'off' ? 0 : 3); k++) {
      const [x, y] = spot(7, k, still, 0.35);
      const g = ac.createRadialGradient(x * W, y * H, 0, x * W, y * H, L * 0.55);
      g.addColorStop(0, `rgba(${GREY},${0.16 + 0.05 * Math.sin(still * 0.3 + k)})`);
      g.addColorStop(1, `rgba(${GREY},0)`);
      ac.fillStyle = g;
      ac.fillRect(0, 0, W, H);
    }

    // Gesamthelligkeit: beim Start weich herein, nach dem Stopp in gut zwei Sekunden gleichmäßig heraus
    const Kt = engine.playing ? ambientMax * presence : 0;
    const K0 = room.K || 0;
    room.K = Math.max(K0 - 0.45 * ambientMax * dt, Math.min(Kt, K0 + RISE_MAX * (calm ? 0.35 : 0.65) * ambientMax * dt));
    const K = room.K;
    // Ausschlag noch einmal geglättet, ruhig (reduzierte Bewegung) fast stehend
    room.amp = (room.amp || 0) + (amp - (room.amp || 0)) * (1 - Math.exp(-dt / (calm ? 1.5 : 0.15)));
    const A = room.amp;
    const [b0, b1, b2] = room.band;
    const lit = K * Math.max(b0, b1, b2, A * 0.5);
    const vt = Math.min(1, lit * 2);
    room.vig += (vt - room.vig) * (1 - Math.exp(-dt / (vt > room.vig ? 0.6 : 0.3)));
    // Farben wandern langsamer als die Helligkeit: ein Schlag ändert das Licht, nicht gleich den Farbton
    const hue = room.hue;
    for (const c of CATS) hue[c] += (level[c] - hue[c]) * (1 - Math.exp(-dt / (level[c] > hue[c] ? 0.7 : 1.6)));
    const mix = total > 0.0005 ? mixRGB((c) => hue[c]) : null;
    const roomOff = mode === 'off'; // nur noch die Lichtleiste
    if (shader) {
      flow += dt * (calm ? 0.12 : 0.35 + 1.1 * A * (K / (ambientMax || 1)));
      if (!roomOff) drawShader({ W, H, L, dt, mix, K, A, calm, still, hue });
    } else if (!roomOff && mix && K > 0.002) {
      const bandC = [0, 1, 2].map((b) => mixRGB((c) => hue[c] * AFF[c][b]) || mix);
      // Mitte satter: ein großer Grund in der Mischfarbe statt einer flachen Fläche
      blob(W / 2, H * 0.5, L * 0.6, L * 0.45, soft(bandC[1], 0.5 * K * (0.4 + 0.6 * A)));
      // Bass: breites, warmes Feld von unten
      if (b0 > 0.01) {
        const top = H * (1 - (0.42 + 0.33 * b0));
        const g = ac.createLinearGradient(0, H, 0, top);
        g.addColorStop(0, css(bandC[0], 1.25 * K * b0));
        g.addColorStop(0.55, css(bandC[0], 0.5 * K * b0));
        g.addColorStop(1, css(bandC[0], 0));
        ac.fillStyle = g;
        ac.fillRect(0, top, W, H - top);
        const sx = calm ? 0.5 : 0.5 + 0.12 * Math.sin(still * 0.13);
        blob(W * sx, H * 1.02, W * 0.75, H * (0.3 + 0.25 * b0), soft(bandC[0], 1.2 * K * b0));
      }
      // Mitten: wenige große Farbwolken – schwache Anteile blenden weich aus, statt hart wegzufallen
      if (b1 > 0.01) {
        const sum = CATS.reduce((n, c) => n + hue[c] * AFF[c][1], 0);
        for (let i = 0; i < CATS.length; i++) {
          const c = CATS[i];
          const share = (hue[c] * AFF[c][1]) / sum;
          const vis = Math.min(1, Math.max(0, (share - 0.05) / 0.2));
          if (vis < 0.01) continue;
          const [x, y] = spot(i, 0, still, 0.8);
          const cy = 0.32 + 0.3 * y;
          const rad = L * (0.24 + 0.22 * share) * (0.75 + 0.35 * b1);
          const a = Math.min(1, (0.9 + 0.7 * share) * K * b1) * vis * vis * (3 - 2 * vis);
          blob(x * W, cy * H, rad, rad * 0.8, soft(rgb[c], a));
        }
      }
      ac.globalCompositeOperation = 'lighter';
      // Höhen: feines Funkeln oben, dazu ein zarter heller Saum
      if (b2 > 0.01) {
        const g = ac.createLinearGradient(0, 0, 0, H * 0.4);
        g.addColorStop(0, css(bandC[2], 0.4 * K * b2));
        g.addColorStop(1, css(bandC[2], 0));
        ac.fillStyle = g;
        ac.fillRect(0, 0, W, H * 0.4);
        const sc = toWhite(bandC[2], 0.45);
        const r = L * 0.014;
        for (const s of STARS) {
          const tw = calm ? 0.55 : (0.5 + 0.5 * Math.sin(still * s.w + s.ph)) ** 2;
          const a = 1.3 * K * b2 * tw;
          if (a < 0.01) continue;
          const x = s.x * W, y = s.y * H, rr = r * s.s * (0.8 + 0.6 * b2);
          const g2 = ac.createRadialGradient(x, y, 0, x, y, rr);
          g2.addColorStop(0, css(sc, a));
          g2.addColorStop(1, css(sc, 0));
          ac.fillStyle = g2;
          ac.fillRect(x - rr, y - rr, rr * 2, rr * 2);
        }
      }
      ac.globalCompositeOperation = 'source-over';
    }

    // ---------- Lichtwelle an der Abspielmarke ----------
    if (shader || roomOff) { /* in drawShader */ } else if (!calm) drawWave(W, H, L, dt, mix, K);
    else { room.waves = []; room.ghosts = []; room.colI = 0; }

    // ---------- Nachglühen nach lauten Stellen: heller Schimmer, löst sich über 2–3 s auf ----------
    const gl = room.glow;
    if (!shader && !roomOff && mix && (gl[0] + gl[1] + gl[2]) > 0.01) {
      ac.globalCompositeOperation = 'lighter';
      const shimmer = (b) => toWhite(mixRGB((c) => hue[c] * AFF[c][b]) || mix, 0.55);
      const M = ambientMax;
      if (gl[0] > 0.01) blob(W / 2, H, W * 0.8, H * 0.45, soft(shimmer(0), 0.55 * M * gl[0]));
      if (gl[1] > 0.01) blob(W / 2, H * 0.48, L * 0.5, L * 0.36, soft(shimmer(1), 0.5 * M * gl[1]));
      if (gl[2] > 0.01) blob(W / 2, 0, W * 0.75, H * 0.32, soft(shimmer(2), 0.55 * M * gl[2]));
      ac.globalCompositeOperation = 'source-over';
    }

    // ---------- Kontrast: Ränder zurück ins Anthrazit (nur wenn Licht da ist) ----------
    if (!shader && !roomOff && room.vig > 0.01) {
      ac.globalCompositeOperation = 'destination-out';
      blob(W / 2, H / 2, W * 0.62, H * 0.62, [[0, 'rgba(0,0,0,0)'], [0.6, 'rgba(0,0,0,0)'], [0.8, `rgba(0,0,0,${(0.35 * room.vig).toFixed(3)})`], [1, `rgba(0,0,0,${(0.85 * room.vig).toFixed(3)})`]]);
      ac.globalCompositeOperation = 'source-over';
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
  // Größe der Zeile: beim Wechsel gemessen, danach vom ResizeObserver
  const rowBox = { item: null, w: 0, h: 0 };
  const rowSize = new ResizeObserver(() => { if (rowBox.item) { rowBox.w = rowBox.item.clientWidth; rowBox.h = rowBox.item.clientHeight; } });
  function drawRow() {
    const id = ui.armedSampleId ?? engine.preview?.sampleId;
    const item = id && shelfEl?.querySelector(`.loop-item[data-sample-id="${CSS.escape(id)}"]`);
    const s = item && library.get(id);
    if (!s) {
      if (rowWave.isConnected) rowWave.remove();
      if (rowBox.item) { rowSize.unobserve(rowBox.item); rowBox.item = null; }
      preview = 0;
      rowKey = '';
      return;
    }
    if (rowWave.parentNode !== item) {
      item.prepend(rowWave);
      rowKey = '';
      if (rowBox.item) rowSize.unobserve(rowBox.item);
      rowBox.item = item;
      rowBox.w = item.clientWidth;
      rowBox.h = item.clientHeight;
      rowSize.observe(item);
    }
    const pv = engine.preview?.sampleId === id ? engine.preview : null;
    const bands = pv ? engine.outputBands(4) : null;
    const lv = bands ? Math.min(1, (bands.reduce((x, y) => x + y, 0) / bands.length) * 1.6) : 0;
    preview += (lv - preview) * (lv > preview ? 0.6 : 0.12);
    const prog = pv?.when != null && engine.ctx ? Math.max(0, Math.min(1, (engine.ctx.currentTime - pv.when) / pv.duration)) : -1;
    const { w, h } = rowBox;
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
  return { get state() { return { shown, amp, cost, preview, sparks: sparks.length, levels: { ...level }, roomCost, glQ, room: { n: room.n, K: room.K, vig: room.vig, band: [...room.band], glow: [...room.glow], waves: room.waves.length, col: room.colI, x: room.colX, w: room.W, h: room.H }, shader: !!shader, mode, software: !!shader?.software, frameMs: speedMs, slowFor: slowRoom, fixed: modeFixed }; },
    // Raumlicht-Fassung festlegen ('full' | 'lean' | 'off'; 'auto' = wieder selbst wählen) – für Tests und Bildschirmfotos
    setMode(m) { if (m === 'auto') { modeFixed = false; setMode(shader?.software ? 'lean' : 'full'); } else { modeFixed = true; setMode(m); } },
    // Für Tests und Bildschirmfotos: Auflösungsstufe des Shaders setzen (CSS-Pixel-Faktor)
    setQuality(q, { fixed = false } = {}) { glQ = q; glFixed = fixed; },
    get react() { return { spec: [...react.spec], col: lastReact ? [...lastReact.col] : [] }; },
    // Für Tests: das Raumlicht als RGBA im Raum-Maß (lange Seite 160), gleich ob Shader oder Canvas 2D
    readRoom() {
      const W = room.W || amb.width, H = room.H || amb.height;
      if (shader) return { data: shader.read(W, H), W, H };
      return { data: ac.getImageData(0, 0, W, H).data, W, H };
    },
  };
}
