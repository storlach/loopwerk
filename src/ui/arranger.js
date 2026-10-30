// Arranger: Spurköpfe links, Taktraster rechts. Clips verschieben, kürzen, verlängern, kopieren (Alt/Strg),
// Lautstärke und Fades direkt am Clip über Griffe auf der Hüllkurve.

import { audibleRanges, clipEnvelope, clipGain, clipSegments, clipSignature, isAbove, sampleFor, totalBeats, MAX_TRACKS, EPS } from '../model.js';
import { clamp, el, trackPointer } from '../util.js';
import { makeKnob } from './knob.js';

// Breite der Spurköpfe; auf schmalen Bildschirmen schmaler, damit mehr Raster sichtbar bleibt.
const narrow = window.matchMedia('(max-width: 760px)');
const headW = () => (narrow.matches ? 124 : 176);
const WAVE_TOP = 17; // Abstand der Wellenform vom Clip-Oberrand (Platz für den Namen)

export const formatDb = (g) => (g <= 0.0001 ? '−∞ dB' : `${(20 * Math.log10(g)).toFixed(1).replace('.', ',').replace('-', '−')} dB`);
const formatBeats = (b) => `${(Math.round(b * 100) / 100).toString().replace('.', ',')} ${b === 1 ? 'Schlag' : 'Schläge'}`;
const formatPos = (b, bpb = 4) => `Takt ${Math.floor(b / bpb) + 1}, Schlag ${String(Math.round(((b % bpb) + 1) * 100) / 100).replace('.', ',')}`;

// „Frei“ (und Umschalt beim Ziehen) rastet in 1/64 Schlag – fein genug zum Hören, exakt als Gleitkommazahl.
export const FREE_STEP = 1 / 64;
export const MIN_PPB = 4;
export const MAX_PPB = 192;
const MAX_CANVAS = 16000; // Gerätepixel; größere Canvas-Flächen verweigert der Browser

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
  const step = (ev) => (ev?.shiftKey || !ui.snapBeats ? FREE_STEP : ui.snapBeats);
  const snap = (b, ev) => Math.round(b / step(ev)) * step(ev);
  const snapDown = (b, ev) => Math.floor(b / step(ev) + 1e-9) * step(ev);

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
    // Farbpunkt: Kategorie des ersten Clips der Spur
    const dot = el('span', 'track-dot');
    const menuBtn = el('button', 'tbtn tbtn-menu', '⋯');
    menuBtn.type = 'button';
    menuBtn.title = 'Spur: duplizieren, verschieben, umbenennen, löschen';
    menuBtn.setAttribute('aria-haspopup', 'menu');
    top.append(dot, name, menuBtn);
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
    // Lautstärke als Drehregler (Doppelklick = Grundwert)
    const volKnob = makeKnob(vol, { wrapClass: 'track-vol-wrap' });
    vol.addEventListener('dblclick', () => store.setTrack(track.id, { volume: 0.8 }));
    btns.append(mute, solo, volKnob.wrap);
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

    menuBtn.addEventListener('click', () => openMenu(track.id, menuBtn));
    head.addEventListener('pointerdown', (e) => startTrackDrag(e, track.id));

    // Klick auf den Spurkopf zeigt die Spur im Inspektor (Lautstärke, Panorama, Effekte)
    head.addEventListener('click', (e) => { if (!e.target.closest('button, input, .knob')) ui.selectTrack?.(track.id); });

    const r = { row, head, name, dot, top, menuBtn, mute, solo, vol, volKnob, lane };
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
      r.menuBtn.setAttribute('aria-label', `Menü für Spur ${t.name}`);
      if (document.activeElement !== r.vol) r.vol.value = String(t.volume);
      r.volKnob.update();
      const first = t.clips.reduce((a, c) => (!a || c.startBeat < a.startBeat ? c : a), null);
      const fs = first && library.get(first.sampleId);
      r.dot.className = `track-dot${fs ? ` cat-${fs.colorCat ?? fs.category}` : ''}`;
      r.row.classList.toggle('silent', t.mute || (anySolo && !t.solo));
      r.row.classList.toggle('selected', !ui.selectedClipId && ui.selectedTrackId === t.id);
    });
    addRow.hidden = tracks.length >= MAX_TRACKS;
  }

  // ---------- Spur-Menü und Spuren ziehen ----------

  const menu = el('div', 'track-menu');
  menu.setAttribute('role', 'menu');
  menu.hidden = true;
  document.body.append(menu);
  let menuFor = null;

  function closeMenu(focusBack = false) {
    if (menu.hidden) return;
    menu.hidden = true;
    const btn = rows.get(menuFor)?.menuBtn;
    btn?.setAttribute('aria-expanded', 'false');
    if (focusBack) btn?.focus();
    menuFor = null;
  }

  function openMenu(trackId, btn) {
    if (menuFor === trackId) { closeMenu(); return; }
    closeMenu();
    menuFor = trackId;
    const tracks = store.project.tracks;
    const i = tracks.findIndex((t) => t.id === trackId);
    const item = (label, action, disabled = false) => {
      const b = el('button', 'track-menu-item', label);
      b.type = 'button';
      b.setAttribute('role', 'menuitem');
      b.disabled = disabled;
      b.addEventListener('click', () => action(b));
      return b;
    };
    menu.replaceChildren(
      item('Duplizieren', () => { closeMenu(); store.duplicateTrack(trackId); }, tracks.length >= MAX_TRACKS),
      item('Nach oben', () => { closeMenu(); store.moveTrack(trackId, i - 1); }, i === 0),
      item('Nach unten', () => { closeMenu(); store.moveTrack(trackId, i + 1); }, i === tracks.length - 1),
      item('Umbenennen', () => { closeMenu(); startRename(trackId); }),
      item('Löschen', (b) => {
        if (b.classList.contains('confirm')) { closeMenu(); store.removeTrack(trackId); return; }
        b.classList.add('confirm');
        b.textContent = 'Wirklich löschen?';
      }, tracks.length <= 1),
    );
    menu.hidden = false;
    btn.setAttribute('aria-expanded', 'true');
    const r = btn.getBoundingClientRect();
    const mw = menu.offsetWidth;
    const mh = menu.offsetHeight;
    menu.style.left = clamp(r.left, 8, innerWidth - mw - 8) + 'px';
    menu.style.top = (r.bottom + 4 + mh > innerHeight - 8 ? r.top - mh - 4 : r.bottom + 4) + 'px';
    menu.querySelector('button:not(:disabled)')?.focus();
  }

  document.addEventListener('pointerdown', (e) => {
    if (!menu.hidden && !menu.contains(e.target) && !e.target.closest('.tbtn-menu')) closeMenu();
  }, true);
  menu.addEventListener('keydown', (e) => {
    const items = [...menu.querySelectorAll('button:not(:disabled)')];
    const k = items.indexOf(document.activeElement);
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeMenu(true); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); items[(k + 1) % items.length]?.focus(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); items[(k - 1 + items.length) % items.length]?.focus(); }
  });
  root.addEventListener('scroll', () => closeMenu(), { passive: true });

  // Spurkopf ziehen: verschiebt die Spur, mit Alt/Strg wird sie kopiert. (Finger nutzen das Menü.)
  const dropLine = el('div', 'track-drop-line');
  function startTrackDrag(e, trackId) {
    if (e.button !== 0 || e.pointerType === 'touch' || e.target.closest('button, input, .knob')) return;
    const r = rows.get(trackId);
    const sy = e.clientY;
    let to = null;
    const indexAt = (y) => {
      const list = [...rowsEl.children];
      let k = list.findIndex((n) => y < n.getBoundingClientRect().top + n.offsetHeight / 2);
      return k < 0 ? list.length : k;
    };
    trackPointer(e, (ev) => {
      if (to == null && Math.abs(ev.clientY - sy) < 6) return;
      const copy = ev.altKey || ev.ctrlKey || ev.metaKey;
      to = indexAt(ev.clientY);
      r.row.classList.add('moving');
      r.row.classList.toggle('copying', copy);
      const list = [...rowsEl.children];
      const y = to < list.length ? list[to].offsetTop : rowsEl.offsetHeight;
      dropLine.style.top = rowsEl.offsetTop + y - 1 + 'px';
      if (!dropLine.parentElement) grid.append(dropLine);
      ui.status(copy ? 'Spur kopieren: loslassen, wo die Kopie hin soll' : 'Spur verschieben');
    }, (ev) => {
      r.row.classList.remove('moving', 'copying');
      dropLine.remove();
      ui.status(null);
      if (to == null) return;
      const from = store.project.tracks.findIndex((t) => t.id === trackId);
      if (ev.altKey || ev.ctrlKey || ev.metaKey) store.duplicateTrack(trackId, to);
      else store.moveTrack(trackId, to > from ? to - 1 : to);
    }, () => { r.row.classList.remove('moving', 'copying'); dropLine.remove(); ui.status(null); });
  }

  // ---------- Clips ----------

  // Wellenform, skaliert mit der Hüllkurve; darüber die Hüllkurve als Linie.
  // Melodie-Pattern: die Noten als kleine Balken (wie eine Mini-Piano-Roll), über die Clip-Länge wiederholt
  function drawNotes(c, clip, pat, w, h) {
    const len = pat.bars * 4;
    const pitches = pat.notes.map((n) => n.pitch);
    const lo = Math.min(...pitches);
    const span = Math.max(1, Math.max(...pitches) - lo);
    const pad = 4;
    const off = clip.offsetBeats || 0;
    for (let rep = Math.floor(off / len) * len - off; rep < clip.lengthBeats; rep += len) {
      for (const n of pat.notes) {
        const x0 = (rep + n.start) * ppb();
        const x1 = (rep + n.start + n.len) * ppb();
        if (x1 <= 0 || x0 >= w) continue;
        const y = Math.round(pad + (1 - (n.pitch - lo) / span) * (h - 2 * pad - 3));
        c.fillRect(Math.max(0, x0) + 1, y, Math.max(2, Math.min(w, x1) - Math.max(0, x0) - 2), 3);
      }
    }
  }

  function drawWave(canvas, clip, sample) {
    const w = Math.max(1, Math.round(clip.lengthBeats * ppb()));
    const h = canvas.clientHeight || 30;
    const dpr = window.devicePixelRatio || 1;
    const sx = Math.min(dpr, MAX_CANVAS / w);
    canvas.width = Math.max(1, Math.round(w * sx));
    canvas.height = Math.round(h * dpr);
    canvas.style.width = w + 'px';
    const c = canvas.getContext('2d');
    c.setTransform(sx, 0, 0, dpr, 0, 0);
    c.clearRect(0, 0, w, h);
    const color = getComputedStyle(canvas).getPropertyValue('--wave').trim() || '#888';
    c.fillStyle = color;
    const mid = h / 2;
    const off = clip.offsetBeats || 0;
    const pat = sample.patternId && store.project.patterns?.[sample.patternId];
    if (pat?.type === 'synth' && pat.notes?.length) drawNotes(c, clip, pat, w, h);
    else {
      // Wellenform als LED-Punkte: Spalten aus 3-px-Punkten, leise Stellen bleiben eine gepunktete Mittellinie
      const peaks = sample.peaks;
      const perBeat = peaks.length / sample.lengthBeats;
      const DOT = 3;
      const PITCH = 4;
      const rows = Math.max(0, Math.floor((mid - DOT / 2) / PITCH));
      for (let x = 0; x + DOT <= w; x += PITCH) {
        const b0 = off + x / ppb();
        let m = 0;
        const k0 = Math.floor(b0 * perBeat);
        const k1 = Math.max(k0 + 1, Math.ceil((b0 + PITCH / ppb()) * perBeat));
        for (let k = k0; k < k1; k++) m = Math.max(m, peaks[k % peaks.length]);
        const env = clipEnvelope(clip, (x + PITCH / 2) / ppb());
        const n = Math.min(rows, Math.round(((m / 0.62) * mid * env) / PITCH));
        for (let k = -n; k <= n; k++) c.fillRect(x, Math.round(mid - DOT / 2 + k * PITCH), DOT, DOT);
      }
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
    const base = library.get(clip.sampleId);
    // Zum Zeichnen reicht der Grund-Sound mit gedehnter Länge (die gedehnte Fassung rechnet im Hintergrund)
    const sample = base && clip.stretch ? { ...base, lengthBeats: base.lengthBeats * clip.stretch } : base;
    const node = el('div', `clip cat-${sample?.colorCat ?? sample?.category ?? 'fx'}`);
    node.dataset.clipId = clip.id;
    node.style.left = clip.startBeat * ppb() + 'px';
    node.style.width = clip.lengthBeats * ppb() + 'px';
    node.classList.toggle('selected', ui.selectedIds().includes(clip.id));
    const label = el('span', 'clip-label', sample?.name ?? 'Fehlendes Sample');
    if (sample?.patternId) label.append(el('span', 'clip-tag', 'Pattern'));
    if (clip.stretch) label.append(el('span', 'clip-tag', `×${String(clip.stretch).replace('.', ',')}`));
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

  // Nur Spuren neu zeichnen, deren Clips sich geändert haben: schnelle Eingaben (Tasten, Pads) bleiben flüssig.
  // Während eines Ziehens verändert die Vorschau das DOM direkt – dann zeichnet der nächste Durchlauf alles neu.
  let forceAll = true;
  const laneKey = (track) => `${ppb()}|${headW()}|${track.clips.map((c) => `${c.id}:${clipSignature('', c)}:${library.get(c.sampleId)?.rev ?? 0}:${sampleFor(library, c)?.rev ?? '-'}`).join(',')}`;
  function renderLane(r, track) {
    const key = laneKey(track);
    if (!forceAll && r.key === key) return;
    r.key = key;
    for (const n of r.lane.querySelectorAll('.clip')) n.remove();
    // Übereinanderliegende Clips: der obere klingt und liegt sichtbar oben, der untere bleibt erhalten
    const order = [...track.clips].sort((a, b) => (isAbove(a, b, track.clips) ? 1 : -1));
    const audible = audibleRanges(track);
    for (const clip of track.clips) {
      const { node, canvas, sample } = makeClip(clip);
      node.style.setProperty('--stack', String(order.indexOf(clip) + 1));
      const heard = (audible.get(clip.id) ?? []).reduce((s, [a, b]) => s + b - a, 0);
      node.classList.toggle('covered', heard < clip.lengthBeats - EPS);
      node.classList.toggle('on-top', track.clips.some((o) => o !== clip && isAbove(clip, o, track.clips) && o.startBeat < clip.startBeat + clip.lengthBeats - EPS && o.startBeat + o.lengthBeats > clip.startBeat + EPS));
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
    // Bei kleinem Zoom nur jede 2./4./8. Taktzahl, damit sie lesbar bleiben
    const barPx = ppb() * p.beatsPerBar;
    const every = barPx >= 28 ? 1 : barPx >= 14 ? 2 : barPx >= 7 ? 4 : 8;
    for (let bar = 0; bar < p.lengthBars; bar += every) {
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

  function render(force = false) {
    if (force) forceAll = true;
    const p = store.project;
    grid.style.setProperty('--ppb', ppb() + 'px');
    grid.style.setProperty('--bar', ppb() * p.beatsPerBar + 'px');
    grid.style.setProperty('--head-w', headW() + 'px');
    // Feine Rasterlinien (Sechzehntel) erst, wenn genug Platz ist; Schlaglinien bei sehr kleinem Zoom weg
    grid.classList.toggle('fine', ppb() >= 64);
    grid.classList.toggle('coarse', ppb() < 10);
    grid.style.width = headW() + totalBeats(p) * ppb() + 'px';
    renderRuler();
    syncRows();
    for (const t of p.tracks) renderLane(rows.get(t.id), t);
    forceAll = false;
    if (ui.selectedClipId && !store.findClip(ui.selectedClipId)) ui.select(null);
    else if (ui.multi.length && ui.multi.some((id) => !store.findClip(id))) ui.selectMany(ui.multi.filter((id) => store.findClip(id)));
    markSelection();
    showLoop(p.loop.startBeat, p.loop.endBeat, p.loop.on);
    setPlayhead(engine.heardBeat());
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

  function markSelection() {
    const ids = new Set(ui.selectedIds());
    for (const n of root.querySelectorAll('.clip')) n.classList.toggle('selected', ids.has(n.dataset.clipId));
  }
  function select(clipId) {
    ui.select(clipId);
    markSelection();
  }

  // Gemeinsamer Rahmen für alle Griff-Bewegungen: Vorschau beim Ziehen, eine Store-Aktion beim Loslassen.
  function dragClip(e, node, { preview, commit }) {
    const found = store.findClip(node.dataset.clipId);
    if (!found) return;
    const { clip } = found;
    const base = library.get(clip.sampleId);
    const sample = base && clip.stretch ? { ...base, lengthBeats: base.lengthBeats * clip.stretch } : base;
    const canvas = node.querySelector('canvas');
    select(clip.id);
    forceAll = true;
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
    }, () => { node.classList.remove('editing'); ui.status(null); render(true); });
  }

  // Mehrere ausgewählte Clips zusammen verschieben (Alt/Strg: kopieren); Abstände und Spurabstände bleiben
  function startGroupMove(e, node, toggle = null) {
    const p = store.project;
    const total = totalBeats(p);
    const order = p.tracks.map((t) => t.id);
    const items = ui.selectedIds().map((id) => {
      const f = store.findClip(id);
      return f && { clip: f.clip, ti: order.indexOf(f.track.id), node: root.querySelector(`.clip[data-clip-id="${id}"]`) };
    }).filter((x) => x && x.node);
    const lead = items.find((x) => x.node === node) ?? items[0];
    const minStart = Math.min(...items.map((x) => x.clip.startBeat));
    const maxEnd = Math.max(...items.map((x) => x.clip.startBeat + x.clip.lengthBeats));
    const minTi = Math.min(...items.map((x) => x.ti));
    const maxTi = Math.max(...items.map((x) => x.ti));
    const sx = e.clientX;
    const sy = e.clientY;
    let moved = false;
    let db = 0;
    let dt = 0;
    forceAll = true;
    trackPointer(e, (ev) => {
      if (!moved && Math.hypot(ev.clientX - sx, ev.clientY - sy) < 4) return;
      moved = true;
      const copy = ev.altKey || ev.ctrlKey || ev.metaKey;
      const want = snap(lead.clip.startBeat + (ev.clientX - sx) / ppb(), ev) - lead.clip.startBeat;
      db = clamp(want, -minStart, total - maxEnd);
      const lane = laneAt(ev.clientX, ev.clientY);
      if (lane) dt = clamp(order.indexOf(lane.dataset.trackId) - lead.ti, -minTi, order.length - 1 - maxTi);
      for (const x of items) {
        x.node.classList.add('dragging');
        x.node.classList.toggle('copying', copy);
        x.node.style.left = (x.clip.startBeat + db) * ppb() + 'px';
        const target = rows.get(order[x.ti + dt])?.lane;
        if (target && target !== x.node.parentElement) target.append(x.node);
      }
      ui.status(`${items.length} Clips · ${formatPos(lead.clip.startBeat + db, p.beatsPerBar)}`);
    }, (ev) => {
      for (const x of items) x.node.classList.remove('dragging', 'copying');
      ui.status(null);
      if (!moved) { toggle?.(); return; }
      const copy = ev.altKey || ev.ctrlKey || ev.metaKey;
      if (!copy && !db && !dt) { render(true); return; }
      const ids = store.moveClips(items.map((x) => ({ id: x.clip.id, trackId: order[x.ti + dt], startBeat: x.clip.startBeat + db })), { copy });
      ui.selectMany(ids);
      render(true);
    }, () => { ui.status(null); render(true); });
  }

  // Rahmen aufziehen (Maus, freie Fläche): alle berührten Clips auswählen; Umschalt fügt hinzu
  const marquee = el('div', 'marquee');
  function startMarquee(e, lane) {
    const sx = e.clientX;
    const sy = e.clientY;
    const keep = e.shiftKey ? ui.selectedIds() : [];
    let active = false;
    let hits = [];
    trackPointer(e, (ev) => {
      if (!active && Math.hypot(ev.clientX - sx, ev.clientY - sy) < 5) return;
      if (!active) { active = true; grid.append(marquee); }
      const g = grid.getBoundingClientRect();
      const x0 = Math.min(sx, ev.clientX);
      const x1 = Math.max(sx, ev.clientX);
      const y0 = Math.min(sy, ev.clientY);
      const y1 = Math.max(sy, ev.clientY);
      Object.assign(marquee.style, { left: `${x0 - g.left}px`, top: `${y0 - g.top}px`, width: `${x1 - x0}px`, height: `${y1 - y0}px` });
      hits = [...root.querySelectorAll('.clip')].filter((n) => {
        const r = n.getBoundingClientRect();
        return r.right > x0 && r.left < x1 && r.bottom > y0 && r.top < y1;
      }).map((n) => n.dataset.clipId);
      const show = new Set([...keep, ...hits]);
      for (const n of root.querySelectorAll('.clip')) n.classList.toggle('selected', show.has(n.dataset.clipId));
      ui.status(hits.length ? `${show.size} ${show.size === 1 ? 'Clip' : 'Clips'} ausgewählt` : null);
    }, (ev) => {
      marquee.remove();
      ui.status(null);
      if (!active) { laneClick(ev, lane); return; }
      ui.selectMany([...keep, ...hits]);
      markSelection();
    }, () => { marquee.remove(); ui.status(null); markSelection(); });
  }

  // toggle: Umschalt-Klick ohne Bewegung ändert nur die Auswahl
  function startMove(e, node, { toggle = null } = {}) {
    if (ui.multi.length > 1 && ui.multi.includes(node.dataset.clipId)) { startGroupMove(e, node, toggle); return; }
    const found = store.findClip(node.dataset.clipId);
    if (!found) return;
    const { clip, track } = found;
    const total = totalBeats(store.project);
    if (!toggle) select(clip.id);
    const sx = e.clientX;
    const sy = e.clientY;
    let moved = false;
    let newStart = clip.startBeat;
    forceAll = true;
    trackPointer(e, (ev) => {
      if (!moved && Math.hypot(ev.clientX - sx, ev.clientY - sy) < 4) return;
      moved = true;
      node.classList.add('dragging');
      node.classList.toggle('copying', ev.altKey || ev.ctrlKey || ev.metaKey);
      newStart = clamp(snap(clip.startBeat + (ev.clientX - sx) / ppb(), ev), 0, Math.max(0, total - clip.lengthBeats));
      node.style.left = newStart * ppb() + 'px';
      ui.status(formatPos(newStart, store.project.beatsPerBar));
      const lane = laneAt(ev.clientX, ev.clientY);
      if (lane && lane !== node.parentElement) lane.append(node);
    }, (ev) => {
      node.classList.remove('dragging', 'copying');
      ui.status(null);
      if (!moved) { toggle?.(); return; }
      const targetId = node.parentElement.dataset.trackId;
      const copy = ev.altKey || ev.ctrlKey || ev.metaKey;
      if (!copy && targetId === track.id && newStart === clip.startBeat) { render(true); return; }
      const id = store.moveClip(clip.id, targetId, newStart, { copy });
      select(id);
    }, () => { ui.status(null); render(true); });
  }

  function startResize(e, node) {
    const total = totalBeats(store.project);
    dragClip(e, node, {
      preview: (clip, dx, dy, ev) => {
        const len = clamp(snap(clip.lengthBeats + dx / ppb(), ev), step(ev), total - clip.startBeat);
        return { clip: { lengthBeats: len }, status: `Länge: ${formatBeats(len)}` };
      },
      commit: (clip, r) => { if (r.lengthBeats !== clip.lengthBeats) store.resizeClip(clip.id, r.lengthBeats); else render(true); },
    });
  }

  function startTrim(e, node) {
    dragClip(e, node, {
      preview: (clip, dx, dy, ev) => {
        const end = clip.startBeat + clip.lengthBeats;
        const start = clamp(snap(clip.startBeat + dx / ppb(), ev), 0, end - step(ev));
        const sb = (library.get(clip.sampleId)?.lengthBeats ?? 4) * (clip.stretch || 1);
        const offsetBeats = ((((clip.offsetBeats || 0) + start - clip.startBeat) % sb) + sb) % sb;
        return { clip: { startBeat: start, lengthBeats: end - start, offsetBeats }, left: start, status: `Anfang: ${formatPos(start, store.project.beatsPerBar)}` };
      },
      commit: (clip, r) => { if (r.startBeat !== clip.startBeat) store.trimClipStart(clip.id, r.startBeat); else render(true); },
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
    if (scissors) { scissors = null; grid.classList.remove('scissors'); ui.status(null); }
    if (!ui.armedSampleId) { select(null); ui.selectTrack?.(null); return; }
    const sample = library.get(ui.armedSampleId);
    const rect = lane.getBoundingClientRect();
    const beat = clamp(snapDown((e.clientX - rect.left) / ppb(), e), 0, totalBeats(store.project) - step(e));
    const id = store.addClip(lane.dataset.trackId, sample.id, beat, sample.lengthBeats);
    select(id);
  }

  root.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    const t = e.target;
    const clip = t.closest('.clip');
    if (clip && scissors) {
      // Schere: an der angeklickten Stelle teilen (im Raster)
      e.preventDefault();
      const c = store.findClip(clip.dataset.clipId)?.clip;
      const rect = clip.parentElement.getBoundingClientRect();
      const beat = snap((e.clientX - rect.left) / ppb(), e);
      const done = scissors;
      scissors = null;
      grid.classList.remove('scissors');
      ui.status(null);
      if (c && beat > c.startBeat + 1e-6 && beat < c.startBeat + c.lengthBeats - 1e-6) {
        const created = store.splitAt(beat, [c.id]);
        if (created.length) select(created[0]);
        done.onDone?.(created.length > 0);
      } else done.onDone?.(false);
      return;
    }
    if (clip) {
      e.preventDefault();
      // Finger: ein nicht ausgewählter Clip wird nur ausgewählt, damit Wischen scrollt statt verschiebt
      if (e.pointerType === 'touch' && ui.selectedClipId !== clip.dataset.clipId) {
        trackPointer(e, () => {}, () => select(clip.dataset.clipId));
        return;
      }
      if (e.shiftKey && e.pointerType === 'mouse' && !t.closest('.clip-grip, .clip-trim, .clip-handle')) {
        // Umschalt-Klick: Clip zur Auswahl hinzufügen oder herausnehmen; Umschalt-Ziehen verschiebt frei (ohne Raster)
        const cid = clip.dataset.clipId;
        startMove(e, clip, {
          toggle: () => {
            const ids = ui.selectedIds();
            ui.selectMany(ids.includes(cid) ? ids.filter((x) => x !== cid) : [...ids, cid]);
            markSelection();
          },
        });
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
    if (!lane) return;
    // Maus auf freier Fläche: Rahmen aufziehen (ein Klick ohne Ziehen bleibt ein Klick)
    if (e.pointerType === 'mouse' && !ui.armedSampleId && !scissors) { e.preventDefault(); startMarquee(e, lane); return; }
    laneClick(e, lane);
  });

  // ---------- Ablegen aus dem Sound-Regal ----------

  function dropTargetAt(x, y, sample) {
    const lane = laneAt(x, y);
    if (!lane) { clearDropPreview(); return null; }
    const total = totalBeats(store.project);
    const rect = lane.getBoundingClientRect();
    const startBeat = clamp(snapDown((x - rect.left) / ppb()), 0, total - step());
    dropPreview.className = `drop-preview cat-${sample.category}`;
    dropPreview.style.left = startBeat * ppb() + 'px';
    dropPreview.style.width = Math.min(sample.lengthBeats, total - startBeat) * ppb() + 'px';
    if (dropPreview.parentElement !== lane) lane.append(dropPreview);
    return { trackId: lane.dataset.trackId, startBeat };
  }

  function clearDropPreview() { dropPreview.remove(); }

  // ---------- Schere: Teilen an einer Stelle, die man anklickt ----------
  let scissors = null;
  function armScissors(onDone) {
    scissors = { onDone };
    grid.classList.add('scissors');
    ui.status('Schere: Klick auf die Stelle im Clip, an der geteilt wird – Esc bricht ab');
  }
  function cancelScissors() {
    if (!scissors) return false;
    scissors = null;
    grid.classList.remove('scissors');
    ui.status(null);
    return true;
  }

  // Clip über einer Schublade sichtbar halten: so scrollen, dass er oberhalb von `limitTop` liegt
  function revealClip(clipId, limitTop) {
    const node = root.querySelector(`.clip[data-clip-id="${clipId}"]`);
    if (!node) return;
    const r = node.getBoundingClientRect();
    const box = root.getBoundingClientRect();
    const top = box.top + 32; // unter dem Lineal
    if (r.bottom > limitTop - 8) root.scrollTop += r.bottom - (limitTop - 8);
    else if (r.top < top) root.scrollTop -= top - r.top;
  }

  // ---------- Zoom ----------

  // Zoomt so, dass der Schlag unter `clientX` (Standard: Mitte des sichtbaren Rasters) an seinem Platz bleibt.
  function zoomTo(target, clientX) {
    const next = clamp(Math.round(target * 4) / 4, MIN_PPB, MAX_PPB);
    if (next === ppb()) return;
    const box = root.getBoundingClientRect();
    const x = clientX == null ? headW() + (box.width - headW()) / 2 : clamp(clientX - box.left, headW(), box.width);
    const beat = (root.scrollLeft + x - headW()) / ppb();
    ui.pxPerBeat = next;
    render();
    root.scrollLeft = Math.max(0, beat * next + headW() - x);
    ui.emit();
  }
  const zoom = (factor, clientX) => zoomTo(ppb() * factor, clientX);

  // Strg + Mausrad (und Zwei-Finger-Zoom auf dem Trackpad, das kommt als Strg + Rad)
  root.addEventListener('wheel', (e) => {
    if (!e.ctrlKey && !e.metaKey) return;
    e.preventDefault();
    zoom(Math.exp(-e.deltaY * (e.deltaMode === 1 ? 0.05 : 0.0025)), e.clientX);
  }, { passive: false });

  // Zwei Finger auseinander/zusammen
  let pinch = null;
  const spread = (t) => Math.abs(t[0].clientX - t[1].clientX);
  root.addEventListener('touchstart', (e) => {
    if (e.touches.length !== 2) return;
    // Zweiter Finger: Scrollen für diese Geste abbestellen, solange es noch nicht begonnen hat
    if (e.cancelable) e.preventDefault();
    pinch = { d: Math.max(20, spread(e.touches)), ppb: ppb() };
  }, { passive: false });
  root.addEventListener('touchmove', (e) => {
    if (!pinch || e.touches.length !== 2) return;
    if (e.cancelable) e.preventDefault();
    const [a, b] = e.touches;
    zoomTo(pinch.ppb * Math.max(20, spread(e.touches)) / pinch.d, (a.clientX + b.clientX) / 2);
  }, { passive: false });
  root.addEventListener('touchend', (e) => { if (e.touches.length < 2) pinch = null; });
  root.addEventListener('touchcancel', () => { pinch = null; });

  // Ausgewählten Clip mit Alt + Pfeil um einen Rasterschritt schieben (mit Umschalt: 1/64 Schlag)
  function nudge(dir, ev) {
    const found = ui.selectedClipId && store.findClip(ui.selectedClipId);
    if (!found) return false;
    const { clip, track } = found;
    const total = totalBeats(store.project);
    // Zur nächsten Rasterlinie in Pfeilrichtung (ein Clip abseits des Rasters landet zuerst darauf)
    const st = step(ev);
    const k = clip.startBeat / st;
    const target = (dir > 0 ? Math.floor(k + 1e-9) + 1 : Math.ceil(k - 1e-9) - 1) * st;
    const start = clamp(target, 0, Math.max(0, total - clip.lengthBeats));
    if (start === clip.startBeat) return true;
    select(store.moveClip(clip.id, track.id, start, { copy: false }));
    ui.flash?.(formatPos(start, store.project.beatsPerBar));
    return true;
  }

  store.on(() => render());
  narrow.addEventListener('change', () => render(true));
  // Farben der Wellenformen hängen vom Farbschema ab
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => render(true));
  render(true);
  ui.on(() => {
    for (const [tid, r] of rows) r.row.classList.toggle('selected', !ui.selectedClipId && ui.selectedTrackId === tid);
    markSelection();
  });
  return { render, setPlayhead, dropTargetAt, clearDropPreview, select, zoom, zoomTo, nudge, armScissors, cancelScissors, revealClip, get scissors() { return !!scissors; } };
}
