// Licht aus der Musik: unscharfer Hintergrund hinter der ganzen Seite (Pegel × Farben der klingenden Clips),
// Leuchten und Funken nur direkt an der Abspielmarke. Läuft nur, solange etwas spielt oder ausklingt.

import { anySoloOf, isAbove, trackState, EPS } from '../model.js';
import { headW } from './arranger.js';

const CATS = ['drums', 'bass', 'chords', 'synth', 'fx', 'own'];
const BEHIND = 150; // px hinter der Marke: Platz für Funken
const AHEAD = 40;
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
  const ac = amb.getContext('2d');
  const bc = beam.getContext('2d');
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
    amb.style.opacity = '0';
    beam.hidden = true;
    sparks = [];
  }

  let cost = 0;
  function frame(now) {
    requestAnimationFrame(frame);
    const t0 = performance.now();
    try { draw(now); } finally { cost += (performance.now() - t0 - cost) * 0.1; }
  }

  function draw(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    const live = engine.playing;
    if (!live && !shown) return;
    if (++colorAge > 60) readColors();

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
        hits.push({ trackId: t.id, cat, lv });
      }
    }
    // schnell hoch, langsam zurück – wie eine Amplitude
    for (const c of CATS) level[c] += (target[c] - level[c]) * (target[c] > level[c] ? 0.5 : 0.06);
    const peak = live ? engine.peakLevel() : 0;
    const db = peak > 0 ? 20 * Math.log10(peak) : -60;
    const a = Math.min(1, Math.max(0, (db + 36) / 36));
    amp += (a - amp) * (a > amp ? 0.45 : 0.08);
    for (const h of hits) {
      const g = trackGlow.get(h.trackId) ?? 0;
      trackGlow.set(h.trackId, g + (h.lv - g) * (h.lv > g ? 0.6 : 0.15));
    }
    const hitIds = new Set(hits.map((h) => h.trackId));
    for (const [id, g] of trackGlow) if (!hitIds.has(id)) { if (g < 0.003) trackGlow.delete(id); else trackGlow.set(id, g * 0.85); }

    const total = CATS.reduce((n, c) => n + level[c], 0);
    if (!live && amp < 0.01 && !sparks.length && !trackGlow.size) { hide(); return; }
    if (!shown) { shown = true; beam.hidden = false; }

    // ---------- Hintergrund: höchstens 30 Bilder pro Sekunde ----------
    if (frameNo++ % 2 === 0) drawAmbient(now / 1000, total);
    // Grundlicht, sobald etwas klingt; darüber pumpt es mit der Lautstärke
    amb.style.opacity = String(total > 0.002 ? ambientMax * (0.35 + 0.65 * amp) : 0);

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
      if (!g) continue;
      const lane = grid.querySelector(`.lane[data-track-id="${t.id}"]`);
      if (!lane?.offsetParent) continue;
      const hit = hits.find((hh) => hh.trackId === t.id);
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
      // heller Kern
      bc.fillStyle = `rgba(255,255,255,${0.55 * I})`;
      bc.fillRect(BEHIND - 1, y0 + 4, 2, lh - 8);
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

  // Farbflächen nach Anteil: nur Drums → alles gelb, kommen Bässe dazu → auch blau
  function drawAmbient(t, total) {
    const W = amb.width;
    const H = amb.height;
    ac.clearRect(0, 0, W, H);
    if (total <= 0.002) return;
    let mr = 0, mg = 0, mb = 0;
    for (const c of CATS) {
      const s = level[c] / total;
      mr += rgb[c][0] * s; mg += rgb[c][1] * s; mb += rgb[c][2] * s;
    }
    ac.fillStyle = `rgba(${mr | 0},${mg | 0},${mb | 0},0.32)`;
    ac.fillRect(0, 0, W, H);
    CATS.forEach((c, i) => {
      const share = level[c] / total;
      if (share < 0.03) return;
      const [r, g, b] = rgb[c];
      for (let k = 0; k < 2; k++) {
        const ph = i * 1.7 + k * 2.9;
        const cx = W * (0.5 + 0.42 * Math.sin(t * 0.21 + ph));
        const cy = H * (0.5 + 0.4 * Math.cos(t * 0.17 + ph * 1.3));
        const rad = W * (0.22 + 0.6 * share);
        const grd = ac.createRadialGradient(cx, cy, 0, cx, cy, rad);
        grd.addColorStop(0, `rgba(${r},${g},${b},${Math.min(1, 1.1 * Math.sqrt(share))})`);
        grd.addColorStop(1, `rgba(${r},${g},${b},0)`);
        ac.fillStyle = grd;
        ac.fillRect(0, 0, W, H);
      }
    });
  }

  readColors();
  amb.style.opacity = '0';
  beam.hidden = true;
  requestAnimationFrame(frame);
  return { get state() { return { shown, amp, cost, sparks: sparks.length, levels: { ...level } }; } };
}
