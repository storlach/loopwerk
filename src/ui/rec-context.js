// ● mit Kontext (Krachwerk 3b, Spec krachwerk-3-festhalten §2): unter ● steht klein „Takes“ oder „Geräusch“ (Text, kein Bedienelement),
// Lang drücken (Maus, Stift, Finger) oder Umschalt+R öffnet die Zeile „Geräusch · Takes“ – die Wahl startet sofort und gilt für diese Aufnahme.
// Wartet die Aufnahme auf den ersten Loop-Sprung, ist ● ein Ring (Rot nur für die Aufnahme), danach gefüllt.
// Schreibt nichts ins Projekt; startet nur über record.start (main.js).

import { el, trackPointer } from '../util.js';

const HOLD_MS = 450;
const MOVE_MAX = 10; // px: wer wegzieht, will nicht lang drücken

export function mountRecContext({ btn, recorder, engine, store, ui, record }) {
  const app = document.getElementById('app');
  const text = el('span', 'rec-ctx');
  text.id = 'rec-ctx';
  text.setAttribute('aria-hidden', 'true');
  btn.append(text);

  const row = el('div', 'rec-ctxrow');
  row.id = 'rec-ctxrow';
  row.setAttribute('role', 'group');
  row.setAttribute('aria-label', 'Was nimmt ● auf?');
  row.hidden = true;
  const opt = (id, label, takes) => {
    const b = el('button', 'key rec-ctx-opt', label);
    b.type = 'button';
    b.id = id;
    b.addEventListener('click', () => { close(false); record.start(null, { takes }); });
    return b;
  };
  const bSound = opt('rec-ctx-sound', 'Geräusch', false);
  const bTakes = opt('rec-ctx-takes', 'Takes', true);
  row.append(bSound, bTakes);
  app.append(row);

  const loopOn = () => { const l = store.project.loop; return l.on && l.endBeat > l.startBeat; };

  function sync() {
    const waiting = recorder.waiting;
    const busy = recorder.state !== 'idle';
    const ctx = record.context();
    const t = waiting ? 'wartet …' : ctx === 'takes' ? 'Takes' : 'Geräusch';
    if (text.textContent !== t) {
      text.textContent = t;
      btn.setAttribute('aria-label', `Aufnahme – ${t}`);
    }
    text.dataset.ctx = ctx;
    btn.classList.toggle('rec-wait', waiting);
    btn.setAttribute('aria-haspopup', 'true');
    const lo = loopOn();
    bTakes.disabled = !lo;
    bTakes.title = lo ? 'Jeder Durchgang im Loop wird ein Take' : 'Dafür den Loop-Bereich einschalten';
    if (busy && !row.hidden) close(false);
  }

  // ---------- die Zeile ----------
  function place() {
    const r = btn.getBoundingClientRect();
    const a = app.getBoundingClientRect();
    const w = row.offsetWidth || 240;
    const left = Math.max(8, Math.min(r.left + r.width / 2 - w / 2, a.width - w - 8));
    row.style.left = `${Math.round(left - a.left)}px`;
    // über ● (Handy: Daumenleiste unten), sonst darunter
    const h = row.offsetHeight || 52;
    const above = r.top - h - 8 >= 4;
    row.style.top = `${Math.round((above ? r.top - h - 8 : r.bottom + 8) - a.top)}px`;
  }
  function open(byKey = false) {
    if (recorder.state !== 'idle') return;
    sync();
    row.hidden = false;
    place();
    (byKey ? (bTakes.disabled ? bSound : bTakes) : null)?.focus();
  }
  function close(refocus = true) {
    if (row.hidden) return;
    row.hidden = true;
    if (refocus && row.contains(document.activeElement)) btn.focus();
  }

  // ---------- Lang drücken auf ● ----------
  let longDone = false;
  btn.addEventListener('pointerdown', (e) => {
    longDone = false;
    if (e.button > 0 || recorder.state !== 'idle') return;
    const x0 = e.clientX, y0 = e.clientY;
    const t = setTimeout(() => { longDone = true; open(false); }, HOLD_MS);
    trackPointer(e,
      (m) => { if (Math.hypot(m.clientX - x0, m.clientY - y0) > MOVE_MAX) clearTimeout(t); },
      () => clearTimeout(t),
      () => clearTimeout(t));
  });
  // Der Klick nach dem langen Drücken startet nichts (Aufnahmen beginnen nur mit der Wahl)
  btn.addEventListener('click', (e) => { if (longDone) { longDone = false; e.stopImmediatePropagation(); e.preventDefault(); } }, true);
  btn.addEventListener('contextmenu', (e) => { if (longDone || !row.hidden) e.preventDefault(); });
  // Tastatur: Umschalt+R (main.js), Pfeil hoch oder Menütaste auf ●
  btn.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowUp' || e.key === 'ContextMenu' || (e.shiftKey && e.key === 'F10')) { e.preventDefault(); open(true); }
  });
  row.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(true); }
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); (document.activeElement === bSound && !bTakes.disabled ? bTakes : bSound).focus(); }
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !row.hidden && !row.contains(e.target)) { e.preventDefault(); close(true); } });
  document.addEventListener('pointerdown', (e) => { if (!row.hidden && !row.contains(e.target) && e.target !== btn && !btn.contains(e.target)) close(false); }, true);
  window.addEventListener('resize', () => { if (!row.hidden) place(); });

  engine.on(sync);
  store.on(sync);
  ui.on(sync);
  recorder.on((what) => { if (what === 'state' || what === 'pass' || what === 'recorded') sync(); });
  sync();
  return { open, close, sync, el: row, get isOpen() { return !row.hidden; } };
}
