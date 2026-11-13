// Schritt-für-Schritt-Abläufe als Karte in der Mitte (Layout „reiter“, nur Desktop): „Neuer Song“, „Neuer Sound“, „Exportieren“.
// Dieselbe Fläche wie der Clip-Editor (overlay.js: abgedunkelter Grund, Karte, ✕, Esc, Klick daneben schließt, Fokus kehrt zurück,
// fliegt von unten ein; Dauern und Kurven aus den Tokens, CSS-Klassen .ov/.ov-card). Eine Karte mit Kopf (Schrittanzeige, Titel,
// Überschrift des Schritts), Inhalt, „Zurück“ und einem Hauptknopf. Die Bedienelemente bleiben die vorhandenen (gleiche Kennungen):
// ein Ablauf bekommt einen Knoten (z. B. #export) und zeigt je Schritt nur seine Teile (data-flow-step am Teil, data-step an der Karte).
// Definiert werden die Abläufe in flows.js. Am Handy (≤ 760 px) gibt es die Karte nicht; die Knoten liegen dort an ihrem alten Platz.

import { narrow } from './place.js';
import { fadeIn, settle, token } from './motion.js';
import { installFlowStyle } from './flow-style.js';

const el = (tag, cls, id, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (id) n.id = id; if (text != null) n.textContent = text; return n; };
const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
const visible = (n) => n.offsetParent !== null || n === document.activeElement;

// def: { title, node, steps: [{ heading, main(ctx) → { label, disabled?, hidden? }, mainNode?, run(ctx) → 'next' | 'stay' | 'close', enter?(ctx), focus? }],
//        onOpen?(ctx), onClose?() }
export function mountFlow({ ui }) {
  const app = document.getElementById('app');
  if (!app) return null;
  installFlowStyle();

  const root = el('div', 'ov flow', 'flow-overlay');
  root.hidden = true;
  root.dataset.state = 'zu';
  const back = el('div', 'ov-back');
  const card = el('section', 'ov-card flow-card', 'flow-card');
  card.setAttribute('role', 'dialog');
  card.setAttribute('aria-modal', 'true');
  card.setAttribute('aria-labelledby', 'flow-title');
  card.tabIndex = -1;
  const head = el('header', 'flow-head');
  const stepEl = el('span', 'flow-step', 'flow-step');
  const titleEl = el('h2', 'flow-title', 'flow-title');
  const headingEl = el('p', 'flow-heading', 'flow-heading');
  head.append(stepEl, titleEl, headingEl);
  const body = el('div', 'flow-body', 'flow-body');
  const foot = el('footer', 'flow-foot');
  const backBtn = el('button', 'dbtn flow-back', 'flow-back', 'Zurück');
  backBtn.type = 'button';
  const slot = el('div', 'flow-main-slot');
  const mainBtn = el('button', 'dbtn primary flow-main', 'flow-main', 'Weiter');
  mainBtn.type = 'button';
  slot.append(mainBtn);
  foot.append(backBtn, slot);
  const closeBtn = el('button', 'dbtn ed-ico ov-close flow-close', 'flow-close');
  closeBtn.type = 'button';
  closeBtn.setAttribute('aria-label', 'Schließen');
  closeBtn.title = 'Schließen (Esc)';
  closeBtn.innerHTML = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3.4 2L2 3.4 6.6 8 2 12.6 3.4 14 8 9.4l4.6 4.6 1.4-1.4L9.4 8 14 3.4 12.6 2 8 6.6z"/></svg>';
  card.append(head, body, foot, closeBtn);
  const park = el('div', 'flow-park', 'flow-park'); // Ruheplatz der umgehängten Knoten (am Desktop, solange kein Ablauf offen ist)
  park.hidden = true;
  root.append(back, card, park);
  app.append(root);

  const defs = new Map();
  let cur = null; // { id, def, i }
  let isOpen = false;
  let returnTo = null;
  let stopHide = null;
  let working = false;
  const ctx = {
    go: (i) => go(i),
    next: () => go(cur.i + 1),
    close: (o) => close(o),
    refresh: () => refresh(),
    get step() { return cur?.i ?? 0; },
  };

  function refresh() {
    if (!cur) return;
    const { def, i } = cur;
    const step = def.steps[i];
    const n = def.steps.length;
    card.dataset.flow = cur.id;
    card.dataset.step = String(i + 1);
    titleEl.textContent = def.title;
    headingEl.textContent = step.heading ?? '';
    headingEl.hidden = !step.heading;
    stepEl.textContent = n > 1 ? `${i + 1} von ${n}` : '';
    stepEl.hidden = n < 2;
    backBtn.hidden = n < 2 || i === 0;
    backBtn.disabled = !!working || !!step.lockBack?.(ctx);
    const m = step.main?.(ctx) ?? { hidden: true };
    if (step.mainNode) {
      const node = step.mainNode();
      if (node.parentElement !== slot) slot.append(node);
      mainBtn.hidden = true;
    } else {
      mainBtn.hidden = !!m.hidden;
      mainBtn.textContent = m.label ?? 'Weiter';
      mainBtn.disabled = !!m.disabled || working;
      if (m.title) mainBtn.title = m.title; else mainBtn.removeAttribute('title');
      if (mainBtn.parentElement !== slot) slot.prepend(mainBtn);
    }
    foot.hidden = backBtn.hidden && mainBtn.hidden && !step.mainNode;
  }

  // Knoten, die an die Fußzeile ziehen (mainNode), gehen beim Verlassen des Schritts zurück: leave() des Schritts
  function leaveStep() {
    const step = cur?.def.steps[cur.i];
    step?.leave?.(ctx);
    if (step?.mainNode && !mainBtn.parentElement) slot.append(mainBtn);
  }

  function go(i, { instant = false } = {}) {
    if (!cur || i < 0) return;
    if (i >= cur.def.steps.length) { close(); return; }
    leaveStep();
    cur.i = i;
    cur.def.steps[i].enter?.(ctx);
    refresh();
    if (!instant) fadeIn([body, head]);
    focusStep();
  }
  function focusStep() {
    requestAnimationFrame(() => {
      if (!isOpen || !cur) return;
      const step = cur.def.steps[cur.i];
      const want = step.focus ? card.querySelector(step.focus) : null;
      const t = want && visible(want) ? want : !mainBtn.hidden && !mainBtn.disabled ? mainBtn : card;
      t.focus({ preventScroll: true });
    });
  }

  function open(id) {
    const def = defs.get(id);
    if (!def || narrow.matches) return false;
    if (isOpen && cur?.id === id) return true;
    if (isOpen) close({ focus: false, now: true });
    const a = document.activeElement;
    returnTo = a && a !== document.body && !root.contains(a) ? a : null;
    cur = { id, def, i: 0 };
    isOpen = true;
    if (def.node) { body.append(def.node); def.node.hidden = false; }
    def.onOpen?.(ctx);
    def.steps[0].enter?.(ctx);
    refresh();
    stopHide?.();
    stopHide = null;
    root.inert = false;
    if (root.hidden) {
      root.hidden = false;
      void getComputedStyle(card).transform; // Ausgangslage (unten, unsichtbar) festhalten, damit der Übergang startet
    }
    root.dataset.state = 'auf';
    focusStep();
    return true;
  }

  function close({ focus = true, now = false } = {}) {
    if (!isOpen) return false;
    isOpen = false;
    leaveStep();
    const was = cur;
    cur = null;
    was.def.onClose?.(ctx);
    root.dataset.state = 'zu';
    root.inert = true;
    stopHide?.();
    const done = () => {
      stopHide = null;
      if (isOpen) return;
      root.hidden = true;
      if (was.def.node) { was.def.node.hidden = true; if (!narrow.matches) park.append(was.def.node); }
    };
    if (now) done(); else stopHide = settle(card, 'opacity', token('--move-editor-out', 260) + 400, done);
    const t = returnTo && returnTo.isConnected && visible(returnTo) ? returnTo : null;
    returnTo = null;
    if (focus && t && typeof t.focus === 'function') t.focus({ preventScroll: true });
    return true;
  }

  mainBtn.addEventListener('click', async () => {
    if (!cur || working) return;
    const step = cur.def.steps[cur.i];
    working = true;
    refresh();
    let r = 'next';
    try { r = (await step.run?.(ctx)) ?? 'next'; } finally { working = false; }
    if (!cur) return;
    if (r === 'close') close();
    else if (r === 'next') go(cur.i + 1);
    else refresh();
  });
  backBtn.addEventListener('click', () => { if (cur && cur.i > 0) go(cur.i - 1); });
  closeBtn.addEventListener('click', () => close());
  back.addEventListener('click', (e) => { if (e.target === back) close(); });

  // Tastatur: Tab bleibt in der Karte; Esc im Textfeld beendet erst die Eingabe, Esc sonst schließt den Ablauf
  root.addEventListener('keydown', (e) => {
    if (e.key === 'Tab') {
      const list = [...card.querySelectorAll(FOCUSABLE)].filter(visible);
      if (!list.length) return;
      const first = list[0];
      const last = list[list.length - 1];
      const a = document.activeElement;
      if (e.shiftKey && (a === first || a === card)) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && a === last) { e.preventDefault(); first.focus(); }
    } else if (e.key === 'Escape') {
      if (/^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName) && e.target.type !== 'range' && e.target.type !== 'radio' && e.target.type !== 'checkbox') { e.target.blur(); e.stopPropagation(); return; }
      e.preventDefault();
      e.stopPropagation();
      close();
    }
  });

  // Breite wird schmal: Ablauf zu (die Knoten gehen über place() an ihren Platz am Handy)
  narrow.addEventListener('change', () => { if (narrow.matches) close({ focus: false, now: true }); });
  ui.on?.(() => { if (isOpen && ui.dock && (ui.dock === 'editor' || ui.dock === 'pattern')) close({ focus: false }); }); // ein Editor ging auf: Platz machen

  return {
    define(id, def) { defs.set(id, def); },
    open, close, refresh, go: (i) => go(i),
    park, el: root, card,
    get isOpen() { return isOpen; },
    get id() { return cur?.id ?? null; },
    get step() { return cur?.i ?? 0; },
  };
}
