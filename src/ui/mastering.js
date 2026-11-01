// Mastering-Bedienung für die Summe: Schalter, Stil, A/B-Vergleich, gemessene Lautheit.
// Dieselbe Bedienung sitzt im Inspektor „Song“ (Desktop) und im Export-Fach (Desktop-Klappfeld, Handy-Fach).

import { MASTER_STYLES } from '../mastering.js';
import { masteringOf } from '../engine.js';
import { el } from '../util.js';

const fmt = (v, d = 1) => (Number.isFinite(v) ? v.toFixed(d).replace('.', ',').replace('-', '−') : '–');

export function mountMasteringControls(root, { store, engine, analysis, prefix }) {
  const box = el('div', 'mst');
  box.id = `${prefix}`;
  const head = el('div', 'mst-head');
  const sw = el('button', 'dbtn mst-on', 'Mastering');
  sw.type = 'button';
  sw.id = `${prefix}-on`;
  sw.title = 'Summe radiotauglich machen: Klangausgleich, Bus-Kompression, Breite in den Höhen, Limiter, Ziellautheit';
  sw.addEventListener('click', () => store.setMastering({ on: !masteringOf(store.project).on }));
  const ab = el('button', 'dbtn mst-ab', 'A/B');
  ab.type = 'button';
  ab.id = `${prefix}-ab`;
  ab.title = 'Vorher und nachher vergleichen – beide gleich laut';
  ab.addEventListener('click', () => analysis.toggleAB());
  const abEnd = el('button', 'dbtn mst-ab-end', '×');
  abEnd.type = 'button';
  abEnd.id = `${prefix}-ab-end`;
  abEnd.setAttribute('aria-label', 'Vergleich beenden');
  abEnd.title = 'Vergleich beenden';
  abEnd.addEventListener('click', () => analysis.endAB());
  head.append(sw, ab, abEnd);
  const styles = el('div', 'mst-styles');
  styles.setAttribute('role', 'group');
  styles.setAttribute('aria-label', 'Mastering-Stil');
  const chips = MASTER_STYLES.map((s) => {
    const b = el('button', 'chip mst-style', s.label);
    b.type = 'button';
    b.dataset.style = s.id;
    b.id = `${prefix}-style-${s.id}`;
    b.title = `${s.label} · Ziel ${fmt(s.target, 0)} LUFS`;
    b.addEventListener('click', () => store.setMastering({ style: s.id, on: true }));
    styles.append(b);
    return b;
  });
  const meter = el('output', 'mst-meter');
  meter.id = `${prefix}-meter`;
  box.append(head, styles, meter);
  root.append(box);

  function render() {
    const m = masteringOf(store.project);
    const st = MASTER_STYLES.find((s) => s.id === m.style) ?? MASTER_STYLES[0];
    sw.setAttribute('aria-pressed', String(!!m.on));
    box.classList.toggle('on', !!m.on);
    for (const c of chips) c.setAttribute('aria-pressed', String(!!m.on && c.dataset.style === m.style));
    const mon = engine.monitor?.ab ?? null;
    ab.disabled = !m.on;
    ab.setAttribute('aria-pressed', String(!!m.on && !!mon));
    ab.textContent = !m.on || !mon ? 'A/B' : mon === 'A' ? 'A · Vorher' : 'B · Nachher';
    abEnd.hidden = !m.on || !mon;
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
