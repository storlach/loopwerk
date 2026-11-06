// Block „Werkstatt“ am Ende der Song-Werkbank (Desktop) bzw. im Song-Fach (Handy), Spec krachwerk-3 §4/§5.
// Scheibe 3a: zuletzt gesichert · [Sichern] [Zurückholen]. Größe, frei und Papierkorb folgen mit Speicher v2 (3b).
// Erinnerung ans Sichern nur als Leuchtpunkt (#app[data-remind]): nicht dauerhaft gespeichert und seit der letzten
// Sicherung > 50 MB neu oder neue Sounds seit > 14 Tagen. Keine Einblender.

import { el } from '../util.js';
import { place } from './place.js';
import { shareOrSave } from './save-file.js';

const DAY = 86400e3;
const REMIND_BYTES = 50e6;
const REMIND_DAYS = 14;
const pad2 = (n) => String(n).padStart(2, '0');
const dateTag = (d = new Date()) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const shortDate = (t) => { const d = new Date(t); return `${pad2(d.getDate())}.${pad2(d.getMonth() + 1)}.`; };
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

// lastKey: localStorage-Schlüssel für { at, bytes, sounds } der letzten Sicherung (3b: kv.lastBackup)
// padsKey: Pad-Belegung, kommt mit in die Sicherung; places: { narrow, wide } Ziel-Container
export function mountStoragePanel({ own, store, ui, library, io, appName = 'Krachwerk', lastKey, padsKey = null, places }) {
  const app = document.getElementById('app');
  const box = el('div', 'insp-grp wk');
  box.id = 'werkstatt';
  box.setAttribute('role', 'group');
  box.setAttribute('aria-label', 'Werkstatt');
  const last = el('p', 'wk-last');
  last.id = 'wk-last';
  const btn = (id, text, title) => { const b = el('button', 'key wk-btn', text); b.type = 'button'; b.id = id; b.title = title; return b; };
  const save = btn('wk-save', 'Sichern', 'Alle eigenen Sounds, den Song und die Pads als eine ZIP-Datei sichern');
  const restore = btn('wk-restore', 'Zurückholen', 'Eine Sicherung oder Song-ZIP zurückholen – vorhandene Sounds werden nie überschrieben');
  const row = el('div', 'wk-btns');
  row.append(save, restore);
  box.append(el('p', 'insp-sub', 'Werkstatt'), last, row);
  places.wide.append(box);
  place(box, { calm: { narrow: places.narrow, wide: places.wide } });

  const readLast = () => { try { return JSON.parse(localStorage.getItem(lastKey) || 'null'); } catch { return null; } };
  let persisted = false;

  function paint() {
    const lb = readLast();
    last.replaceChildren(...(lb?.at ? [el('span', null, 'zuletzt gesichert '), el('span', 'wk-num', shortDate(lb.at))] : [el('span', null, 'noch nicht gesichert')]));
    // Neu seit der letzten Sicherung: eigene Sounds mit Audio (keine Varianten), jünger als die Sicherung
    const since = lb?.at ?? 0;
    const fresh = library.list().filter((s) => s.category === 'own' && !s.missing && !s.parentId && /^(own|mk)-/.test(s.id) && (s.created ?? 0) > since);
    const bytes = fresh.reduce((n, s) => n + (s.bytes ?? 0), 0);
    // Seit der letzten Sicherung; ohne Sicherung seit dem ältesten ungesicherten Sound
    const oldest = fresh.reduce((t, s) => Math.min(t, s.created ?? Infinity), Infinity);
    const waiting = fresh.length ? Date.now() - (lb?.at ?? oldest) : 0;
    const on = !persisted && (bytes > REMIND_BYTES || (fresh.length > 0 && waiting > REMIND_DAYS * DAY));
    app.toggleAttribute('data-remind', on);
  }

  async function refresh() {
    try { persisted = !!(await navigator.storage?.persisted?.()); } catch { persisted = false; }
    paint();
  }

  // Fortschritt als Weißglut-Linie unten am Knopf (--p 0…1); null = fertig
  const busy = (b, p) => {
    if (p == null) { b.removeAttribute('aria-busy'); b.style.removeProperty('--p'); return; }
    b.setAttribute('aria-busy', 'true');
    b.style.setProperty('--p', String(Math.max(0, Math.min(1, p))));
  };

  let job = null;
  save.addEventListener('click', async () => {
    if (job) { job.abort(); return; } // erneutes Tippen bricht ab
    const ctl = new AbortController();
    job = ctl;
    busy(save, 0);
    save.textContent = 'Sichert …';
    save.setAttribute('aria-label', 'Sichern abbrechen');
    try {
      let pads;
      if (padsKey) { try { const raw = localStorage.getItem(padsKey); if (raw != null) { try { pads = JSON.parse(raw); } catch { pads = raw; } } } catch { /* ohne Pads */ } }
      const res = await own.exportArchive({ project: store.project, pads, app: appName, kind: 'werkstatt', signal: ctl.signal, onProgress: (d, n) => busy(save, n ? d / n : 1) });
      if (ctl.signal.aborted) throw Object.assign(new Error('abgebrochen'), { name: 'AbortError' });
      const out = await shareOrSave(`${appName}-Sicherung ${dateTag()}.zip`, res.blob, { title: `${appName}-Sicherung` });
      if (out.cancelled) return;
      try { localStorage.setItem(lastKey, JSON.stringify({ at: Date.now(), bytes: res.bytes, sounds: res.sounds })); } catch { /* Speicher nicht verfügbar */ }
      ui.flash(`Gesichert: ${plural(res.sounds, 'Sound', 'Sounds')} und „${store.project.name || 'Song'}“ in ${out.filename}.`);
    } catch (err) {
      if (err?.name === 'AbortError') ui.flash('Sichern abgebrochen.');
      else if (err?.code === 'declined') { /* abgelehnt */ }
      else ui.flash(err?.message === 'Zu groß für eine Datei.' ? 'Zu groß für eine Datei.' : `Sichern ging nicht (${err?.message || 'unbekannt'}).`);
    } finally {
      job = null;
      busy(save, null);
      save.textContent = 'Sichern';
      save.removeAttribute('aria-label');
      paint();
    }
  });

  restore.addEventListener('click', () => io.pick());
  io.onProgress((p) => busy(restore, p));

  library.on(paint);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
  refresh();
  return { el: box, refresh, paint };
}
