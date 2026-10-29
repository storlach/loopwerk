// Transport-Deck: Start/Stopp, Loop, Metronom, Anzeige, Pegel, Rückgängig, Zoom, Raster.

import { clamp } from '../util.js';
import { createDemoProject, createEmptyProject } from '../model.js';

export function mountTransport({ store, engine, ui, arranger }) {
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

  play.addEventListener('click', () => (engine.playing ? engine.stop() : engine.play()));
  $('home-btn').addEventListener('click', () => engine.setPosition(0));
  loopBtn.addEventListener('click', () => store.setLoop({ on: !store.project.loop.on }));
  metro.addEventListener('click', () => { engine.metronome = !engine.metronome; sync(); });
  undo.addEventListener('click', () => store.undo());
  redo.addEventListener('click', () => store.redo());

  const zoom = (f) => { ui.pxPerBeat = clamp(Math.round(ui.pxPerBeat * f), 10, 64); arranger.render(); };
  $('zoom-in').addEventListener('click', () => zoom(1.25));
  $('zoom-out').addEventListener('click', () => zoom(0.8));
  $('snap-sel').addEventListener('change', (e) => { ui.snapBeats = Number(e.target.value); });

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
  confirmButton($('new-btn'), 'Leeren', () => reset(createEmptyProject()));
  confirmButton($('demo-btn'), 'Beispiel', () => reset(createDemoProject()));

  function sync() {
    play.setAttribute('aria-pressed', String(engine.playing));
    play.setAttribute('aria-label', engine.playing ? 'Stopp' : 'Abspielen');
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

  // Anzeige, Pegel und Abspielmarke laufen im Bildtakt.
  const mc = meter.getContext('2d');
  let hold = 0;
  let holdAge = 0;
  function frame() {
    const beat = engine.currentBeat();
    const bpb = store.project.beatsPerBar;
    lcdBar.textContent = String(Math.floor(beat / bpb) + 1).padStart(3, '0');
    lcdBeat.textContent = String(Math.floor(beat % bpb) + 1);
    const sec = beat * (60 / store.project.bpm);
    lcdTime.textContent = `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, '0')}.${Math.floor((sec % 1) * 10)}`;
    arranger.setPlayhead(beat);

    const level = engine.peakLevel();
    const db = level > 0 ? 20 * Math.log10(level) : -60;
    const frac = clamp((db + 42) / 42, 0, 1);
    if (frac >= hold) { hold = frac; holdAge = 0; } else if (++holdAge > 40) hold = Math.max(frac, hold - 0.02);
    drawMeter(frac, hold);
    requestAnimationFrame(frame);
  }

  function drawMeter(frac, peak) {
    const dpr = window.devicePixelRatio || 1;
    const w = meter.clientWidth;
    const h = meter.clientHeight;
    if (meter.width !== Math.round(w * dpr)) { meter.width = Math.round(w * dpr); meter.height = Math.round(h * dpr); }
    mc.setTransform(dpr, 0, 0, dpr, 0, 0);
    mc.clearRect(0, 0, w, h);
    const css = getComputedStyle(meter);
    const segs = 24;
    const gap = 2;
    const sw = (w - gap * (segs - 1)) / segs;
    for (let i = 0; i < segs; i++) {
      const pos = (i + 0.5) / segs;
      const lit = pos <= frac || Math.abs(pos - peak) < 0.5 / segs;
      const zone = pos > 0.92 ? '--meter-hot' : pos > 0.75 ? '--meter-warm' : '--meter-ok';
      mc.fillStyle = css.getPropertyValue(lit ? zone : '--meter-off').trim();
      mc.fillRect(i * (sw + gap), 0, sw, h);
    }
  }
  requestAnimationFrame(frame);
}
