// Schwebende Karte rechts mit drei Reitern (Layout „reiter“, nur Desktop): Datei · Sounds · Mixer. Die Reiter-Knöpfe sitzen im Deck;
// ein Klick auf den gewählten Reiter klappt die Karte zu (data-side="zu").
// Dieselben Bausteine wie vorher, nur umgehängt: Sounds = das Regal (.shelf), Datei = Projekt-Knöpfe + Song-Abschnitt des Inspektors,
// Mixer = Spur-Abschnitt, Summe und Busse des Inspektors + Knöpfe für Mixer-Fach und FX-Pad. Ein gewählter Clip zeigt hier nichts:
// seine Einstellungen stehen im Clip-Editor (overlay.js), Teilen/Duplizieren/Löschen in der Kopfzeile über den Spuren (#arr-bar-tools),
// „Tastenkürzel“ in der Befehlsliste von Datei. Aussehen: CSS in index.html unter #app[data-layout="reiter"].
// Am Handy (≤ 760 px) bleibt alles am alten Platz; die Leiste wird dort nicht gezeigt.

import { narrow } from './place.js';
import { lsKey } from '../edition.js';

const TABS = [
  { id: 'datei', label: 'Datei' },
  { id: 'sounds', label: 'Sounds' },
  { id: 'mixer', label: 'Mixer' },
];
const DEFAULT = 'sounds';

export function mountSide({ ui }) {
  const app = document.getElementById('app');
  const insp = document.getElementById('insp');
  const shelf = document.querySelector('.shelf');
  const key = lsKey('loopwerk.side');
  const el = (tag, cls, id) => { const n = document.createElement(tag); if (cls) n.className = cls; if (id) n.id = id; return n; };

  // ---------- Gerüst ----------
  const side = el('aside', 'side', 'side');
  side.setAttribute('aria-label', 'Seitenleiste');
  const tabs = el('div', 'side-tabs', 'side-tabs'); // sitzt rechts im Deck (neben Rückgängig/Wiederholen), nicht in der Karte
  tabs.setAttribute('role', 'tablist');
  tabs.setAttribute('aria-label', 'Seitenleiste');
  const btns = new Map();
  for (const t of TABS) {
    const b = el('button', 'side-tab', `side-tab-${t.id}`);
    b.type = 'button';
    b.textContent = t.label;
    b.setAttribute('role', 'tab');
    b.setAttribute('aria-controls', t.id === 'sounds' ? 'side-sounds' : 'insp');
    b.addEventListener('click', () => (app.dataset.side === t.id ? close() : show(t.id))); // gewählter Reiter: Karte zu
    btns.set(t.id, b);
    tabs.append(b);
  }
  tabs.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    const i = TABS.findIndex((t) => t.id === current) + (e.key === 'ArrowRight' ? 1 : -1);
    const next = TABS[(i + TABS.length) % TABS.length];
    show(next.id);
    btns.get(next.id).focus();
  });
  const sounds = el('div', 'side-sounds', 'side-sounds'); // nimmt das Regal auf
  side.append(sounds);
  insp.before(side);
  // Kopfzeile: Logo frei, daneben das Deck als eigene Leiste (.deck-bar), rechts die Reiter. Die Leiste fasst alles zwischen Logo und .deck-right
  // zusammen; wo sie keine eigene Fläche hat (Handy), ist sie unsichtbar (display: contents)
  const deckEl = document.querySelector('header.deck');
  const deckRight = deckEl?.querySelector('.deck-right');
  const bar = el('div', 'deck-bar', 'deck-bar');
  if (deckEl && deckRight) {
    const brand = deckEl.querySelector('.brand');
    for (let n = brand?.nextSibling; n && n !== deckRight;) { const nx = n.nextSibling; bar.append(n); n = nx; }
    deckRight.before(bar);
    // Rückgängig/Wiederholen gehören am Desktop in die Leiste (am Handy bleiben sie im Deck-Rest)
    const edit = document.getElementById('deck-edit');
    if (edit) {
      const home = document.createComment('deck-edit');
      edit.before(home);
      const mv = () => (narrow.matches ? home.after(edit) : bar.append(edit));
      mv();
      narrow.addEventListener('change', mv);
    }
    deckRight.prepend(tabs);
  } else side.append(tabs);

  // Teile des Reiters „Datei“ und „Mixer“ liegen im Inspektor-Abschnitt (Song bzw. Spur); die Plätze der umgehängten Knöpfe
  const datei = el('div', 'side-datei', 'side-datei');
  datei.setAttribute('aria-label', 'Datei');
  datei.append(el('div', 'side-datei-name', 'side-datei-name')); // Songname als Überschrift
  // Darunter (nach dem Song-Abschnitt): „Neuer Song“ mit dem Song-Starter, dann die ruhige Befehlsliste
  const neu = el('section', 'side-datei-neu', 'side-datei-neu');
  neu.setAttribute('data-surface', 'starter');
  const neuH = el('h3', 'create-sec', null);
  neuH.textContent = 'Neuer Song';
  neu.append(neuH);
  const liste = el('div', 'side-datei-liste', 'side-datei-liste');
  liste.setAttribute('role', 'group');
  liste.setAttribute('aria-label', 'Datei');
  for (const id of ['side-datei-act', 'side-datei-export', 'side-datei-start', 'side-datei-foot']) liste.append(el('div', id, id));
  const mixer = el('div', 'side-mixer', 'side-mixer');
  mixer.setAttribute('aria-label', 'Mixer');
  mixer.append(el('div', 'side-mixer-docks', 'side-mixer-docks'));
  const hint = el('p', 'side-mixer-hint', 'side-mixer-hint');
  hint.textContent = 'Wähle eine Spur, dann stehen hier ihre Effekte, das Panorama und die Sends.';
  mixer.append(hint);
  const clipSec = insp.querySelector('.insp-clip');
  const trackSec = insp.querySelector('.insp-track');
  const songSec = insp.querySelector('.insp-song');
  (trackSec || songSec).before(mixer);
  songSec.before(datei);
  insp.append(neu, liste);

  // ---------- Reiter ----------
  let current = DEFAULT; // zuletzt gewählter Reiter (auch bei zugeklappter Karte)
  let closed = false;
  try { const v = localStorage.getItem(key); if (TABS.some((t) => t.id === v)) current = v; else if (v === 'zu') closed = true; } catch { /* Voreinstellung */ }
  function apply(save) {
    app.dataset.side = closed ? 'zu' : current;
    for (const [tid, b] of btns) { const on = !closed && tid === current; b.setAttribute('aria-selected', String(on)); b.tabIndex = on || (closed && tid === current) ? 0 : -1; }
    if (save) { try { localStorage.setItem(key, closed ? 'zu' : current); } catch { /* egal */ } }
  }
  function show(id, { save = true } = {}) {
    if (!TABS.some((t) => t.id === id)) return;
    current = id; closed = false;
    apply(save);
  }
  // Karte zuklappen; gibt true zurück, wenn sie offen war
  function close({ save = true } = {}) {
    if (closed) return false;
    closed = true;
    apply(save);
    return true;
  }
  apply(false);

  // Kopfzeile über den Spuren: Teilen, Duplizieren, Löschen (und später Schneiden) stehen nur, solange Clips gewählt sind
  const barTools = document.getElementById('arr-bar-tools');
  if (barTools) {
    const sync = () => { barTools.hidden = !ui.selectedIds().length; };
    ui.on(sync);
    sync();
  }

  // Eine Spur gewählt (Klick auf den Spurkopf): die Leiste wechselt auf „Mixer“
  let lastTrack = ui.selectedTrackId ?? null;
  ui.on(() => {
    const t = ui.selectedTrackId ?? null;
    if (t && t !== lastTrack) show('mixer');
    lastTrack = t;
  });

  // ---------- Ort je Bildschirm: Desktop in der Leiste, Handy an den alten Platz ----------
  // Der Inspektor steht über dem Regal; am Handy kehren beide an ihren Platz zurück
  const home = document.createComment('regal');
  shelf.before(home);
  const put = () => {
    if (narrow.matches) { home.after(shelf); side.after(insp); } else { sounds.append(shelf); side.prepend(insp); }
  };
  put();
  narrow.addEventListener('change', put);
  // Die schmale Laptop-Ansicht klappt den Inspektor sonst zu; hier ist er Teil der Leiste
  app.classList.add('insp-open');

  // Der Song-Starter zieht aus dem Erstellen-Fach in den Reiter Datei (wird nach mountStarter aufgerufen); „busy“ folgt dem Fach
  function takeStarter() {
    const box = document.getElementById('starter');
    const panel = document.getElementById('create-panel');
    if (!box || !panel) return;
    const home = document.createComment('starter');
    box.before(home);
    const mv = () => (narrow.matches ? home.after(box) : neu.append(box)); // Handy: zurück ins Fach „Erstellen“
    mv();
    narrow.addEventListener('change', mv);
    new MutationObserver(() => neu.classList.toggle('busy', panel.classList.contains('busy'))).observe(panel, { attributes: true, attributeFilter: ['class'] });
  }

  return { show, close, takeStarter, get open() { return !closed; }, get current() { return current; } };
}
