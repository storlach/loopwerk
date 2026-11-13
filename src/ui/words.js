// Wörter für das Layout „reiter“ am Desktop (Scheibe 7). Die Tabelle steht in words-table.js (alt → neu). Gesetzt wird beim Start und beim Wechsel
// der Breite: am Desktop werden Texte, title, aria-label und placeholder der Seite umgeschrieben (Originale merkt sich ein Speicher, am Handy
// kommen sie zurück). Dynamisch erzeugte Texte (Mixer, Inspektor, Einblender …) laufen vor dem Setzen durch W(). Kennungen und Klassen
// bleiben unberührt; Krachwerk bleibt auf „klassisch“ und ruft apply nie mit active auf.

import { narrow } from './place.js';
import { ENTRIES } from './words-table.js';

const EXACT = new Map(ENTRIES.filter((e) => e.art === 'ganz').map((e) => [e.alt, e.neu]));
const PARTS = ENTRIES.filter((e) => e.art !== 'ganz').map((e) => (e.art === 'regex' ? [new RegExp(e.alt, 'g'), e.neu] : [e.alt, e.neu]));

let enabled = false; // Option aus main.js (Layout „reiter“)
const active = () => enabled && !narrow.matches;

// Der Text nach der Tabelle (unverändert, wenn die Wörter nicht gelten)
export function W(text) {
  if (!active() || typeof text !== 'string' || !text) return text;
  const lead = text.match(/^\s*/)[0];
  const core = text.trim();
  if (EXACT.has(core)) return lead + EXACT.get(core) + text.slice(lead.length + core.length);
  let out = text;
  for (const [a, b] of PARTS) out = typeof a === 'string' ? out.split(a).join(b) : out.replace(a, b);
  return out;
}

const SKIP = '#library, .clip, .track-head, script, style, svg, textarea, input';
const ATTRS = ['title', 'aria-label', 'placeholder'];
const orig = new Map(); // Text- oder Element-Knoten → Originale { t, a: {attr: text} }

function setText(n, from) {
  const to = W(from);
  if (to === n.data) return;
  (orig.get(n) ?? orig.set(n, { t: from }).get(n)).t ??= from;
  n.data = to;
}
// Alle Knoten unter root durchgehen und umschreiben
export function apply(root = document.body) {
  if (!active() || !root) return;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let n; (n = walker.nextNode());) {
    if (!n.data.trim() || n.parentElement?.closest(SKIP)) continue;
    setText(n, orig.get(n)?.t ?? n.data);
  }
  for (const el of root.querySelectorAll('[title], [aria-label], [placeholder]')) {
    if (el.closest('#library, .clip')) continue;
    for (const a of ATTRS) {
      if (!el.hasAttribute(a)) continue;
      const rec = orig.get(el) ?? orig.set(el, { a: {} }).get(el);
      rec.a ??= {};
      const from = rec.a[a] ?? el.getAttribute(a);
      const to = W(from);
      if (to !== el.getAttribute(a)) { rec.a[a] = from; el.setAttribute(a, to); }
    }
  }
}
// Originale zurück (Breite wird schmal)
export function restore() {
  for (const [n, rec] of orig) {
    if (!n.isConnected) { orig.delete(n); continue; }
    if (n.nodeType === 3) n.data = rec.t;
    else for (const [a, v] of Object.entries(rec.a ?? {})) n.setAttribute(a, v);
  }
  orig.clear();
}

export function mountWords({ active: on }) {
  enabled = !!on;
  if (!enabled) return;
  apply();
  narrow.addEventListener('change', () => (narrow.matches ? restore() : apply()));
}
