// Bedienelemente je nach Bildschirm an ihren Platz bringen: dieselben Knöpfe (gleiche IDs, gleiche Logik)
// sitzen am Desktop in Deck, Leisten und Menüs, am Handy an ihrem Ort (Deck, Kopfzeile, Fach „Song“) oder am Ursprungsort.

export const narrow = window.matchMedia('(max-width: 760px)');
// Eingabeart statt Breite: Finger ohne Maus (Tablet, Handy). Ein Tablet bekommt das Desktop-Layout, aber Fingerbedienung.
export const touch = window.matchMedia('(hover: none) and (pointer: coarse)');

const entries = [];

// Dichte „calm“ (Edition): eigener Platz; ein Element mit calm-Platz ist dort sichtbar, auch wenn es sonst Stufe 3 hat
const calm = () => document.getElementById('app')?.dataset.density === 'calm';

function apply(e) {
  const own = calm() && e.calm ? (narrow.matches ? e.calm.narrow : e.calm.wide) : undefined;
  const target = own !== undefined ? own : narrow.matches ? e.narrow : e.wide;
  e.node.toggleAttribute('data-placed', own != null);
  if (target) target.append(e.node);
  else e.home.after(e.node);
}

// node: Element; narrow/wide: Ziel-Container (null = Ursprungsort im HTML)
// calm: { narrow, wide } nur bei Dichte „calm“ (fehlt eine Seite, gilt dort der bisherige Platz)
export function place(node, { narrow: n = null, wide: w = null, calm: c = null } = {}) {
  if (!node) return;
  const home = document.createComment(node.id || node.className || 'platz');
  node.before(home);
  const e = { node, home, narrow: n, wide: w, calm: c };
  entries.push(e);
  apply(e);
}

// In Reihenfolge der Anmeldung neu verteilen, damit die Anordnung in jedem Ziel gleich bleibt
narrow.addEventListener('change', () => entries.forEach(apply));
