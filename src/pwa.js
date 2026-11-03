// Krachwerk als App am Handy (nur unter /werkstatt/, die Adresse steht in EDITION.path): Service Worker für den Start ohne Netz und einmal der Tipp
// „Zum Home-Bildschirm“ in iPhone-Safari – iOS räumt Seiten-Speicher sonst nach Tagen ohne Besuch, Apps nicht.
// Dauerhaften Speicher erbittet own-sounds.js (askPersist) beim ersten eigenen Sound.

import { EDITION, lsKey } from './edition.js';

const TIP_KEY = lsKey('loopwerk.tips.home');
const standalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
const isIos = () => /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

export function mountPwa({ ui, recorder, own }) {
  const dir = EDITION.path; // Adresse nur aus EDITION.path
  if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol) && location.pathname.includes(`/${dir}/`)) {
    navigator.serviceWorker.register(`${dir}/sw.js`, { scope: `${dir}/` })
      .catch((err) => console.warn('Offline-Start nicht verfügbar:', err?.message || err));
  }
  const tip = () => {
    let seen = false;
    try { seen = localStorage.getItem(TIP_KEY) === '1'; } catch { /* ohne Speicher */ }
    if (seen || standalone() || !isIos()) return;
    try { localStorage.setItem(TIP_KEY, '1'); } catch { /* egal */ }
    ui.flash('Tipp: Teilen → „Zum Home-Bildschirm“ – dann bleiben deine Klänge sicher.');
  };
  recorder.on((what) => { if (what === 'recorded') setTimeout(tip, 2800); });
  return { tip, own };
}
