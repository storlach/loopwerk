// Schnelle Fourier-Transformation (Radix 2, in place) und Fensterfunktionen.
// Basis für Tonhöhenerkennung (YIN) und Spektral-Trennung (Stimme, Ebenen).

const tables = new Map();
function table(n) {
  let t = tables.get(n);
  if (!t) {
    const rev = new Uint32Array(n);
    const bits = Math.log2(n);
    for (let i = 0; i < n; i++) {
      let r = 0;
      for (let b = 0; b < bits; b++) r |= ((i >> b) & 1) << (bits - 1 - b);
      rev[i] = r;
    }
    const cos = new Float64Array(n / 2);
    const sin = new Float64Array(n / 2);
    for (let i = 0; i < n / 2; i++) { cos[i] = Math.cos((2 * Math.PI * i) / n); sin[i] = Math.sin((2 * Math.PI * i) / n); }
    t = { rev, cos, sin };
    tables.set(n, t);
  }
  return t;
}

// re/im: Float64Array der Länge n (Zweierpotenz). inverse = true rechnet zurück (mit 1/n).
export function fft(re, im, inverse = false) {
  const n = re.length;
  const { rev, cos, sin } = table(n);
  for (let i = 0; i < n; i++) {
    const j = rev[i];
    if (i < j) {
      let x = re[i]; re[i] = re[j]; re[j] = x;
      x = im[i]; im[i] = im[j]; im[j] = x;
    }
  }
  const sgn = inverse ? 1 : -1;
  for (let size = 2; size <= n; size <<= 1) {
    const half = size >> 1;
    const step = n / size;
    for (let i = 0; i < n; i += size) {
      for (let k = 0; k < half; k++) {
        const wr = cos[k * step];
        const wi = sgn * sin[k * step];
        const a = i + k;
        const b = a + half;
        const tr = re[b] * wr - im[b] * wi;
        const ti = re[b] * wi + im[b] * wr;
        re[b] = re[a] - tr; im[b] = im[a] - ti;
        re[a] += tr; im[a] += ti;
      }
    }
  }
  if (inverse) for (let i = 0; i < n; i++) { re[i] /= n; im[i] /= n; }
}

export function hann(n) {
  const w = new Float64Array(n);
  for (let i = 0; i < n; i++) w[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / n);
  return w;
}

export const nextPow2 = (n) => 1 << Math.ceil(Math.log2(Math.max(2, n)));
