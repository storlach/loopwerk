// Festhalten und Sicherung (Krachwerk 3a, Spec docs/specs/krachwerk-3-festhalten.md §2): „Festhalten“ am Loop-Bereich im
// Lineal (Taste F), Fortschritt als Linie, Füllstand der Kiste, „Alle eigenen Sounds sichern“ und „Zurückholen“.
// Schreibt nur über freezeRange/store.freeze und über die Sicherung; die Knoten bleiben stehen (kein Ersetzen beim Bedienen).

import { el } from '../util.js';
import { freezeRange, freezePrefs } from '../freeze.js';
import { backupSounds, restoreSounds, backupName } from '../sound-backup.js';
import { saveFile } from './save-file.js';
import { narrow, place } from './place.js';

const MB = 1048576;
const ERRORS = {
  empty: 'Im Bereich klingt nichts – wähle einen Bereich mit Clips.',
  silent: 'Der Bereich ist still – nichts festgehalten.',
  tracks: 'Keine freie Spur – lösche erst eine Spur.',
};

export const fillText = ({ bytes, quota }) => {
  if (!bytes) return { text: '', full: false };
  const full = !!quota && bytes >= quota * 0.8;
  return { text: `Eigene: ${Math.max(1, Math.round(bytes / MB))} MB${full ? ' – fast voll' : ''}`, full };
};

export function mountFreeze({ store, engine, library, ui, own, arranger, appName = 'Krachwerk' }) {
  const scroll = document.getElementById('arr-scroll');
  const ruler = scroll.querySelector('.ruler');
  let busy = false;

  // ---------- Festhalten am Loop-Bereich ----------
  const btn = el('button', 'fz-btn', 'Festhalten');
  btn.type = 'button';
  btn.id = 'freeze-btn';
  btn.title = 'Den Bereich als neue Schleife festhalten (F)';
  btn.hidden = true;
  const prog = el('div', 'fz-prog');
  prog.hidden = true;
  ruler.append(btn, prog);
  // Zeiger nicht ans Lineal weiterreichen (sonst zöge die Berührung einen neuen Bereich auf)
  btn.addEventListener('pointerdown', (e) => e.stopPropagation());
  btn.addEventListener('click', () => run());

  function layoutBtn() {
    const { loop } = store.project;
    btn.hidden = !loop.on;
    if (!loop.on) { prog.hidden = true; return; }
    const ppb = ui.pxPerBeat;
    const from = loop.startBeat * ppb, to = loop.endBeat * ppb;
    const total = ruler.offsetWidth || to + 200;
    const w = btn.offsetWidth || 80;
    // Sichtbarer Teil des Lineals (rechts der Spurköpfe): der Knopf bleibt im Bild, auch wenn der Bereich darüber hinausreicht
    const sr = scroll.getBoundingClientRect(), rr = ruler.getBoundingClientRect();
    const corner = scroll.querySelector('.corner')?.offsetWidth ?? 0;
    const visLo = sr.left + corner - rr.left, visHi = sr.right - rr.left;
    // Rechts neben dem Bereich; passt es dort nicht, am (sichtbaren) rechten Rand des Bereichs
    let x = to + 6 + w <= Math.min(total, visHi) ? to + 6 : Math.min(to, visHi) - w - 6;
    x = Math.max(x, from);
    x = Math.max(visLo + 4, Math.min(x, visHi - w - 4));
    btn.style.left = `${Math.round(x)}px`;
    prog.style.left = `${Math.round(from)}px`;
    prog.style.setProperty('--fz-w', `${Math.round(to - from)}px`);
  }
  const setProgress = (f) => { prog.hidden = false; prog.style.setProperty('--fz-f', String(Math.max(0, Math.min(1, f)))); };

  async function run({ clipIds = null } = {}) {
    if (busy) return null;
    const { loop } = store.project;
    if (!clipIds && !loop.on) { ui.flash('Zieh im Lineal einen Bereich auf, dann „Festhalten“.'); return null; }
    busy = true;
    btn.disabled = true;
    btn.setAttribute('aria-busy', 'true');
    btn.textContent = 'Festhalten …';
    layoutBtn();
    if (!clipIds) setProgress(0);
    let res = null;
    try {
      res = await freezeRange({ store, library, own, fromBeat: loop.startBeat, toBeat: loop.endBeat, clipIds, onProgress: clipIds ? undefined : setProgress });
    } catch (err) {
      console.error(err);
      res = { error: 'failed' };
    }
    busy = false;
    btn.disabled = false;
    btn.removeAttribute('aria-busy');
    btn.textContent = 'Festhalten';
    prog.hidden = true;
    layoutBtn();
    if (res.error) { ui.flash(ERRORS[res.error] ?? 'Festhalten hat nicht geklappt.'); return res; }
    arranger.select(res.clipId);
    arranger.revealClip?.(res.clipId);
    if (narrow.matches) ui.setDock('werkbank');
    ui.flash(freezePrefs().mute ? 'Festgehalten – Quellen im Bereich stumm.' : 'Festgehalten.');
    return res;
  }

  store.on(layoutBtn);
  scroll.addEventListener('arr-layout', layoutBtn);
  scroll.addEventListener('scroll', layoutBtn, { passive: true });
  new ResizeObserver(layoutBtn).observe(ruler);
  layoutBtn();

  // Taste F: Mehrfachauswahl, sonst der Loop-Bereich (nicht im Pattern-Editor, dort spielen Tasten Töne)
  document.addEventListener('keydown', (e) => {
    const t = e.target;
    if ((t.tagName === 'INPUT' && t.type !== 'range') || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT') return;
    if (e.ctrlKey || e.metaKey || e.altKey || e.shiftKey || e.key.toLowerCase() !== 'f') return;
    if (ui.dock === 'pattern' || ui.dock === 'editor') return;
    if (!ui.multi.length && !store.project.loop.on) return;
    e.preventDefault();
    run(ui.multi.length > 1 ? { clipIds: ui.multi.slice() } : {});
  });

  // ---------- Füllstand in der Kiste ----------
  const fill = el('div', 'shelf-store');
  fill.id = 'shelf-store';
  fill.hidden = true;
  document.getElementById('library').after(fill);
  let fillTimer = 0;
  async function updateFill() {
    try {
      const u = await own.usage();
      const f = fillText(u);
      fill.textContent = f.text;
      fill.hidden = !f.text;
      fill.classList.toggle('full', f.full);
    } catch { /* ohne Speicher keine Zeile */ }
  }
  library.on(() => { clearTimeout(fillTimer); fillTimer = setTimeout(updateFill, 250); });
  updateFill();

  // ---------- Sichern und Zurückholen ----------
  const mk = (id, text, title) => {
    const b = el('button', 'key', text);
    b.type = 'button';
    b.id = id;
    b.title = title;
    return b;
  };
  const backupBtn = mk('backup-btn', 'Alle eigenen Sounds sichern', 'Alle eigenen Sounds als ZIP-Datei auf dem Gerät ablegen');
  const restoreBtn = mk('restore-btn', 'Sounds zurückholen', 'Eine Sicherung (ZIP) wieder in die Kiste holen – oder die Datei auf die Kiste ziehen');
  const input = document.createElement('input');
  Object.assign(input, { type: 'file', id: 'restore-input', accept: '.zip,application/zip', multiple: true, hidden: true });
  document.body.append(input);
  const slotN = document.getElementById('song-links');
  const slotW = document.getElementById('insp-song-tools');
  place(backupBtn, { calm: { narrow: slotN, wide: slotW } });
  place(restoreBtn, { calm: { narrow: slotN, wide: slotW } });

  let saving = false;
  async function backup() {
    if (saving) return;
    saving = true;
    backupBtn.disabled = true;
    ui.flash('Sicherung wird gepackt …');
    try {
      const parts = await backupSounds(own);
      if (!parts.length) { ui.flash('Es gibt noch keine eigenen Sounds zum Sichern.'); return; }
      const now = new Date();
      const files = parts.map((b, i) => new File([b], backupName(appName, now, i + 1, parts.length), { type: 'application/zip' }));
      let shared = false;
      if (narrow.matches && navigator.canShare?.({ files })) {
        try { await navigator.share({ files, title: `${appName}-Sounds` }); shared = true; } catch (err) { if (err?.name === 'AbortError') return; }
      }
      if (!shared) for (const f of files) await saveFile(f.name, f);
      ui.flash(parts.length > 1 ? `Gesichert in ${parts.length} Dateien.` : `Gesichert als ${files[0].name}.`);
    } catch (err) {
      if (err?.code !== 'declined') ui.flash('Sichern hat nicht geklappt.');
    } finally {
      saving = false;
      backupBtn.disabled = false;
    }
  }

  async function restore(files) {
    if (!files.length) return;
    ui.flash('Sounds werden zurückgeholt …');
    try {
      const r = await restoreSounds(own, files);
      const n = (k, one, many) => `${k} ${k === 1 ? one : many}`;
      const parts = [`${n(r.added, 'Sound', 'Sounds')} zurückgeholt`];
      if (r.skipped) parts.push(r.skipped === 1 ? '1 war schon da' : `${r.skipped} waren schon da`);
      if (r.failed) parts.push(r.failed === 1 ? '1 nicht lesbar' : `${r.failed} nicht lesbar`);
      ui.flash(`${parts.join(', ')}.`);
      updateFill();
    } catch {
      ui.flash('Das ist keine Sound-Sicherung von Krachwerk.');
    }
  }
  backupBtn.addEventListener('click', backup);
  restoreBtn.addEventListener('click', () => input.click());
  input.addEventListener('change', () => { const files = [...input.files]; input.value = ''; restore(files); });
  // ZIP auf die Kiste (oder irgendwohin) ziehen; Audiodateien bleiben beim Import
  const isZip = (f) => /\.zip$/i.test(f.name) || f.type === 'application/zip';
  const zipsIn = (e) => [...(e.dataTransfer?.files || [])].filter(isZip);
  document.addEventListener('drop', (e) => {
    const zips = zipsIn(e);
    if (!zips.length) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    document.getElementById('app').classList.remove('file-over');
    restore(zips);
  }, true);

  return { run, backup, restore, updateFill };
}
