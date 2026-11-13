// Mastering-Bedienung für die Summe: oben ein Schalter, darunter – nur wenn an – Stil und gemessene Lautheit.
// Dieselbe Bedienung sitzt im Inspektor „Song“ (Desktop) und im Export-Fach (Desktop-Klappfeld, Handy-Fach).

import { MASTER_STYLES } from '../mastering.js';
import { masteringOf } from '../engine.js';
import { el } from '../util.js';
import { W } from './words.js';

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
  sw.setAttribute('aria-label', W('Mastering ein/aus'));
  sw.title = W('Summe radiotauglich machen: Klangausgleich, Bus-Kompression, Breite in den Höhen, Limiter, Ziellautheit');
  sw.addEventListener('click', (e) => { e.preventDefault(); store.setMastering({ on: !masteringOf(store.project).on }); });
  const name = el('span', 'mst-name', W('Mastering'));
  const meter = el('output', 'mst-meter');
  meter.id = `${prefix}-meter`;
  head.append(name, sw);
  // Einstellungen, nur bei eingeschaltetem Mastering
  const body = el('div', 'mst-body');
  const row = (label, node) => { const r = el('div', 'mst-row'); r.append(el('span', 'mst-label', label), node); return r; };
  const styles = el('div', 'mst-seg mst-styles');
  styles.setAttribute('role', 'group');
  styles.setAttribute('aria-label', W('Mastering-Stil'));
  const chips = MASTER_STYLES.map((s) => {
    const b = el('button', 'seg mst-style', s.label);
    b.type = 'button';
    b.dataset.style = s.id;
    b.id = `${prefix}-style-${s.id}`;
    b.title = W(`${s.label} · Ziel ${fmt(s.target, 0)} LUFS`);
    b.addEventListener('click', () => store.setMastering({ style: s.id, on: true }));
    styles.append(b);
    return b;
  });
  // Kein eigener Vergleich mehr (Martin): Aus- und Einschalten genügt
  body.append(meter, row('Stil', styles));
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
    const an = analysis.state.analysis;
    if (!m.on) meter.textContent = '';
    else if (analysis.state.busy || !an || an.style !== m.style) meter.textContent = W(`Ziel ${fmt(st.target, 0)} LUFS · misst …`);
    else meter.textContent = W(`${fmt(an.outLufs)} LUFS · Spitze ${fmt(an.peak)} dBTP`);
  }
  store.on(render);
  analysis.on(render);
  engine.on((what) => { if (what === 'monitor') render(); });
  render();
  return { render, box };
}
