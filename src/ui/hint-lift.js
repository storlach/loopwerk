// Einblender (#hint) decken keine Bedienelemente ab (CD-Auflage Krachwerk 3a–5, 2b-Auflage 4): solange er zu sehen ist, sitzt er
// über der Oberkante der obersten Schublade, die in den Arranger ragt (Handy: Werkbank, Kiste, Fächer). Nur Dichte „calm“.
export function mountHintLift({ hint, arranger }) {
  let raf = 0;
  const lift = () => {
    if (!hint.classList.contains('show')) { raf = 0; hint.style.marginBottom = ''; return; }
    const ar = arranger.getBoundingClientRect();
    let top = Infinity;
    for (const s of document.querySelectorAll('.dock:not([hidden]), .shelf')) {
      if (!s.getClientRects().length) continue;
      const r = s.getBoundingClientRect();
      if (r.bottom <= ar.top || r.top >= ar.bottom || r.right <= ar.left || r.left >= ar.right) continue;
      top = Math.min(top, r.top);
    }
    const mb = top === Infinity ? '' : `${Math.max(12, Math.round(ar.bottom - top + 10))}px`;
    if (hint.style.marginBottom !== mb) hint.style.marginBottom = mb;
    raf = requestAnimationFrame(lift);
  };
  new MutationObserver(() => { if (hint.classList.contains('show') && !raf) raf = requestAnimationFrame(lift); }).observe(hint, { attributes: true, attributeFilter: ['class'] });
}
