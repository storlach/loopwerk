// Splash-Screen beim Start: Logo, Fortschrittsbalken und der aktuelle Schritt. Blendet sich am Ende aus.

export function createSplash(root = document.getElementById('boot')) {
  const fill = root.querySelector('#boot-fill');
  const bar = root.querySelector('[role="progressbar"]');
  const step = root.querySelector('#boot-step');
  const pct = root.querySelector('#boot-pct');
  let shown = 0;
  return {
    // p: 0…1 (geht nie zurück), text: was gerade passiert
    set(p, text) {
      shown = Math.max(shown, Math.min(1, p));
      const v = Math.round(shown * 100);
      fill.style.width = `${v}%`;
      bar.setAttribute('aria-valuenow', String(v));
      pct.textContent = `${v} %`;
      if (text) step.textContent = text;
    },
    done() {
      this.set(1, 'Fertig – viel Spaß!');
      root.classList.add('done');
      root.setAttribute('aria-busy', 'false');
      setTimeout(() => { root.hidden = true; }, 500);
    },
    fail(message) {
      root.classList.add('error');
      step.textContent = message;
      pct.textContent = '';
    },
  };
}
