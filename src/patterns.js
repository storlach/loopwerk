// Hält die gerenderten Pattern-Sounds („pat-…“) synchron zu project.patterns:
// neue Patterns registrieren, geänderte neu rendern, entfernte austragen. Die Engine plant geänderte Clips neu.

import { renderPattern, SYNTH_PRESETS } from './instruments.js';

export const patternSampleId = (id) => 'pat-' + id;

export class Patterns {
  constructor(library) {
    this.library = library;
    this.keys = new Map();
    this.project = null;
    this.queue = Promise.resolve();
    this.onChange = null;
  }

  current(id) { return this.project?.patterns?.[id]; }

  // Gibt ein Promise zurück, das erfüllt ist, wenn alle Pattern-Sounds zum Projekt passen.
  sync(project) {
    this.project = project;
    this.queue = this.queue.then(() => this._sync()).catch((err) => console.warn('Pattern konnte nicht erzeugt werden:', err));
    return this.queue;
  }

  async _sync() {
    const lib = this.library;
    const patterns = this.project?.patterns || {};
    let changed = false;
    for (const [id, p] of Object.entries(patterns)) {
      const sid = patternSampleId(id);
      const key = JSON.stringify(p);
      const meta = {
        name: p.name,
        category: 'own',
        beats: p.bars * 4,
        origin: 'Pattern',
        instrument: p.type === 'drums' ? 'Beat' : SYNTH_PRESETS.find((x) => x.id === p.preset)?.label,
      };
      let s = lib.get(sid);
      if (!s) {
        s = { id: sid, kind: 'loop', patternId: id, ...meta, make: (bpm) => renderPattern(this.current(id), bpm, lib) };
        this.keys.set(id, key);
        await lib.add(s);
        changed = true;
      } else if (this.keys.get(id) !== key) {
        this.keys.set(id, key);
        Object.assign(s, meta);
        lib.prepared.delete(sid);
        await lib._prepare(s, lib.bpm);
        changed = true;
      }
    }
    for (const s of lib.list()) {
      if (s.patternId && !patterns[s.patternId]) { lib.remove(s.id); this.keys.delete(s.patternId); changed = true; }
    }
    if (changed) { lib.emit(); this.onChange?.(); }
  }
}
