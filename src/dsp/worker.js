// Rechen-Worker für lange DSP-Aufgaben (Trennung, Autotune, Tonhöhe, Rauschminderung), damit die Oberfläche flüssig bleibt.
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

const JOBS = {
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
};

self.onmessage = (e) => {
  const { id, job, args } = e.data;
  if (job === 'ping') { self.postMessage({ id, pong: true }); return; }
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
