// Karte zur Mixer-Spalte (Layout „reiter“, Desktop): Ein Klick auf die Effekt-Kurzinfo einer Zeile (mixer.js) öffnet sie über der Spalte.
// Inhalt sind dieselben Teile wie bisher im Inspektor, nur umgehängt (CSS unter #app[data-layout="reiter"][data-mixcard]):
//   Spur  → Abschnitt „Spur“ (Lautstärke, Panorama, Scharf, Effekte mit Reihenfolge, Busse) mit dem Spurnamen als Titel,
//   Summe → Mastering, Busse, Master (Lautstärke und Effekte).
// Die Karte folgt der Auswahl: eine Spur gewählt = Spur-Karte, nichts gewählt = Summe, ein Clip gewählt = zu. Schließen: ✕, Esc, anderer Reiter.

const el = (tag, cls, id) => { const n = document.createElement(tag); if (cls) n.className = cls; if (id) n.id = id; return n; };

export function mountMixcol({ ui, store, mixer, side }) {
  const app = document.getElementById('app');
  const sideEl = document.getElementById('side');
  if (!app || !sideEl || !mixer?.hooks) return null;

  const head = el('header', 'mixcard-head', 'mixcard-head');
  const title = el('h2', 'mixcard-title', 'mixcard-title');
  const close = el('button', 'dbtn ed-ico mixcard-close', 'mixcard-close');
  close.type = 'button';
  close.setAttribute('aria-label', 'Schließen');
  close.title = 'Schließen (Esc)';
  close.innerHTML = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3.4 2L2 3.4 6.6 8 2 12.6 3.4 14 8 9.4l4.6 4.6 1.4-1.4L9.4 8 14 3.4 12.6 2 8 6.6z"/></svg>';
  head.append(title, close);
  sideEl.append(head);

  let kind = null; // 'spur' | 'summe' | null
  let returnTo = null;
  // Was die Auswahl gerade zeigt: Spur, Summe (nichts gewählt) oder nichts davon (Clip gewählt)
  const kindNow = () => (ui.selectedClipId ? null : ui.selectedTrackId ? 'spur' : 'summe');

  function paint() {
    if (!kind) { delete app.dataset.mixcard; return; }
    app.dataset.mixcard = kind;
    const t = kind === 'spur' ? store.track(ui.selectedTrackId) : null;
    title.textContent = kind === 'spur' ? t?.name ?? '' : 'Summe';
    sideEl.setAttribute('aria-label', kind === 'spur' ? `Spur ${t?.name ?? ''}` : 'Summe');
  }
  function shut({ focus = true } = {}) {
    if (!kind) return false;
    kind = null;
    paint();
    const t = returnTo;
    returnTo = null;
    if (focus && t && t.isConnected && t.offsetParent !== null) t.focus({ preventScroll: true });
    return true;
  }
  // id: Spur oder '__master' / '__bus:…' (Summe)
  function open(id) {
    const k = typeof id === 'string' && id.startsWith('__') ? 'summe' : 'spur';
    if (!kind) { const a = document.activeElement; returnTo = a && a !== document.body ? a : null; }
    kind = k;
    paint();
    requestAnimationFrame(() => { if (kind) close.focus({ preventScroll: true }); });
  }

  close.addEventListener('click', () => shut());
  const follow = () => {
    if (!kind) return;
    const now = kindNow();
    if (now !== kind || (kind === 'spur' && !store.track(ui.selectedTrackId))) shut({ focus: false });
    else paint();
  };
  ui.on(follow);
  store.on(() => { if (kind === 'spur') paint(); });
  new MutationObserver(() => { if (app.dataset.side !== 'mixer') shut({ focus: false }); }).observe(app, { attributes: true, attributeFilter: ['data-side'] });

  mixer.hooks.open = open;
  mixer.hooks.show = () => side.show('mixer');
  return { open, close: () => shut(), get open_() { return !!kind; }, get kind() { return kind; } };
}
