// MP3-Kodierung in einem eigenen Worker (klassisch, damit lamejs unverändert per importScripts lädt, ADR 002) – die Seite
// bleibt beim Export bedienbar. Gleiche Rechnung wie der Rückfall in src/export.js (Blöcke, Wandlung nach 16 Bit),
// die Datei ist bitgleich.
importScripts('../../vendor/lamejs/lame.min.js');

const toInt16 = (f) => {
  const out = new Int16Array(f.length);
  for (let i = 0; i < f.length; i++) { const v = Math.max(-1, Math.min(1, f[i])); out[i] = v < 0 ? v * 0x8000 : v * 0x7fff; }
  return out;
};

self.onmessage = (e) => {
  const { l: lf, r: rf, sampleRate, kbps, block } = e.data;
  try {
    const enc = new self.lamejs.Mp3Encoder(2, sampleRate, kbps);
    let peak = 0;
    for (const d of lf === rf ? [lf] : [lf, rf]) for (let i = 0; i < d.length; i++) { const a = Math.abs(d[i]); if (a > peak) peak = a; }
    const l = toInt16(lf);
    const r = lf === rf ? l : toInt16(rf);
    const chunks = [];
    for (let i = 0; i < l.length; i += block) {
      const out = enc.encodeBuffer(l.subarray(i, i + block), r.subarray(i, i + block));
      if (out.length) chunks.push(new Uint8Array(out));
      if ((i / block) % 4 === 0) self.postMessage({ progress: i / l.length });
    }
    const end = enc.flush();
    if (end.length) chunks.push(new Uint8Array(end));
    self.postMessage({ chunks, peak }, chunks.map((c) => c.buffer));
  } catch (err) {
    self.postMessage({ error: err?.message || String(err) });
  }
};
self.postMessage({ ready: true });
