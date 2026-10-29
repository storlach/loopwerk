// Arranger: Spurköpfe links, Taktraster rechts. Clips verschieben, kürzen, verlängern, kopieren (Alt/Strg),
// Lautstärke und Fades direkt am Clip über Griffe auf der Hüllkurve.

import { clipEnvelope, clipGain, clipSegments, totalBeats, MAX_TRACKS } from '../model.js';
import { clamp, el, trackPointer } from '../util.js';

// Breite der Spurköpfe; auf schmalen Bildschirmen schmaler, damit mehr Raster sichtbar bleibt.
const narrow = window.matchMedia('(max-width: 760px)');
const headW = () => (narrow.matches ? 124 : 176);
const WAVE_TOP = 17; // Abstand der Wellenform vom Clip-Oberrand (Platz für den Namen)

export const formatDb = (g) => (g <= 0.0001 ? '−∞ dB' : `${(20 * Math.log10(g)).toFixed(1).replace('.', ',').replace('-', '−')} dB`);
const formatBeats = (b) => `${(Math.round(b * 100) / 100).toString().replace('.', ',')} ${b === 1 ? 'Schlag' : 'Schläge'}`;

export function mountArranger({ root, store, engine, library, ui }) {
  root.innerHTML = '';
  const grid = el('div', 'arr-grid');
  const rulerRow = el('div', 'ruler-row');
  const corner = el('div', 'corner');
  corner.append(el('span', null, 'Takt'));
  const ruler = el('div', 'ruler');
  const marks = el('div', 'ruler-marks');
  const loopBand = el('div', 'loop-band');
  ruler.append(loopBand, marks);
  rulerRow.append(corner, ruler);
  const rowsEl = el('div', 'rows');
  const addRow = el('div', 'add-row');
  const addBtn = el('button', 'add-track', '+ Spur');
  addBtn.type = 'button';
  addBtn.id = 'add-track';
  addBtn.title = 'Neue Spur hinzufügen';
  addRow.append(addBtn);
  const loopShade = el('div', 'loop-shade');
  const playhead = el('div', 'playhead');
  grid.append(rulerRow, rowsEl, addRow, loopShade, playhead);
  root.append(grid);

  const rows = new Map();
  const dropPreview = el('div', 'drop-preview');
  let marksKey = '';

  const ppb = () => ui.pxPerBeat;
  const snap = (b) => Math.round(b / ui.snapBeats) * ui.snapBeats;

  addBtn.addEventListener('click', () => {
    const id = store.addTrack();
    if (id) requestAnimationFrame(() => rows.get(id)?.row.scrollIntoView({ block: 'nearest' }));
  });

  // ---------- Spuren ----------

  function makeRow(track) {
    const row = el('div', 'track-row');
    const head = el('div', 'track-head');
    const top = el('div', 'track-top');
    const name = el('div', 'track-name');
    name.title = 'Doppelklick zum Umbenennen';
    const del = el('button', 'tbtn tbtn-del', '×');
    del.type = 'button';
    del.title = 'Spur löschen';
    top.append(name, del);
    const btns = el('div', 'track-btns');
    const mute = el('button', 'tbtn tbtn-mute', 'M');
    mute.type = 'button';
    mute.title = 'Stumm';
    const solo = el('button', 'tbtn tbtn-solo', 'S');
    solo.type = 'button';
    solo.title = 'Solo';
    const vol = document.createElement('input');
    vol.type = 'range';
    vol.min = '0';
    vol.max = '1';
    vol.step = '0.01';
    vol.className = 'track-vol';
    vol.id = `vol-${track.id}`;
    btns.append(mute, solo, vol);
    head.append(top, btns);
    const lane = el('div', 'lane');
    lane.dataset.trackId = track.id;
    row.append(head, lane);

    mute.addEventListener('click', () => { const t = store.track(track.id); store.setTrack(t.id, { mute: !t.mute }); });
    solo.addEventListener('click', () => { const t = store.track(track.id); store.setTrack(t.id, { solo: !t.solo }); });
    vol.addEventListener('input', () => store.setTrack(track.id, { volume: Number(vol.value) }, 'vol-' + track.id));
    name.addEventListener('dblclick', () => startRename(track.id));
    // Doppelklick gibt es am Finger nicht: dort genügt einmal Antippen
    name.addEventListener('click', (e) => { if (e.pointerType === 'touch') startRename(track.id); });

    // Löschen mit Bestätigung im Button selbst
    let armed = null;
    del.addEventListener('click', () => {
      if (armed) { clearTimeout(armed); armed = null; store.removeTrack(track.id); return; }
      del.classList.add('confirm');
      del.textContent = '?';
      del.title = 'Nochmal klicken zum Löschen';
      armed = setTimeout(() => { armed = null; del.classList.remove('confirm'); del.textContent = '×'; del.title = 'Spur löschen'; }, 3000);
    });

    const r = { row, name, top, del, mute, solo, vol, lane };
    rows.set(track.id, r);
    return r;
  }

  function startRename(trackId) {
    const r = rows.get(trackId);
    if (!r || r.top.querySelector('input')) return;
    const input = document.createElement('input');
    input.className = 'track-name-input';
    input.id = `name-${trackId}`;
    input.maxLength = 32;
    input.value = store.track(trackId).name;
    input.setAttribute('aria-label', 'Spurname');
    r.name.hidden = true;
    r.top.prepend(input);
    input.focus();
    input.select();
    let done = false;
    const finish = (save) => {
      if (done) return;
      done = true;
      const value = input.value.trim();
      input.remove();
      r.name.hidden = false;
      if (save && value && value !== store.track(trackId)?.name) store.setTrack(trackId, { name: value });
    };
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); finish(true); }
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); finish(false); }
    });
    input.addEventListener('blur', () => finish(true));
  }

  function syncRows() {
    const tracks = store.project.tracks;
    const ids = new Set(tracks.map((t) => t.id));
    for (const [id, r] of rows) if (!ids.has(id)) { r.row.remove(); rows.delete(id); }
    const anySolo = tracks.some((x) => x.solo);
    tracks.forEach((t, i) => {
      const r = rows.get(t.id) || makeRow(t);
      // Nur umhängen, wenn nötig – sonst verliert ein gerade gezogener Regler den Fokus.
      if (rowsEl.children[i] !== r.row) rowsEl.insertBefore(r.row, rowsEl.children[i] || null);
      r.name.textContent = t.name;
      r.mute.setAttribute('aria-pressed', String(t.mute));
      r.solo.setAttribute('aria-pressed', String(t.solo));
      r.vol.setAttribute('aria-label', `Lautstärke ${t.name}`);
      r.del.setAttribute('aria-label', `Spur ${t.name} löschen`);
      r.del.disabled = tracks.length <= 1;
      if (document.activeElement !== r.vol) r.vol.value = String(t.volume);
      r.row.classList.toggle('silent', t.mute || (anySolo && !t.solo));
    });
    addRow.hidden = tracks.length >= MAX_TRACKS;
  }

  // ---------- Clips ----------

  // Wellenform, skaliert mit der Hüllkurve; darüber die Hüllkurve als Linie.
  function drawWave(canvas, clip, sample) {
    const w = Math.max(1, Math.round(clip.lengthBeats * ppb()));
    const h = canvas.clientHeight || 30;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    canvas.style.width = w + 'px';
    const c = canvas.getContext('2d');
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.clearRect(0, 0, w, h);
    const color = getComputedStyle(canvas).getPropertyValue('--wave').trim() || '#888';
    c.fillStyle = color;
    const peaks = sample.peaks;
    const perBeat = peaks.length / sample.lengthBeats;
    const mid = h / 2;
    const off = clip.offsetBeats || 0;
    for (let x = 0; x < w; x++) {
      const b0 = off + x / ppb();
      let m = 0;
      const k0 = Math.floor(b0 * perBeat);
      const k1 = Math.max(k0 + 1, Math.ceil((b0 + 1 / ppb()) * perBeat));
      for (let k = k0; k < k1; k++) m = Math.max(m, peaks[k % peaks.length]);
      const env = clipEnvelope(clip, (x + 0.5) / ppb());
      const a = Math.max(0.5, Math.min(mid, (m / 0.62) * mid * env));
      c.fillRect(x, mid - a, 1, a * 2);
    }
    // Markierung, wo das Sample von vorn beginnt
    c.globalAlpha = 0.55;
    for (const seg of clipSegments(clip, sample.lengthBeats).slice(1)) {
      c.fillRect(Math.round((seg.start - clip.startBeat) * ppb()), 0, 1, h);
    }
    // Hüllkurve nur zeigen, wenn sie etwas verändert
    if (clipGain(clip) < 1 || clip.fadeInBeats || clip.fadeOutBeats) {
      c.globalAlpha = 0.9;
      c.strokeStyle = color;
      c.lineWidth = 1.5;
      c.beginPath();
      const L = clip.lengthBeats;
      const pts = [0, clip.fadeInBeats || 0, L - (clip.fadeOutBeats || 0), L];
      pts.forEach((x, i) => {
        const y = envY(clipEnvelope(clip, Math.min(L, Math.max(0, x))), h);
        if (i === 0) c.moveTo(x * ppb(), y); else c.lineTo(x * ppb(), y);
      });
      c.stroke();
    }
    c.globalAlpha = 1;
  }

  const envY = (v, h) => 1 + (1 - v) * (h - 2);

  // Griffe sitzen auf der Hüllkurve: Fade-In-Ende, Mitte (Lautstärke), Fade-Out-Anfang.
  function placeHandles(node, clip) {
    const h = (node.querySelector('canvas')?.clientHeight || 30);
    const y = WAVE_TOP + envY(clipGain(clip), h) - 5;
    const L = clip.lengthBeats * ppb();
    const fi = (clip.fadeInBeats || 0) * ppb();
    const fo = (clip.fadeOutBeats || 0) * ppb();
    const set = (cls, x) => { const n = node.querySelector(cls); n.style.left = x - 5.5 + 'px'; n.style.top = y - 0.5 + 'px'; };
    set('.clip-fade-in', clamp(fi, 5, L - 5));
    set('.clip-fade-out', clamp(L - fo, 5, L - 5));
    set('.clip-vol', L / 2);
  }

  function makeClip(clip) {
    const sample = library.get(clip.sampleId);
    const node = el('div', `clip cat-${sample?.category ?? 'fx'}`);
    node.dataset.clipId = clip.id;
    node.style.left = clip.startBeat * ppb() + 'px';
    node.style.width = clip.lengthBeats * ppb() + 'px';
    node.classList.toggle('selected', ui.selectedClipId === clip.id);
    const label = el('span', 'clip-label', sample?.name ?? 'Fehlendes Sample');
    const canvas = el('canvas', 'clip-wave');
    const trim = el('div', 'clip-trim');
    trim.title = 'Ziehen zum Kürzen';
    const handle = el('div', 'clip-handle');
    handle.title = 'Ziehen zum Verlängern';
    const fadeIn = el('div', 'clip-grip clip-fade-in');
    fadeIn.title = 'Fade-In: nach rechts ziehen';
    const fadeOut = el('div', 'clip-grip clip-fade-out');
    fadeOut.title = 'Fade-Out: nach links ziehen';
    const vol = el('div', 'clip-grip clip-vol');
    vol.title = 'Lautstärke: nach unten ziehen';
    node.append(canvas, label, trim, handle, fadeIn, fadeOut, vol);
    return { node, canvas, sample };
  }

  function renderLane(r, track) {
    for (const n of r.lane.querySelectorAll('.clip')) n.remove();
    for (const clip of track.clips) {
      const { node, canvas, sample } = makeClip(clip);
      r.lane.append(node);
      if (sample) drawWave(canvas, clip, sample);
      placeHandles(node, clip);
    }
  }

  // ---------- Lineal und Loop ----------

  function renderRuler() {
    const p = store.project;
    const key = `${ppb()}|${p.lengthBars}|${p.beatsPerBar}`;
    if (key === marksKey) return;
    marksKey = key;
    marks.innerHTML = '';
    for (let bar = 0; bar < p.lengthBars; bar++) {
      const m = el('span', 'bar-mark', String(bar + 1));
      m.style.left = bar * p.beatsPerBar * ppb() + 'px';
      marks.append(m);
    }
  }

  function showLoop(startBeat, endBeat, on) {
    for (const n of [loopBand, loopShade]) {
      n.style.left = (n === loopShade ? headW() : 0) + startBeat * ppb() + 'px';
      n.style.width = (endBeat - startBeat) * ppb() + 'px';
      n.classList.toggle('off', !on);
    }
  }

  function render() {
    const p = store.project;
    grid.style.setProperty('--ppb', ppb() + 'px');
    grid.style.setProperty('--bar', ppb() * p.beatsPerBar + 'px');
    grid.style.setProperty('--head-w', headW() + 'px');
    grid.style.width = headW() + totalBeats(p) * ppb() + 'px';
    renderRuler();
    syncRows();
    for (const t of p.tracks) renderLane(rows.get(t.id), t);
    if (ui.selectedClipId && !store.findClip(ui.selectedClipId)) ui.select(null);
    showLoop(p.loop.startBeat, p.loop.endBeat, p.loop.on);
    setPlayhead(engine.currentBeat());
  }

  function setPlayhead(beat) {
    const x = headW() + beat * ppb();
    playhead.style.transform = `translateX(${x}px)`;
    if (engine.playing) {
      const view = root.clientWidth;
      if (x > root.scrollLeft + view - 40 || x < root.scrollLeft + headW()) root.scrollLeft = x - headW() - 24;
    }
  }

  // ---------- Zeiger-Interaktionen ----------

  const laneAt = (x, y) => document.elementFromPoint(x, y)?.closest('.lane');

  function select(clipId) {
    ui.select(clipId);
    for (const n of root.querySelectorAll('.clip')) n.classList.toggle('selected', n.dataset.clipId === clipId);
  }

  // Gemeinsamer Rahmen für alle Griff-Bewegungen: Vorschau beim Ziehen, eine Store-Aktion beim Loslassen.
  function dragClip(e, node, { preview, commit }) {
    const found = store.findClip(node.dataset.clipId);
    if (!found) return;
    const { clip } = found;
    const sample = library.get(clip.sampleId);
    const canvas = node.querySelector('canvas');
    select(clip.id);
    node.classList.add('editing');
    let result = null;
    trackPointer(e, (ev) => {
      result = preview(clip, ev.clientX - e.clientX, ev.clientY - e.clientY, ev);
      if (!result) return;
      const temp = { ...clip, ...result.clip };
      if (result.left != null) node.style.left = result.left * ppb() + 'px';
      node.style.width = temp.lengthBeats * ppb() + 'px';
      if (sample) drawWave(canvas, temp, sample);
      placeHandles(node, temp);
      ui.status(result.status);
    }, () => {
      node.classList.remove('editing');
      ui.status(null);
      if (result) commit(clip, result.clip);
    }, () => { node.classList.remove('editing'); ui.status(null); render(); });
  }

  function startMove(e, node) {
    const found = store.findClip(node.dataset.clipId);
    if (!found) return;
    const { clip, track } = found;
    const total = totalBeats(store.project);
    select(clip.id);
    const sx = e.clientX;
    const sy = e.clientY;
    let moved = false;
    let newStart = clip.startBeat;
    trackPointer(e, (ev) => {
      if (!moved && Math.hypot(ev.clientX - sx, ev.clientY - sy) < 4) return;
      moved = true;
      node.classList.add('dragging');
      node.classList.toggle('copying', ev.altKey || ev.ctrlKey || ev.metaKey);
      newStart = clamp(snap(clip.startBeat + (ev.clientX - sx) / ppb()), 0, Math.max(0, total - clip.lengthBeats));
      node.style.left = newStart * ppb() + 'px';
      const lane = laneAt(ev.clientX, ev.clientY);
      if (lane && lane !== node.parentElement) lane.append(node);
    }, (ev) => {
      node.classList.remove('dragging', 'copying');
      if (!moved) return;
      const targetId = node.parentElement.dataset.trackId;
      const copy = ev.altKey || ev.ctrlKey || ev.metaKey;
      if (!copy && targetId === track.id && newStart === clip.startBeat) { render(); return; }
      const id = store.moveClip(clip.id, targetId, newStart, { copy });
      select(id);
    }, () => render());
  }

  function startResize(e, node) {
    const total = totalBeats(store.project);
    dragClip(e, node, {
      preview: (clip, dx) => {
        const len = clamp(Math.max(ui.snapBeats, snap(clip.lengthBeats + dx / ppb())), ui.snapBeats, total - clip.startBeat);
        return { clip: { lengthBeats: len }, status: `Länge: ${formatBeats(len)}` };
      },
      commit: (clip, r) => { if (r.lengthBeats !== clip.lengthBeats) store.resizeClip(clip.id, r.lengthBeats); else render(); },
    });
  }

  function startTrim(e, node) {
    dragClip(e, node, {
      preview: (clip, dx) => {
        const end = clip.startBeat + clip.lengthBeats;
        const start = clamp(snap(clip.startBeat + dx / ppb()), 0, end - ui.snapBeats);
        const sb = library.get(clip.sampleId)?.lengthBeats ?? 4;
        const offsetBeats = ((((clip.offsetBeats || 0) + start - clip.startBeat) % sb) + sb) % sb;
        return { clip: { startBeat: start, lengthBeats: end - start, offsetBeats }, left: start, status: `Anfang: Takt ${Math.floor(start / 4) + 1}, Schlag ${Math.floor(start % 4) + 1}` };
      },
      commit: (clip, r) => { if (r.startBeat !== clip.startBeat) store.trimClipStart(clip.id, r.startBeat); else render(); },
    });
  }

  function startFade(e, node, which) {
    dragClip(e, node, {
      preview: (clip, dx, dy, ev) => {
        const step = ev.shiftKey ? 1 / 32 : 0.25;
        const key = which === 'in' ? 'fadeInBeats' : 'fadeOutBeats';
        const other = which === 'in' ? clip.fadeOutBeats || 0 : clip.fadeInBeats || 0;
        const raw = (clip[key] || 0) + (which === 'in' ? dx : -dx) / ppb();
        const v = clamp(Math.round(raw / step) * step, 0, clip.lengthBeats - other);
        return { clip: { [key]: v }, status: `${which === 'in' ? 'Fade-In' : 'Fade-Out'}: ${formatBeats(v)}` };
      },
      commit: (clip, r) => store.setClip(clip.id, r),
    });
  }

  function startVol(e, node) {
    const h = node.querySelector('canvas')?.clientHeight || 30;
    dragClip(e, node, {
      preview: (clip, dx, dy) => {
        const g = clamp(Math.round((clipGain(clip) - dy / (h - 2)) * 100) / 100, 0, 1);
        return { clip: { gain: g }, status: `Clip-Lautstärke: ${formatDb(g)}` };
      },
      commit: (clip, r) => store.setClip(clip.id, r),
    });
  }

  function startRuler(e) {
    const p = store.project;
    const total = totalBeats(p);
    const bpb = p.beatsPerBar;
    const rect = ruler.getBoundingClientRect();
    const barAt = (x) => clamp(Math.floor((x - rect.left) / ppb() / bpb) * bpb, 0, total - bpb);
    const b0 = barAt(e.clientX);
    let region = null;
    trackPointer(e, (ev) => {
      if (!region && Math.abs(ev.clientX - e.clientX) < 6) return;
      const b = barAt(ev.clientX);
      region = { start: Math.min(b0, b), end: Math.max(b0, b) + bpb };
      showLoop(region.start, region.end, true);
    }, () => {
      if (region) store.setLoop({ on: true, startBeat: region.start, endBeat: region.end });
      else engine.setPosition(b0);
    }, () => render());
  }

  function laneClick(e, lane) {
    if (!ui.armedSampleId) { select(null); return; }
    const sample = library.get(ui.armedSampleId);
    const rect = lane.getBoundingClientRect();
    const beat = Math.floor((e.clientX - rect.left) / ppb() / ui.snapBeats) * ui.snapBeats;
    const id = store.addClip(lane.dataset.trackId, sample.id, beat, sample.lengthBeats);
    select(id);
  }

  root.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    const t = e.target;
    const clip = t.closest('.clip');
    if (clip) {
      e.preventDefault();
      // Finger: ein nicht ausgewählter Clip wird nur ausgewählt, damit Wischen scrollt statt verschiebt
      if (e.pointerType === 'touch' && ui.selectedClipId !== clip.dataset.clipId) {
        trackPointer(e, () => {}, () => select(clip.dataset.clipId));
        return;
      }
      if (t.closest('.clip-fade-in')) startFade(e, clip, 'in');
      else if (t.closest('.clip-fade-out')) startFade(e, clip, 'out');
      else if (t.closest('.clip-vol')) startVol(e, clip);
      else if (t.closest('.clip-trim')) startTrim(e, clip);
      else if (t.closest('.clip-handle')) startResize(e, clip);
      else startMove(e, clip);
      return;
    }
    if (t.closest('.ruler')) { startRuler(e); return; }
    const lane = t.closest('.lane');
    if (lane) laneClick(e, lane);
  });

  // ---------- Ablegen aus dem Sound-Regal ----------

  function dropTargetAt(x, y, sample) {
    const lane = laneAt(x, y);
    if (!lane) { clearDropPreview(); return null; }
    const total = totalBeats(store.project);
    const rect = lane.getBoundingClientRect();
    const startBeat = clamp(Math.floor((x - rect.left) / ppb() / ui.snapBeats) * ui.snapBeats, 0, total - ui.snapBeats);
    dropPreview.className = `drop-preview cat-${sample.category}`;
    dropPreview.style.left = startBeat * ppb() + 'px';
    dropPreview.style.width = Math.min(sample.lengthBeats, total - startBeat) * ppb() + 'px';
    if (dropPreview.parentElement !== lane) lane.append(dropPreview);
    return { trackId: lane.dataset.trackId, startBeat };
  }

  function clearDropPreview() { dropPreview.remove(); }

  store.on(render);
  narrow.addEventListener('change', render);
  render();
  return { render, setPlayhead, dropTargetAt, clearDropPreview, select };
}
