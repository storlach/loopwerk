// Sample-Editor: Wellenform mit Auswahl, destruktive Bearbeitung mit eigenem Rückgängig-Verlauf.
// „Übernehmen“ speichert das Ergebnis als neuen eigenen Sound und setzt ihn in den Clip ein.

import * as E from '../dsp/edit.js';
import { channelsToBuffer, bufferToChannels } from '../own-sounds.js';
import { clamp, el, trackPointer } from '../util.js';

const fmtSec = (s) => `${s.toFixed(2).replace('.', ',')} s`;

export function mountEditor({ root, store, engine, library, ui, own }) {
  const $ = (id) => root.querySelector('#' + id);
  const canvas = $('ed-wave');
  const selEl = root.querySelector('.ed-sel');
  const headEl = root.querySelector('.ed-head');
  const info = $('ed-info');
  const nameIn = $('ed-name');
  const loopIn = $('ed-loop');
  const beatsIn = $('ed-beats');
  const bpmOut = $('ed-bpm');
  const pitchOut = $('ed-pitch-value');
  let st = null; // { clipId, src, chs, sr, history, sel, kind, beats, pitch }

  const len = () => st.chs[0].length;
  const hasSel = () => st.sel && st.sel[1] - st.sel[0] > 0;
  const selOrAll = () => (hasSel() ? st.sel : [0, len()]);

  function open(clipId) {
    const found = store.findClip(clipId);
    if (!found) return;
    const sample = library.get(found.clip.sampleId);
    if (!sample?.buffer) return;
    const base = sample.orig || sample.buffer;
    st = {
      clipId,
      src: sample,
      chs: bufferToChannels(base),
      sr: base.sampleRate,
      history: [],
      sel: null,
      kind: sample.kind === 'loop' ? 'loop' : 'oneshot',
      beats: sample.kind === 'loop' ? (sample.beats || sample.lengthBeats) : Math.max(1, Math.round(base.duration / (60 / store.project.bpm))),
      pitch: 0,
    };
    nameIn.value = sample.category === 'own' ? sample.name : `${sample.name} (bearbeitet)`;
    $('editor-title').textContent = `Sample-Editor: ${sample.name}`;
    ui.setDock('editor');
    requestAnimationFrame(render);
  }

  function apply(fn) {
    st.history.push(st.chs);
    if (st.history.length > 30) st.history.shift();
    st.chs = fn(st.chs);
    if (st.sel) st.sel = [Math.min(st.sel[0], len()), Math.min(st.sel[1], len())];
    render();
  }

  // ---------- Darstellung ----------

  function render() {
    if (!st || root.hidden) return;
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    const c = canvas.getContext('2d');
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.clearRect(0, 0, w, h);
    const css = getComputedStyle(canvas);
    c.fillStyle = css.getPropertyValue('--wave').trim();
    const n = len();
    const per = n / w;
    for (const [ci, d] of st.chs.entries()) {
      const top = (h / st.chs.length) * ci;
      const ch = h / st.chs.length;
      const mid = top + ch / 2;
      for (let x = 0; x < w; x++) {
        let lo = 0;
        let hi = 0;
        const a = Math.floor(x * per);
        const b = Math.min(n, Math.max(a + 1, Math.floor((x + 1) * per)));
        for (let i = a; i < b; i++) { const v = d[i]; if (v < lo) lo = v; if (v > hi) hi = v; }
        c.fillRect(x, mid - hi * (ch / 2 - 2), 1, Math.max(1, (hi - lo) * (ch / 2 - 2)));
      }
    }
    if (hasSel()) {
      selEl.hidden = false;
      selEl.style.left = (st.sel[0] / n) * 100 + '%';
      selEl.style.width = ((st.sel[1] - st.sel[0]) / n) * 100 + '%';
    } else selEl.hidden = true;
    const dur = n / st.sr;
    info.textContent = hasSel()
      ? `Auswahl ${fmtSec(st.sel[0] / st.sr)} – ${fmtSec(st.sel[1] / st.sr)} (${fmtSec((st.sel[1] - st.sel[0]) / st.sr)}) · gesamt ${fmtSec(dur)}`
      : `Länge ${fmtSec(dur)} · ziehe über die Wellenform, um einen Bereich auszuwählen`;
    for (const id of ['ed-crop', 'ed-cut', 'ed-silence']) $(id).disabled = !hasSel();
    $('ed-undo').disabled = !st.history.length;
    loopIn.checked = st.kind === 'loop';
    beatsIn.disabled = st.kind !== 'loop';
    if (document.activeElement !== beatsIn) beatsIn.value = String(st.beats);
    bpmOut.textContent = st.kind === 'loop' ? `= ${(st.beats * 60 / dur).toFixed(1).replace('.', ',')} BPM` : 'One-Shot, wird nicht gestreckt';
    pitchOut.textContent = `${st.pitch > 0 ? '+' : ''}${st.pitch}`;
  }

  // ---------- Auswahl ----------

  canvas.addEventListener('pointerdown', (e) => {
    if (!st || e.button !== 0) return;
    e.preventDefault();
    const rect = canvas.getBoundingClientRect();
    const frameAt = (x) => Math.round(clamp((x - rect.left) / rect.width, 0, 1) * len());
    const a = frameAt(e.clientX);
    let moved = false;
    trackPointer(e, (ev) => {
      if (!moved && Math.abs(ev.clientX - e.clientX) < 3) return;
      moved = true;
      const b = frameAt(ev.clientX);
      st.sel = [Math.min(a, b), Math.max(a, b)];
      render();
    }, () => { if (!moved) { st.sel = null; render(); } });
  });

  // ---------- Werkzeuge ----------

  const tool = (id, fn) => $(id).addEventListener('click', () => { if (st) apply(fn); });
  tool('ed-crop', (chs) => { const [a, b] = st.sel; st.sel = null; return E.crop(chs, a, b); });
  tool('ed-cut', (chs) => { const [a, b] = st.sel; st.sel = null; return E.cut(chs, a, b, st.sr); });
  tool('ed-silence', (chs) => E.silence(chs, ...st.sel));
  tool('ed-fadein', (chs) => E.fade(chs, ...selOrAll(), 'in'));
  tool('ed-fadeout', (chs) => E.fade(chs, ...selOrAll(), 'out'));
  tool('ed-reverse', (chs) => E.reverse(chs, ...selOrAll()));
  tool('ed-normalize', (chs) => E.normalize(chs, 0.89, ...selOrAll()));
  tool('ed-louder', (chs) => E.gain(chs, 3, ...selOrAll()));
  tool('ed-quieter', (chs) => E.gain(chs, -3, ...selOrAll()));
  $('ed-pitch-down').addEventListener('click', () => { if (st) { st.pitch = Math.max(-12, st.pitch - 1); render(); } });
  $('ed-pitch-up').addEventListener('click', () => { if (st) { st.pitch = Math.min(12, st.pitch + 1); render(); } });
  $('ed-pitch-apply').addEventListener('click', () => {
    if (!st || !st.pitch) return;
    const p = st.pitch;
    st.pitch = 0;
    st.sel = null;
    apply((chs) => E.pitch(chs, p));
  });
  loopIn.addEventListener('change', () => { st.kind = loopIn.checked ? 'loop' : 'oneshot'; render(); });
  beatsIn.addEventListener('change', () => { st.beats = clamp(Math.round(Number(beatsIn.value) || 1), 1, 64); render(); });

  $('ed-undo').addEventListener('click', () => { if (st?.history.length) { st.chs = st.history.pop(); st.sel = null; render(); } });

  // ---------- Anhören ----------

  let previewing = null;
  $('ed-play').addEventListener('click', async () => {
    if (!st) return;
    if (previewing && engine.preview === previewing) { engine.stopPreview(); return; }
    const buffer = channelsToBuffer(st.chs, st.sr);
    const [a, b] = selOrAll();
    previewing = await engine.previewBuffer(buffer, a / st.sr, (b - a) / st.sr);
    const tick = () => {
      if (!previewing || engine.preview !== previewing) { headEl.hidden = true; return; }
      const t = engine.ctx.currentTime - previewing.when;
      headEl.hidden = false;
      headEl.style.left = clamp((a / st.sr + Math.max(0, t)) / (len() / st.sr), 0, 1) * 100 + '%';
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });

  // ---------- Abschließen ----------

  function close() {
    engine.stopPreview();
    st = null;
    if (ui.dock === 'editor') ui.setDock(null);
  }
  $('ed-cancel').addEventListener('click', close);
  $('editor-close').addEventListener('click', close);
  $('ed-apply').addEventListener('click', async () => {
    if (!st) return;
    const btn = $('ed-apply');
    btn.disabled = true;
    try {
      const buffer = channelsToBuffer(st.chs, st.sr);
      const name = nameIn.value.trim() || `${st.src.name} (bearbeitet)`;
      const sample = await own.create({ name, buffer, kind: st.kind, beats: st.kind === 'loop' ? st.beats : null, source: `Bearbeitet aus „${st.src.name}“` });
      const clipId = st.clipId;
      close();
      if (store.findClip(clipId)) store.setClip(clipId, { sampleId: sample.id, offsetBeats: 0 });
      ui.flash(`„${sample.name}“ gespeichert und im Clip eingesetzt.`);
    } catch (err) {
      ui.flash(`Speichern nicht möglich: ${err.message}`);
    } finally {
      btn.disabled = false;
    }
  });

  ui.on(() => {
    const show = ui.dock === 'editor';
    if (root.hidden === !show) return;
    root.hidden = !show;
    if (show) requestAnimationFrame(render);
    else if (st) { engine.stopPreview(); st = null; }
  });
  window.addEventListener('resize', () => render());

  return { open, close, get state() { return st; } };
}
