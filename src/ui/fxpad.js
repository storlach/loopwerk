// Effekt-Pad: XY-Fläche, wirkt live auf Summe oder Spur, solange Finger oder Maus drücken. „● Kurve aufnehmen“ schreibt
// Filter- und Echo-Bewegungen während der Wiedergabe als Kurve des Ziels (src/fxpad-record.js) – erst beim Loslassen, als
// ein Rückgängig-Schritt; danach öffnet sich die Kurvenzeile.
// Desktop: eigene Schublade „FX-Pad“ in der Fachleiste. Handy: Knopf im Mixer-Kopf (dieselbe Schublade).

import { PAD_MODES, ECHO_STEPS, STUTTER_STEPS, stepAt, padFilter, padBits, padHold } from '../fxpad.js';
import { PadRecorder, padRecordBlocked } from '../fxpad-record.js';
import { AUTO_PARAMS } from '../automation.js';
import { clamp, el } from '../util.js';
import { W } from './words.js';

const hz = (f) => (f >= 1000 ? `${(f / 1000).toFixed(f >= 10000 ? 0 : 1).replace('.', ',')} kHz` : `${Math.round(f)} Hz`);
const pct = (v) => `${Math.round(v * 100)} %`;

function describe(mode, x, y) {
  if (mode === 'filter') {
    const f = padFilter(x, y);
    const kind = f.lp < 19999 ? `Tiefpass ${hz(f.lp)}` : f.hp > 10 ? `Hochpass ${hz(f.hp)}` : 'Filter offen';
    return `${kind} · Resonanz ${pct(y)}`;
  }
  if (mode === 'echo') return `Echo ${stepAt(ECHO_STEPS, x).label} · Rückkopplung ${pct(y * 0.85)}`;
  if (mode === 'stutter') return `Wiederholung ${stepAt(STUTTER_STEPS, x).label} · ${y > 0.95 ? 'endlos' : `klingt ab (${pct(0.5 + 0.5 * y)})`}`;
  return `${Math.round(padBits(x))} Bit · Abtastrate ÷${Math.round(padHold(y))}`;
}

export function mountFxPad({ root, store, engine, ui }) {
  const btn = document.getElementById('fxpad-btn');
  const phoneBtn = document.getElementById('mixer-fxpad');
  const actions = root.querySelector('.dock-actions');
  const area = root.querySelector('#fxpad-area');
  const dot = el('span', 'fxpad-dot');
  const grid = el('div', 'fxpad-grid');
  const xLabel = el('span', 'fxpad-axis fxpad-axis-x');
  const yLabel = el('span', 'fxpad-axis fxpad-axis-y');
  const value = el('output', 'fxpad-value');
  value.id = 'fxpad-value';
  area.append(grid, xLabel, yLabel, value, dot);

  let mode = 'filter';
  let target = 'master';
  let lock = false;
  let tape = false;
  let held = false; // Finger/Maus drückt
  let live = false; // Effekt wirkt (gedrückt oder gehalten)
  let pos = { x: 0.5, y: 0.5 };
  let rec = false; // Schalter „Kurve aufnehmen“
  let take = null; // laufende Aufnahme (PadRecorder)
  let lastTake = null; // Ergebnis der letzten Aufnahme (Tests, Anzeige)

  const modeBox = el('div', 'fxpad-modes');
  modeBox.setAttribute('role', 'group');
  modeBox.setAttribute('aria-label', 'Effekt');
  const modeBtns = PAD_MODES.map((m) => {
    const b = el('button', 'chip fxpad-mode', m.label);
    b.type = 'button';
    b.dataset.mode = m.id;
    b.id = `fxpad-mode-${m.id}`;
    b.addEventListener('click', () => setMode(m.id));
    modeBox.append(b);
    return b;
  });
  const sel = document.createElement('select');
  sel.id = 'fxpad-target';
  sel.className = 'fxpad-target';
  sel.setAttribute('aria-label', 'Ziel des Effekts');
  sel.addEventListener('change', () => { if (live) stop(); target = sel.value; });
  const lockBtn = el('button', 'dbtn fxpad-lock', 'Halten');
  lockBtn.type = 'button';
  lockBtn.id = 'fxpad-lock';
  lockBtn.title = 'Effekt bleibt nach dem Loslassen an';
  lockBtn.addEventListener('click', () => { lock = !lock; if (!lock && live && !held) stop(); sync(); });
  const tapeBtn = el('button', 'dbtn fxpad-tape', 'Bandstopp');
  tapeBtn.type = 'button';
  tapeBtn.id = 'fxpad-tape';
  tapeBtn.title = 'Beim Loslassen bremst das Band bis zum Stillstand, dann geht es auf dem nächsten Schlag weiter';
  tapeBtn.addEventListener('click', () => { tape = !tape; sync(); });
  const recBtn = el('button', 'dbtn fxpad-rec', '● Kurve aufnehmen');
  recBtn.type = 'button';
  recBtn.id = 'fxpad-rec';
  recBtn.title = 'Filter- und Echo-Bewegungen während der Wiedergabe als Kurve des Ziels schreiben';
  recBtn.addEventListener('click', () => setRecord(!rec));
  actions.append(modeBox, sel, lockBtn, tapeBtn, recBtn);

  const ownerOf = (id) => (id === 'master' ? store.project.master || {} : store.track(id));
  const modeLabel = (id) => PAD_MODES.find((m) => m.id === id)?.label ?? id;

  function setRecord(on) {
    rec = !!on;
    if (!rec && take) take = null; // Schalter aus mitten in der Geste: nichts schreiben
    sync();
  }

  // Aufnahme beginnt mit dem Einsetzen des Effekts; die Position kommt aus der Kontextuhr (engine.currentBeat)
  function beginTake() {
    take = null;
    if (!rec) return;
    const why = padRecordBlocked(mode, ownerOf(target), modeLabel(mode));
    if (why) { ui.flash?.(why); return; }
    if (!engine.playing) { ui.flash?.('Kurve aufnehmen geht nur während der Wiedergabe.'); return; }
    take = new PadRecorder({ mode, target, beat: engine.currentBeat(), x: pos.x, y: pos.y, loop: store.project.loop });
    const t = take;
    // Je Bild abtasten: Halten ohne Bewegung und Loop-Sprünge entstehen auch ohne Pointer-Ereignis
    const tick = () => {
      if (take !== t || t.closed) return;
      if (!engine.playing) { t.stop(); return; }
      t.sample(engine.currentBeat(), pos.x, pos.y);
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  function finishTake() {
    const t = take;
    take = null;
    if (!t) return;
    const owner = ownerOf(t.target);
    const res = t.finish(engine.playing ? engine.currentBeat() : null, owner);
    lastTake = res;
    if (!res.points) { ui.flash?.(res.reason); return; }
    if (!store.recordAutoLane(t.target, res.key, res.points, res.fx)) return;
    ui.autoLane?.open(t.target, res.key);
    const label = AUTO_PARAMS[res.key].label;
    const note = res.other ? ` Die ${res.type === 'highpass' ? 'Tiefpass' : 'Hochpass'}-Seite wirkt nur live.` : tape ? ' Der Bandstopp wirkt nur live.' : '';
    ui.flash?.(`${t.target === 'master' ? W('Summe') + ': ' : ''}${label}-Kurve aufgenommen.${note}`);
  }

  function setMode(id) {
    if (id === mode) return;
    mode = id;
    if (live) {
      finishTake();
      engine.padDown(target, mode, pos.x, pos.y);
      beginTake();
    }
    sync();
  }

  function stop() {
    live = false;
    held = false;
    engine.padUp({ tape });
    finishTake();
    sync();
  }

  function targets() {
    const opts = [['master', W('Summe')], ...store.project.tracks.map((t) => [t.id, t.name])];
    const key = JSON.stringify(opts);
    if (sel.dataset.key !== key) {
      sel.dataset.key = key;
      sel.replaceChildren(...opts.map(([id, name]) => { const o = el('option', null, name); o.value = id; return o; }));
    }
    if (!opts.some(([id]) => id === target)) target = 'master';
    sel.value = target;
  }

  function drawGrid() {
    const steps = mode === 'echo' ? ECHO_STEPS : mode === 'stutter' ? STUTTER_STEPS : null;
    const key = mode;
    if (grid.dataset.key === key) return;
    grid.dataset.key = key;
    const lines = [];
    if (steps) {
      steps.forEach((s, i) => {
        const cell = el('span', 'fxpad-cell', s.label.replace(' punktiert', '.'));
        cell.style.left = `${(i / steps.length) * 100}%`;
        cell.style.width = `${100 / steps.length}%`;
        lines.push(cell);
      });
    } else if (mode === 'filter') {
      const mid = el('span', 'fxpad-mid');
      lines.push(mid, el('span', 'fxpad-side fxpad-side-l', 'Tiefpass'), el('span', 'fxpad-side fxpad-side-r', 'Hochpass'));
    }
    grid.replaceChildren(...lines);
  }

  function sync() {
    const m = PAD_MODES.find((x) => x.id === mode);
    for (const b of modeBtns) b.setAttribute('aria-pressed', String(b.dataset.mode === mode));
    lockBtn.setAttribute('aria-pressed', String(lock));
    tapeBtn.setAttribute('aria-pressed', String(tape));
    recBtn.setAttribute('aria-pressed', String(rec));
    recBtn.classList.toggle('writing', !!take);
    xLabel.textContent = m.x;
    yLabel.textContent = m.y;
    area.dataset.mode = mode;
    area.classList.toggle('live', live);
    area.style.setProperty('--px', String(pos.x));
    area.style.setProperty('--py', String(pos.y));
    value.textContent = live ? (take ? '● ' : '') + describe(mode, pos.x, pos.y) : '';
    drawGrid();
  }

  const at = (e) => {
    const r = area.getBoundingClientRect();
    return { x: clamp((e.clientX - r.left) / r.width, 0, 1), y: clamp(1 - (e.clientY - r.top) / r.height, 0, 1) };
  };

  area.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    area.setPointerCapture?.(e.pointerId);
    pos = at(e);
    held = true;
    if (live && engine.pad?.active) { engine.padMove(pos.x, pos.y); take?.sample(engine.currentBeat(), pos.x, pos.y); }
    else { engine.padDown(target, mode, pos.x, pos.y); beginTake(); }
    live = true;
    sync();
    const end = () => {
      held = false;
      if (!lock) stop(); else sync();
    };
    const move = (ev) => {
      if (ev.pointerId !== e.pointerId || !held) return;
      pos = at(ev);
      engine.padMove(pos.x, pos.y);
      take?.sample(engine.currentBeat(), pos.x, pos.y);
      sync();
    };
    const up = (ev) => {
      if (ev.pointerId !== e.pointerId) return;
      area.removeEventListener('pointermove', move);
      area.removeEventListener('pointerup', up);
      area.removeEventListener('pointercancel', up);
      end();
    };
    area.addEventListener('pointermove', move);
    area.addEventListener('pointerup', up);
    area.addEventListener('pointercancel', up);
  });
  area.addEventListener('contextmenu', (e) => e.preventDefault());

  const toggle = () => ui.setDock(ui.dock === 'fxpad' ? null : 'fxpad');
  btn.addEventListener('click', toggle);
  phoneBtn?.addEventListener('click', toggle);
  ui.on(() => {
    const show = ui.dock === 'fxpad';
    btn.setAttribute('aria-pressed', String(show));
    phoneBtn?.setAttribute('aria-pressed', String(show));
    if (root.hidden === !show) return;
    root.hidden = !show;
    // Fach zu: nichts darf weiterwirken, was man nicht mehr sieht
    if (!show && live) stop();
    if (show) { targets(); sync(); }
  });
  store.on(() => { if (!root.hidden) targets(); });
  targets();
  sync();
  return {
    get state() { return { mode, target, lock, tape, live, held, rec, pos: { ...pos }, take: take ? { key: take.key, count: take.count, passes: take.passes.length } : null, lastTake }; },
    setMode, setTarget(id) { target = id; targets(); }, setRecord,
  };
}
