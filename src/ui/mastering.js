// Mastering-Bedienung für die Summe: oben ein Schalter, darunter – nur wenn an – Stil, Vergleich und gemessene Lautheit.
// Dieselbe Bedienung sitzt im Inspektor „Song“ (Desktop) und im Export-Fach (Desktop-Klappfeld, Handy-Fach).

import { MASTER_STYLES } from '../mastering.js';
import { masteringOf } from '../engine.js';
import { el } from '../util.js';

const fmt = (v, d = 1) => (Number.isFinite(v) ? v.toFixed(d).replace('.', ',').replace('-', '−') : '–');

export function mountMasteringControls(root, { store, engine, analysis, prefix }) {
  const box = el('div', 'mst');
  box.id = `${prefix}`;
  // Kopf: Name links, Schalter rechts; darunter der Messwert
  const head = el('label', 'mst-head');
  const sw = el('button', 'fxl-switch mst-on');
  sw.type = 'button';
  sw.id = `${prefix}-on`;
  sw.setAttribute('role', 'switch');
  sw.setAttribute('aria-label', 'Mastering ein/aus');
  sw.title = 'Summe radiotauglich machen: Klangausgleich, Bus-Kompression, Breite in den Höhen, Limiter, Ziellautheit';
  sw.addEventListener('click', (e) => { e.preventDefault(); store.setMastering({ on: !masteringOf(store.project).on }); });
  const name = el('span', 'mst-name', 'Mastering');
  const meter = el('output', 'mst-meter');
  meter.id = `${prefix}-meter`;
  head.append(name, sw);
  // Einstellungen, nur bei eingeschaltetem Mastering
  const body = el('div', 'mst-body');
  const row = (label, node) => { const r = el('div', 'mst-row'); r.append(el('span', 'mst-label', label), node); return r; };
  const styles = el('div', 'mst-seg mst-styles');
  styles.setAttribute('role', 'group');
  styles.setAttribute('aria-label', 'Mastering-Stil');
  const chips = MASTER_STYLES.map((s) => {
    const b = el('button', 'seg mst-style', s.label);
    b.type = 'button';
    b.dataset.style = s.id;
    b.id = `${prefix}-style-${s.id}`;
    b.title = `${s.label} · Ziel ${fmt(s.target, 0)} LUFS`;
    b.addEventListener('click', () => store.setMastering({ style: s.id, on: true }));
    styles.append(b);
    return b;
  });
  // Vergleich: Aus · Vorher · Nachher (beide gleich laut) – drei feste Stellungen statt eines wechselnden Knopfs
  const cmp = el('div', 'mst-seg mst-cmp');
  cmp.setAttribute('role', 'group');
  cmp.setAttribute('aria-label', 'Vergleich');
  const cmpBtns = [[null, 'Aus', 'ab-end'], ['A', 'Vorher', 'ab-a'], ['B', 'Nachher', 'ab-b']].map(([v, label, id]) => {
    const b = el('button', 'seg', label);
    b.type = 'button';
    b.id = `${prefix}-${id}`;
    b.dataset.ab = v ?? '';
    b.title = v === 'A' ? 'Ohne Mastering hören – gleich laut wie mit' : v === 'B' ? 'Mit Mastering hören – gleich laut wie ohne' : 'Normal hören';
    b.addEventListener('click', () => analysis.setAB(v));
    cmp.append(b);
    return b;
  });
  body.append(meter, row('Stil', styles), row('Vergleich', cmp));
  box.append(head, body);
  root.append(box);

  function render() {
    const m = masteringOf(store.project);
    const st = MASTER_STYLES.find((s) => s.id === m.style) ?? MASTER_STYLES[0];
    sw.setAttribute('aria-pressed', String(!!m.on));
    sw.setAttribute('aria-checked', String(!!m.on));
    box.classList.toggle('on', !!m.on);
    body.hidden = !m.on;
    for (const c of chips) c.setAttribute('aria-pressed', String(!!m.on && c.dataset.style === m.style));
    const mon = engine.monitor?.ab ?? null;
    for (const b of cmpBtns) b.setAttribute('aria-pressed', String((b.dataset.ab || null) === (m.on ? mon : null)));
    const an = analysis.state.analysis;
    if (!m.on) meter.textContent = '';
    else if (analysis.state.busy || !an || an.style !== m.style) meter.textContent = `Ziel ${fmt(st.target, 0)} LUFS · misst …`;
    else meter.textContent = `${fmt(an.outLufs)} LUFS · Spitze ${fmt(an.peak)} dBTP`;
  }
  store.on(render);
  analysis.on(render);
  engine.on((what) => { if (what === 'monitor') render(); });
  render();
  return { render, box };
}
