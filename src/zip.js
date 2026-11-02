// Minimaler ZIP-Packer (Methode „gespeichert“, ohne Kompression). Audio lässt sich ohnehin kaum komprimieren;
// gebraucht wird ZIP, weil das Artifact WAV/MP3 nicht direkt zum Speichern anbieten darf.

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

export function crc32(bytes) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

// files: [{ name, data: Uint8Array }] oder [{ name, data: Blob, crc, size }] (CRC vorab berechnet, z. B. je Einzelspur)
export function makeZip(files) {
  const enc = new TextEncoder();
  const parts = [];
  const central = [];
  let offset = 0;
  const now = new Date();
  const dosTime = (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1);
  const dosDate = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();
  for (const f of files) {
    const name = enc.encode(f.name);
    const crc = f.crc ?? crc32(f.data);
    const size = f.size ?? f.data.length;
    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(4, 20, true);
    local.setUint16(6, 0x0800, true); // UTF-8-Dateinamen
    local.setUint16(8, 0, true);
    local.setUint16(10, dosTime, true);
    local.setUint16(12, dosDate, true);
    local.setUint32(14, crc, true);
    local.setUint32(18, size, true);
    local.setUint32(22, size, true);
    local.setUint16(26, name.length, true);
    local.setUint16(28, 0, true);
    parts.push(new Uint8Array(local.buffer), name, f.data);
    const cd = new DataView(new ArrayBuffer(46));
    cd.setUint32(0, 0x02014b50, true);
    cd.setUint16(4, 20, true);
    cd.setUint16(6, 20, true);
    cd.setUint16(8, 0x0800, true);
    cd.setUint16(10, 0, true);
    cd.setUint16(12, dosTime, true);
    cd.setUint16(14, dosDate, true);
    cd.setUint32(16, crc, true);
    cd.setUint32(20, size, true);
    cd.setUint32(24, size, true);
    cd.setUint16(28, name.length, true);
    cd.setUint32(42, offset, true);
    central.push(new Uint8Array(cd.buffer), name);
    offset += 30 + name.length + size;
  }
  const cdSize = central.reduce((n, p) => n + p.length, 0);
  const endRec = new DataView(new ArrayBuffer(22));
  endRec.setUint32(0, 0x06054b50, true);
  endRec.setUint16(8, files.length, true);
  endRec.setUint16(10, files.length, true);
  endRec.setUint32(12, cdSize, true);
  endRec.setUint32(16, offset, true);
  return new Blob([...parts, ...central, new Uint8Array(endRec.buffer)], { type: 'application/zip' });
}

// Liest eine ZIP-Datei ohne Kompression (wie makeZip sie schreibt): [{ name, data: Uint8Array, crcOk }]
export function readZip(bytes) {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let end = bytes.length - 22;
  while (end >= 0 && dv.getUint32(end, true) !== 0x06054b50) end--;
  if (end < 0) throw new Error('Keine ZIP-Datei');
  const count = dv.getUint16(end + 10, true);
  let p = dv.getUint32(end + 16, true);
  const dec = new TextDecoder();
  const out = [];
  for (let i = 0; i < count; i++) {
    if (dv.getUint32(p, true) !== 0x02014b50) throw new Error('ZIP-Verzeichnis beschädigt');
    const method = dv.getUint16(p + 10, true);
    const crc = dv.getUint32(p + 16, true);
    const size = dv.getUint32(p + 20, true);
    const nameLen = dv.getUint16(p + 28, true);
    const extra = dv.getUint16(p + 30, true);
    const comment = dv.getUint16(p + 32, true);
    const at = dv.getUint32(p + 42, true);
    const name = dec.decode(bytes.subarray(p + 46, p + 46 + nameLen));
    if (method !== 0) throw new Error('Komprimierte ZIP-Einträge werden nicht gelesen');
    const start = at + 30 + dv.getUint16(at + 26, true) + dv.getUint16(at + 28, true);
    const data = bytes.subarray(start, start + size);
    out.push({ name, data, crcOk: crc32(data) === crc });
    p += 46 + nameLen + extra + comment;
  }
  return out;
}
