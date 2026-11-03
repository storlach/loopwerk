// Hält die gerenderten Pattern-Sounds („pat-…“) synchron zu project.patterns:
// neue Patterns registrieren, geänderte neu rendern, entfernte austragen. Die Engine plant geänderte Clips neu.
// Kits und Instrumente aus dem Projekt (ADR 012) gehen mit Map bzw. Sampler-Zone ins Rendern; der Schlüssel enthält das
// Rezept (recipeKey) jedes benutzten Sounds, damit eine Rezeptänderung am Pad das Pattern neu rendert.

import { renderPattern, presetInfo } from './instruments.js';
import { transposePattern, tonicOf, keyOf, kitOf, isKitId } from './model.js';
import { voicePattern } from './harmony.js';
import { recipeKey, normalizeRecipe } from './recipe.js';
import { syncInstruments, instrumentKey } from './own-instruments.js';

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

  // Pattern mit allem, was das Rendern aus dem Projekt braucht: Kit-Map eines Projekt-Kits (kitMap)
  resolved(id) {
    const p = this.current(id);
    if (!p || p.type !== 'drums' || !isKitId(p.kit)) return p;
    return { ...p, kitMap: kitOf(this.project, p.kit)?.map ?? {} };
  }

  // Pattern in der Tonart „Grundtonart + delta“ und auf Stufe `chord` (nur Begleit-Patterns)
  voiced(id, delta = 0, chord = null) {
    const pat = transposePattern(this.current(id), delta);
    if (!chord || !pat.follow) return pat;
    return voicePattern(pat, (tonicOf(keyOf(this.project)) + delta + 120) % 12, chord);
  }

  // Gibt ein Promise zurück, das erfüllt ist, wenn alle Pattern-Sounds zum Projekt passen.
  sync(project) {
    this.project = project;
    this.queue = this.queue.then(() => this._sync()).catch((err) => console.warn('Pattern konnte nicht erzeugt werden:', err));
    return this.queue;
  }

  // Sounds, die ein Pattern spielt (Kit-Pads, Instrument-Sound), und ihr Klang-Schlüssel
  _sounds(p) {
    if (p.type === 'drums') return isKitId(p.kit) ? Object.values(kitOf(this.project, p.kit)?.map ?? {}) : [];
    const inst = this.project?.instruments?.[p.preset];
    return inst?.sampleId ? [inst.sampleId] : [];
  }

  _soundKey(id) {
    const s = this.library.get(id);
    return `${id}:${s && !s.missing ? 1 : 0}:${recipeKey(normalizeRecipe(this.project?.recipes?.[id]))}`;
  }

  async _sync() {
    const lib = this.library;
    const project = this.project;
    const patterns = project?.patterns || {};
    let changed = false;
    // Eigene Sounds der Kits und Instrumente: Rezepte gebacken, Audio geladen (Speicher v2: auf Abruf), Instrumente registriert
    const used = new Set();
    for (const p of Object.values(patterns)) for (const id of this._sounds(p)) used.add(id);
    if (used.size) {
      if (await lib.applyRecipes?.(project)) changed = true;
      await lib.ensureMany?.([...used].filter((id) => lib.get(id)));
    }
    syncInstruments(project, lib);
    for (const [id, p] of Object.entries(patterns)) {
      const sid = patternSampleId(id);
      // Einstellungen der Tonleiter-Sperre ändern nur die Eingabe, nicht den Klang: kein Neu-Rendern
      const base = JSON.stringify(p, (k, v) => (k === 'scaleLock' || k === 'scaleKind' ? undefined : v));
      const sounds = this._sounds(p);
      const extra = p.type === 'drums'
        ? (isKitId(p.kit) ? `|kit:${JSON.stringify(kitOf(project, p.kit))}` : '')
        : (project?.instruments?.[p.preset] ? `|in:${instrumentKey(project, p.preset, lib)}` : '');
      const key = base + extra + (sounds.length ? '|' + sounds.map((x) => this._soundKey(x)).join(',') : '');
      const meta = {
        name: p.name,
        category: 'own',
        beats: p.bars * 4,
        origin: 'Pattern',
        instrument: p.type === 'drums' ? 'Beat' : presetInfo(p.preset)?.label,
        // Farbe im Arranger: Beats wie Drums, Melodien wie ihr Klang (Bass, Akkorde, Synth)
        colorCat: p.type === 'drums' ? 'drums' : presetInfo(p.preset)?.category ?? 'synth',
        // Melodien folgen der Tonart je Takt: Fassung mit verschobenen Noten (Library.ensureVariant)
        // Begleit-Patterns (follow) zusätzlich auf jeder Stufe des Akkord-Streifens (Vorlage steht auf Stufe i)
        transpose: p.type === 'synth' ? (bpm, delta, chord) => renderPattern(this.voiced(id, delta, chord), bpm, lib) : undefined,
        followChords: p.type === 'synth' && !!p.follow,
      };
      let s = lib.get(sid);
      if (!s) {
        s = { id: sid, kind: 'loop', patternId: id, ...meta, make: (bpm) => renderPattern(this.resolved(id), bpm, lib) };
        this.keys.set(id, key);
        await lib.add(s);
        changed = true;
      } else if (this.keys.get(id) !== key) {
        this.keys.set(id, key);
        Object.assign(s, meta);
        s.make = (bpm) => renderPattern(this.resolved(id), bpm, lib);
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
