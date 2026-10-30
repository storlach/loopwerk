// Rechen-Worker für lange DSP-Aufgaben (Trennung, Autotune, Tonhöhe), damit die Oberfläche flüssig bleibt.
import { separate } from './separate.js';
import { autotune } from './autotune.js';
import { detectPitch, toMono } from './pitch.js';
import { timeStretch } from './stretch.js';

const JOBS = {
  separate: ({ chs, sampleRate }, progress) => separate(chs, sampleRate, { onProgress: progress }),
  autotune: ({ chs, sampleRate, opts }) => autotune(chs, sampleRate, opts),
  pitch: ({ chs, sampleRate }) => detectPitch(toMono(chs), sampleRate),
  stretch: ({ chs, sampleRate, ratio, loop }) => timeStretch(chs, ratio, sampleRate, Math.round(chs[0].length * ratio), { loop }),
};

self.onmessage = (e) => {
  const { id, job, args } = e.data;
  try {
    const result = JOBS[job](args, (p) => self.postMessage({ id, progress: p }));
    // Float32Arrays ohne Kopie zurückgeben
    const transfer = [];
    const collect = (v) => {
      if (v instanceof Float32Array) transfer.push(v.buffer);
      else if (Array.isArray(v)) v.forEach(collect);
      else if (v && typeof v === 'object') Object.values(v).forEach(collect);
    };
    collect(result);
    self.postMessage({ id, result }, [...new Set(transfer)]);
  } catch (err) {
    self.postMessage({ id, error: err.message || String(err) });
  }
};
