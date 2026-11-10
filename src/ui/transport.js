// Transport-Deck: Start/Stopp, Loop, Metronom, Anzeige, Pegel, Rückgängig, Zoom, Raster.

import { clamp } from '../util.js';
import { createDemoProject, createEmptyProject } from '../model.js';
import { lsKey } from '../edition.js';

export function mountTransport({ store, engine, ui, arranger, emptyProject = createEmptyProject }) {
  const $ = (id) => document.getElementById(id);
  const play = $('play-btn');
  const loopBtn = $('loop-btn');
  const metro = $('metro-btn');
  const undo = $('undo-btn');
  const redo = $('redo-btn');
  const lcdBar = $('lcd-bar');
  const lcdBeat = $('lcd-beat');
  const lcdTime = $('lcd-time');
  const meter = $('meter');
  const bpmInput = $('bpm-input');

  bpmInput.addEventListener('change', () => {
    const v = Number(bpmInput.value);
    if (Number.isFinite(v) && v > 0) store.setBpm(v);
    bpmInput.value = String(store.project.bpm);
  });
  bpmInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') bpmInput.blur(); });

  const playFail = (err) => { console.error('Wiedergabe:', err); ui.flash(`Kein Ton: ${err?.message || err}`); };
  play.addEventListener('click', () => { try { Promise.resolve(engine.playing ? engine.pause() : engine.play()).catch(playFail); } catch (err) { playFail(err); } });
  engine.on((what, err) => { if (what === 'error') ui.flash(`Wiedergabe-Fehler: ${err?.message || err}`); });
  $('home-btn').addEventListener('click', () => engine.setPosition(0));
  const touchy = matchMedia('(max-width: 760px), (hover: none) and (pointer: coarse)');
  loopBtn.addEventListener('click', () => {
    const on = !store.project.loop.on;
    store.setLoop({ on });
    if (on && touchy.matches) {
      const { startBeat, endBeat } = store.project.loop;
      const bpb = store.project.beatsPerBar;
      ui.flash(`Loop Takt ${startBeat / bpb + 1}–${endBeat / bpb} · auf der Taktleiste ziehen, um ihn zu ändern`);
    }
  });
  metro.addEventListener('click', () => { engine.metronome = !engine.metronome; sync(); });
  undo.addEventListener('click', () => store.undo());
  redo.addEventListener('click', () => store.redo());

  $('zoom-in').addEventListener('click', () => arranger.zoom(1.5));
  $('zoom-out').addEventListener('click', () => arranger.zoom(1 / 1.5));
  $('zoomy-in').addEventListener('click', () => arranger.zoomY(1.25));
  $('zoomy-out').addEventListener('click', () => arranger.zoomY(0.8));
  // Raster merkt sich der Browser (nur eine Bequemlichkeit, kein Projektinhalt)
  const snapSel = $('snap-sel');
  try {
    const saved = localStorage.getItem(lsKey('loopwerk.snap'));
    if (saved != null && [...snapSel.options].some((o) => o.value === saved)) snapSel.value = saved;
  } catch { /* ohne Speicher gilt die Voreinstellung */ }
  ui.snapBeats = Number(snapSel.value);
  snapSel.addEventListener('change', () => {
    ui.snapBeats = Number(snapSel.value);
    try { localStorage.setItem(lsKey('loopwerk.snap'), snapSel.value); } catch { /* egal */ }
  });

  // Zweistufige Bestätigung im Button selbst (Dialoge gibt es hier nicht).
  function confirmButton(btn, label, action) {
    let armed = null;
    btn.addEventListener('click', () => {
      if (armed) {
        clearTimeout(armed);
        armed = null;
        btn.textContent = label;
        btn.classList.remove('confirm');
        action();
        return;
      }
      btn.textContent = 'Sicher?';
      btn.classList.add('confirm');
      armed = setTimeout(() => { armed = null; btn.textContent = label; btn.classList.remove('confirm'); }, 3000);
    });
  }
  const reset = (project) => { engine.stop(); engine.setPosition(0); ui.select(null); store.replace(project); };
  confirmButton($('new-btn'), 'Leeren', () => reset(emptyProject()));
  confirmButton($('demo-btn'), 'Beispiel', () => reset(createDemoProject()));

  function sync() {
    play.setAttribute('aria-pressed', String(engine.playing));
    document.getElementById('app')?.classList.toggle('playing', engine.playing);
    play.setAttribute('aria-label', engine.playing ? 'Pause' : 'Abspielen');
    play.querySelector('.ico-play').toggleAttribute('hidden', engine.playing);
    play.querySelector('.ico-stop').toggleAttribute('hidden', !engine.playing);
    loopBtn.setAttribute('aria-pressed', String(store.project.loop.on));
    metro.setAttribute('aria-pressed', String(engine.metronome));
    if (document.activeElement !== bpmInput) bpmInput.value = String(store.project.bpm);
    undo.disabled = !store.canUndo;
    redo.disabled = !store.canRedo;
  }
  engine.on(sync);
  store.on(sync);
  sync();

  // Anzeige, Pegel und Abspielmarke laufen im Bildtakt – geschrieben wird nur, was sich geändert hat
  // (im Stillstand also nichts: kein Layout, keine Stilrechnung je Bild).
  const mc = meter.getContext('2d');
  let hold = 0;
  let holdAge = 0;
  const shown = { bar: null, beat: null, time: null, lit: -1 };
  const setText = (node, key, v) => { if (shown[key] !== v) { node.textContent = v; shown[key] = v; } };
  // Maße und Farben des Pegels: einmal lesen, bei Größenänderung neu
  let mw = 0;
  let mh = 0;
  let colors = null;
  new ResizeObserver(() => { mw = meter.clientWidth; mh = meter.clientHeight; colors = null; shown.lit = -1; }).observe(meter);
  function frame() {
    const beat = engine.heardBeat();
    const bpb = store.project.beatsPerBar;
    setText(lcdBar, 'bar', String(Math.floor(beat / bpb) + 1).padStart(3, '0'));
    setText(lcdBeat, 'beat', String(Math.floor(beat % bpb) + 1));
    const sec = beat * (60 / store.project.bpm);
    setText(lcdTime, 'time', `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, '0')}.${Math.floor((sec % 1) * 10)}`);
    arranger.setPlayhead(beat);

    const level = engine.peakLevel();
    const db = level > 0 ? 20 * Math.log10(level) : -60;
    const frac = clamp((db + 42) / 42, 0, 1);
    if (frac >= hold) { hold = frac; holdAge = 0; } else if (++holdAge > 40) hold = Math.max(frac, hold - 0.02);
    drawMeter(frac, hold);
    requestAnimationFrame(frame);
  }

  const SEGS = 24;
  function drawMeter(frac, peak) {
    // Welche Segmente leuchten: nur bei einer Änderung neu zeichnen
    let lit = 0;
    for (let i = 0; i < SEGS; i++) {
      const pos = (i + 0.5) / SEGS;
      if (pos <= frac || Math.abs(pos - peak) < 0.5 / SEGS) lit |= 1 << i;
    }
    if (lit === shown.lit || !mw) return;
    shown.lit = lit;
    const dpr = window.devicePixelRatio || 1;
    const w = mw;
    const h = mh;
    if (meter.width !== Math.round(w * dpr)) { meter.width = Math.round(w * dpr); meter.height = Math.round(h * dpr); }
    if (!colors) {
      const css = getComputedStyle(meter);
      colors = Object.fromEntries(['--meter-hot', '--meter-warm', '--meter-ok', '--meter-off'].map((k) => [k, css.getPropertyValue(k).trim()]));
    }
    mc.setTransform(dpr, 0, 0, dpr, 0, 0);
    mc.clearRect(0, 0, w, h);
    const gap = 2;
    const sw = (w - gap * (SEGS - 1)) / SEGS;
    for (let i = 0; i < SEGS; i++) {
      const pos = (i + 0.5) / SEGS;
      const zone = pos > 0.92 ? '--meter-hot' : pos > 0.75 ? '--meter-warm' : '--meter-ok';
      mc.fillStyle = colors[lit & (1 << i) ? zone : '--meter-off'];
      mc.fillRect(i * (sw + gap), 0, sw, h);
    }
  }
  requestAnimationFrame(frame);
}
