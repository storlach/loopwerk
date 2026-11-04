// Sample-Editor: Wellenform mit Auswahl, destruktive Bearbeitung mit eigenem Rückgängig-Verlauf.
// „Übernehmen“ speichert das Ergebnis als neuen eigenen Sound und setzt ihn in den Clip ein.

import * as E from '../dsp/edit.js';
import { runJob } from '../dsp/run.js';
import { STEMS, mixStems } from '../dsp/separate.js';
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
  let peaks = null;
  let st = null; // { clipId, src, chs, sr, history, sel, kind, beats, pitch }

  const len = () => st.chs[0].length;
  const hasSel = () => st.sel && st.sel[1] - st.sel[0] > 0;
  const selOrAll = () => (hasSel() ? st.sel : [0, len()]);

  function open(clipId) {
    const found = store.findClip(clipId);
    if (!found) return;
    const sample = library.get(found.clip.sampleId);
    // Eigener Sound noch nicht dekodiert (lädt erst bei Gebrauch): laden, dann öffnen
    if (sample?.lazy) { library.ensure(sample.id).then(() => { if (!sample.lazy) open(clipId); }).catch(() => ui.flash('Dieser Sound ist im Browser nicht mehr gespeichert.')); return; }
    if (!sample?.buffer || sample.missing) { if (sample?.missing) ui.flash('Sound fehlt – öffne die Projektdatei, um ihn zurückzuholen.'); return; }
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
    live = null;
    $('ed-autotune').setAttribute('aria-pressed', 'false');
    nameIn.value = sample.category === 'own' ? sample.name : `${sample.name} (bearbeitet)`;
    ui.setDock('editor');
    requestAnimationFrame(render);
  }

  function apply(fn) {
    endLive();
    st.history.push(st.chs);
    if (st.history.length > 30) st.history.shift();
    st.chs = fn(st.chs);
    if (st.sel) st.sel = [Math.min(st.sel[0], len()), Math.min(st.sel[1], len())];
    render();
    replay();
  }

  // ---------- Sofort hören: Tonhöhe und Autotune wirken beim Einstellen ----------
  // Eine Live-Sitzung rechnet immer vom Stand vor der Sitzung aus (ein Rückgängig-Schritt);
  // ein anderes Werkzeug oder „Übernehmen“ macht das Ergebnis fest.
  let live = null; // { base, pitch, autotune }
  function startLive() {
    if (live) return live;
    st.history.push(st.chs);
    if (st.history.length > 30) st.history.shift();
    live = { base: st.chs, pitch: 0, autotune: false, token: 0 };
    return live;
  }
  function endLive() {
    if (!live) return;
    live = null;
    st && (st.pitch = 0);
    $('ed-autotune').setAttribute('aria-pressed', 'false');
  }
  let liveTimer = null;
  function relive() {
    clearTimeout(liveTimer);
    liveTimer = setTimeout(computeLive, 120);
  }
  async function computeLive() {
    if (!st || !live) return;
    const token = ++live.token;
    let chs = live.base;
    if (live.pitch) chs = E.pitch(chs, live.pitch);
    if (live.autotune) {
      const [a, b] = live.sel ?? [0, chs[0].length];
      const part = chs.map((d) => d.slice(a, b));
      const out = await work('Autotune rechnet …', 'autotune', { chs: part, sampleRate: st.sr, opts: atOpts() }, { quiet: true });
      if (!out || !live || token !== live.token) return;
      chs = chs.map((d, c) => { const r = d.slice(); r.set(out[c], a); return r; });
    }
    if (!st || !live || token !== live.token) return;
    st.chs = chs;
    st.rev = (st.rev || 0) + 1;
    if (!live.pitch && !live.autotune) { st.history.pop(); live = null; }
    render();
    replay();
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
    if (!peaks || peaks.chs !== st.chs || peaks.w !== w) {
      peaks = { chs: st.chs, w, cols: st.chs.map((d) => {
        const out = new Float32Array(w * 2);
        for (let x = 0; x < w; x++) {
          let lo = 0;
          let hi = 0;
          const a = Math.floor(x * per);
          const b = Math.min(n, Math.max(a + 1, Math.floor((x + 1) * per)));
          for (let i = a; i < b; i++) { const v = d[i]; if (v < lo) lo = v; if (v > hi) hi = v; }
          out[x * 2] = lo;
          out[x * 2 + 1] = hi;
        }
        return out;
      }) };
    }
    for (const [ci, cols] of peaks.cols.entries()) {
      const ch = h / st.chs.length;
      const mid = ch * ci + ch / 2;
      for (let x = 0; x < w; x++) {
        const lo = cols[x * 2];
        const hi = cols[x * 2 + 1];
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
    loopIn.setAttribute('aria-pressed', String(st.kind === 'loop'));
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
    }, () => { if (!moved) st.sel = null; render(); if (isPlaying()) play(0); });
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
  const setPitch = (p) => {
    if (!st) return;
    const l = startLive();
    l.pitch = clamp(p, -12, 12);
    st.pitch = l.pitch;
    render();
    relive();
  };
  $('ed-pitch-down').addEventListener('click', () => setPitch((live?.pitch ?? 0) - 1));
  $('ed-pitch-up').addEventListener('click', () => setPitch((live?.pitch ?? 0) + 1));
  $('ed-pitch-apply').hidden = true;
  loopIn.addEventListener('click', () => { if (!st) return; st.kind = st.kind === 'loop' ? 'oneshot' : 'loop'; render(); });
  beatsIn.addEventListener('change', () => { st.beats = clamp(Math.round(Number(beatsIn.value) || 1), 1, 64); render(); });

  $('ed-undo').addEventListener('click', () => {
    if (!st?.history.length) return;
    live = null;
    st.pitch = 0;
    $('ed-autotune').setAttribute('aria-pressed', 'false');
    st.chs = st.history.pop();
    st.sel = null;
    render();
    replay();
  });

  // ---------- Lange Berechnungen (Autotune, Trennen) ----------

  const busyEl = $('ed-busy');
  let busy = false;
  async function work(text, job, args, { quiet = false } = {}) {
    if (!st || busy) return null;
    if (quiet) {
      try { return await runJob(job, args, {}); } catch (err) { ui.flash(`Das hat nicht geklappt: ${err.message}`); return null; }
    }
    busy = true;
    root.classList.add('busy');
    busyEl.hidden = false;
    $('ed-busy-text').textContent = text;
    $('ed-busy-bar').removeAttribute('value');
    try {
      return await runJob(job, args, { onProgress: (p) => { $('ed-busy-bar').value = p; } });
    } catch (err) {
      ui.flash(`Das hat nicht geklappt: ${err.message}`);
      return null;
    } finally {
      busy = false;
      root.classList.remove('busy');
      busyEl.hidden = true;
    }
  }

  const atOpts = () => ({
    root: Number($('ed-at-root').value), scale: $('ed-at-scale').value,
    strength: Number($('ed-at-strength').value), speed: $('ed-at-robot').getAttribute('aria-pressed') === 'true' ? 1 : 0.6,
  });
  const atBtn = $('ed-autotune');
  atBtn.setAttribute('aria-pressed', 'false');
  atBtn.addEventListener('click', () => {
    if (!st) return;
    const l = startLive();
    l.autotune = !l.autotune;
    if (l.autotune && !l.sel) l.sel = hasSel() ? [...st.sel] : null;
    atBtn.setAttribute('aria-pressed', String(l.autotune));
    relive();
  });
  for (const id of ['ed-at-root', 'ed-at-scale', 'ed-at-strength']) {
    $(id).addEventListener(id === 'ed-at-strength' ? 'input' : 'change', () => { if (live?.autotune) relive(); });
  }
  $('ed-at-robot').addEventListener('click', (e) => {
    const b = e.currentTarget;
    b.setAttribute('aria-pressed', String(b.getAttribute('aria-pressed') !== 'true'));
    if (live?.autotune) relive();
  });
  // Schalter-Beschriftung ist mit klickbar
  for (const id of ['ed-autotune', 'ed-at-robot', 'ed-loop']) $(`${id}-l`).addEventListener('click', () => $(id).click());

  const separateNow = () => work('Trenne Gesang, Drums, Bass und Instrumente … (dauert bei langen Songs etwas)', 'separate', { chs: st.chs, sampleRate: st.sr });
  $('ed-novocal').addEventListener('click', async () => {
    const stems = await separateNow();
    if (stems && st) { apply(() => mixStems(stems, ['drums', 'bass', 'other'])); ui.flash('Stimme entfernt (Näherung: Reste können bleiben).'); }
  });
  $('ed-vocal').addEventListener('click', async () => {
    const stems = await separateNow();
    if (stems && st) { apply(() => stems.vocals); ui.flash('Stimme isoliert (Näherung: mittige Instrumente können mitklingen).'); }
  });
  $('ed-stems').addEventListener('click', async () => {
    if (!st) return;
    if (store.project.tracks.length + STEMS.length > 16) { ui.flash('Dafür braucht es vier freie Spuren (höchstens 16).'); return; }
    const stems = await separateNow();
    if (!stems || !st) return;
    const base = nameIn.value.trim() || st.src.name;
    const made = [];
    for (const stem of STEMS) {
      const sample = await own.create({
        name: `${base} – ${stem.label}`.slice(0, 40), buffer: channelsToBuffer(stems[stem.id], st.sr),
        kind: st.kind, beats: st.kind === 'loop' ? st.beats : null, source: `Ebene aus „${st.src.name}“`,
      });
      made.push({ name: `${stem.label}`, sampleId: sample.id });
    }
    const clipId = st.clipId;
    close();
    if (store.insertStemTracks(clipId, made)) ui.flash('In vier Ebenen zerlegt: Gesang, Drums, Bass, Instrumente – jede auf eigener Spur.');
  });

  // ---------- Anhören ----------

  // Anhören läuft im Loop (Auswahl oder ganzer Clip), bis man es anhält; Änderungen hört man sofort an derselben Stelle
  let previewing = null;
  const playBtn = $('ed-play');
  const isPlaying = () => !!previewing && engine.preview === previewing;
  const syncPlay = () => {
    const on = isPlaying();
    playBtn.setAttribute('aria-pressed', String(on));
    playBtn.setAttribute('aria-label', on ? 'Stopp' : 'Anhören');
    playBtn.classList.toggle('on', on);
    playBtn.querySelector('.ico-play').toggleAttribute('hidden', on);
    playBtn.querySelector('.ico-stop').toggleAttribute('hidden', !on);
    playBtn.title = on ? 'Stopp' : 'Anhören (im Loop)';
  };
  async function play(at = 0) {
    if (!st) return;
    const buffer = channelsToBuffer(st.chs, st.sr);
    const [a, b] = selOrAll();
    const dur = (b - a) / st.sr;
    if (dur <= 0) return;
    previewing = await engine.previewBuffer(buffer, a / st.sr, dur, { loop: true, at });
    syncPlay();
    const tick = () => {
      if (!isPlaying()) { headEl.hidden = true; syncPlay(); return; }
      const t = Math.max(0, engine.heardTime() - previewing.when) % previewing.duration;
      headEl.hidden = false;
      headEl.style.left = clamp((previewing.offset + t) / (len() / st.sr), 0, 1) * 100 + '%';
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }
  // Nach einer Änderung: an derselben Stelle mit dem neuen Klang weiter
  function replay() {
    if (!isPlaying()) return;
    const at = Math.max(0, engine.ctx.currentTime - previewing.when);
    play(at);
  }
  playBtn.addEventListener('click', () => {
    if (!st) return;
    if (isPlaying()) { engine.stopPreview(); syncPlay(); return; }
    play(0);
  });

  // ---------- Abschließen ----------

  function close() {
    engine.stopPreview();
    live = null;
    st = null;
    if (ui.dock === 'editor') ui.setDock(null);
  }
  $('ed-cancel').addEventListener('click', close);
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

  // Eigener Merker statt root.hidden: wischt man die Schublade zu, blendet sie sich selbst aus, bevor das Fach wechselt –
  // die Wiedergabe muss trotzdem enden
  let shown = !root.hidden;
  ui.on(() => {
    const show = ui.dock === 'editor';
    if (shown === show) return;
    shown = show;
    root.hidden = !show;
    if (show) requestAnimationFrame(render);
    else if (st) { engine.stopPreview(); st = null; }
  });
  window.addEventListener('resize', () => render());
  // Die Wellenform füllt die Schublade: wächst oder schrumpft sie (auch beim Ziehen), zeichnet sie im nächsten Bild neu
  let raf = 0;
  new ResizeObserver(() => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; render(); }); }).observe(canvas);
  // Tonhöhe, Autotune, Trennen, Loop: eingeklappt, damit die Wellenform den Platz bekommt
  const moreBtn = $('clip-more');
  moreBtn.addEventListener('click', () => {
    const open = moreBtn.getAttribute('aria-expanded') !== 'true';
    moreBtn.setAttribute('aria-expanded', String(open));
    moreBtn.textContent = `Mehr: Tonhöhe, Autotune, Trennen, Loop ${open ? '▴' : '▾'}`;
    $('ed-tools').hidden = !open;
  });
  nameIn.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); nameIn.blur(); } });

  return { open, close, get state() { return st; } };
}
