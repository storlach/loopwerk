// Startet eine DSP-Aufgabe im Worker (Fallback: direkt im Hauptthread, z. B. wenn Module-Worker fehlen).
import { separate } from './separate.js';
import { autotune } from './autotune.js';
import { detectPitch, toMono } from './pitch.js';
import { timeStretch, pitchShift } from './stretch.js';
import { detectKey } from './key.js';
import { searchMaster } from './master-search.js';
import { cookRecipe } from './recipe.js';
import { detectOnsets } from './slice.js';
import { mixMono } from './clean.js';
import { denoise } from './denoise.js';
import { wavJob } from '../wav.js';
import { crc32 } from '../zip.js';

let worker = null;
let nextId = 1;
const pending = new Map();
// Antwortet der Worker nicht (manche Seiten blockieren Worker still, ohne Fehler), rechnet der Hauptthread
const PING_MS = 6000;
let alive = false;

function giveUp() {
  if (!worker) return;
  try { worker.terminate(); } catch { /* egal */ }
  worker = false;
  for (const [id, p] of pending) { pending.delete(id); p.fallback(); }
}

function getWorker() {
  if (worker === null) {
    try {
      worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
      worker.onmessage = (e) => {
        alive = true;
        if (e.data.pong) return;
        const p = pending.get(e.data.id);
        if (!p) return;
        if ('progress' in e.data) { p.onProgress?.(e.data.progress); return; }
        pending.delete(e.data.id);
        if (e.data.error) p.reject(new Error(e.data.error)); else p.resolve(e.data.result);
      };
      worker.onerror = (e) => {
        e.preventDefault?.();
        // Worker ließ sich nicht laden: offene Aufgaben im Hauptthread nachholen
        giveUp();
      };
      // Als Erstes ein Lebenszeichen anfordern – es kommt vor jeder Aufgabe zurück
      worker.postMessage({ id: 0, job: 'ping' });
      setTimeout(() => { if (!alive) giveUp(); }, PING_MS);
    } catch {
      worker = false;
    }
  }
  return worker;
}

const LOCAL = {
  separate: ({ chs, sampleRate }, progress) => separate(chs, sampleRate, { onProgress: progress }),
  autotune: ({ chs, sampleRate, opts }) => autotune(chs, sampleRate, opts),
  pitch: ({ chs, sampleRate }) => detectPitch(toMono(chs), sampleRate),
  stretch: ({ chs, sampleRate, ratio, outLength, loop }) => timeStretch(chs, ratio, sampleRate, outLength ?? Math.round(chs[0].length * ratio), { loop }),
  master: ({ chs, sampleRate, style, target }) => searchMaster(chs, sampleRate, style, target),
  recipe: ({ chs, sampleRate, recipe }) => cookRecipe(chs, sampleRate, recipe),
  onsets: ({ chs, sampleRate, sensitivity }) => detectOnsets(mixMono(chs), sampleRate, { sensitivity }),
  key: ({ chs, sampleRate }) => detectKey(chs, sampleRate),
  pitchshift: ({ chs, sampleRate, semis, loop }) => pitchShift(chs, semis, sampleRate, { loop }),
  denoise: ({ chs, sampleRate, opts }) => denoise(chs, sampleRate, opts),
  wav: (args) => wavJob(args, crc32),
  crc: ({ chs }) => crc32(chs[0]),
};

export function runJob(job, args, { onProgress } = {}) {
  return new Promise((resolve, reject) => {
    const local = () => {
      // Kurz warten, damit die Oberfläche den Fortschritt noch zeichnen kann
      setTimeout(() => { try { resolve(LOCAL[job](args, onProgress)); } catch (err) { reject(err); } }, 30);
    };
    const w = getWorker();
    if (!w) { local(); return; }
    const id = nextId++;
    pending.set(id, { resolve, reject, onProgress, fallback: local });
    // Kanäle kopieren: der Aufrufer behält seine Daten
    const copy = { ...args, chs: args.chs.map((d) => d.slice()) };
    w.postMessage({ id, job, args: copy }, copy.chs.map((d) => d.buffer));
  });
}
