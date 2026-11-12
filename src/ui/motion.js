// Bewegungs-Helfer für die schwebenden Flächen (Layout „reiter“, Desktop). Dauern und Kurven stehen als Tokens in :root (--move-*, --ease-*);
// die großen Übergänge (Karte, Mixer-Spalte, Clip-Editor) laufen als CSS-Übergänge, hier nur, was CSS allein nicht kann:
//   fadeIn  – Inhalt einer stehenden Karte wechselt (Reiter, andere Spur): kurz überblenden, vom aktuellen Stand aus
//   reveal  – ein Element mit hidden-Attribut weich ein- und ausblenden; hidden erst, wenn es ausgeblendet ist
//   settle  – auf das Ende eines CSS-Übergangs warten (mit Rückfallzeit, falls keiner läuft)
// Nur transform und opacity; Web Animations, damit jede Bewegung unterbrechbar ist und vom aktuellen Stand aus weiterläuft.

const reduced = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };

// Dauer eines Tokens in ms (z. B. '--move-swap')
export function token(name, fallback = 0) {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  const n = parseFloat(v);
  if (!Number.isFinite(n)) return fallback;
  return v.endsWith('ms') ? n : v.endsWith('s') ? n * 1000 : n;
}
function curve() {
  return getComputedStyle(document.documentElement).getPropertyValue('--ease-card').trim() || 'ease-out';
}
function run(el, frames, opts) {
  try { return el.animate(frames, opts); } catch { return el.animate(frames, { ...opts, easing: 'ease-out' }); } // Kurve linear() unbekannt
}

const SWAP = new WeakMap();
// Neuer Inhalt in einer Karte, die stehen bleibt: aus der aktuellen Deckkraft (läuft schon ein Wechsel) bzw. aus 0 einblenden
export function fadeIn(els) {
  const dur = token('--move-swap', 200);
  for (const el of els) {
    if (!el) continue;
    const prev = SWAP.get(el);
    const from = prev && prev.playState === 'running' ? Number(getComputedStyle(el).opacity) : 0;
    prev?.cancel();
    const a = run(el, [{ opacity: from }, { opacity: 1 }], { duration: dur, easing: curve() });
    SWAP.set(el, a);
    a.onfinish = () => { if (SWAP.get(el) === a) SWAP.delete(el); };
  }
}

const REVEAL = new WeakMap();
// hidden weich: einblenden sofort (hidden fällt, dann von der aktuellen Deckkraft nach 1), ausblenden erst ohne Klicks (inert), hidden am Ende.
// dx: kleiner Weg in px beim Ein- und Ausblenden (bei reduzierter Bewegung keiner)
export function reveal(el, on, { dx = -6 } = {}) {
  if (!el) return;
  const st = REVEAL.get(el);
  const want = !!on;
  if (!st) { el.hidden = !want; el.inert = !want; REVEAL.set(el, { on: want, anim: null }); return; } // erster Aufruf: ohne Bewegung
  if (st.on === want) return;
  st.on = want;
  const from = el.hidden ? 0 : Number(getComputedStyle(el).opacity);
  st.anim?.cancel();
  el.hidden = false;
  el.inert = !want;
  const x = reduced.matches ? 0 : dx;
  const off = (k) => (x ? `translateX(${(x * k).toFixed(2)}px)` : 'none');
  const dur = token('--move-small', 180) * (want ? 1 - from : from || 1);
  const frames = want ? [{ opacity: from, transform: off(1 - from) }, { opacity: 1, transform: 'none' }] : [{ opacity: from, transform: off(1 - from) }, { opacity: 0, transform: off(1) }];
  const a = run(el, frames, { duration: Math.max(60, dur), easing: want ? curve() : 'cubic-bezier(0.3, 0, 0.4, 1)' });
  st.anim = a;
  a.onfinish = () => { if (st.anim !== a) return; st.anim = null; if (!want) el.hidden = true; };
}

// Wartet, bis an el der laufende Übergang der Eigenschaft prop endet; läuft keiner (nichts zu tun, reduziert, verborgen), sofort im nächsten Bild.
// ms: Sicherheitsnetz (mindestens 5 s), falls kein Ende gemeldet wird. Gibt eine Abbruchfunktion zurück.
export function settle(el, prop, ms, done) {
  let t = 0;
  let raf = 0;
  const running = () => el.getAnimations().some((a) => a.playState === 'running' && (!prop || a.transitionProperty === prop));
  const end = (e) => { if (e.target !== el || (prop && e.propertyName !== prop)) return; stop(); done(); };
  const stop = () => { clearTimeout(t); cancelAnimationFrame(raf); el.removeEventListener('transitionend', end); el.removeEventListener('transitioncancel', end); };
  el.addEventListener('transitionend', end);
  el.addEventListener('transitioncancel', end); // abgebrochen (z. B. verborgen); ein Gegenbefehl hat das Warten vorher schon beendet
  raf = requestAnimationFrame(() => { if (!running()) { stop(); done(); } });
  t = setTimeout(() => { stop(); done(); }, Math.max(ms, 5000));
  return stop;
}
