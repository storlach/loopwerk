// Akkord-Streifen unter der Tonart-Zeile: zeigt den Akkord je Abschnitt („Am“, „F“ …). Takt antippen → Auswahl der
// leitereigenen Akkorde (ganzer Takt oder eine Hälfte), Pause und beliebte Folgen ab hier. Begleit-Patterns folgen.

import { chordsOf, chordAtBeat, keyAtBeat, tonicOf, barOfBeat, totalBeats, chordGrid } from '../model.js';
import { DEGREES, PROGRESSIONS, REST, chordName } from '../harmony.js';
import { clamp, el } from '../util.js';

// Abschnitte gleichen Akkords (und gleicher Tonart) über den ganzen Song: [{ from, to, chord, key, set }] in Schlägen
export function chordSections(project) {
  const end = totalBeats(project);
  const list = chordsOf(project);
  const cuts = new Set([0, end]);
  for (const c of list) if (c.beat < end) cuts.add(c.beat);
  for (let b = 1; b <= project.lengthBars; b++) cuts.add((b - 1) * project.beatsPerBar);
  const sorted = [...cuts].sort((a, b) => a - b);
  const out = [];
  for (let i = 0; i < sorted.length - 1; i++) {
    const from = sorted[i];
    const to = sorted[i + 1];
    const chord = chordAtBeat(project, from, list);
    const key = keyAtBeat(project, from);
    const set = list.some((c) => c.beat <= from + 1e-6);
    const last = out[out.length - 1];
    if (last && last.chord === chord && last.key === key && last.set === set && !list.some((c) => Math.abs(c.beat - from) < 1e-6)) last.to = to;
    else out.push({ from, to, chord, key, set });
  }
  return out;
}

export function mountChordRow({ store, engine, ui, library }) {
  const row = el('div', 'chord-row');
  const corner = el('div', 'corner');
  corner.append(el('span', null, 'Akkorde'));
  const strip = el('div', 'chord-strip');
  strip.tabIndex = 0;
  strip.setAttribute('role', 'button');
  strip.setAttribute('aria-haspopup', 'dialog');
  strip.setAttribute('aria-label', 'Akkord-Streifen: Takt wählen, um den Akkord festzulegen');
  const hover = el('div', 'key-hover');
  hover.hidden = true;
  strip.append(hover);
  row.append(corner, strip);

  const pop = el('div', 'key-pop chord-pop');
  pop.hidden = true;
  pop.setAttribute('role', 'dialog');
  document.body.append(pop);

  let rendered = '';
  let popBar = null;
  let part = 'bar'; // 'bar' | 'a' (1. Hälfte) | 'b' (2. Hälfte)
  const ppb = () => ui.pxPerBeat;
  const bpb = () => store.project.beatsPerBar;
  const barAtX = (clientX) => clamp(Math.floor((clientX - strip.getBoundingClientRect().left) / (ppb() * bpb())) + 1, 1, store.project.lengthBars);

  function render() {
    const p = store.project;
    const key = `${ppb()}|${p.lengthBars}|${p.beatsPerBar}|${p.key}|${JSON.stringify(p.keyChanges ?? [])}|${JSON.stringify(chordsOf(p))}`;
    if (key === rendered) return;
    rendered = key;
    for (const n of [...strip.querySelectorAll('.chord-sec')]) n.remove();
    for (const s of chordSections(p)) {
      const sec = el('div', 'chord-sec' + (s.set ? ' set' : '') + (s.chord === REST ? ' rest' : ''));
      sec.dataset.beat = String(s.from);
      sec.style.left = s.from * ppb() + 'px';
      sec.style.width = (s.to - s.from) * ppb() + 'px';
      const name = el('span', 'chord-name', chordName(s.chord, tonicOf(s.key)));
      name.title = s.chord === REST ? 'Pause: Begleitung schweigt' : `Stufe ${s.chord} in ${s.key}`;
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

  const range = (bar) => {
    const a = (bar - 1) * bpb();
    const g = chordGrid(store.project);
    return part === 'a' ? [a, g] : part === 'b' ? [a + g, g] : [a, bpb()];
  };

  // Rückmeldung; Loops mit eigener Akkordfolge folgen bewusst nicht (docs/specs/v2.9-song-starter-akkorde.md)
  function feedback(text) {
    const p = store.project;
    const follows = p.tracks.some((t) => t.clips.some((c) => library?.followsChords?.(c.sampleId)));
    const loops = p.tracks.some((t) => t.clips.some((c) => library?.followsKey?.(c.sampleId) && !library.followsChords?.(c.sampleId)));
    ui.flash?.(text + (!follows ? ' Damit etwas folgt: „Begleitung“ hinzufügen.' : loops ? ' Loops spielen ihre eigenen Akkorde.' : ''));
  }

  function choose(bar, chord) {
    const [a, span] = range(bar);
    close();
    store.setChordAt(a, chord, span);
    const now = chordAtBeat(store.project, a);
    feedback(`Takt ${bar}${part === 'bar' ? '' : part === 'a' ? ' (1. Hälfte)' : ' (2. Hälfte)'}: ${now === REST ? 'Pause' : chordName(now, tonicOf(keyAtBeat(store.project, a)))}.`);
  }

  function useProgression(bar, prog) {
    close();
    store.fillChords((bar - 1) * bpb(), prog.chords);
    const tonic = tonicOf(keyAtBeat(store.project, (bar - 1) * bpb()));
    feedback(`Ab Takt ${bar}: ${prog.chords.map((d) => chordName(d, tonic)).join('–')}.`);
  }

  function open(bar, x, y) {
    const p = store.project;
    popBar = bar;
    const a = (bar - 1) * bpb();
    const g = chordGrid(p);
    const split = chordAtBeat(p, a) !== chordAtBeat(p, a + g);
    if (!split) part = 'bar';
    else if (part === 'bar') part = 'a';
    const tonic = tonicOf(keyAtBeat(p, a));
    const head = el('div', 'key-pop-head', `Akkord · Takt ${bar} · ${keyAtBeat(p, a)}`);
    const parts = el('div', 'chord-pop-parts');
    parts.setAttribute('role', 'group');
    parts.setAttribute('aria-label', 'Bereich');
    const grid = el('div', 'key-pop-grid chord-pop-grid');
    const fill = () => {
      const [b0] = range(bar);
      const current = chordAtBeat(store.project, b0);
      for (const btn of parts.children) btn.setAttribute('aria-pressed', String(btn.dataset.part === part));
      for (const btn of grid.children) btn.setAttribute('aria-pressed', String(btn.dataset.chord === current));
    };
    for (const [id, label] of [['bar', 'Ganz'], ['a', '1. Hälfte'], ['b', '2. Hälfte']]) {
      const b = el('button', 'key-pop-same chord-pop-part', label);
      b.type = 'button';
      b.dataset.part = id;
      b.title = id === 'bar' ? 'Ganzer Takt' : `${label} des Takts`;
      b.addEventListener('click', () => { part = id; fill(); });
      parts.append(b);
    }
    for (const d of [...DEGREES.map((x) => x.id), REST]) {
      const b = el('button', 'key-pop-key chord-pop-key');
      b.type = 'button';
      b.dataset.chord = d;
      b.append(el('span', 'chord-pop-name', d === REST ? 'Pause' : chordName(d, tonic)), el('span', 'chord-pop-deg', d === REST ? 'still' : d));
      b.title = d === REST ? 'Begleitung schweigt' : `Stufe ${d}`;
      b.addEventListener('click', () => choose(bar, d));
      grid.append(b);
    }
    const sugHead = el('div', 'key-pop-head chord-pop-sub', 'Folge ab hier');
    const sug = el('div', 'chord-pop-prog');
    for (const prog of PROGRESSIONS) {
      const b = el('button', 'key-pop-same chord-pop-progbtn');
      b.type = 'button';
      b.dataset.prog = prog.id;
      b.append(el('span', 'chord-pop-name', prog.chords.map((d) => chordName(d, tonic)).join('–')), el('span', 'chord-pop-deg', prog.label));
      b.title = `${prog.chords.join('–')}: ab Takt ${bar} bis zum Ende, ein Akkord je Takt`;
      b.addEventListener('click', () => useProgression(bar, prog));
      sug.append(b);
    }
    pop.replaceChildren(head, parts, grid, sugHead, sug);
    fill();
    pop.setAttribute('aria-label', head.textContent);
    pop.hidden = false;
    strip.setAttribute('aria-expanded', 'true');
    const w = pop.offsetWidth;
    const h = pop.offsetHeight;
    pop.style.left = clamp(x - w / 2, 8, innerWidth - w - 8) + 'px';
    pop.style.top = (y + 6 + h > innerHeight - 8 ? Math.max(8, y - h - 6) : y + 6) + 'px';
    (grid.querySelector('[aria-pressed="true"]') || grid.querySelector('button'))?.focus({ preventScroll: true });
  }

  strip.addEventListener('click', (e) => {
    const bar = barAtX(e.clientX);
    if (!pop.hidden && popBar === bar) { close(); return; }
    // Antippen in der zweiten Hälfte eines geteilten Takts öffnet diese Hälfte
    const r = strip.getBoundingClientRect();
    const inBar = (e.clientX - r.left) / (ppb() * bpb()) - (bar - 1);
    part = inBar >= 0.5 ? 'b' : 'a';
    open(bar, e.clientX, r.bottom);
  });
  strip.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    e.preventDefault();
    const bar = clamp(barOfBeat(store.project, engine.heardBeat()), 1, store.project.lengthBars);
    const r = strip.getBoundingClientRect();
    part = 'bar';
    open(bar, clamp(r.left + (bar - 0.5) * ppb() * bpb(), r.left, r.right), r.bottom);
  });
  strip.addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'mouse') return;
    const bar = barAtX(e.clientX);
    hover.hidden = false;
    hover.style.left = (bar - 1) * ppb() * bpb() + 'px';
    hover.style.width = ppb() * bpb() + 'px';
  });
  strip.addEventListener('pointerleave', () => { hover.hidden = true; });
  document.addEventListener('pointerdown', (e) => {
    if (!pop.hidden && !pop.contains(e.target) && !strip.contains(e.target)) close();
  }, true);
  pop.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(true); return; }
    const items = [...pop.querySelectorAll('button')];
    const k = items.indexOf(document.activeElement);
    const step = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: 3, ArrowUp: -3 }[e.key];
    if (step && k >= 0) { e.preventDefault(); items[clamp(k + step, 0, items.length - 1)]?.focus(); }
  });
  store.on((_, reason) => { if (reason === 'replace' || reason === 'undo' || reason === 'redo') close(); });

  return { row, strip, pop, render, open, close };
}
