// Bedienelemente je nach Bildschirm an ihren Platz bringen: dieselben Knöpfe (gleiche IDs, gleiche Logik)
// sitzen am Desktop in Deck, Leisten und Menüs, am Handy im Fach „Mehr“ oder an ihrem Ursprungsort.

export const narrow = window.matchMedia('(max-width: 760px)');

const entries = [];

function apply(e) {
  const target = narrow.matches ? e.narrow : e.wide;
  if (target) target.append(e.node);
  else e.home.after(e.node);
}

// node: Element; narrow/wide: Ziel-Container (null = Ursprungsort im HTML)
export function place(node, { narrow: n = null, wide: w = null } = {}) {
  if (!node) return;
  const home = document.createComment(node.id || node.className || 'platz');
  node.before(home);
  const e = { node, home, narrow: n, wide: w };
  entries.push(e);
  apply(e);
}

// In Reihenfolge der Anmeldung neu verteilen, damit die Anordnung in jedem Ziel gleich bleibt
narrow.addEventListener('change', () => entries.forEach(apply));
