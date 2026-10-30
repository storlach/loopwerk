// Startet eine DSP-Aufgabe im Worker (Fallback: direkt im Hauptthread, z. B. wenn Module-Worker fehlen).
import { separate } from './separate.js';
import { autotune } from './autotune.js';
import { detectPitch, toMono } from './pitch.js';
import { timeStretch } from './stretch.js';

let worker = null;
let nextId = 1;
const pending = new Map();

function getWorker() {
  if (worker === null) {
    try {
      worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
      worker.onmessage = (e) => {
        const p = pending.get(e.data.id);
        if (!p) return;
        if ('progress' in e.data) { p.onProgress?.(e.data.progress); return; }
        pending.delete(e.data.id);
        if (e.data.error) p.reject(new Error(e.data.error)); else p.resolve(e.data.result);
      };
      worker.onerror = (e) => {
        e.preventDefault?.();
        // Worker ließ sich nicht laden: offene Aufgaben im Hauptthread nachholen
        worker = false;
        for (const [id, p] of pending) { pending.delete(id); p.fallback(); }
      };
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
  stretch: ({ chs, sampleRate, ratio, loop }) => timeStretch(chs, ratio, sampleRate, Math.round(chs[0].length * ratio), { loop }),
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
