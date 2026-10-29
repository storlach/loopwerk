// Arranger: Spurköpfe links, Taktraster rechts. Clips verschieben, verlängern, kopieren (Alt/Strg).

import { clipSegments, totalBeats } from '../model.js';
import { clamp, el, trackPointer } from '../util.js';

// Breite der Spurköpfe; auf schmalen Bildschirmen schmaler, damit mehr Raster sichtbar bleibt.
const narrow = window.matchMedia('(max-width: 760px)');
const headW = () => (narrow.matches ? 124 : 176);

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
  const loopShade = el('div', 'loop-shade');
  const playhead = el('div', 'playhead');
  grid.append(rulerRow, rowsEl, loopShade, playhead);
  root.append(grid);

  const rows = new Map();
  const dropPreview = el('div', 'drop-preview');
  let marksKey = '';

  const ppb = () => ui.pxPerBeat;
  const snap = (b) => Math.round(b / ui.snapBeats) * ui.snapBeats;

  // ---------- Spuren ----------

  function makeRow(track) {
    const row = el('div', 'track-row');
    const head = el('div', 'track-head');
    const name = el('div', 'track-name');
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
    head.append(name, btns);
    const lane = el('div', 'lane');
    lane.dataset.trackId = track.id;
    row.append(head, lane);

    mute.addEventListener('click', () => { const t = store.track(track.id); store.setTrack(t.id, { mute: !t.mute }); });
    solo.addEventListener('click', () => { const t = store.track(track.id); store.setTrack(t.id, { solo: !t.solo }); });
    vol.addEventListener('input', () => store.setTrack(track.id, { volume: Number(vol.value) }, 'vol-' + track.id));

    const r = { row, name, mute, solo, vol, lane };
    rows.set(track.id, r);
    return r;
  }

  function syncRows() {
    const ids = new Set(store.project.tracks.map((t) => t.id));
    for (const [id, r] of rows) if (!ids.has(id)) { r.row.remove(); rows.delete(id); }
    store.project.tracks.forEach((t, i) => {
      const r = rows.get(t.id) || makeRow(t);
      // Nur umhängen, wenn nötig – sonst verliert ein gerade gezogener Regler den Fokus.
      if (rowsEl.children[i] !== r.row) rowsEl.insertBefore(r.row, rowsEl.children[i] || null);
      r.name.textContent = t.name;
      r.mute.setAttribute('aria-pressed', String(t.mute));
      r.solo.setAttribute('aria-pressed', String(t.solo));
      r.vol.setAttribute('aria-label', `Lautstärke ${t.name}`);
      if (document.activeElement !== r.vol) r.vol.value = String(t.volume);
      const anySolo = store.project.tracks.some((x) => x.solo);
      r.row.classList.toggle('silent', t.mute || (anySolo && !t.solo));
    });
  }

  // ---------- Clips ----------

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
    c.fillStyle = getComputedStyle(canvas).getPropertyValue('--wave').trim() || '#888';
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
      const a = Math.max(0.5, Math.min(mid, (m / 0.62) * mid));
      c.fillRect(x, mid - a, 1, a * 2);
    }
    // Markierung, wo das Sample von vorn beginnt
    c.globalAlpha = 0.55;
    for (const seg of clipSegments(clip, sample.lengthBeats).slice(1)) {
      c.fillRect(Math.round((seg.start - clip.startBeat) * ppb()), 0, 1, h);
    }
    c.globalAlpha = 1;
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
    const handle = el('div', 'clip-handle');
    handle.title = 'Ziehen zum Verlängern';
    node.append(canvas, label, handle);
    return { node, canvas, sample };
  }

  function renderLane(r, track) {
    for (const n of r.lane.querySelectorAll('.clip')) n.remove();
    for (const clip of track.clips) {
      const { node, canvas, sample } = makeClip(clip);
      r.lane.append(node);
      if (sample) drawWave(canvas, clip, sample);
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
    const found = store.findClip(node.dataset.clipId);
    if (!found) return;
    const { clip } = found;
    const sample = library.get(clip.sampleId);
    const total = totalBeats(store.project);
    const canvas = node.querySelector('canvas');
    select(clip.id);
    const sx = e.clientX;
    let newLen = clip.lengthBeats;
    trackPointer(e, (ev) => {
      const raw = clip.lengthBeats + (ev.clientX - sx) / ppb();
      newLen = clamp(Math.max(ui.snapBeats, snap(raw)), ui.snapBeats, total - clip.startBeat);
      node.style.width = newLen * ppb() + 'px';
      if (sample) drawWave(canvas, { ...clip, lengthBeats: newLen }, sample);
    }, () => {
      if (newLen !== clip.lengthBeats) store.resizeClip(clip.id, newLen);
    }, () => render());
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
    const handle = e.target.closest('.clip-handle');
    const clip = e.target.closest('.clip');
    if (handle) { e.preventDefault(); startResize(e, clip); return; }
    if (clip) { e.preventDefault(); startMove(e, clip); return; }
    if (e.target.closest('.ruler')) { startRuler(e); return; }
    const lane = e.target.closest('.lane');
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
  return { render, setPlayhead, dropTargetAt, clearDropPreview };
}
