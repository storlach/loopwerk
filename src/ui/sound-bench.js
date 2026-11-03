// Sound-Werkbank (Krachwerk 2a, Spec docs/specs/krachwerk-2-werkbank.md §6): ersetzt im Inspektor den Clip-Abschnitt.
// Kopf (Herkunft, Name, „in N Clips“, Als Variante) · Stammbaum · Welle mit Griffen · Reiter Form, Ton, Farbe, Zeit, Clip.
// Je Reiter höchstens 5 Griffe im Grund, der Rest steht unter „Feinheiten“. Eine Änderung gilt für alle Clips des Sounds;
// geschrieben wird nur über store.setRecipe / addVariant / setSampleTempo / setClip (Ziehen = ein Rückgängig-Schritt).

import { clipGain, keyOf, tonicOf } from '../model.js';
import { MATERIALS, RECIPE, materialOf, recipeGesture, recipeSteps, suggestMaterial } from '../recipe.js';
import { clamp, el } from '../util.js';
import { lsKey } from '../edition.js';
import { formatCurve, formatDb } from './arranger.js';
import { place } from './place.js';
import { mountClipSpeed } from './clip-speed.js';
import { mountWaveHandles, cookedSeconds } from './wave-handles.js';
import { fmtBpm, hasOwnTempo, soundBpm, setSoundBpm, useAsSongTempo } from './sound-tempo.js';
import { soundBounds, mixMono } from '../dsp/clean.js';
import { runJob } from '../dsp/run.js';
import { midiOf, snapToScale, voicing } from '../dsp/pitch.js';

const TAB_KEY = lsKey('loopwerk.wbTab');
const FINE_KEY = lsKey('loopwerk.wbFine');
const TABS = [['form', 'Form'], ['ton', 'Ton'], ['farbe', 'Farbe'], ['zeit', 'Zeit'], ['clip', 'Clip']];
const SOURCE = { mic: 'Aufnahme', file: 'Datei', loop: 'Schleife' };
const NOTE = ['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'B♭', 'H'];

const load = (key) => { try { return JSON.parse(localStorage.getItem(key)) || {}; } catch { return {}; } };
const save = (key, v) => { try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* egal */ } };
const comma = (v, d = 1) => String(Math.round(v * 10 ** d) / 10 ** d).replace('.', ',');
const signed = (v) => (v > 0 ? '+' : v < 0 ? '−' : '') + comma(Math.abs(v), 0);
const fmtHz = (v) => (v >= 1000 ? `${comma(v / 1000, 1)} kHz` : `${Math.round(v)} Hz`);
const fmtMs = (v) => (v >= 1000 ? `${comma(v / 1000, 2)} s` : `${Math.round(v)} ms`);
const fmtBeats = (b) => (b <= 0 ? 'aus' : `${comma(b, 2)} ${b === 1 ? 'Schlag' : 'Schläge'}`);
const fmtPct = (v) => `${Math.round(v * 100)} %`;
const pad2 = (n) => String(n).padStart(2, '0');
export const noteName = (midi) => `${NOTE[((Math.round(midi) % 12) + 12) % 12]}${Math.floor(Math.round(midi) / 12) - 1}`;

// Stammbaum-Zeile (§5): Material · Quelle Datum → Schritte · Dauer
export function treeText(s, r, lib) {
  if (!s) return '';
  if (s.missing) return 'Dieser Klang ist nicht mehr im Browser. Die Projektdatei bringt ihn zurück.';
  const root = s.parentId ? lib.get(s.parentId) : s;
  const mat = materialOf(r?.material ?? root?.material ?? s.material) ?? materialOf(suggestMaterial(root ?? s));
  const strom = /^pat-/.test(s.id) || s.patternId;
  const src = strom ? 'Strom' : SOURCE[root?.made?.from ?? 'mic'] ?? 'Aufnahme';
  let when = '';
  if (root?.created && root.created > 1e11) { const d = new Date(root.created); when = ` ${pad2(d.getDate())}.${pad2(d.getMonth() + 1)}. ${pad2(d.getHours())}:${pad2(d.getMinutes())}`; }
  const steps = recipeSteps(r);
  const dur = (lib.source?.(s) ?? s.orig)?.duration ?? s.duration;
  const parts = [`${mat.label} · ${src}${when}`];
  if (steps.length) parts[0] += ` → ${steps.join(' · ')}`;
  if (dur) parts[0] += ` · ${comma(dur, 2)} s`;
  return (s.parentId ? `Variante von ${root?.name ?? '?'} → ` : '') + parts[0];
}

export function mountSoundBench(box, { store, ui, library, engine, tools, own = null }) {
  const root = el('div', 'wb');
  box.setAttribute('aria-label', 'Sound-Werkbank');
  box.append(root);
  const gesture = recipeGesture();
  const fineOpen = load(FINE_KEY);
  const tabMem = load(TAB_KEY);
  const updaters = [];
  let cur = { id: null, clipId: null, kind: 'sound' };
  const recipe = () => store.project.recipes?.[cur.id] ?? {};
  const sound = () => library.get(cur.id);
  const clipNow = () => (cur.clipId ? store.findClip(cur.clipId)?.clip : null);
  const durOf = () => sound()?.orig?.duration ?? sound()?.duration ?? 0;
  const patch = (p, field) => store.setRecipe(cur.id, p, field ? { coalesce: gesture(cur.id, field) } : undefined);

  // ---------- Kopf ----------
  const head = el('header', 'wb-head');
  const dot = el('button', 'wb-dot');
  dot.type = 'button';
  dot.id = 'wb-dot';
  dot.setAttribute('aria-label', 'Herkunft ändern');
  dot.setAttribute('aria-expanded', 'false');
  dot.append(el('span', 'wb-dot-i'));
  const nameBtn = el('button', 'wb-name');
  nameBtn.type = 'button';
  nameBtn.id = 'wb-name';
  nameBtn.title = 'Antippen zum Umbenennen';
  const nameIn = document.createElement('input');
  Object.assign(nameIn, { type: 'text', maxLength: 40, id: 'wb-name-in', className: 'wb-name-in', hidden: true });
  nameIn.setAttribute('aria-label', 'Name des Sounds');
  const count = el('span', 'wb-count');
  count.id = 'wb-count';
  const varBtn = el('button', 'wb-var', 'Als Variante');
  varBtn.type = 'button';
  varBtn.id = 'wb-variant';
  varBtn.title = 'Eigene Fassung nur für diesen Clip';
  head.append(dot, nameBtn, nameIn, count, varBtn);
  const tree = el('p', 'wb-tree');
  tree.id = 'wb-tree';
  const matRow = el('div', 'wb-mat');
  matRow.hidden = true;
  matRow.setAttribute('role', 'group');
  matRow.setAttribute('aria-label', 'Herkunft');
  const matBtns = MATERIALS.map((m) => {
    const b = el('button', `wb-mat-btn cat-${m.cat}`);
    b.type = 'button';
    b.dataset.material = m.id;
    b.append(el('span', 'wb-dot-i'), el('span', null, m.label));
    b.addEventListener('click', () => {
      patch({ material: m.id });
      own?.rememberMaterial?.(library.get(cur.id)?.parentId ?? cur.id, m.id);
      matRow.hidden = true;
      dot.setAttribute('aria-expanded', 'false');
    });
    matRow.append(b);
    return [m.id, b];
  });
  dot.addEventListener('click', () => {
    matRow.hidden = !matRow.hidden;
    dot.setAttribute('aria-expanded', String(!matRow.hidden));
  });
  // Umbenennen im Kopf: Antippen, tippen, Enter oder weggehen speichert, Esc verwirft
  function rename(on) {
    nameBtn.hidden = on;
    nameIn.hidden = !on;
    if (on) { nameIn.value = sound()?.name ?? ''; nameIn.focus(); nameIn.select(); }
  }
  nameBtn.addEventListener('click', () => { if (cur.kind !== 'missing') rename(true); });
  let renaming = true;
  nameIn.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); nameIn.blur(); }
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); renaming = false; nameIn.blur(); }
  });
  nameIn.addEventListener('blur', () => {
    const v = nameIn.value.trim();
    const save_ = renaming;
    renaming = true;
    rename(false);
    if (save_ && cur.id && v && v !== sound()?.name) patch({ name: v });
  });
  varBtn.addEventListener('click', () => {
    if (!cur.id) return;
    const vr = store.addVariant(cur.id, { clipId: cur.clipId });
    library.syncVariants?.(store.project);
    library.emit?.();
    ui.flash(`„${library.get(vr)?.name ?? 'Variante'}“ – eigener Klang nur für diesen Clip.`);
  });

  // ---------- Welle ----------
  const wave = mountWaveHandles(root, { store, library, engine, ui });

  // ---------- Reiter und Flächen ----------
  const tabs = el('div', 'wb-tabs');
  tabs.setAttribute('role', 'tablist');
  tabs.setAttribute('aria-label', 'Werkbank');
  const panels = {};
  const tabBtns = {};
  function panel(id) {
    const p = el('div', 'wb-panel');
    p.id = `wb-panel-${id}`;
    p.setAttribute('role', 'tabpanel');
    p.setAttribute('aria-labelledby', `wb-tab-${id}`);
    p.hidden = true;
    const grund = el('div', 'wb-grund');
    const fineBtn = el('button', 'wb-fine-btn', 'Feinheiten');
    fineBtn.type = 'button';
    fineBtn.id = `wb-fine-btn-${id}`;
    const fine = el('div', 'wb-fine');
    const setFine = (on) => { fine.hidden = !on; fineBtn.setAttribute('aria-expanded', String(on)); };
    setFine(!!fineOpen[id]);
    fineBtn.addEventListener('click', () => { fineOpen[id] = fine.hidden; setFine(fine.hidden); save(FINE_KEY, fineOpen); });
    p.append(grund, fineBtn, fine);
    panels[id] = { p, grund, fine, fineBtn };
    return panels[id];
  }
  for (const [id, label] of TABS) {
    const b = el('button', 'wb-tab', label);
    b.type = 'button';
    b.id = `wb-tab-${id}`;
    b.setAttribute('role', 'tab');
    b.setAttribute('aria-controls', `wb-panel-${id}`);
    b.addEventListener('click', () => choose(id));
    b.addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
      const vis = TABS.map(([i]) => i).filter((i) => !tabBtns[i].hidden);
      const next = vis[(vis.indexOf(id) + (e.key === 'ArrowRight' ? 1 : -1) + vis.length) % vis.length];
      e.preventDefault();
      choose(next);
      tabBtns[next].focus();
    });
    tabs.append(b);
    tabBtns[id] = b;
    panel(id);
  }
  const patLink = el('button', 'wb-btn wb-pat', 'Muster bearbeiten');
  patLink.type = 'button';
  patLink.id = 'wb-pattern';
  patLink.addEventListener('click', () => tools.edit());
  root.append(head, tree, matRow, wave.el, tabs, ...TABS.map(([i]) => panels[i].p), patLink);

  let tab = 'form';
  function choose(id) {
    tab = id;
    tabMem[cur.kind === 'pattern' ? 'pattern' : 'sound'] = id;
    save(TAB_KEY, tabMem);
    show();
    render();
  }
  function show() {
    for (const [id] of TABS) {
      const on = id === tab && !tabBtns[id].hidden;
      tabBtns[id].setAttribute('aria-selected', String(on));
      tabBtns[id].tabIndex = on ? 0 : -1;
      panels[id].p.hidden = !on;
    }
  }

  // ---------- Bausteine ----------
  const row = (parent, label, extra = '') => {
    const r = el('label', `insp-row wb-row ${extra}`.trim());
    const out = el('output');
    r.append(el('span', null, label), out);
    parent.append(r);
    return { r, out };
  };
  const range = (r, id, min, max, step) => {
    const input = document.createElement('input');
    Object.assign(input, { type: 'range', min: String(min), max: String(max), step: String(step), id });
    r.append(input);
    return input;
  };
  const btn = (parent, label, id, fn, cls = '') => {
    const b = el('button', `wb-btn ${cls}`.trim(), label);
    b.type = 'button';
    if (id) b.id = id;
    b.addEventListener('click', fn);
    parent.append(b);
    return b;
  };
  const setVal = (input, v) => { if (document.activeElement !== input) input.value = String(v); };

  // Regler für ein Rezeptfeld. toUi/fromUi bilden den Wert auf die Reglerstellung ab (log, quadratisch …)
  function rslider(parent, field, label, { min, max, step, toUi = (v) => v, fromUi = (x) => x, fmt, def = null, show = null }) {
    const { r, out } = row(parent, label);
    const input = range(r, `wb-${field}`, min, max, step);
    input.setAttribute('aria-label', label);
    const isDef = (v) => def != null && Math.abs(v - def) < 1e-9;
    input.addEventListener('input', () => { const v = fromUi(Number(input.value)); patch({ [field]: isDef(v) ? null : v }, field); });
    input.addEventListener('change', () => gesture.end());
    input.addEventListener('dblclick', () => { patch({ [field]: null }); gesture.end(); });
    updaters.push((ctx) => {
      const v = ctx.r[field] ?? def ?? RECIPE[field].def;
      setVal(input, toUi(v));
      out.textContent = fmt(v);
      r.hidden = show ? !show(ctx) : false;
    });
    return { r, input };
  }
  const logTo = (lo, hi) => ({ toUi: (v) => Math.round((Math.log(v / lo) / Math.log(hi / lo)) * 1000), fromUi: (x) => Math.round(lo * (hi / lo) ** (x / 1000)) });
  const sqTo = (max) => ({ toUi: (v) => Math.round(Math.sqrt(v / max) * 1000), fromUi: (x) => Math.round(max * (x / 1000) ** 2) });
  const toggle = (parent, label, id, get, set) => {
    const b = btn(parent, label, id, () => set(!get()), 'wb-toggle');
    updaters.push((ctx) => b.setAttribute('aria-pressed', String(!!get(ctx))));
    return b;
  };

  // ---------- Form ----------
  {
    const { grund, fine } = panels.form;
    rslider(grund, 'gain', 'Lautstärke', { min: -24, max: 12, step: 0.5, def: 0, fmt: (v) => (v === 0 ? '0 dB' : `${v > 0 ? '+' : '−'}${comma(Math.abs(v), 1)} dB`) });
    rslider(grund, 'attack', 'Anschlag', { min: 0, max: 1000, step: 1, def: 0, ...sqTo(2000), fmt: fmtMs });
    rslider(grund, 'release', 'Ausklang', { min: 0, max: 1000, step: 1, def: 0, ...sqTo(5000), fmt: fmtMs });
    toggle(grund, 'Rückwärts', 'wb-reverse', () => !!recipe().reverse, (on) => patch({ reverse: on ? true : null }));
    const num = (label, field, id) => {
      const r = el('label', 'insp-row wb-row');
      const out = el('output');
      const input = document.createElement('input');
      Object.assign(input, { type: 'number', min: '0', step: '0.01', id, inputMode: 'decimal' });
      input.setAttribute('aria-label', label);
      r.append(el('span', null, label), out, input);
      fine.append(r);
      input.addEventListener('change', () => {
        const v = Number(String(input.value).replace(',', '.'));
        if (!Number.isFinite(v)) return;
        const dur = durOf();
        patch({ [field]: field === 'start' ? (v <= 0 ? null : v) : (v >= dur - 1e-3 ? null : v) });
      });
      updaters.push((ctx) => {
        const v = field === 'start' ? ctx.r.start ?? 0 : Math.min(ctx.dur, ctx.r.end ?? ctx.dur);
        setVal(input, v.toFixed(2));
        out.textContent = `${comma(v, 2)} s`;
      });
    };
    num('Anfang im Original', 'start', 'wb-start-num');
    num('Ende im Original', 'end', 'wb-end-num');
    const acts = el('div', 'wb-acts');
    fine.append(acts);
    btn(acts, 'Auf Spitze', 'wb-peak', () => { if (cur.id) patch({ gain: library.peakGainDb(cur.id) || null }); });
    btn(acts, 'Stille abschneiden', 'wb-trim', () => {
      const o = sound()?.orig;
      if (!o) return;
      const b = soundBounds(mixMono(Array.from({ length: o.numberOfChannels }, (_, c) => o.getChannelData(c))), o.sampleRate);
      if (b) patch({ start: b.start / o.sampleRate || null, end: b.end >= o.length - 8 ? null : b.end / o.sampleRate });
      else ui.flash('Hier ist keine Stille zum Abschneiden.');
    });
    btn(acts, 'Zurücksetzen', 'wb-form-reset', () => patch({ start: null, end: null, attack: null, release: null, gain: null, reverse: null }));
  }

  // ---------- Ton ----------
  const pitchOf = new WeakMap(); // Original → Promise<{ midi } | null>
  function detect() {
    const o = sound()?.orig;
    if (!o) return null;
    if (!pitchOf.has(o)) {
      const chs = Array.from({ length: o.numberOfChannels }, (_, c) => o.getChannelData(c));
      const p = runJob('pitch', { chs, sampleRate: o.sampleRate }).then((track) => {
        const v = voicing(track);
        const f = Array.from(track.f0).filter((_, i) => v[i]).sort((a, b) => a - b);
        return f.length >= 3 ? { midi: midiOf(f[f.length >> 1]), hz: f[f.length >> 1] } : null;
      }).catch(() => null);
      pitchOf.set(o, { p, done: undefined });
      p.then((res) => { pitchOf.get(o).done = res; render(); });
    }
    return pitchOf.get(o);
  }
  {
    const { grund, fine } = panels.ton;
    const sr = el('div', 'insp-row wb-row wb-step');
    const sOut = el('output');
    sOut.id = 'wb-semis';
    const minus = btn(sr, '−', 'wb-semis-minus', () => patch({ semis: clamp((recipe().semis ?? 0) - 1, -24, 24) }), 'wb-step-btn');
    const plus = btn(sr, '+', 'wb-semis-plus', () => patch({ semis: clamp((recipe().semis ?? 0) + 1, -24, 24) }), 'wb-step-btn');
    minus.setAttribute('aria-label', 'Einen Halbton tiefer');
    plus.setAttribute('aria-label', 'Einen Halbton höher');
    sr.insertBefore(el('span', null, 'Halbtöne'), minus);
    sr.insertBefore(sOut, plus);
    grund.append(sr);
    updaters.push((ctx) => { const v = ctx.r.semis ?? 0; sOut.textContent = v ? `${signed(v)} Halbtöne` : '0 Halbtöne'; minus.disabled = v <= -24; plus.disabled = v >= 24; });
    rslider(grund, 'cents', 'Feinstimmung', { min: -100, max: 100, step: 1, def: 0, fmt: (v) => `${signed(v)} Cent` });
    const auto = btn(grund, 'Auf Tonart', 'wb-tonart', () => {
      const pc = detect()?.done;
      if (!pc) return;
      const key = keyOf(store.project);
      const shift = snapToScale(pc.midi, tonicOf(key), 'minor') - pc.midi;
      const semis = Math.round(shift);
      patch({ semis: clamp(semis, -24, 24) || null, cents: Math.round((shift - semis) * 100) || null });
    });
    auto.title = 'Rundet den erkannten Grundton auf die Tonart des Songs';
    const found = el('p', 'wb-note');
    found.id = 'wb-grundton';
    const acts = el('div', 'wb-acts');
    fine.append(found, acts);
    btn(acts, 'Zurücksetzen', 'wb-ton-reset', () => patch({ semis: null, cents: null }));
    updaters.push((ctx) => {
      if (ctx.tab !== 'ton') return;
      const d = detect();
      const pc = d?.done;
      auto.hidden = !pc || Math.abs(snapToScale(pc.midi, tonicOf(keyOf(store.project)), 'minor') - pc.midi) < 0.005;
      found.textContent = !d ? '' : d.done === undefined ? 'Grundton wird erkannt …' : pc ? `Grundton ${noteName(pc.midi)} · ${comma(pc.hz, 1)} Hz` : 'Kein Grundton erkannt';
    });
    // „Im Editor“ (Autotune, Trennen): der Editor-Knopf zieht hierher
    const ed = document.getElementById('edit-btn');
    if (ed) place(ed, { calm: { narrow: fine, wide: fine } });
  }

  // ---------- Farbe ----------
  {
    const { grund, fine } = panels.farbe;
    rslider(grund, 'lp', 'Dunkler', { min: 0, max: 1000, step: 1, def: 20000, toUi: (v) => 1000 - Math.round((Math.log(v / 200) / Math.log(100)) * 1000), fromUi: (x) => Math.round(200 * 100 ** ((1000 - x) / 1000)), fmt: (v) => (v >= 20000 ? 'aus' : fmtHz(v)) });
    rslider(grund, 'hp', 'Dünner', { min: 0, max: 1000, step: 1, def: 20, ...logTo(20, 2000), fmt: (v) => (v <= 20 ? 'aus' : fmtHz(v)) });
    rslider(grund, 'res', 'Resonanz', { min: 0, max: 1, step: 0.01, def: 0, fmt: fmtPct });
    rslider(grund, 'warm', 'Wärme', { min: 0, max: 1, step: 0.01, def: 0, fmt: fmtPct });
    rslider(fine, 'grain', 'Körnung', { min: 0, max: 1, step: 0.01, def: 0, fmt: fmtPct });
    const acts = el('div', 'wb-acts');
    fine.append(acts);
    btn(acts, 'Zurücksetzen', 'wb-farbe-reset', () => patch({ lp: null, hp: null, res: null, warm: null, grain: null }));
  }

  // ---------- Zeit ----------
  {
    const { grund, fine } = panels.zeit;
    const baseKind = (s) => (s?.tempoBase ?? s)?.kind;
    const mode = el('div', 'wb-seg');
    mode.setAttribute('role', 'group');
    mode.setAttribute('aria-label', 'Einzelklang oder Loop');
    grund.append(mode);
    const one = btn(mode, 'Einzelklang', 'wb-mode-one', () => store.setSampleTempo(cur.id, null), 'wb-toggle');
    const loop = btn(mode, 'Loop', 'wb-mode-loop', () => {
      const d = durOf();
      store.setSampleTempo(cur.id, Math.max(1, Math.round((d * store.project.bpm) / 60)));
    }, 'wb-toggle');
    const lenRow = el('div', 'insp-row wb-row wb-step');
    const lenOut = el('output');
    lenOut.id = 'wb-len';
    const half = btn(lenRow, '÷2', 'wb-half', () => { const b = store.project.sampleTempo?.[cur.id] ?? sound()?.beats; if (b) store.setSampleTempo(cur.id, Math.max(0.25, b / 2)); }, 'wb-step-btn');
    const dbl = btn(lenRow, '×2', 'wb-double', () => { const b = store.project.sampleTempo?.[cur.id] ?? sound()?.beats; if (b) store.setSampleTempo(cur.id, Math.min(512, b * 2)); }, 'wb-step-btn');
    half.setAttribute('aria-label', 'Halb so lang');
    dbl.setAttribute('aria-label', 'Doppelt so lang');
    lenRow.insertBefore(el('span', null, 'Länge'), half);
    lenRow.insertBefore(lenOut, dbl);
    grund.append(lenRow);
    const stretch = rslider(grund, 'stretch', 'Dehnen', { min: 50, max: 200, step: 1, def: 1, toUi: (v) => Math.round(v * 100), fromUi: (x) => x / 100, fmt: fmtPct, show: (ctx) => ctx.s.kind !== 'loop' });
    const bpmRow = el('label', 'insp-row wb-row');
    const bpmIn = document.createElement('input');
    Object.assign(bpmIn, { type: 'number', min: '20', max: '400', step: '0.1', id: 'wb-bpm', inputMode: 'decimal', placeholder: '–' });
    bpmIn.setAttribute('aria-label', 'Tempo des Sounds (BPM)');
    const bpmOut = el('output');
    bpmRow.append(el('span', null, 'Tempo des Sounds'), bpmOut, bpmIn);
    bpmIn.addEventListener('change', () => setSoundBpm(store, sound(), Number(String(bpmIn.value).replace(',', '.'))));
    bpmIn.addEventListener('keydown', (e) => { if (e.key === 'Enter') bpmIn.blur(); });
    fine.append(bpmRow);
    const acts = el('div', 'wb-acts');
    fine.append(acts);
    btn(acts, 'Als Song-Tempo', 'wb-song-tempo', () => useAsSongTempo(store, sound()));
    const reset = btn(acts, 'Wie geliefert', 'wb-tempo-reset', () => store.setSampleTempo(cur.id, null));
    updaters.push((ctx) => {
      const s = ctx.s;
      const native = baseKind(s) === 'loop';
      const isLoop = s.kind === 'loop';
      mode.hidden = native;
      one.setAttribute('aria-pressed', String(!isLoop));
      loop.setAttribute('aria-pressed', String(isLoop));
      lenRow.hidden = !isLoop;
      const b = store.project.sampleTempo?.[cur.id] ?? s.beats;
      lenOut.textContent = b ? fmtBeats(b) : '';
      const sb = soundBpm(s);
      bpmRow.hidden = !isLoop;
      bpmOut.textContent = sb ? `${fmtBpm(sb)} BPM` : '';
      setVal(bpmIn, sb ? Math.round(sb * 10) / 10 : '');
      reset.hidden = store.project.sampleTempo?.[cur.id] == null;
      stretch.r.hidden = isLoop;
    });
  }

  // ---------- Clip ----------
  {
    const { grund, fine } = panels.clip;
    const cslider = (parent, label, id, min, max, step, get, set, fmt, keyName) => {
      const { r, out } = row(parent, label);
      const input = range(r, id, min, max, step);
      input.setAttribute('aria-label', label);
      input.addEventListener('input', () => { const c = clipNow(); if (c) set(c, Number(input.value), `${keyName}-${c.id}`); });
      updaters.push((ctx) => {
        const c = ctx.clip;
        if (!c) return;
        const mx = id === 'wb-clip-gain' || id.includes('curve') ? max : c.lengthBeats;
        input.max = String(mx);
        const v = get(c);
        setVal(input, v);
        out.textContent = fmt(v);
        r.hidden = id.includes('curve') ? !(id.includes('in') ? c.fadeInBeats : c.fadeOutBeats) : false;
      });
      return { r, input };
    };
    cslider(grund, 'Lautstärke', 'wb-clip-gain', 0, 1, 0.01, (c) => clipGain(c), (c, v, k) => store.setClip(c.id, { gain: v }, k), formatDb, 'insp-gain');
    cslider(grund, 'Einblenden', 'wb-clip-in', 0, 4, 0.25, (c) => c.fadeInBeats || 0, (c, v, k) => store.setClip(c.id, { fadeInBeats: clamp(v, 0, c.lengthBeats - (c.fadeOutBeats || 0)) }, k), fmtBeats, 'insp-in');
    cslider(grund, 'Ausblenden', 'wb-clip-out', 0, 4, 0.25, (c) => c.fadeOutBeats || 0, (c, v, k) => store.setClip(c.id, { fadeOutBeats: clamp(v, 0, c.lengthBeats - (c.fadeInBeats || 0)) }, k), fmtBeats, 'insp-out');
    const speedBox = el('div', 'insp-clip-speed');
    grund.append(speedBox);
    const chips = el('div', 'wb-chips');
    mountClipSpeed(speedBox, { store, ui, library, chipsIn: chips });
    fine.append(chips);
    cslider(fine, 'Kurve Einblenden', 'wb-curve-in', -1, 1, 0.05, (c) => c.fadeInCurve || 0, (c, v, k) => store.setClip(c.id, { fadeInCurve: v }, k), formatCurve, 'insp-fadeInCurve');
    cslider(fine, 'Kurve Ausblenden', 'wb-curve-out', -1, 1, 0.05, (c) => c.fadeOutCurve || 0, (c, v, k) => store.setClip(c.id, { fadeOutCurve: v }, k), formatCurve, 'insp-fadeOutCurve');
  }

  // ---------- Anzeige ----------
  function render() {
    const found = ui.selectedClipId ? store.findClip(ui.selectedClipId) : null;
    if (!found) return;
    const { clip } = found;
    const s = library.get(clip.sampleId);
    const isPat = !!s && (/^pat-/.test(s.id) || !!s.patternId);
    const kind = !s || s.missing ? 'missing' : isPat ? 'pattern' : 'sound';
    if (cur.id !== clip.sampleId || cur.kind !== kind) { matRow.hidden = true; dot.setAttribute('aria-expanded', 'false'); if (!nameIn.hidden) rename(false); }
    cur = { id: clip.sampleId, clipId: clip.id, kind };
    const r = store.project.recipes?.[cur.id] ?? {};
    const cat = s?.colorCat ?? s?.category ?? 'fx';
    root.className = `wb cat-${cat} wb-${kind}`;
    box.dataset.kind = kind;
    // Kopf
    if (nameIn.hidden) nameBtn.textContent = s?.name ?? 'Clip';
    const n = store.clipsOf(cur.id);
    count.textContent = kind === 'missing' ? '' : `in ${n} ${n === 1 ? 'Clip' : 'Clips'}`;
    varBtn.hidden = kind !== 'sound';
    dot.hidden = kind === 'missing';
    tree.textContent = treeText(s, r, library);
    tree.title = tree.textContent;
    const mat = (materialOf(r.material ?? library.get(s?.parentId)?.material ?? s?.material) ?? materialOf(suggestMaterial(s))).id;
    for (const [id, b] of matBtns) b.setAttribute('aria-pressed', String(id === mat));
    // Reiter je Objektart
    const avail = kind === 'sound' ? ['form', 'ton', 'farbe', ...(hasOwnTempo(s) ? ['zeit'] : []), 'clip'] : kind === 'pattern' ? ['clip'] : [];
    for (const [id] of TABS) tabBtns[id].hidden = !avail.includes(id);
    tabs.hidden = !avail.length;
    const want = tabMem[kind === 'pattern' ? 'pattern' : 'sound'] ?? (kind === 'pattern' ? 'clip' : 'form');
    tab = avail.includes(want) ? want : avail[0] ?? 'form';
    show();
    patLink.hidden = kind !== 'pattern';
    wave.el.hidden = kind !== 'sound';
    if (kind === 'sound') {
      wave.render(cur.id);
      const dur = durOf();
      const ctx = { s, r, clip, dur, tab, cooked: cookedSeconds(r, dur) };
      for (const fn of updaters) fn(ctx);
    } else if (kind === 'pattern') {
      const ctx = { s, r, clip, dur: 0, tab };
      for (const fn of updaters) { try { fn(ctx); } catch { /* Reiter fehlt */ } }
    }
  }
  library.on?.(() => { if (!root.closest('[hidden]')) render(); });
  return { render, root, choose };
}
