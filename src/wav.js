// WAV-Kodierung: 16 oder 24 Bit PCM, 32 Bit Gleitkomma (übersteuert nicht: Werte über 0 dBFS bleiben erhalten).

export function encodeWav(buffer, { bits = 16 } = {}) {
  const ch = buffer.numberOfChannels;
  const frames = buffer.length;
  const float = bits === 32;
  const bytesPer = bits / 8;
  const fmtSize = float ? 18 : 16;
  const head = 12 + 8 + fmtSize + (float ? 12 : 0) + 8;
  const dataBytes = frames * ch * bytesPer;
  const view = new DataView(new ArrayBuffer(head + dataBytes));
  const str = (o, s) => { for (let i = 0; i < s.length; i++) view.setUint8(o + i, s.charCodeAt(i)); };
  let o = 0;
  str(o, 'RIFF'); view.setUint32(o + 4, head + dataBytes - 8, true); str(o + 8, 'WAVE'); o += 12;
  str(o, 'fmt '); view.setUint32(o + 4, fmtSize, true); o += 8;
  view.setUint16(o, float ? 3 : 1, true);
  view.setUint16(o + 2, ch, true);
  view.setUint32(o + 4, buffer.sampleRate, true);
  view.setUint32(o + 8, buffer.sampleRate * ch * bytesPer, true);
  view.setUint16(o + 12, ch * bytesPer, true);
  view.setUint16(o + 14, bits, true);
  if (float) view.setUint16(o + 16, 0, true);
  o += fmtSize;
  // Gleitkomma ist kein PCM: dazu gehört ein „fact“-Block mit der Zahl der Frames
  if (float) { str(o, 'fact'); view.setUint32(o + 4, 4, true); view.setUint32(o + 8, frames, true); o += 12; }
  str(o, 'data'); view.setUint32(o + 4, dataBytes, true); o += 8;
  const data = Array.from({ length: ch }, (_, c) => buffer.getChannelData(c));
  for (let i = 0; i < frames; i++) {
    for (let c = 0; c < ch; c++) {
      const s = data[c][i];
      if (float) { view.setFloat32(o, s, true); o += 4; continue; }
      const v = Math.max(-1, Math.min(1, s));
      if (bits === 24) {
        const x = Math.round(v < 0 ? v * 0x800000 : v * 0x7fffff);
        view.setUint8(o, x & 0xff); view.setUint8(o + 1, (x >> 8) & 0xff); view.setUint8(o + 2, (x >> 16) & 0xff);
        o += 3;
      } else {
        view.setInt16(o, v < 0 ? v * 0x8000 : v * 0x7fff, true);
        o += 2;
      }
    }
  }
  return new Blob([view], { type: 'audio/wav' });
}

// Export-Format aus dem Wahlknopf: „wav“ (16 Bit), „wav24“, „wav32“ (Gleitkomma) oder „mp3“
export const wavBits = (format) => (format === 'wav24' ? 24 : format === 'wav32' ? 32 : 16);
export const fileExt = (format) => (format === 'mp3' ? 'mp3' : 'wav');
