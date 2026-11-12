// Rechte Leiste mit drei Reitern (Layout „reiter“, nur Desktop): Datei · Sounds · Mixer.
// Dieselben Bausteine wie vorher, nur umgehängt: Sounds = das Regal (.shelf), Datei = Projekt-Knöpfe + Song-Abschnitt des Inspektors,
// Mixer = Spur-Abschnitt, Summe und Busse des Inspektors + Knöpfe für Mixer-Fach und FX-Pad. Ein gewählter Clip zeigt seinen
// Abschnitt oberhalb des Reiter-Inhalts (Übergang). Aussehen: CSS in index.html unter #app[data-layout="reiter"].
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
  const tabs = el('div', 'side-tabs');
  tabs.setAttribute('role', 'tablist');
  tabs.setAttribute('aria-label', 'Seitenleiste');
  const btns = new Map();
  for (const t of TABS) {
    const b = el('button', 'side-tab', `side-tab-${t.id}`);
    b.type = 'button';
    b.textContent = t.label;
    b.setAttribute('role', 'tab');
    b.setAttribute('aria-controls', t.id === 'sounds' ? 'side-sounds' : 'insp');
    b.addEventListener('click', () => show(t.id));
    btns.set(t.id, b);
    tabs.append(b);
  }
  tabs.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    const i = TABS.findIndex((t) => t.id === app.dataset.side) + (e.key === 'ArrowRight' ? 1 : -1);
    const next = TABS[(i + TABS.length) % TABS.length];
    show(next.id);
    btns.get(next.id).focus();
  });
  const sounds = el('div', 'side-sounds', 'side-sounds'); // nimmt das Regal auf
  side.append(tabs, sounds);
  insp.before(side);

  // Teile des Reiters „Datei“ und „Mixer“ liegen im Inspektor-Abschnitt (Song bzw. Spur); die Plätze der umgehängten Knöpfe
  const datei = el('div', 'side-datei', 'side-datei');
  datei.setAttribute('aria-label', 'Datei');
  for (const [id, cls] of [['side-datei-name', 'side-datei-name'], ['side-datei-act', 'side-datei-act'], ['side-datei-export', 'side-datei-export']]) datei.append(el('div', cls, id));
  const foot = el('div', 'side-datei-foot', 'side-datei-foot');
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
  insp.append(foot);

  // ---------- Reiter ----------
  let current = DEFAULT;
  try { const v = localStorage.getItem(key); if (TABS.some((t) => t.id === v)) current = v; } catch { /* Voreinstellung */ }
  function show(id, { save = true } = {}) {
    if (!TABS.some((t) => t.id === id)) return;
    current = id;
    app.dataset.side = id;
    for (const [tid, b] of btns) { b.setAttribute('aria-selected', String(tid === id)); b.tabIndex = tid === id ? 0 : -1; }
    if (save) { try { localStorage.setItem(key, id); } catch { /* egal */ } }
  }
  show(current, { save: false });

  // Eine Spur gewählt (Klick auf den Spurkopf): die Leiste wechselt auf „Mixer“
  let lastTrack = ui.selectedTrackId ?? null;
  ui.on(() => {
    const t = ui.selectedTrackId ?? null;
    if (t && t !== lastTrack) show('mixer');
    lastTrack = t;
  });

  // ---------- Ort je Bildschirm: Desktop in der Leiste, Handy an den alten Platz ----------
  // Inspektor (mit dem Clip-Abschnitt oben) steht über dem Regal; am Handy kehren beide an ihren Platz zurück
  const home = document.createComment('regal');
  shelf.before(home);
  const put = () => {
    if (narrow.matches) { home.after(shelf); side.after(insp); } else { sounds.append(shelf); tabs.after(insp); }
  };
  put();
  narrow.addEventListener('change', put);
  // Die schmale Laptop-Ansicht klappt den Inspektor sonst zu; hier ist er Teil der Leiste
  app.classList.add('insp-open');

  return { show, get current() { return current; } };
}
