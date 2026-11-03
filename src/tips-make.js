// Tipps der Edition Krachwerk (Spec krachwerk-4-kit §6): eigene Liste statt der Loopwerk-Tipps, nur als Einblender,
// höchstens einer je Sitzung. Gleiche Form wie TIPS in src/ui/tips.js, aber mit when() statt sel.

import { kitOf } from './model.js';

const own = (library) => library.list().filter((s) => s.category === 'own' && !/^pat-/.test(s.id) && !s.missing);

// Kit-Clip oder Kit aus der Kiste in der Werkbank?
function kitOpen(store, ui) {
  const found = ui.selectedClipId ? store.findClip(ui.selectedClipId) : null;
  if (found) { const m = /^pat-(.+)$/.exec(found.clip.sampleId); const pat = m && store.project.patterns?.[m[1]]; return !!(pat?.type === 'drums' && kitOf(store.project, pat.kit)); }
  return !ui.selectedTrackId && !!kitOf(store.project, ui.benchSoundId);
}

export function makeTips({ store, ui, library, engine }) {
  const clips = () => store.project.tracks.flatMap((t) => t.clips);
  // Durchgänge des Loops: Sprünge der hörbaren Position zurück zählen (nur zum Zählen, nichts wird geplant)
  let passes = 0;
  let last = null;
  const watch = () => {
    if (!engine.playing || !store.project.loop.on) { last = null; passes = engine.playing ? passes : 0; return; }
    const b = engine.heardBeat();
    if (last != null && b < last - 0.5) passes++;
    last = b;
  };
  setInterval(watch, 250);
  return [
    { id: 'm-first', text: 'Tipp auf den Clip – in der Werkbank formst du den Klang.', when: () => clips().length >= 1 && own(library).length >= 1 },
    { id: 'm-cut', text: 'Zerlegen macht aus einer langen Aufnahme einzelne Schläge.', when: () => {
      const c = ui.selectedClipId ? store.findClip(ui.selectedClipId)?.clip : null;
      const s = c ? library.get(c.sampleId) : null;
      return !!s && !/^pat-/.test(s.id) && (s.orig?.duration ?? s.duration ?? 0) >= 2;
    } },
    { id: 'm-kit', text: 'Leeres Pad antippen und ins Mikro machen.', when: () => kitOpen(store, ui) },
    { id: 'm-loop', text: '● im Loop nimmt Takes auf, lang drücken für ein einzelnes Geräusch.', when: () => passes >= 3 },
    { id: 'm-clips', text: 'Festhalten am Loop-Bereich macht aus allem eine Schleife.', when: () => clips().length >= 4 },
    { id: 'm-backup', text: 'Song → Projekt → Alle Sounds sichern.', when: () => own(library).length >= 10 },
  ];
}

