// Aufnahme-Einstellungen (Krachwerk, Reiter „Aufnahme“ der Song-Werkbank): Stopp nach Stille, Dauer der Stille, Säubern.
// Nur Vorlieben des Geräts, nicht Teil des Projekts.
import { lsKey } from './edition.js';

export const REC_DEFAULTS = { autoStop: true, silence: 1.2, clean: true };
const KEY = () => lsKey('loopwerk.recPrefs');

export function loadRecPrefs() {
  let p = {};
  try { p = JSON.parse(localStorage.getItem(KEY())) || {}; } catch { /* Standard */ }
  const silence = Number(p.silence);
  return {
    autoStop: p.autoStop !== false,
    silence: Number.isFinite(silence) ? Math.min(3, Math.max(0.5, silence)) : REC_DEFAULTS.silence,
    clean: p.clean !== false,
  };
}

export function saveRecPrefs(patch) {
  const next = { ...loadRecPrefs(), ...patch };
  try { localStorage.setItem(KEY(), JSON.stringify(next)); } catch { /* egal */ }
  return loadRecPrefs();
}
