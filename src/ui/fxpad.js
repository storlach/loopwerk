// Effekt-Pad: XY-Fläche, wirkt live auf Summe oder Spur, solange Finger oder Maus drücken. Wird nicht aufgezeichnet.
// Desktop: eigene Schublade „FX-Pad“ in der Fachleiste. Handy: Knopf im Mixer-Kopf (dieselbe Schublade).

import { PAD_MODES, ECHO_STEPS, STUTTER_STEPS, stepAt, padFilter, padBits, padHold } from '../fxpad.js';
import { clamp, el } from '../util.js';

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
  actions.append(modeBox, sel, lockBtn, tapeBtn);

  function setMode(id) {
    if (id === mode) return;
    mode = id;
    if (live) engine.padDown(target, mode, pos.x, pos.y);
    sync();
  }

  function stop() {
    live = false;
    held = false;
    engine.padUp({ tape });
    sync();
  }

  function targets() {
    const opts = [['master', 'Summe'], ...store.project.tracks.map((t) => [t.id, t.name])];
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
    xLabel.textContent = m.x;
    yLabel.textContent = m.y;
    area.dataset.mode = mode;
    area.classList.toggle('live', live);
    area.style.setProperty('--px', String(pos.x));
    area.style.setProperty('--py', String(pos.y));
    value.textContent = live ? describe(mode, pos.x, pos.y) : '';
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
    if (live && engine.pad?.active) engine.padMove(pos.x, pos.y);
    else engine.padDown(target, mode, pos.x, pos.y);
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
    get state() { return { mode, target, lock, tape, live, held, pos: { ...pos } }; },
    setMode, setTarget(id) { target = id; targets(); },
  };
}
