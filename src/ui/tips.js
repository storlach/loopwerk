// Tutorial: Tipps erscheinen, wenn ein Bereich zum ersten Mal zu sehen ist – einer nach dem anderen,
// gut sichtbar neben dem Element. „Verstanden“ blendet ihn aus, „Keine Tipps mehr“ schaltet alle ab.
// Im Projekt-Menü (am Handy unter „Mehr“) lassen sie sich wieder einschalten.

import { el } from '../util.js';
import { narrow, touch } from './place.js';

const KEY = 'loopwerk.tips';

// sel: Element, an dem der Tipp steht (das erste sichtbare Treffer-Element)
// only: Bildschirm ('wide' | 'narrow') oder Eingabe ('mouse' | 'touch'), auch als Liste (eins davon genügt)
// touchText: Wortlaut für Finger (Tablet und Handy)
const TIPS = [
  { id: 'sounds', sel: '#library .loop-item', only: 'mouse', text: 'Hier sind die Sounds. Klick hört rein – auf eine Spur ziehen setzt ihn ein.' },
  { id: 'sounds-phone', sel: '#library .loop-item', only: ['narrow', 'touch'], text: 'Antippen hört rein und wählt den Sound aus. Danach in eine Spur tippen setzt ihn ein.' },
  { id: 'create', sel: '#ltab-create', only: 'wide', text: 'Unter „Erstellen“ baust du Beats und Melodien, singst ein, nimmst auf oder importierst Dateien.' },
  { id: 'ruler', sel: '.ruler', text: 'Das Lineal: Klick setzt die Abspielmarke, Ziehen markiert einen Bereich zum Wiederholen (Loop).', touchText: 'Das Lineal: Antippen setzt die Abspielmarke, Ziehen markiert einen Bereich zum Wiederholen (Loop). Zwei Finger zoomen.' },
  { id: 'clip', sel: '.clip.selected', text: 'Ziehen verschiebt den Clip, die Ränder kürzen oder verlängern ihn. Die Punkte oben regeln Lautstärke und Ein-/Ausblenden. Doppelklick öffnet den Editor.', touchText: 'Den ausgewählten Clip ziehen verschiebt ihn, unten an den Rändern kürzt oder verlängert er sich. Die Punkte oben regeln Lautstärke und Ein-/Ausblenden.' },
  { id: 'select-touch', sel: '#select-btn', only: 'touch', text: 'Lange auf einen Clip drücken wählt mehrere aus – danach weitere antippen. Lange auf eine freie Stelle drücken und ziehen zieht einen Rahmen auf.' },
  { id: 'inspector', sel: '#insp[data-mode="clip"] .insp-sec:not([hidden])', only: 'wide', text: 'Rechts stehen immer die Einstellungen des Ausgewählten: Clip, Spur mit ihren Effekten – oder ohne Auswahl der ganze Song.' },
  { id: 'fx-track', sel: '#insp .insp-sec:not([hidden]) .fxl, #mixer:not([hidden]) .strip-fx', text: 'Effekte sitzen auf der Spur, nicht auf dem einzelnen Sound: Sie wirken auf alles, was auf dieser Spur liegt. Soll ein Sound anders klingen, leg ihn auf eine eigene Spur.' },
  { id: 'sheet', sel: '.dock:not([hidden]) > .sheet-grip, .app[data-dock="sounds"] .shelf > .sheet-grip', text: 'Am Griff ziehen macht das Fach größer oder kleiner. Nach unten wischen schließt es.' },
  { id: 'mixer', sel: '#mixer:not([hidden]) .strip', text: 'Jede Spur hat einen Kanal: Fader für die Lautstärke, M stumm, S solo. Klick auf den Namen zeigt ihre Effekte.', touchText: 'Jede Spur hat einen Kanal: Fader hoch und runter ziehen für die Lautstärke, M stumm, S solo. Der Name zeigt ihre Effekte.' },
  { id: 'beat', sel: '#pattern:not([hidden])[data-type="drums"] #pat-view', text: 'Schritte anklicken setzt Schläge (gedrückt ziehen malt mehrere). Bei „Pads“ trommelst du mit A–K – halten gibt einen Wirbel.', touchText: 'Schritte antippen setzt Schläge. Bei „Pads“ trommelst du mit den Fingern – halten gibt einen Wirbel.' },
  { id: 'melody', sel: '#pattern:not([hidden])[data-type="synth"] .pat-roll-wrap', text: 'Klick ins Raster setzt eine Note, Ziehen macht sie länger. Tasten spielen – gehalten klingt der Ton länger.', touchText: 'Antippen setzt eine Note, nochmal antippen löscht sie. Lange drücken und ziehen verschiebt sie, am rechten Ende wird sie länger.' },
  { id: 'sing', sel: '#pattern:not([hidden]) #sing-rec', text: 'Sing, summ oder pfeif eine Melodie – Loopwerk macht Noten daraus. Unter „Wie soll es klingen?“ beschreibst du den Klang.' },
  { id: 'vkeys', sel: '#pattern:not([hidden]) .pat-vkeys', only: 'narrow', text: 'Die Tasten links sind spielbar: halten = langer Ton, mit dem Finger darübergleiten spielt weiter.' },
  { id: 'editor', sel: '#editor:not([hidden]) #ed-wave', text: 'Über die Wellenform ziehen wählt einen Bereich. Darunter findest du Schneiden, Klang, Tonhöhe und Autotune und das Trennen von Stimme und Instrumenten.' },
  { id: 'export', sel: '#export:not([hidden]) .export-body', text: 'WAV ist verlustfrei, MP3 deutlich kleiner. „Nur Loop-Bereich“ exportiert nur den markierten Teil.' },
];

function load() {
  try { const v = JSON.parse(localStorage.getItem(KEY)); if (v && Array.isArray(v.seen)) return v; } catch { /* Standard */ }
  return { off: false, seen: [] };
}
function save(state) { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* egal */ } }

const visible = (n) => {
  if (!n) return false;
  const r = n.getBoundingClientRect();
  if (r.width < 4 || r.height < 4) return false;
  if (r.bottom < 0 || r.top > innerHeight || r.right < 0 || r.left > innerWidth) return false;
  return getComputedStyle(n).visibility !== 'hidden';
};

export function mountTips({ ui, store }) {
  const state = load();
  // In automatisierten Tests aus, außer ein Test schaltet sie ein
  let enabled = !navigator.webdriver;
  const box = el('div', 'tip');
  box.hidden = true;
  box.setAttribute('role', 'dialog');
  box.setAttribute('aria-live', 'polite');
  const step = el('span', 'tip-step', 'Tipp');
  const text = el('p', 'tip-text');
  const btns = el('div', 'tip-btns');
  const off = el('button', 'tip-off', 'Keine Tipps mehr');
  const ok = el('button', 'tip-ok', 'Verstanden');
  off.type = ok.type = 'button';
  btns.append(off, ok);
  const arrow = el('span', 'tip-arrow');
  box.append(arrow, step, text, btns);
  document.body.append(box);
  let current = null; // { tip, target }

  function hide() {
    current?.target.classList.remove('tip-target');
    current = null;
    box.hidden = true;
  }
  function position() {
    if (!current) return;
    const r = current.target.getBoundingClientRect();
    const bw = box.offsetWidth;
    const bh = box.offsetHeight;
    const below = r.bottom + 12 + bh < innerHeight - 8 || r.top - 12 - bh < 8;
    const top = below ? Math.min(innerHeight - bh - 8, r.bottom + 12) : r.top - 12 - bh;
    const left = Math.min(innerWidth - bw - 8, Math.max(8, r.left + r.width / 2 - bw / 2));
    box.style.top = `${Math.max(8, top)}px`;
    box.style.left = `${left}px`;
    arrow.className = `tip-arrow ${below ? 'up' : 'down'}`;
    arrow.style.left = `${Math.min(bw - 20, Math.max(8, r.left + r.width / 2 - left - 6))}px`;
  }
  function done(tip) {
    if (!state.seen.includes(tip.id)) state.seen.push(tip.id);
    save(state);
  }
  ok.addEventListener('click', () => { if (current) done(current.tip); hide(); schedule(); });
  off.addEventListener('click', () => { state.off = true; save(state); hide(); ui.flash?.('Tipps sind aus. Im Projekt-Menü kannst du sie wieder einschalten.'); });

  function check() {
    if (!enabled || state.off) { hide(); return; }
    if (current) {
      // Der Bereich ist weg (z. B. Fach geschlossen): Tipp kommt beim nächsten Mal wieder
      if (!visible(current.target) || !document.contains(current.target)) hide();
      else { position(); return; }
    }
    const modes = [narrow.matches ? 'narrow' : 'wide', touch.matches ? 'touch' : 'mouse'];
    const fits = (t) => !t.only || [t.only].flat().some((m) => modes.includes(m));
    for (const tip of TIPS) {
      if (state.seen.includes(tip.id) || !fits(tip)) continue;
      const target = [...document.querySelectorAll(tip.sel)].find(visible);
      if (!target) continue;
      current = { tip, target };
      text.textContent = (touch.matches && tip.touchText) || tip.text;
      const left = TIPS.filter((t) => !state.seen.includes(t.id) && fits(t)).length;
      step.textContent = left > 1 ? `Tipp · noch ${left - 1} weitere` : 'Tipp';
      target.classList.add('tip-target');
      box.hidden = false;
      position();
      return;
    }
  }
  let timer = null;
  function schedule() { clearTimeout(timer); timer = setTimeout(check, 450); }
  ui.on(schedule);
  store.on(schedule);
  narrow.addEventListener('change', schedule);
  touch.addEventListener('change', schedule);
  window.addEventListener('resize', () => { if (current) position(); });
  document.addEventListener('scroll', () => { if (current) position(); }, true);
  schedule();

  // Projekt-Menü / „Mehr“: Tipps wieder einschalten
  document.getElementById('tips-reset')?.addEventListener('click', () => {
    state.off = false;
    state.seen = [];
    save(state);
    ui.flash?.('Tipps sind wieder an.');
    schedule();
  });

  return {
    enable() { enabled = true; schedule(); },
    disable() { enabled = false; hide(); },
    reset() { state.off = false; state.seen = []; save(state); schedule(); },
    get current() { return current?.tip.id ?? null; },
    check,
  };
}
