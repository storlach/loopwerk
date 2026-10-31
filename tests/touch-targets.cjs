// Tippflächen messen: Wie groß ist die Fläche, die ein Finger wirklich trifft? Gemessen wird mit
// elementFromPoint von der Mitte aus nach links/rechts und oben/unten – unsichtbar vergrößerte Trefferflächen
// (::before/::after) zählen mit, verdeckte oder von Nachbarn überlappte Teile nicht.

// Läuft im Browser. Gibt für jedes sichtbare Bedienelement { label, w, h } zurück.
function measureTargets(selector) {
  const SEL = selector || 'button, input:not([type=hidden]), select, textarea, a[href], [role=slider], [role=tab], .knob, .clip-grip, .clip-trim, .clip-handle, .ph-grip, .track-name, .pat-cell, .vkey';
  const out = [];
  const seen = new Set();
  for (const n of document.querySelectorAll(SEL)) {
    if (n.disabled || n.closest('[hidden], [inert], [aria-hidden="true"]:not(.knob)')) continue;
    // Bedienelemente, die vor Ort nur Anzeige sind (Regler mit eigenem Drehknopf daneben), zählen über den Knopf
    if (n.matches('.track-vol, .strip-pan')) continue;
    const r = n.getBoundingClientRect();
    if (r.width < 1 || r.height < 1 || r.top < 0 || r.left < 0 || r.bottom > innerHeight || r.right > innerWidth) continue;
    const cs = getComputedStyle(n);
    if (cs.visibility === 'hidden' || cs.pointerEvents === 'none' || Number(cs.opacity) === 0) continue;
    const labels = n.labels ? [...n.labels] : [];
    const owns = (x, y) => {
      if (x < 0 || y < 0 || x >= innerWidth || y >= innerHeight) return false;
      const h = document.elementFromPoint(x, y);
      return !!h && (h === n || n.contains(h) || labels.some((l) => l.contains(h)));
    };
    const cx = Math.min(innerWidth - 1, Math.max(0, Math.round(r.left + r.width / 2)));
    const cy = Math.min(innerHeight - 1, Math.max(0, Math.round(r.top + r.height / 2)));
    if (!owns(cx, cy)) continue; // verdeckt (z. B. hinter einem Fach) – nicht erreichbar, also nicht zu messen
    // Nur ganz sichtbare Elemente: halb unter einer Schublade oder am Rand einer Scrollfläche zählt die volle Größe erst,
    // wenn man hinscrollt
    const ix = Math.min(3, r.width / 4);
    const iy = Math.min(3, r.height / 4);
    const corners = [[r.left + ix, r.top + iy], [r.right - ix, r.top + iy], [r.left + ix, r.bottom - iy], [r.right - ix, r.bottom - iy]];
    // Ecke von etwas anderem verdeckt: Ist es ein Nachbar-Bedienelement (Klaviertasten, vergrößerte Trefferflächen), wird
    // trotzdem gemessen; liegt etwas anderes darüber (Schublade, klebendes Lineal, Rand einer Scrollfläche), nicht
    const blocked = corners.some(([x, y]) => {
      if (owns(Math.round(x), Math.round(y))) return false;
      const h = document.elementFromPoint(Math.round(x), Math.round(y));
      return !h || !h.closest(SEL);
    });
    if (blocked) continue;
    let l = cx; let rr = cx; let t = cy; let b = cy;
    while (l > cx - 80 && owns(l - 1, cy)) l--;
    while (rr < cx + 80 && owns(rr + 1, cy)) rr++;
    // Senkrecht in der Mitte der waagerechten Spanne messen (Nachbarn können die Mitte verschieben)
    const mx = Math.round((l + rr) / 2);
    t = cy; b = cy;
    while (t > cy - 80 && owns(mx, t - 1)) t--;
    while (b < cy + 80 && owns(mx, b + 1)) b++;
    const name = n.id ? `#${n.id}` : `${n.tagName.toLowerCase()}.${[...n.classList].slice(0, 2).join('.')}`;
    const label = `${name}${n.getAttribute('aria-label') ? ` „${n.getAttribute('aria-label')}“` : n.textContent.trim() ? ` „${n.textContent.trim().slice(0, 18)}“` : ''}`;
    const key = label.replace(/-t\d+\b/g, '-tN').replace(/\d+/g, '#');
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ label, w: rr - l + 1, h: b - t + 1 });
  }
  return out;
}

module.exports = { measureTargets };
