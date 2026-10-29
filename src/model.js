// Projektmodell: Projekt → Spuren → Clips. Alle Positionen in Schlägen (Beats).
// Ein Clip verweist auf ein Sample und wiederholt es über seine Länge (wie ein Objekt im Music Maker).

import { Emitter } from './util.js';
import { withFx } from './effects.js';

export const EPS = 1e-6;
export const PROJECT_VERSION = 1;

export function createEmptyProject() {
  return {
    version: PROJECT_VERSION,
    name: 'Neues Projekt',
    bpm: 120,
    beatsPerBar: 4,
    lengthBars: 32,
    loop: { on: false, startBeat: 0, endBeat: 16 },
    tracks: Array.from({ length: 8 }, (_, i) => ({
      id: 't' + (i + 1),
      name: 'Spur ' + (i + 1),
      volume: 0.8,
      pan: 0,
      mute: false,
      solo: false,
      clips: [],
    })),
  };
}

export function createDemoProject() {
  const p = createEmptyProject();
  p.name = 'Beispiel-Arrangement';
  const names = ['Drums', 'Hi-Hats', 'Bass', 'Pad', 'Arp', 'Melodie', 'FX', 'Spur 8'];
  p.tracks.forEach((t, i) => { t.name = names[i]; });
  let n = 0;
  const put = (ti, sampleId, startBar, bars) => {
    p.tracks[ti].clips.push({ id: 'c' + (++n), sampleId, startBeat: startBar * 4, lengthBeats: bars * 4, offsetBeats: 0 });
  };
  put(0, 'drums-four', 4, 12);
  put(1, 'drums-hats16', 8, 8);
  put(2, 'bass-prog', 4, 12);
  put(3, 'chords-pad', 0, 16);
  put(4, 'synth-arp-prog', 8, 8);
  put(5, 'synth-lead', 12, 4);
  put(6, 'fx-riser', 2, 2);
  put(6, 'fx-crash', 4, 1);
  p.tracks[3].volume = 0.65;
  p.tracks[4].volume = 0.6;
  return p;
}

// Zerlegt einen Clip in die einzelnen Wiederholungen seines Samples.
export function clipSegments(clip, sampleBeats) {
  const segs = [];
  const end = clip.startBeat + clip.lengthBeats;
  let pos = clip.startBeat;
  let off = (clip.offsetBeats || 0) % sampleBeats;
  while (pos < end - EPS) {
    const segEnd = Math.min(pos + sampleBeats - off, end);
    segs.push({ start: pos, end: segEnd, offset: off });
    pos = segEnd;
    off = 0;
  }
  return segs;
}

export function clipSignature(trackId, clip) {
  return `${trackId}|${clip.sampleId}|${clip.startBeat}|${clip.lengthBeats}|${clip.offsetBeats || 0}|${clipGain(clip)}|${clip.fadeInBeats || 0}|${clip.fadeOutBeats || 0}`;
}

export const MAX_TRACKS = 16;
export const MIN_BPM = 60;
export const MAX_BPM = 200;
export const clipGain = (clip) => clip.gain ?? 1;

// Fades begrenzen: nie negativ, zusammen nie länger als der Clip.
export function normalizeClip(clip) {
  clip.gain = Math.min(1, Math.max(0, clipGain(clip)));
  let fi = Math.max(0, clip.fadeInBeats || 0);
  let fo = Math.max(0, clip.fadeOutBeats || 0);
  if (fi + fo > clip.lengthBeats) {
    const k = clip.lengthBeats / (fi + fo);
    fi *= k;
    fo *= k;
  }
  clip.fadeInBeats = fi;
  clip.fadeOutBeats = fo;
  return clip;
}

// Lautstärke-Hüllkurve an Position x (Schläge ab Clip-Start).
export function clipEnvelope(clip, x) {
  const L = clip.lengthBeats;
  const fi = clip.fadeInBeats || 0;
  const fo = clip.fadeOutBeats || 0;
  let v = 1;
  if (fi > 0) v = Math.min(v, x / fi);
  if (fo > 0) v = Math.min(v, (L - x) / fo);
  return clipGain(clip) * Math.max(0, Math.min(1, v));
}

export function totalBeats(project) {
  return project.lengthBars * project.beatsPerBar;
}

export function isValidProject(p) {
  return p && p.version === PROJECT_VERSION && Array.isArray(p.tracks) && p.tracks.every((t) => Array.isArray(t.clips));
}

export class Store extends Emitter {
  constructor(project, { sampleBeats }) {
    super();
    this.sampleBeats = sampleBeats;
    this.replace(project, 'init');
  }

  replace(project, reason = 'replace') {
    this.project = project;
    this.undoStack = [];
    this.redoStack = [];
    this.lastKey = null;
    this.nextId = 1 + Math.max(0, ...project.tracks.flatMap((t) => t.clips.map((c) => parseInt(c.id.slice(1), 10) || 0)));
    this.emit(this.project, reason);
  }

  // Jede Änderung läuft hier durch und landet im Rückgängig-Verlauf.
  // `coalesce` fasst schnelle Folgeänderungen (z. B. Lautstärke-Regler ziehen) zu einem Schritt zusammen.
  dispatch(label, mutate, { coalesce } = {}) {
    const now = performance.now();
    const merge = coalesce && coalesce === this.lastKey && now - this.lastTime < 1500;
    if (!merge) {
      this.undoStack.push(JSON.stringify(this.project));
      if (this.undoStack.length > 200) this.undoStack.shift();
      this.redoStack.length = 0;
    }
    this.lastKey = coalesce || null;
    this.lastTime = now;
    mutate(this.project);
    this.emit(this.project, label);
  }

  get canUndo() { return this.undoStack.length > 0; }
  get canRedo() { return this.redoStack.length > 0; }

  undo() {
    if (!this.canUndo) return;
    this.redoStack.push(JSON.stringify(this.project));
    this.project = JSON.parse(this.undoStack.pop());
    this.lastKey = null;
    this.emit(this.project, 'undo');
  }

  redo() {
    if (!this.canRedo) return;
    this.undoStack.push(JSON.stringify(this.project));
    this.project = JSON.parse(this.redoStack.pop());
    this.lastKey = null;
    this.emit(this.project, 'redo');
  }

  newId() { return 'c' + this.nextId++; }

  findClip(clipId) {
    for (const track of this.project.tracks) {
      const clip = track.clips.find((c) => c.id === clipId);
      if (clip) return { track, clip };
    }
    return null;
  }

  track(trackId) { return this.project.tracks.find((t) => t.id === trackId); }

  // Wer auf belegten Platz gelegt wird, überschreibt: überlappende Clips werden gekürzt oder geteilt.
  _carve(track, keep) {
    const ks = keep.startBeat;
    const ke = ks + keep.lengthBeats;
    const out = [];
    for (const c of track.clips) {
      if (c === keep) { out.push(c); continue; }
      const cs = c.startBeat;
      const ce = cs + c.lengthBeats;
      if (ce <= ks + EPS || cs >= ke - EPS) { out.push(c); continue; }
      if (cs < ks - EPS) out.push(normalizeClip({ ...c, lengthBeats: ks - cs, fadeOutBeats: 0 }));
      if (ce > ke + EPS) {
        const sb = this.sampleBeats(c.sampleId);
        out.push(normalizeClip({
          ...c,
          id: cs < ks - EPS ? this.newId() : c.id,
          startBeat: ke,
          lengthBeats: ce - ke,
          offsetBeats: ((c.offsetBeats || 0) + (ke - cs)) % sb,
          fadeInBeats: 0,
        }));
      }
    }
    track.clips = out.sort((a, b) => a.startBeat - b.startBeat);
  }

  _fit(startBeat, lengthBeats) {
    const total = totalBeats(this.project);
    const start = Math.max(0, Math.min(startBeat, total - 1));
    return { start, length: Math.max(EPS, Math.min(lengthBeats, total - start)) };
  }

  addClip(trackId, sampleId, startBeat, lengthBeats) {
    const id = this.newId();
    this.dispatch('add-clip', () => {
      const track = this.track(trackId);
      const { start, length } = this._fit(startBeat, lengthBeats);
      const clip = { id, sampleId, startBeat: start, lengthBeats: length, offsetBeats: 0 };
      track.clips.push(clip);
      this._carve(track, clip);
    });
    return id;
  }

  moveClip(clipId, trackId, startBeat, { copy = false } = {}) {
    const found = this.findClip(clipId);
    if (!found) return null;
    const newId = copy ? this.newId() : clipId;
    this.dispatch(copy ? 'copy-clip' : 'move-clip', () => {
      const { track, clip } = this.findClip(clipId);
      const target = this.track(trackId);
      const { start, length } = this._fit(startBeat, clip.lengthBeats);
      let moved;
      if (copy) {
        moved = { ...clip, id: newId, startBeat: start, lengthBeats: length };
      } else {
        track.clips = track.clips.filter((c) => c !== clip);
        moved = clip;
        moved.startBeat = start;
        moved.lengthBeats = length;
      }
      normalizeClip(moved);
      target.clips.push(moved);
      this._carve(target, moved);
    });
    return newId;
  }

  resizeClip(clipId, lengthBeats) {
    this.dispatch('resize-clip', () => {
      const { track, clip } = this.findClip(clipId);
      clip.lengthBeats = this._fit(clip.startBeat, lengthBeats).length;
      normalizeClip(clip);
      this._carve(track, clip);
    });
  }

  deleteClip(clipId) {
    if (!this.findClip(clipId)) return;
    this.dispatch('delete-clip', () => {
      const { track } = this.findClip(clipId);
      track.clips = track.clips.filter((c) => c.id !== clipId);
    });
  }

  setClip(clipId, patch) {
    if (!this.findClip(clipId)) return;
    this.dispatch('clip', () => normalizeClip(Object.assign(this.findClip(clipId).clip, patch)));
  }

  // Linken Rand verschieben: Inhalt bleibt an seiner Stelle, nur der Anfang wandert.
  trimClipStart(clipId, startBeat) {
    if (!this.findClip(clipId)) return;
    this.dispatch('trim-clip', () => {
      const { track, clip } = this.findClip(clipId);
      const end = clip.startBeat + clip.lengthBeats;
      const start = Math.max(0, Math.min(startBeat, end - EPS * 10));
      const sb = this.sampleBeats(clip.sampleId);
      clip.offsetBeats = ((((clip.offsetBeats || 0) + (start - clip.startBeat)) % sb) + sb) % sb;
      clip.startBeat = start;
      clip.lengthBeats = end - start;
      normalizeClip(clip);
      this._carve(track, clip);
    });
  }

  // Teilt die angegebenen Clips (ohne Angabe: alle) an Schlag `beat`. Gibt die neuen rechten Teile zurück.
  splitAt(beat, clipIds = null) {
    const targets = [];
    for (const track of this.project.tracks) {
      for (const c of track.clips) {
        if (clipIds && !clipIds.includes(c.id)) continue;
        if (beat > c.startBeat + EPS && beat < c.startBeat + c.lengthBeats - EPS) targets.push(c.id);
      }
    }
    if (!targets.length) return [];
    const created = targets.map(() => this.newId());
    this.dispatch('split', () => {
      targets.forEach((id, i) => {
        const { track, clip } = this.findClip(id);
        const sb = this.sampleBeats(clip.sampleId);
        const end = clip.startBeat + clip.lengthBeats;
        const right = normalizeClip({
          ...clip,
          id: created[i],
          startBeat: beat,
          lengthBeats: end - beat,
          offsetBeats: ((clip.offsetBeats || 0) + (beat - clip.startBeat)) % sb,
          fadeInBeats: 0,
        });
        clip.lengthBeats = beat - clip.startBeat;
        clip.fadeOutBeats = 0;
        normalizeClip(clip);
        track.clips.splice(track.clips.indexOf(clip) + 1, 0, right);
      });
    });
    return created;
  }

  duplicateClip(clipId) {
    const found = this.findClip(clipId);
    if (!found) return null;
    const total = totalBeats(this.project);
    const start = found.clip.startBeat + found.clip.lengthBeats;
    if (start >= total - EPS) return null;
    const id = this.newId();
    this.dispatch('duplicate-clip', () => {
      const { track, clip } = this.findClip(clipId);
      const copy = normalizeClip({ ...clip, id, startBeat: start, lengthBeats: Math.min(clip.lengthBeats, total - start) });
      track.clips.push(copy);
      this._carve(track, copy);
    });
    return id;
  }

  addTrack() {
    if (this.project.tracks.length >= MAX_TRACKS) return null;
    const n = 1 + Math.max(0, ...this.project.tracks.map((t) => parseInt(t.id.slice(1), 10) || 0));
    const id = 't' + n;
    this.dispatch('add-track', (p) => {
      p.tracks.push({ id, name: 'Spur ' + (p.tracks.length + 1), volume: 0.8, pan: 0, mute: false, solo: false, clips: [] });
    });
    return id;
  }

  removeTrack(trackId) {
    if (this.project.tracks.length <= 1 || !this.track(trackId)) return;
    this.dispatch('remove-track', (p) => { p.tracks = p.tracks.filter((t) => t.id !== trackId); });
  }

  setTrack(trackId, patch, coalesce) {
    this.dispatch('track', () => Object.assign(this.track(trackId), patch), { coalesce });
  }

  setTrackFx(trackId, fxId, patch, coalesce) {
    if (!this.track(trackId)) return;
    this.dispatch('fx', () => {
      const t = this.track(trackId);
      t.fx = withFx(t.fx);
      Object.assign(t.fx[fxId], patch);
    }, { coalesce });
  }

  setMaster(patch, coalesce) {
    this.dispatch('master', (p) => { p.master = { volume: 0.85, fx: null, ...(p.master || {}), ...patch }; }, { coalesce });
  }

  setMasterFx(fxId, patch, coalesce) {
    this.dispatch('fx', (p) => {
      p.master = { volume: 0.85, ...(p.master || {}) };
      p.master.fx = withFx(p.master.fx);
      Object.assign(p.master.fx[fxId], patch);
    }, { coalesce });
  }

  setBpm(bpm) {
    const v = Math.round(Math.min(MAX_BPM, Math.max(MIN_BPM, bpm)) * 10) / 10;
    if (v === this.project.bpm) return;
    this.dispatch('tempo', (p) => { p.bpm = v; });
  }

  setLoop(patch) {
    this.dispatch('loop', (p) => Object.assign(p.loop, patch));
  }
}
