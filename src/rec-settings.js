// Aufnahme-Einstellungen je Gerät (Spec 2.13 A), kein Projektfeld: gemessene Latenz und Handkorrektur
// unter lsKey('loopwerk.recLatency.v1') = { "<Eingang>|<Ausgang>": { ms: 142.3 | null, nudge: 0, at } }, höchstens 20.

import { lsKey } from './edition.js';

const KEY = () => lsKey('loopwerk.recLatency.v1');
const MAX = 20;
export const DEFAULT_INPUT = 'Standard';

function readAll() {
  try {
    const v = JSON.parse(localStorage.getItem(KEY()));
    return v && typeof v === 'object' && !Array.isArray(v) ? v : {};
  } catch { return {}; }
}

function writeAll(all) {
  const keys = Object.keys(all).sort((a, b) => (all[b]?.at || 0) - (all[a]?.at || 0));
  const out = {};
  for (const k of keys.slice(0, MAX)) out[k] = all[k];
  try { localStorage.setItem(KEY(), JSON.stringify(out)); } catch { /* Speicher voll oder gesperrt */ }
  return out;
}

const clean = (e) => (e ? { ms: Number.isFinite(e.ms) ? e.ms : null, nudge: Number.isFinite(e.nudge) ? e.nudge : 0, at: e.at || 0 } : null);

export function loadLatency(key) { return clean(readAll()[key]); }

export function saveLatency(key, patch) {
  const all = readAll();
  const next = { ...(clean(all[key]) || { ms: null, nudge: 0 }), ...patch, at: Date.now() };
  all[key] = next;
  writeAll(all);
  return clean(next);
}

// Ausgang: Label des gewählten bzw. Standard-Ausgangs (Bluetooth verschiebt die Latenz), sonst „Standard“
async function outputLabel(ctx) {
  try {
    const sink = typeof ctx?.sinkId === 'string' ? ctx.sinkId : '';
    const list = await navigator.mediaDevices?.enumerateDevices?.() ?? [];
    const outs = list.filter((d) => d.kind === 'audiooutput');
    const d = outs.find((x) => x.deviceId === (sink || 'default')) ?? (sink ? null : outs[0]);
    return (d?.label || '').trim() || DEFAULT_INPUT;
  } catch { return DEFAULT_INPUT; }
}

const inputLabel = (stream) => {
  const t = stream?.getAudioTracks?.()[0];
  return (t?.label || '').trim() || t?.getSettings?.().deviceId || DEFAULT_INPUT;
};

// Geräteschlüssel „Eingang|Ausgang“; ohne Stream (vor der Freigabe) der zuletzt benutzte Eingang an diesem Ausgang
export async function deviceKey(stream, ctx) {
  const out = await outputLabel(ctx);
  if (stream) return `${inputLabel(stream)}|${out}`;
  // Gewähltes Gerät mit bekanntem Namen (2.13 C): dessen Latenz zeigen
  const dev = loadDevice();
  if (dev.id && dev.label) return `${dev.label}|${out}`;
  const all = readAll();
  const last = Object.keys(all).filter((k) => k.endsWith(`|${out}`)).sort((a, b) => (all[b].at || 0) - (all[a].at || 0))[0];
  return last ?? `${DEFAULT_INPUT}|${out}`;
}

// Eintrag für einen Stream; wurde vor der Freigabe unter „Standard|…“ korrigiert, zieht der Wert auf das Gerät um
export function entryFor(key) {
  const e = loadLatency(key);
  if (e) return e;
  const out = key.slice(key.indexOf('|') + 1);
  const pre = loadLatency(`${DEFAULT_INPUT}|${out}`);
  return pre ? saveLatency(key, { ms: pre.ms, nudge: pre.nudge }) : null;
}

// Schätzung ohne Messung (Formel aus Stufe 5): Ausgabe bis zum Lautsprecher plus Eingang bis zum Worklet
export function estimateLatency(ctx, stream) {
  const input = stream?.getAudioTracks?.()[0]?.getSettings?.().latency || 0;
  return (ctx?.outputLatency || 0) + (ctx?.baseLatency || 0) + input;
}

// Ausgleich in Sekunden: rundweg (gemessen oder geschätzt) + Handkorrektur (+ Verzögerung des Songs durch die Summe)
export async function effectiveLatency(ctx, stream, { song = 0 } = {}) {
  const key = await deviceKey(stream, ctx);
  const e = stream ? entryFor(key) : loadLatency(key);
  const measured = e?.ms != null;
  const round = measured ? e.ms / 1000 : estimateLatency(ctx, stream);
  const nudge = (e?.nudge || 0) / 1000;
  return { seconds: round + nudge + (song || 0), round, nudge, measured, key };
}

// ---------- Eingangsgerät (Spec 2.13 C) ----------
// lsKey('loopwerk.recDevice.v1') = { id: deviceId | '' (Standard), devices: { "<deviceId>": { label, channels, at } } }
const DEV_KEY = () => lsKey('loopwerk.recDevice.v1');

function readDev() {
  try {
    const v = JSON.parse(localStorage.getItem(DEV_KEY()));
    if (v && typeof v === 'object' && !Array.isArray(v)) return { id: typeof v.id === 'string' ? v.id : '', devices: v.devices && typeof v.devices === 'object' ? v.devices : {} };
  } catch { /* leer */ }
  return { id: '', devices: {} };
}

function writeDev(v) {
  const keys = Object.keys(v.devices).sort((a, b) => (v.devices[b]?.at || 0) - (v.devices[a]?.at || 0));
  const devices = {};
  for (const k of keys.slice(0, MAX)) devices[k] = v.devices[k];
  try { localStorage.setItem(DEV_KEY(), JSON.stringify({ id: v.id, devices })); } catch { /* egal */ }
}

// Gewähltes Gerät: { id ('' = Standard), label, channels (1 | 2 | null = unbekannt) }
export function loadDevice() {
  const v = readDev();
  const d = v.devices[v.id || 'default'] || {};
  return { id: v.id, label: d.label || '', channels: d.channels === 1 || d.channels === 2 ? d.channels : null };
}

export function chooseDevice(id, label = '') {
  const v = readDev();
  v.id = id || '';
  const k = v.id || 'default';
  v.devices[k] = { ...v.devices[k], ...(label ? { label } : {}), at: Date.now() };
  writeDev(v);
  return loadDevice();
}

// Nach dem Öffnen: Name und Kanäle des gewählten Geräts merken (chosen = '' für Standard)
export function rememberDevice(chosen, { label, channels }) {
  const v = readDev();
  const k = chosen || 'default';
  const ch = channels === 1 ? 1 : channels >= 2 ? 2 : null;
  v.devices[k] = { ...v.devices[k], ...(label ? { label } : {}), ...(ch ? { channels: ch } : {}), at: Date.now() };
  writeDev(v);
  return loadDevice();
}

// Eingang je Ziel (Spec 2.13 C): 'L' | 'R' | 'LR' (Stereo). input fehlt = Auto: ein Ziel → Stereo bei 2 Kanälen,
// mehrere → abwechselnd Links, Rechts in der Reihenfolge des Scharfschaltens. Ein 1-Kanal-Gerät liefert immer 'L' (Mono).
export function resolveInputs(targets, channels) {
  const stereo = channels !== 1;
  return targets.map((t, i) => {
    let input = t.input === 'L' || t.input === 'R' || t.input === 'LR' ? t.input : null;
    if (!input) input = targets.length === 1 ? 'LR' : i % 2 ? 'R' : 'L';
    if (!stereo) input = 'L';
    return { ...t, input };
  });
}

export const INPUT_LABELS = { L: 'Links', R: 'Rechts', LR: 'Stereo' };
