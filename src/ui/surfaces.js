// Flächen einer Edition abschalten: Elemente mit data-surface="name" bekommen data-off, wenn die Fläche aus ist.
// Sie bleiben im DOM (getElementById bricht nicht); eine CSS-Regel in index.html blendet sie aus.

export function applySurfaces(surfaces = {}, root = document) {
  let n = 0;
  for (const el of root.querySelectorAll('[data-surface]')) {
    const off = surfaces[el.dataset.surface] === false;
    el.toggleAttribute('data-off', off);
    if (off) n++;
  }
  return n;
}
