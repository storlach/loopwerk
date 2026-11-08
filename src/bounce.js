// Festhalten (ADR 011, Spec docs/specs/krachwerk-3-takes-festhalten.md §3): reine Teile ohne Audio, in Node testbar.
// planBounce sagt, was gerendert wird (Optionen für renderProject) und was danach stumm wird; foldTail faltet den
// Ausklang in den Anfang (Loop), cutTail schneidet ab (Auswahl, Spur ohne Loop), headroom hält 16-Bit-WAV unter 0,98.

import { audibleMap, trackState, anySoloOf, clipSampleIds, isAbove, MAX_CLIP_GAIN, EPS } from './model.js';
import { withFx, busOf, ECHO_TIMES } from './effects.js';
import { sendActive } from './automation.js';

export const MAX_BOUNCE_SECONDS = 480;
export const MAX_BOUNCE_OF = 16;
export const HEADROOM = 0.98;
export const LEAD_FRAMES = 512; // Vorlauf vor dem Loop-Anfang (> 2 × 96 Samples Überblendung)
const MAX_TAIL = 12;
const CUT_FADE = 0.01;

// Ausklang einer Effekt-Einstellung in Sekunden (Hall bis −60 dB, Echo bis −60 dB, Rest kurz)
function fxTail(id, f, spb) {
  if (id === 'hall') return 0.6 + (f.size ?? 0.5) * 3.5;
  if (id === 'echo') {
    const beats = ECHO_TIMES.find((x) => x.id === f.time)?.beats ?? 0.75;
    const fb = Math.min(0.95, Math.max(0.01, f.feedback ?? 0.35));
    return Math.min(4, beats * spb) * (1 + Math.log(0.001) / Math.log(fb)) + 0.1;
  }
  return 0.1;
}

// Ausklang der beteiligten Ketten (Spur-Effekte, Sends zu den Bussen); ohne Effekte nur die Überblendung
export function tailFor(project, tracks, { withFx: fx = true } = {}) {
  const spb = 60 / project.bpm;
  let t = 0.01;
  if (!fx) return t;
  for (const tr of tracks) {
    const all = withFx(tr.fx);
    for (const [id, f] of Object.entries(all)) if (f.on) t = Math.max(t, fxTail(id, f, spb));
    for (const bus of ['hall', 'echo']) if (sendActive(tr, bus)) t = Math.max(t, fxTail(bus, busOf(project, bus), spb));
  }
  return Math.min(MAX_TAIL, t);
}

const overlaps = (c, from, to) => c.startBeat < to - EPS && c.startBeat + c.lengthBeats > from + EPS;
const hears = (ranges, from, to) => (ranges ?? []).some(([a, b]) => a < to - EPS && b > from + EPS);

// Was wird festgehalten? scope: 'loop' | 'track' | 'selection'. missing(id) = Sound fehlt (Clip bleibt still).
// → { scope, mode: 'replace' | 'top', fromBeat, toBeat, opts, sources, fold, belowTrackId, trackId, missing, bounceOf }
//   oder { error } mit einem Satz für den Einblender.
export function planBounce(project, { scope = 'loop', fromBeat = null, toBeat = null, clipIds = [], trackId = null, withFx: fx = true, missing = () => false } = {}) {
  const spb = 60 / project.bpm;
  const loop = project.loop;
  const loopOn = !!loop?.on && loop.endBeat > loop.startBeat + EPS;
  const anySolo = anySoloOf(project);
  const sounds = (t) => !trackState(project, t).mute && (!anySolo || trackState(project, t).solo);
  const audible = audibleMap(project);
  let tracks = [];
  let fold = false;
  let mode = 'replace';
  let from = fromBeat;
  let to = toBeat;
  const opts = { master: false };
  let pick = null; // gewählte Clips (Auswahl)

  if (scope === 'loop') {
    if (from == null || to == null) {
      if (!loopOn) return { error: 'Erst einen Loop ziehen.' };
      [from, to] = [loop.startBeat, loop.endBeat];
    }
    tracks = project.tracks.filter(sounds);
    fold = true;
  } else if (scope === 'track') {
    const track = project.tracks.find((t) => t.id === trackId);
    if (!track) return { error: 'Keine Spur gewählt.' };
    if (from == null || to == null) {
      if (loopOn) [from, to] = [loop.startBeat, loop.endBeat];
      else {
        const live = track.clips.filter((c) => !c.mute);
        if (!live.length) return { error: 'Im Bereich klingt nichts.' };
        from = Math.min(...live.map((c) => c.startBeat));
        to = Math.max(...live.map((c) => c.startBeat + c.lengthBeats));
      }
    }
    fold = loopOn && Math.abs(from - loop.startBeat) < EPS && Math.abs(to - loop.endBeat) < EPS;
    tracks = [track];
    opts.onlyTrack = track.id;
    if (!fx) { mode = 'top'; opts.dry = true; }
  } else if (scope === 'selection') {
    const ids = new Set(clipIds);
    pick = project.tracks.flatMap((t) => t.clips.filter((c) => ids.has(c.id)).map((c) => ({ t, c })));
    if (!pick.length) return { error: 'Keine Clips gewählt.' };
    if (from == null || to == null) {
      from = Math.min(...pick.map((x) => x.c.startBeat));
      to = Math.max(...pick.map((x) => x.c.startBeat + x.c.lengthBeats));
    }
    tracks = [...new Set(pick.map((x) => x.t))];
    opts.onlyClips = pick.map((x) => x.c.id);
    if (!fx && tracks.length === 1) { mode = 'top'; opts.dry = true; }
    else if (!fx) opts.dry = true;
  } else return { error: 'Unbekannter Bereich.' };

  if (!(to - from > EPS)) return { error: 'Im Bereich klingt nichts.' };
  if ((to - from) * spb > MAX_BOUNCE_SECONDS) return { error: `Der Bereich ist länger als ${MAX_BOUNCE_SECONDS / 60} Minuten.` };

  // Quellen: alles, was im Bereich liegt und klingen könnte (auch verdeckte Clips, damit nach dem Stummschalten
  // nichts Neues hervorkommt). Stumme bleiben, wie sie sind; Clips ohne Sound bleiben still und unverändert.
  let silentMissing = 0;
  const sources = [];
  const roots = [];
  const take = (c, win) => {
    if (c.mute) return;
    if (missing(c.sampleId)) { if (hears(audible.get(c.id), win.fromBeat, win.toBeat)) silentMissing++; return; }
    sources.push(win.fromBeat === from && win.toBeat === to ? c.id : { id: c.id, ...win });
    if (hears(audible.get(c.id), win.fromBeat, win.toBeat)) roots.push(project.recipes?.[c.sampleId]?.parent ?? c.sampleId);
  };
  if (pick) {
    const ids = new Set(clipIds);
    for (const { t, c } of pick) {
      take(c, { fromBeat: from, toBeat: to });
      // Was ein gewählter Clip verdeckt, käme nach dem Stummschalten hervor: im Fenster dieses Clips mit stumm
      if (mode === 'replace') {
        for (const u of t.clips) {
          if (ids.has(u.id) || !overlaps(u, c.startBeat, c.startBeat + c.lengthBeats) || !isAbove(c, u, t.clips)) continue;
          if (!u.mute && !missing(u.sampleId)) sources.push({ id: u.id, fromBeat: c.startBeat, toBeat: c.startBeat + c.lengthBeats });
        }
      }
    }
  } else {
    for (const t of tracks) for (const c of t.clips) if (overlaps(c, from, to)) take(c, { fromBeat: from, toBeat: to });
  }
  if (!roots.length) return { error: 'Im Bereich klingt nichts.', missing: silentMissing };

  const order = project.tracks.map((t) => t.id);
  const used = tracks.filter((t) => t.clips.some((c) => overlaps(c, from, to)));
  const belowTrackId = used.reduce((a, t) => (order.indexOf(t.id) > order.indexOf(a) ? t.id : a), used[0]?.id ?? tracks[0]?.id ?? null);
  opts.fromBeat = from;
  opts.toBeat = to;
  opts.tailSeconds = fold ? tailFor(project, used, { withFx: !opts.dry }) : 0;
  return {
    scope, mode, fromBeat: from, toBeat: to, opts, sources, fold, belowTrackId,
    trackId: mode === 'top' ? tracks[0].id : null,
    missing: silentMissing,
    bounceOf: [...new Set(roots)].slice(0, MAX_BOUNCE_OF),
  };
}

// Frames des Bereichs: N = round(Schläge · spb · sr)
export const bounceFrames = (project, fromBeat, toBeat, sampleRate) => Math.round((toBeat - fromBeat) * (60 / project.bpm) * sampleRate);

// Loop-Klang: alles vor dem Anfang (Vorlauf, lead Frames) und nach dem Ende (Ausklang) modulo N in den Bereich falten.
// Genau so klingt der Loop im eingeschwungenen Zustand: Fahnen des vorigen Durchgangs liegen im Anfang.
export function foldTail(chs, N, { lead = 0 } = {}) {
  return chs.map((d) => {
    const out = new Float32Array(N);
    for (let i = 0; i < d.length; i++) {
      const k = (((i - lead) % N) + N) % N;
      out[k] += d[i];
    }
    return out;
  });
}

// Ohne Loop: genau N Frames ab lead, die letzten 10 ms blenden aus
export function cutTail(chs, N, sampleRate, { lead = 0 } = {}) {
  const fade = Math.min(N, Math.round(CUT_FADE * sampleRate));
  return chs.map((d) => {
    const out = new Float32Array(N);
    out.set(d.subarray(lead, Math.min(d.length, lead + N)));
    for (let i = 0; i < fade; i++) out[N - 1 - i] *= i / fade;
    return out;
  });
}

export function peakOf(chs) {
  let p = 0;
  for (const d of chs) for (let i = 0; i < d.length; i++) { const a = Math.abs(d[i]); if (a > p) p = a; }
  return p;
}

// Kopfraum für 16-Bit-WAV: liegt die Spitze über 0,98, wird abgesenkt; gain (bis +12 dB) gleicht am Clip aus
export function headroom(chs, limit = HEADROOM) {
  const peak = peakOf(chs);
  if (peak <= limit) return { chs, gain: 1, factor: 1, peak };
  const factor = limit / peak;
  const out = chs.map((d) => { const o = new Float32Array(d.length); for (let i = 0; i < d.length; i++) o[i] = d[i] * factor; return o; });
  return { chs: out, gain: Math.min(MAX_CLIP_GAIN, 1 / factor), factor, peak };
}

// Name „Festgehalten n“ und Herkunft „Festgehalten: Takt 5–8“
export function bounceName(names) {
  let n = 0;
  for (const s of names) { const m = /^Festgehalten (\d+)$/.exec(s || ''); if (m) n = Math.max(n, Number(m[1])); }
  return `Festgehalten ${n + 1}`;
}
export function bounceSource(project, fromBeat, toBeat) {
  const bpb = project.beatsPerBar;
  const a = Math.floor(fromBeat / bpb + EPS) + 1;
  const b = Math.ceil(toBeat / bpb - EPS);
  return `Festgehalten: Takt ${a}${b > a ? `–${b}` : ''}`;
}

// Alle Sounds, die die Quellen brauchen (für Laden vor dem Rendern)
export const sourceSampleIds = (project, sources) => {
  const ids = new Set(sources.map((s) => (typeof s === 'string' ? s : s.id)));
  return project.tracks.flatMap((t) => t.clips.filter((c) => ids.has(c.id)).flatMap(clipSampleIds));
};
