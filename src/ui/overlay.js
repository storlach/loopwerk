// Clip-Editor als Karte in der Mitte über dem Arranger (Layout „reiter“, nur Desktop).
// Doppelklick auf einen Clip (oder „Beat bauen“, „Melodie schreiben“) öffnet wie bisher ui.setDock('editor' | 'pattern');
// hier hängen sich die beiden Editoren (#editor, #pattern, samt ihren Kennungen und ihrer Logik) in eine Karte mit abgedunkeltem
// Rand und die Clip-Einstellungen (der Abschnitt .insp-clip des Inspektors) in ihre rechte Spalte. Am Handy (≤ 760 px) liegt alles
// wieder an seinem alten Platz: die Fächer unten. Schließen: ✕, Esc (main.js), Klick auf die abgedunkelte Fläche; der Fokus kehrt zurück.
// Aussehen: CSS in index.html unter #app[data-layout="reiter"] #clip-overlay.

import { narrow } from './place.js';
import { settle, token } from './motion.js';

const el = (tag, cls, id) => { const n = document.createElement(tag); if (cls) n.className = cls; if (id) n.id = id; return n; };
const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
const visible = (n) => n.offsetParent !== null || n === document.activeElement;

export function mountOverlay({ ui, editor }) {
  const app = document.getElementById('app');
  const ed = document.getElementById('editor');
  const pat = document.getElementById('pattern');
  const clipSec = document.querySelector('.insp-clip');
  if (!app || !ed || !pat || !clipSec) return null;

  // Alte Plätze merken, bevor etwas umgehängt wird
  const homes = new Map();
  for (const n of [ed, pat, clipSec]) { const c = document.createComment(n.id || 'platz'); n.before(c); homes.set(n, c); }

  const root = el('div', 'ov', 'clip-overlay');
  root.hidden = true;
  root.dataset.state = 'zu'; // auf | zu: steuert Ein- und Ausflug (CSS-Übergänge); hidden erst, wenn die Karte ganz draußen ist
  const back = el('div', 'ov-back');
  const card = el('section', 'ov-card', 'ov-card');
  card.setAttribute('role', 'dialog');
  card.setAttribute('aria-modal', 'true');
  card.tabIndex = -1;
  const close = el('button', 'dbtn ed-ico ov-close', 'ov-close'); // Beat und Melodie; der Sample-Editor hat sein ✕ (Abbrechen) selbst
  close.type = 'button';
  close.setAttribute('aria-label', 'Schließen');
  close.title = 'Schließen (Esc)';
  close.innerHTML = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3.4 2L2 3.4 6.6 8 2 12.6 3.4 14 8 9.4l4.6 4.6 1.4-1.4L9.4 8 14 3.4 12.6 2 8 6.6z"/></svg>';
  const toggle = el('button', 'dbtn ed-ico ov-side-toggle', 'ov-side-toggle'); // Beat und Melodie: Clip-Einstellungen ein- und ausklappen
  toggle.type = 'button';
  toggle.innerHTML = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 4h10v1.5H3zm0 3.25h10v1.5H3zm0 3.25h10V12H3z"/></svg>';
  card.append(ed, pat, toggle, close);
  root.append(back, card);
  app.append(root);

  // ---------- Ort je Bildschirm: Desktop in der Karte, Handy an den alten Platz (Fächer unten, Clip-Abschnitt im Inspektor) ----------
  let sideOpen = window.innerWidth >= 1280; // Beat/Melodie: Spalte rechts; schmal beginnt sie eingeklappt
  const put = () => {
    if (narrow.matches) {
      for (const [n, c] of homes) c.after(n);
      return;
    }
    card.prepend(ed, pat); // Reihenfolge der Fächer bleibt
    dockClip();
  };
  // Die Clip-Einstellungen wohnen im gerade offenen Editor (Raster-Spalte rechts)
  function dockClip() {
    if (narrow.matches) return;
    const host = ui.dock === 'pattern' ? pat : ed;
    if (clipSec.parentElement !== host) host.append(clipSec);
  }

  // ---------- Öffnen und Schließen ----------
  let isOpen = false;
  let returnTo = null;
  let stopHide = null;
  const kindOf = () => (ui.dock === 'editor' ? 'sample' : ui.dock === 'pattern' ? 'pattern' : null);
  const clipEl = () => (ui.selectedClipId ? document.querySelector(`.clip[data-clip-id="${CSS.escape(ui.selectedClipId)}"]`) : null);

  function sideState() {
    card.dataset.side = card.dataset.kind === 'pattern' && !sideOpen ? 'zu' : 'offen';
    toggle.setAttribute('aria-expanded', String(card.dataset.side === 'offen'));
    const t = card.dataset.side === 'offen' ? 'Clip-Einstellungen ausblenden' : 'Clip-Einstellungen einblenden';
    toggle.title = t;
    toggle.setAttribute('aria-label', t);
  }
  toggle.addEventListener('click', () => { sideOpen = !sideOpen; sideState(); });

  function labelled(kind) {
    card.setAttribute('aria-labelledby', kind === 'pattern' ? 'pat-title' : 'editor-title');
  }

  function open(kind) {
    isOpen = true;
    const a = document.activeElement;
    returnTo = a && a !== document.body && !root.contains(a) ? a : null;
    card.dataset.kind = kind;
    labelled(kind);
    sideState();
    dockClip();
    stopHide?.();
    stopHide = null;
    root.inert = false;
    if (root.hidden) {
      root.hidden = false;
      void getComputedStyle(card).transform; // Ausgangslage (unten, unsichtbar) festhalten, damit der Übergang startet
    }
    root.dataset.state = 'auf'; // läuft die Karte gerade hinaus, kehrt sie vom aktuellen Stand aus um
    // Der Editor gehört zu einem Clip: ist er nicht gewählt (z. B. Öffnen über die Konsole), wird er es jetzt
    const cid = kind === 'sample' ? editor?.state?.clipId : null;
    if (cid && ui.selectedClipId !== cid) ui.select(cid);
    requestAnimationFrame(() => { if (isOpen) card.focus({ preventScroll: true }); });
  }
  function shut() {
    isOpen = false;
    root.dataset.state = 'zu';
    root.inert = true; // während des Ausflugs weder Klicks noch Fokus; die Spuren darunter sind sofort wieder bedienbar
    stopHide?.();
    stopHide = settle(card, 'opacity', token('--move-editor-out', 260) + 400, () => { stopHide = null; if (!isOpen) root.hidden = true; });
    // Fokus zurück: das Element von vorher, sonst der Clip
    const t = returnTo && returnTo.isConnected && visible(returnTo) ? returnTo : clipEl();
    returnTo = null;
    if (t && typeof t.focus === 'function') { if (!t.hasAttribute('tabindex') && t.tagName === 'DIV') t.tabIndex = -1; t.focus({ preventScroll: true }); }
  }
  function sync() {
    const kind = !narrow.matches ? kindOf() : null;
    if (kind && !isOpen) open(kind);
    else if (kind && card.dataset.kind !== kind) { card.dataset.kind = kind; labelled(kind); sideState(); dockClip(); }
    else if (!kind && isOpen) shut();
  }
  ui.on(sync);
  narrow.addEventListener('change', () => { put(); sync(); });
  put();
  sync();

  // Klick auf die abgedunkelte Fläche, ✕: Fach schließen (Sample-Editor: wie Abbrechen, nichts wird übernommen)
  back.addEventListener('click', (e) => { if (e.target === back) ui.setDock(null); });
  close.addEventListener('click', () => ui.setDock(null));

  // Tastatur: Tab bleibt in der Karte; Esc im Textfeld beendet erst die Eingabe, Esc sonst schließt (main.js)
  root.addEventListener('keydown', (e) => {
    if (e.key === 'Tab') {
      const list = [...card.querySelectorAll(FOCUSABLE)].filter(visible);
      if (!list.length) return;
      const first = list[0];
      const last = list[list.length - 1];
      const a = document.activeElement;
      if (e.shiftKey && (a === first || a === card)) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && a === last) { e.preventDefault(); first.focus(); }
    } else if (e.key === 'Escape' && /^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName) && e.target.type !== 'range') {
      e.target.blur();
    }
  });

  return { get open() { return isOpen; }, el: root };
}
