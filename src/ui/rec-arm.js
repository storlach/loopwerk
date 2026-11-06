// Mehrspur-Aufnahme (Spec 2.13 C): Schalter ● Scharf und Eingang Auto · Links · Rechts · Stereo.
// Scharf ist UI-Zustand (ui.recTracks), der Eingang steht an der Spur (track.recInput, ein Rückgängig-Schritt über
// setTrack). Ein 1-Kanal-Gerät sperrt Rechts und Stereo. Genutzt im Inspektor „Spur“ und im Feld „Aufnahme“.

import { el } from '../util.js';
import { loadDevice, resolveInputs, INPUT_LABELS } from '../rec-settings.js';

const CHOICES = [['', 'Auto'], ['L', 'Links'], ['R', 'Rechts'], ['LR', 'Stereo']];

// Eingangswahl für eine Spur; update(track) zeichnet Zustand, Sperren und was „Auto“ gerade bedeutet
export function mountInputPicker({ store, ui, recorder, idPrefix }) {
  const box = el('div', 'recin-btns');
  box.setAttribute('role', 'group');
  box.setAttribute('aria-label', 'Eingang der Aufnahme');
  const keys = CHOICES.map(([v, label]) => {
    const b = el('button', 'key', label);
    b.type = 'button';
    b.dataset.input = v;
    b.id = `${idPrefix}-${v || 'auto'}`;
    box.append(b);
    return b;
  });
  let trackId = null;
  box.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-input]');
    if (!b || b.disabled || !trackId) return;
    const v = b.dataset.input || undefined;
    if ((store.track(trackId)?.recInput ?? undefined) !== v) store.setTrack(trackId, { recInput: v });
  });
  function update(track) {
    trackId = track?.id ?? null;
    if (!track) return;
    const ch = loadDevice().channels;
    const mono = ch === 1;
    const busy = !!recorder && recorder.state !== 'idle';
    const armed = ui.recTracks.map((id) => store.track(id)).filter(Boolean);
    const auto = resolveInputs(armed.map((t) => ({ trackId: t.id, input: null })), ch ?? 2).find((t) => t.trackId === track.id)?.input;
    for (const b of keys) {
      const v = b.dataset.input;
      b.setAttribute('aria-pressed', String((track.recInput ?? '') === v));
      const locked = mono && (v === 'R' || v === 'LR');
      b.disabled = locked || busy;
      b.title = locked ? 'Eingang hat nur einen Kanal' : v ? `Eingang ${INPUT_LABELS[v]}` : `Auto: jetzt ${mono ? 'Mono' : INPUT_LABELS[auto] ?? 'Stereo'}`;
    }
  }
  return { el: box, update };
}

// Inspektor „Spur“: Zeile „Aufnahme ● Scharf“, darunter bei scharfer Spur „Eingang …“
export function mountRecArmRows({ store, ui, recArm, recorder }) {
  const armRow = el('div', 'insp-row insp-arm');
  armRow.id = 'insp-arm-row';
  const arm = el('button', 'key arm-btn');
  arm.type = 'button';
  arm.id = 'insp-rec-arm';
  arm.append(el('span', 'arm-dot'), el('span', null, 'Scharf'));
  arm.title = 'Die nächste Aufnahme (●) landet auch auf dieser Spur (Umschalt+R)';
  arm.setAttribute('aria-label', 'Für Aufnahme scharf');
  armRow.append(el('span', null, 'Aufnahme'), arm);
  const inRow = el('div', 'insp-row insp-recin');
  inRow.id = 'insp-recin-row';
  const picker = mountInputPicker({ store, ui, recorder, idPrefix: 'insp-recin' });
  inRow.append(el('span', null, 'Eingang'), picker.el);

  let trackId = null;
  arm.addEventListener('click', () => { if (trackId) recArm.toggle(trackId); });
  // track: gezeigte Spur oder null (Zeilen aus)
  function update(track) {
    trackId = track?.id ?? null;
    armRow.hidden = !track;
    const on = !!track && ui.recTracks.includes(track.id);
    inRow.hidden = !on;
    arm.setAttribute('aria-pressed', String(on));
    if (on) picker.update(track);
  }
  recorder?.on((what) => { if (what === 'device' || what === 'state') update(trackId ? store.track(trackId) : null); });
  return { rows: [armRow, inRow], update };
}

// Feld „Aufnahme“: die scharfen Spuren mit ihrem Eingang (Überblick vor dem ●, am Handy der Ort für den Eingang)
export function mountArmedList({ store, ui, recArm, recorder }) {
  const box = el('div', 'rs-armed');
  box.id = 'rs-armed';
  box.hidden = true;
  const rows = new Map(); // trackId → { row, name, picker }
  function update() {
    const armed = ui.recTracks.map((id) => store.track(id)).filter(Boolean);
    box.hidden = !armed.length;
    for (const [id, r] of rows) if (!armed.some((t) => t.id === id)) { r.row.remove(); rows.delete(id); }
    armed.forEach((t, i) => {
      let r = rows.get(t.id);
      if (!r) {
        const row = el('div', 'rs-row rs-armed-row');
        row.dataset.trackId = t.id;
        const name = el('span', 'rs-track');
        const off = el('button', 'key rs-disarm', '×');
        off.type = 'button';
        off.addEventListener('click', () => recArm.toggle(t.id));
        const picker = mountInputPicker({ store, ui, recorder, idPrefix: `rs-recin-${t.id}` });
        row.append(name, off, picker.el);
        r = { row, name, picker, off };
        rows.set(t.id, r);
      }
      r.name.textContent = t.name;
      r.name.title = t.name;
      r.off.title = `„${t.name}“ nicht mehr scharf`;
      r.off.setAttribute('aria-label', r.off.title);
      r.picker.update(t);
      if (box.children[i] !== r.row) box.insertBefore(r.row, box.children[i] || null);
    });
  }
  ui.on(update);
  store.on(update);
  recorder?.on((what) => { if (what === 'device' || what === 'state') update(); });
  update();
  return { el: box, update };
}
