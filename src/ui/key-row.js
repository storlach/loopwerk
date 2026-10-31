// Tonart-Zeile unter dem Lineal: zeigt die Tonart je Abschnitt („Am“ ab Takt 1, „Dm“ ab Takt 5).
// Klick bzw. Antippen auf einen Takt öffnet die Auswahl der Tonarten und „Wie davor“ (Wechsel entfernen).

import { KEYS, KEY_MAJOR, keyOf, keyAtBar, keyChangesOf, barOfBeat } from '../model.js';
import { clamp, el } from '../util.js';

const MINOR_NAME = ['C', 'Cis', 'D', 'Es', 'E', 'F', 'Fis', 'G', 'Gis', 'A', 'B', 'H'];

// Abschnitte gleicher Tonart über den ganzen Song: [{ bar, end, key, changed }] (Takte ab 1, end exklusiv)
export function keySections(project) {
  const out = [{ bar: 1, end: project.lengthBars + 1, key: keyOf(project), changed: false }];
  for (const c of keyChangesOf(project)) {
    if (c.bar > project.lengthBars) break;
    const last = out[out.length - 1];
    if (c.key === last.key) continue;
    last.end = c.bar;
    out.push({ bar: c.bar, end: project.lengthBars + 1, key: c.key, changed: true });
  }
  return out;
}

export function mountKeyRow({ store, engine, ui }) {
  const row = el('div', 'key-row');
  const corner = el('div', 'corner');
  corner.append(el('span', null, 'Tonart'));
  const strip = el('div', 'key-strip');
  strip.tabIndex = 0;
  strip.setAttribute('role', 'button');
  strip.setAttribute('aria-haspopup', 'dialog');
  strip.setAttribute('aria-label', 'Tonart je Takt: Takt wählen, um die Tonart ab dort zu ändern');
  const hover = el('div', 'key-hover');
  hover.hidden = true;
  strip.append(hover);
  row.append(corner, strip);

  const pop = el('div', 'key-pop');
  pop.hidden = true;
  pop.setAttribute('role', 'dialog');
  document.body.append(pop);

  let renderedKey = '';
  let popBar = null;
  const ppb = () => ui.pxPerBeat;
  const barPx = () => ppb() * store.project.beatsPerBar;
  const barAtX = (clientX) => clamp(Math.floor((clientX - strip.getBoundingClientRect().left) / barPx()) + 1, 1, store.project.lengthBars);

  function render() {
    const p = store.project;
    const key = `${ppb()}|${p.lengthBars}|${p.beatsPerBar}|${keyOf(p)}|${JSON.stringify(keyChangesOf(p))}`;
    if (key === renderedKey) return;
    renderedKey = key;
    for (const n of [...strip.querySelectorAll('.key-sec')]) n.remove();
    for (const s of keySections(p)) {
      const sec = el('div', 'key-sec' + (s.changed ? ' changed' : ''));
      sec.dataset.bar = String(s.bar);
      sec.style.left = (s.bar - 1) * barPx() + 'px';
      sec.style.width = (s.end - s.bar) * barPx() + 'px';
      const name = el('span', 'key-name', s.key);
      name.title = `${s.changed ? `Ab Takt ${s.bar}` : 'Grundtonart'}: ${MINOR_NAME[KEYS.indexOf(s.key)]}-Moll`;
      sec.append(name);
      strip.append(sec);
    }
  }

  function close(focusBack = false) {
    if (pop.hidden) return;
    pop.hidden = true;
    popBar = null;
    strip.setAttribute('aria-expanded', 'false');
    if (focusBack) strip.focus();
  }

  function choose(bar, key) {
    close();
    if (key == null) store.clearKeyAt(bar);
    else store.setKeyAt(bar, key);
    const now = keyAtBar(store.project, bar);
    ui.flash?.(bar === 1 ? `Grundtonart ${now}.` : `Ab Takt ${bar}: ${now}.`);
  }

  // Auswahl für Takt `bar` an der Stelle (x, y) öffnen
  function open(bar, x, y) {
    const p = store.project;
    popBar = bar;
    const current = keyAtBar(p, bar);
    const own = keyChangesOf(p).find((c) => c.bar === bar);
    const before = bar > 1 ? keyAtBar(p, bar - 1) : null;
    const head = el('div', 'key-pop-head', bar === 1 ? 'Grundtonart · Takt 1' : `Tonart ab Takt ${bar}`);
    const grid = el('div', 'key-pop-grid');
    KEYS.forEach((k, i) => {
      const b = el('button', 'key-pop-key', k);
      b.type = 'button';
      b.dataset.key = k;
      b.title = `${MINOR_NAME[i]}-Moll (parallel ${KEY_MAJOR[i]}-Dur)`;
      b.setAttribute('aria-pressed', String(k === current && (bar === 1 || !!own)));
      b.addEventListener('click', () => choose(bar, k));
      grid.append(b);
    });
    pop.replaceChildren(head, grid);
    if (bar > 1) {
      const same = el('button', 'key-pop-same', `Wie davor (${before})`);
      same.type = 'button';
      same.title = 'Kein Wechsel an diesem Takt';
      same.setAttribute('aria-pressed', String(!own));
      same.addEventListener('click', () => choose(bar, null));
      pop.append(same);
    }
    pop.setAttribute('aria-label', head.textContent);
    pop.hidden = false;
    strip.setAttribute('aria-expanded', 'true');
    const w = pop.offsetWidth;
    const h = pop.offsetHeight;
    pop.style.left = clamp(x - w / 2, 8, innerWidth - w - 8) + 'px';
    pop.style.top = (y + 6 + h > innerHeight - 8 ? Math.max(8, y - h - 6) : y + 6) + 'px';
    (pop.querySelector('[aria-pressed="true"]') || pop.querySelector('button'))?.focus({ preventScroll: true });
  }

  // Klick auf den Namen eines Abschnitts bearbeitet dessen Wechsel, sonst den Takt unter dem Zeiger
  strip.addEventListener('click', (e) => {
    const sec = e.target.closest('.key-name') && e.target.closest('.key-sec');
    const bar = sec ? Number(sec.dataset.bar) : barAtX(e.clientX);
    if (!pop.hidden && popBar === bar) { close(); return; }
    const r = strip.getBoundingClientRect();
    open(bar, e.clientX, r.bottom);
  });
  strip.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    e.preventDefault();
    const bar = clamp(barOfBeat(store.project, engine.heardBeat()), 1, store.project.lengthBars);
    const r = strip.getBoundingClientRect();
    open(bar, clamp(r.left + (bar - 0.5) * barPx(), r.left, r.right), r.bottom);
  });
  // Maus: der Takt unter dem Zeiger wird angedeutet
  strip.addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'mouse') return;
    const bar = barAtX(e.clientX);
    hover.hidden = false;
    hover.style.left = (bar - 1) * barPx() + 'px';
    hover.style.width = barPx() + 'px';
  });
  strip.addEventListener('pointerleave', () => { hover.hidden = true; });

  document.addEventListener('pointerdown', (e) => {
    if (!pop.hidden && !pop.contains(e.target) && !strip.contains(e.target)) close();
  }, true);
  pop.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(true); return; }
    const items = [...pop.querySelectorAll('button')];
    const k = items.indexOf(document.activeElement);
    const step = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: 4, ArrowUp: -4 }[e.key];
    if (step && k >= 0) { e.preventDefault(); items[clamp(k + step, 0, items.length - 1)]?.focus(); }
  });
  store.on((_, reason) => { if (reason === 'replace' || reason === 'undo' || reason === 'redo') close(); });

  return { row, strip, pop, render, open, close };
}
