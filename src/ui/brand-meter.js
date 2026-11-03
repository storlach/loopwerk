// Bildmarke im Deck: die Balken zeigen live den Pegel von allem, was gerade klingt (Song, Vorhören, Pads, Klick).
// Ohne Ton steht das Logo in seiner Grundform. Höhen rasten auf ganze LED-Stufen ein.

const IDLE = [0.45, 0.75, 1, 0.6, 0.3];
const STEP = 3; // px je LED

// Zeichen je Edition (Option mark): Grundform als Anteil der vollen Höhe, symmetrisch um die Mittellinie
const MARKS = {
  klatscher: [8, 20, 46, 34, 24, 14, 6].map((h) => h / 46), // assets/icons/krachwerk.svg
};

export function mountBrandMeter(engine, root = document.getElementById('brand-bars'), { mark = null } = {}) {
  if (!root) return null;
  if (mark && MARKS[mark]) return mountMark(engine, root, mark, MARKS[mark]);
  const bars = [...root.children];
  const level = IDLE.slice(0, bars.length);
  const shown = bars.map(() => -1);
  function frame() {
    const max = root.clientHeight || 20;
    const bands = engine.outputBands(bars.length);
    const loud = !!bands && bands.some((v) => v > 0.04);
    root.classList.toggle('live', loud);
    bars.forEach((bar, i) => {
      const target = loud ? bands[i] : IDLE[i];
      // schnell hoch, langsam zurück – wie eine LED-Kette
      level[i] = target > level[i] ? target : level[i] + (target - level[i]) * (loud ? 0.18 : 0.1);
      const px = Math.max(STEP, Math.round((level[i] * max) / STEP) * STEP);
      if (px !== shown[i]) { bar.style.height = `${px}px`; shown[i] = px; }
    });
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
  return { get levels() { return level.slice(); } };
}

// Ausschlag: nur transform (scaleY um die Mitte), kein Layout pro Bild. Steil an, Ausklang zeitbasiert (unabhängig von der Bildrate).
const FALL = 0.14; // s, Zeitkonstante Ausklang beim Spielen
const BACK = 0.22; // s, Rückkehr in die Grundform
const FLOOR = 0.12; // kleinster Ausschlag

function mountMark(engine, root, name, idle) {
  root.dataset.mark = name;
  root.replaceChildren(...idle.map(() => document.createElement('i')));
  const bars = [...root.children];
  const level = idle.slice();
  const shown = bars.map(() => -1);
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  let last = 0;
  function frame(now) {
    const dt = last ? Math.min(0.1, (now - last) / 1000) : 0;
    last = now;
    const bands = engine.outputBands(bars.length);
    const loud = !!bands && bands.some((v) => v > 0.04);
    root.classList.toggle('live', loud);
    // Weniger Bewegung: Zeichen bleibt in der Grundform, es leuchtet nur auf
    const move = loud && !reduced.matches;
    const k = reduced.matches ? 1 : 1 - Math.exp(-dt / (move ? FALL : BACK));
    bars.forEach((bar, i) => {
      // Pegel je Band, gewichtet mit der Grundform: der Klatscher bleibt erkennbar, schlägt aber mit dem Ton aus
      const target = move ? Math.max(FLOOR, Math.min(1, bands[i] * (0.5 + idle[i]) * 1.6)) : idle[i];
      level[i] = target > level[i] && move ? target : level[i] + (target - level[i]) * k;
      if (Math.abs(level[i] - idle[i]) < 0.002 && !move) level[i] = idle[i];
      const s = Math.round(level[i] * 1000) / 1000;
      if (s !== shown[i]) { bar.style.transform = `scaleY(${s})`; shown[i] = s; }
    });
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
  return { get levels() { return level.slice(); } };
}
