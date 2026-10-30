// Bildmarke im Deck: die Balken zeigen live den Pegel von allem, was gerade klingt (Song, Vorhören, Pads, Klick).
// Ohne Ton steht das Logo in seiner Grundform. Höhen rasten auf ganze LED-Stufen ein.

const IDLE = [0.45, 0.75, 1, 0.6, 0.3];
const STEP = 3; // px je LED

export function mountBrandMeter(engine, root = document.getElementById('brand-bars')) {
  if (!root) return null;
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
