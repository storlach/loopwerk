// Raumlicht als Shader (WebGL 2): fließender Nebel aus verzerrtem Rauschen, darin Sternenstaub.
// Die Musik steuert nur Werte (Bänder, Farben, Marke, Nachglühen); gezeichnet wird alles auf der Grafikkarte.
// Ohne WebGL 2 gibt createRoomShader null zurück, glow.js malt dann wie bisher mit Canvas 2D.

const VS = `#version 300 es
in vec2 a;
void main() { gl_Position = vec4(a, 0.0, 1.0); }`;

// Erster Durchgang, klein: der teure Nebel (zweifach verzerrtes Rauschen, der Bass verbiegt ihn stärker)
const FIELD_FS = `#version 300 es
precision highp float;
uniform vec2 uRes;
uniform float uT;
uniform float uBass;
out vec4 o;
float hash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
}
const mat2 R = mat2(1.6, 1.2, -1.2, 1.6);
float fbm(vec2 p) { float s = 0.0, a = 0.5; for (int i = 0; i < 4; i++) { s += a * noise(p); p = R * p; a *= 0.5; } return s; }
void main() {
  float L = max(uRes.x, uRes.y);
  vec2 P = vec2(gl_FragCoord.x, uRes.y - gl_FragCoord.y) / L;
  vec2 s = P * 2.4;
  vec2 q = vec2(fbm(s + vec2(0.0, uT * 0.05)), fbm(s + vec2(5.2, 1.3) - vec2(uT * 0.04, 0.0)));
  vec2 r = vec2(fbm(s + 3.0 * q + vec2(1.7, 9.2) + uT * 0.035), fbm(s + 3.0 * q + vec2(8.3, 2.8) - uT * 0.03));
  float f = clamp(fbm(s + (2.0 + 1.6 * uBass) * r), 0.0, 0.999);
  float hi = floor(f * 255.0) / 255.0;
  o = vec4(hi, (f - hi) * 255.0, 0.0, 1.0);
}`;

// Zweiter Durchgang, volle Auflösung: gemeinsamer Vorspann (Licht der Musik, Punktraster), dann je Variante ein main()
const PRE = `#version 300 es
precision highp float;
uniform vec2 uRes;
uniform float uT;
uniform float uK;
uniform float uA;
uniform vec3 uBand;
uniform vec3 uGlow;
uniform vec3 uC0;
uniform vec3 uC1;
uniform vec3 uC2;
uniform vec3 uWhite;
uniform vec4 uCloud[6];
uniform vec3 uCloudC[6];
uniform vec4 uCol;
uniform vec3 uColC;
uniform vec4 uGhost;
uniform vec4 uWave[4];
uniform float uVig;
uniform float uIdle;
uniform vec3 uGrey;
uniform float uGlowMax;
uniform float uPx;
uniform sampler2D uField;
uniform float uSpec[32];
uniform float uPeak[32];
uniform vec3 uCatE[6];
uniform vec3 uCatC[6];
uniform vec4 uTrk[8];
uniform vec3 uTrkC[8];
uniform int uTrkN;
uniform sampler2D uHist;
uniform float uHistFrac;
const int HIST = 48;
out vec4 o;
float hash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
vec3 toWhite(vec3 c, float k) { return mix(c, uWhite, k); }
float L() { return max(uRes.x, uRes.y); }
// Nebel an einer Stelle (uv, y nach unten)
float field(vec2 uv) { vec4 t = texture(uField, vec2(uv.x, 1.0 - uv.y)); return t.r + t.g / 255.0; }
float beamAt(vec4 c, vec2 uv) {
  if (c.y < 0.002) return 0.0;
  float dx = (uv.x - c.x) * uRes.x / L();
  float ys = smoothstep(c.z - 0.03, c.z + 0.05, uv.y) * smoothstep(c.w + 0.03, c.w - 0.05, uv.y);
  return c.y * ys * exp(-dx * dx / 0.0035);
}
// Farbiges Licht der Musik ohne Struktur
vec3 light(vec2 uv, out float beam) {
  vec2 P = uv * uRes / L();
  float bass = uBand.x, highs = uBand.z;
  vec3 col = vec3(0.0);
  col += uC0 * uK * bass * smoothstep(1.0 - (0.42 + 0.36 * bass), 1.08, uv.y) * 1.2;
  vec2 dc = (P - 0.5 * uRes / L()) / vec2(0.6, 0.45);
  col += uC1 * uK * (0.4 + 0.6 * uA) * 0.32 * exp(-dot(dc, dc) * 1.6);
  for (int i = 0; i < 6; i++) {
    vec4 c = uCloud[i];
    if (c.w < 0.002) continue;
    vec2 dp = (P - c.xy) / vec2(c.z, c.z * 0.8);
    col += uCloudC[i] * c.w * exp(-dot(dp, dp) * 2.4);
  }
  col += uC2 * uK * highs * smoothstep(0.42, 0.0, uv.y) * 0.6;
  beam = beamAt(uCol, uv) + beamAt(uGhost, uv);
  col += uColC * 0.6 * beam;
  vec2 gc = (P - 0.5 * uRes / L()) / vec2(0.5, 0.36);
  float area = uGlow.x * smoothstep(0.45, 1.05, uv.y) + uGlow.y * exp(-dot(gc, gc)) + uGlow.z * smoothstep(0.4, 0.0, uv.y);
  col += toWhite(normalize(col + 1e-4), 0.55) * uGlowMax * 0.6 * area;
  return col;
}
float waveAt(vec2 uv) {
  vec2 P = uv * uRes / L();
  float w = 0.0;
  for (int i = 0; i < 4; i++) {
    vec4 wv = uWave[i];
    if (wv.w < 0.002) continue;
    float e = (length((P - wv.xy) / vec2(1.0, 0.85)) - wv.z) / 0.035;
    w += wv.w * exp(-e * e);
  }
  return w;
}
void finish(vec3 col, vec2 uv) {
  float e = length((uv - 0.5) / 0.62);
  float vig = e < 0.6 ? 0.0 : (e < 0.8 ? 0.35 * (e - 0.6) / 0.2 : mix(0.35, 0.85, clamp((e - 0.8) / 0.2, 0.0, 1.0)));
  col *= 1.0 - uVig * vig;
  col = col / (1.0 + 0.35 * col);
  col += (hash(gl_FragCoord.xy) - 0.5) / 255.0;
  col = clamp(col, 0.0, 1.0);
  o = vec4(col, max(col.r, max(col.g, col.b)));
}
vec2 UV() { return vec2(gl_FragCoord.x / uRes.x, 1.0 - gl_FragCoord.y / uRes.y); }

// Punktraster: xy Mitte der Zelle (uv), z Abstand zur Mitte (px), w Zellgröße (px)
vec4 cellAt(float css) {
  float c = css * uPx;
  vec2 g = gl_FragCoord.xy / c;
  vec2 id = floor(g);
  return vec4((id.x + 0.5) * c / uRes.x, 1.0 - (id.y + 0.5) * c / uRes.y, length(fract(g) - 0.5) * c, c);
}
float dotR(vec4 C, float v) { return (0.12 + 0.36 * sqrt(clamp(v, 0.0, 1.0))) * C.w; }
float dotOf(vec4 C, float v) { return 1.0 - clamp((C.z - dotR(C, v)) / uPx + 0.5, 0.0, 1.0); }
float haloOf(vec4 C, float v) { return exp(-pow(max(0.0, C.z - dotR(C, v)) / (3.0 * uPx), 2.0)); }
float specAt(float x) { float b = clamp(x, 0.0, 0.9999) * 31.0; int i = int(b); return mix(uSpec[i], uSpec[min(i + 1, 31)], fract(b)); }
float peakAt(float x) { float b = clamp(x, 0.0, 0.9999) * 31.0; int i = int(b); return mix(uPeak[i], uPeak[min(i + 1, 31)], fract(b)); }
vec3 bandCol(float x) { return x < 0.45 ? mix(uC0, uC1, smoothstep(0.1, 0.45, x)) : mix(uC1, uC2, smoothstep(0.55, 0.9, x)); }
`;

// Varianten (vorläufig zum Vergleich): 0 Sternenstaub ruhig, 1 Spektrum-Wand, 2 Spur-Pulse, 3 Sternenstaub reaktiv, 4 Wasserfall
const BODY = [`
// Sternenstaub: Lichtpunkte sammeln sich, wo Nebel und Licht sind (viele kleine, wenige große); sie blenden weich
// ein und aus, während der Nebel zieht, und funkeln mit der Musik schneller
void main() {
  vec2 uv = UV();
  float beam;
  vec3 ink = light(uv, beam);
  vec3 col = ink * 0.3 + uGrey * uIdle * 0.1;
  for (int k = 0; k < 2; k++) {
    float cell = (k == 0 ? 6.0 : 15.0) * uPx;
    vec2 g = gl_FragCoord.xy / cell;
    vec2 id = floor(g);
    float h = hash(id + float(k) * 17.0);
    vec2 cuv = vec2((id.x + 0.5) * cell / uRes.x, 1.0 - (id.y + 0.5) * cell / uRes.y);
    float bc = beamAt(uCol, cuv) + beamAt(uGhost, cuv);
    vec3 ic = ink;
    float lc = dot(ic, vec3(0.2126, 0.7152, 0.0722));
    float dens = (smoothstep(0.35, 0.8, field(cuv)) * (0.15 + 2.2 * lc) + 0.8 * bc + 0.04 * uIdle + 0.6 * waveAt(cuv)) * (k == 0 ? 0.55 : 0.3);
    float on = smoothstep(h - 0.06, h + 0.02, dens);
    if (on < 0.002) continue;
    vec2 jp = vec2(hash(id + 3.1), hash(id + 7.3)) - 0.5;
    vec2 dp = (fract(g) - 0.5 - jp * 0.6) * cell;
    float r = (k == 0 ? 0.9 : 1.7) * uPx * (0.7 + 0.6 * hash(id + 1.7));
    float st = exp(-dot(dp, dp) / (r * r)) + 0.12 * exp(-dot(dp, dp) / (9.0 * r * r));
    float tw = 0.6 + 0.4 * sin(uT * (0.8 + 2.2 * hash(id + 4.4)) + h * 50.0);
    col += toWhite(normalize(ic + 1e-3), 0.5) * st * on * tw * (0.25 + 1.6 * lc + bc) * (k == 0 ? 0.8 : 1.2);
  }
  finish(col, uv);
}
`, `
// 1 · Spektrum-Wand: jede Spalte ein Frequenzband (links tief, rechts hoch), füllt sich von unten, Spitzenpunkt fällt langsam
void main() {
  vec2 uv = UV();
  float beam;
  vec3 ink = light(uv, beam);
  vec4 C = cellAt(12.0);
  float h = 1.0 - C.y;
  float s = specAt(C.x) * 0.9, pk = peakAt(C.x) * 0.9;
  float cellH = C.w / uRes.y;
  float on = 1.0 - smoothstep(s - cellH * 0.5, s + cellH * 0.5, h);
  float top = (1.0 - clamp(abs(h - pk) / cellH, 0.0, 1.0)) * step(0.02, pk);
  float bc = beamAt(uCol, C.xy) + beamAt(uGhost, C.xy);
  float kk = clamp(uK / max(uGlowMax, 0.01), 0.0, 1.0);
  float v = clamp((on * (0.3 + 0.7 * h / max(s, 0.05)) + top + 0.7 * bc) * (0.25 + 0.75 * kk), 0.0, 1.0);
  vec3 c = toWhite(bandCol(C.x), 0.15 + 0.55 * top + 0.4 * min(1.0, bc));
  vec3 col = ink * 0.18 + uGrey * uIdle * 0.05;
  col += c * dotOf(C, max(v, 0.03)) * (0.03 + 0.95 * v) + c * haloOf(C, v) * 0.2 * v;
  finish(col, uv);
}
`, `
// 2 · Spur-Pulse: jeder Schlag einer Spur schickt eine senkrechte Lichtfront von der Marke nach links und rechts,
// in ihrer Farbe und nahe ihrer Zeile am hellsten; was klingt, glüht als Band an der Marke
void main() {
  vec2 uv = UV();
  float beam;
  vec3 ink = light(uv, beam);
  vec4 C = cellAt(11.0);
  float v = 0.0;
  vec3 acc = vec3(0.0);
  for (int i = 0; i < 8; i++) {
    if (i >= uTrkN) break;
    vec4 t = uTrk[i];
    float yc = 0.5 * (t.x + t.y), hh = max(0.015, 0.5 * (t.y - t.x));
    float dy = C.y - yc;
    float age = t.w > 0.002 ? -0.32 * log(t.w) : 9.0;
    float dx = abs(C.x - uCol.x) * uRes.x / L();
    float front = 0.02 + age * 0.9;
    float spread = 0.1 + hh + 0.5 * age;
    float wv = t.w * exp(-pow((dx - front) / (0.025 + 0.06 * age), 2.0)) * exp(-dy * dy / (spread * spread));
    float core = t.z * exp(-dx * dx / 0.0015) * exp(-dy * dy / 0.04);
    float e = 0.9 * wv + 0.5 * core;
    v += e;
    acc += uTrkC[i] * e;
  }
  float bc = beamAt(uCol, C.xy) + beamAt(uGhost, C.xy);
  vec3 c = v > 0.001 ? toWhite(acc / v, 0.2 + 0.45 * min(1.0, v)) : uColC;
  v = clamp(v + 0.35 * bc, 0.0, 1.0);
  vec3 col = ink * 0.2 + uGrey * uIdle * 0.05;
  col += c * dotOf(C, max(v, 0.03)) * (0.03 + 0.95 * v) + c * haloOf(C, v) * 0.22 * v;
  finish(col, uv);
}
`, `
// 3 · Sternenstaub, reaktiv: jeder Stern gehört zu einer Kategorie und blitzt mit ihren Schlägen auf;
// große Sterne für Drums und Bass (Bass eher unten), kleine für alles andere
void main() {
  vec2 uv = UV();
  float beam;
  vec3 ink = light(uv, beam);
  vec3 col = ink * 0.22 + uGrey * uIdle * 0.08;
  for (int k = 0; k < 2; k++) {
    float cell = (k == 0 ? 7.0 : 17.0) * uPx;
    vec2 g = gl_FragCoord.xy / cell;
    vec2 id = floor(g);
    float h = hash(id + float(k) * 17.0);
    vec2 cuv = vec2((id.x + 0.5) * cell / uRes.x, 1.0 - (id.y + 0.5) * cell / uRes.y);
    float hc = hash(id + 5.5 + float(k));
    int ci = k == 1 ? (hc < 0.55 ? 0 : 1) : min(5, int(hc * 6.0));
    vec3 e = uCatE[ci];
    float pos = ci == 1 ? smoothstep(0.25, 0.95, cuv.y) : 1.0;
    float dens = 0.25 + 0.75 * smoothstep(0.3, 0.8, field(cuv));
    float act = (0.05 + 1.3 * e.x + 1.8 * e.y) * pos * dens;
    float on = smoothstep(h - 0.08, h + 0.01, act * (k == 0 ? 0.45 : 0.2) + 0.6 * beamAt(uCol, cuv));
    if (on < 0.002) continue;
    vec2 jp = vec2(hash(id + 3.1), hash(id + 7.3)) - 0.5;
    vec2 dp = (fract(g) - 0.5 - jp * 0.6) * cell;
    float r = (k == 0 ? 0.9 : 1.6) * uPx * (0.7 + 0.6 * hash(id + 1.7)) * (1.0 + 0.25 * e.y);
    float st = exp(-dot(dp, dp) / (r * r)) + 0.12 * exp(-dot(dp, dp) / (9.0 * r * r)) * smoothstep(0.5 * cell, 0.25 * cell, length(dp));
    float tw = 0.8 + 0.2 * sin(uT * (0.8 + 2.2 * hash(id + 4.4)) + h * 50.0);
    col += toWhite(uCatC[ci], 0.25 + 0.5 * e.y) * st * on * tw * (0.15 + 0.8 * e.x + 1.2 * e.y) * (k == 0 ? 0.8 : 1.1);
  }
  finish(col, uv);
}
`, `
// 4 · Wasserfall: das Spektrum der letzten drei Takte steigt als Punktraster von unten auf (unten = jetzt)
void main() {
  vec2 uv = UV();
  float beam;
  vec3 ink = light(uv, beam);
  vec4 C = cellAt(10.0);
  float age = 1.0 - C.y;
  float v = texture(uHist, vec2(clamp(C.x, 0.0, 1.0), clamp((age * float(HIST) - uHistFrac + 0.5) / float(HIST), 0.0, 1.0))).r;
  float kk = clamp(uK / max(uGlowMax, 0.01), 0.0, 1.0);
  float bc = beamAt(uCol, C.xy) + beamAt(uGhost, C.xy);
  v = pow(smoothstep(0.5, 0.95, v), 1.4);
  v = clamp(v * (1.0 - 0.6 * age) * (0.3 + 0.7 * kk) + 0.5 * bc, 0.0, 1.0);
  vec3 c = toWhite(bandCol(C.x), 0.15 + 0.45 * v);
  vec3 col = ink * 0.18 + uGrey * uIdle * 0.05;
  col += c * dotOf(C, max(v, 0.03)) * (0.03 + 0.95 * v) + c * haloOf(C, v) * 0.2 * v;
  finish(col, uv);
}
`];
export const VARIANTS = ['Sterne ruhig', 'Spektrum-Wand', 'Spur-Pulse', 'Sterne reaktiv', 'Wasserfall'];

export function createRoomShader(canvas) {
  let gl = null;
  try {
    gl = canvas.getContext('webgl2', { alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false, preserveDrawingBuffer: true, powerPreference: 'low-power' });
  } catch { gl = null; }
  if (!gl) return null;
  const sh = (type, src) => {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) || 'Shader');
    return s;
  };
  const link = (fs) => {
    const pr = gl.createProgram();
    gl.attachShader(pr, sh(gl.VERTEX_SHADER, VS));
    gl.attachShader(pr, sh(gl.FRAGMENT_SHADER, fs));
    gl.bindAttribLocation(pr, 0, 'a');
    gl.linkProgram(pr);
    if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(pr) || 'Programm');
    return pr;
  };
  const NAMES = ['uRes', 'uT', 'uK', 'uA', 'uBand', 'uGlow', 'uC0', 'uC1', 'uC2', 'uWhite', 'uCloud', 'uCloudC', 'uCol', 'uColC', 'uGhost', 'uWave', 'uVig', 'uIdle', 'uGrey', 'uGlowMax', 'uPx', 'uField',
    'uSpec', 'uPeak', 'uCatE', 'uCatC', 'uTrk', 'uTrkC', 'uTrkN', 'uHist', 'uHistFrac'];
  // Ein Programm je Variante, erst beim ersten Gebrauch übersetzt
  const progs = [];
  function program(v) {
    if (!progs[v]) {
      const pr = link(PRE + BODY[v]);
      const U = {};
      for (const n of NAMES) U[n] = gl.getUniformLocation(pr, n);
      progs[v] = { pr, U };
    }
    return progs[v];
  }
  let fieldProg;
  try {
    fieldProg = link(FIELD_FS);
    program(0);
  } catch (e) {
    console.warn('Raumlicht ohne Shader:', e.message);
    return null;
  }
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  const FU = { res: gl.getUniformLocation(fieldProg, 'uRes'), t: gl.getUniformLocation(fieldProg, 'uT'), bass: gl.getUniformLocation(fieldProg, 'uBass') };
  // Nebel-Textur (RGBA8, weich gefiltert) mit eigenem Framebuffer
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  for (const [k, v] of [[gl.TEXTURE_MIN_FILTER, gl.LINEAR], [gl.TEXTURE_MAG_FILTER, gl.LINEAR], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_2D, k, v);
  const fbo = gl.createFramebuffer();
  // Verlauf des Spektrums (32 Bänder × 48 Zeilen, oben die jüngste) für den Wasserfall
  const histTex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, histTex);
  for (const [k, v] of [[gl.TEXTURE_MIN_FILTER, gl.LINEAR], [gl.TEXTURE_MAG_FILTER, gl.LINEAR], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_2D, k, v);
  gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, 32, 48, 0, gl.RED, gl.UNSIGNED_BYTE, new Uint8Array(32 * 48));
  let fw = 0, fh = 0;
  let lost = false;
  canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); lost = true; });
  const cloud = new Float32Array(24), cloudC = new Float32Array(18), waves = new Float32Array(16);
  const catE = new Float32Array(18), catC = new Float32Array(18), trk = new Float32Array(32), trkC = new Float32Array(24);
  const c3 = (c) => [c[0] / 255, c[1] / 255, c[2] / 255];

  // Software-Renderer (kein Grafikchip): dann rechnet glow.js mit kleinerer Auflösung
  const info = gl.getExtension('WEBGL_debug_renderer_info');
  const renderer = String(info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER));
  const software = /swiftshader|llvmpipe|softpipe|software|basic render/i.test(renderer);

  return {
    software,
    get lost() { return lost || gl.isContextLost(); },
    // u: Werte aus glow.js, Farben 0…255, Orte in Raum-Einheiten (0…1 der langen Seite) bzw. uv (0…1)
    draw(u) {
      if (this.lost) return;
      // 1) Nebel klein: etwa ein Drittel der CSS-Auflösung
      const k = 1 / (3 * (u.px || 1));
      const w = Math.max(16, Math.round(canvas.width * k)), h = Math.max(16, Math.round(canvas.height * k));
      gl.bindTexture(gl.TEXTURE_2D, tex);
      if (w !== fw || h !== fh) {
        fw = w; fh = h;
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
        gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
      }
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
      gl.viewport(0, 0, w, h);
      gl.useProgram(fieldProg);
      gl.uniform2f(FU.res, w, h);
      gl.uniform1f(FU.t, u.t);
      gl.uniform1f(FU.bass, u.band[0]);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      // 2) Licht und Punkte in voller Auflösung
      let P;
      try { P = program(u.variant || 0); } catch (e) { console.warn('Raumlicht-Variante:', e.message); P = program(0); }
      const U = P.U;
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.useProgram(P.pr);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.uniform1i(U.uField, 0);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, histTex);
      if (u.react) gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, 32, 48, gl.RED, gl.UNSIGNED_BYTE, u.react.hist);
      gl.uniform1i(U.uHist, 1);
      gl.activeTexture(gl.TEXTURE0);
      if (u.react) {
        const r = u.react;
        gl.uniform1fv(U.uSpec, r.spec);
        gl.uniform1fv(U.uPeak, r.peak);
        catE.fill(0);
        r.cats.forEach((c, i) => { catE.set([c.env, c.flash, 0], i * 3); catC.set(c3(c.c), i * 3); });
        gl.uniform3fv(U.uCatE, catE);
        gl.uniform3fv(U.uCatC, catC);
        trk.fill(0);
        r.tracks.slice(0, 8).forEach((t, i) => { trk.set([t.y0, t.y1, t.env, t.flash], i * 4); trkC.set(c3(t.c), i * 3); });
        gl.uniform4fv(U.uTrk, trk);
        gl.uniform3fv(U.uTrkC, trkC);
        gl.uniform1i(U.uTrkN, Math.min(8, r.tracks.length));
        gl.uniform1f(U.uHistFrac, r.histFrac);
      }
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.uniform2f(U.uRes, canvas.width, canvas.height);
      gl.uniform1f(U.uT, u.t);
      gl.uniform1f(U.uK, u.K);
      gl.uniform1f(U.uA, u.A);
      gl.uniform3f(U.uBand, ...u.band);
      gl.uniform3f(U.uGlow, ...u.glow);
      gl.uniform3f(U.uC0, ...c3(u.c0));
      gl.uniform3f(U.uC1, ...c3(u.c1));
      gl.uniform3f(U.uC2, ...c3(u.c2));
      gl.uniform3f(U.uWhite, ...c3(u.white));
      cloud.fill(0);
      u.clouds.slice(0, 6).forEach((c, i) => { cloud.set([c.x, c.y, c.r, c.a], i * 4); cloudC.set(c3(c.c), i * 3); });
      gl.uniform4fv(U.uCloud, cloud);
      gl.uniform3fv(U.uCloudC, cloudC);
      gl.uniform4f(U.uCol, u.col.x, u.col.i, u.col.y0, u.col.y1);
      gl.uniform3f(U.uColC, ...c3(u.col.c));
      gl.uniform4f(U.uGhost, u.ghost.x, u.ghost.i, u.ghost.y0, u.ghost.y1);
      waves.fill(0);
      u.waves.slice(0, 4).forEach((w, i) => waves.set([w.x, w.y, w.r, w.a], i * 4));
      gl.uniform4fv(U.uWave, waves);
      gl.uniform1f(U.uVig, u.vig);
      gl.uniform1f(U.uIdle, u.idle);
      gl.uniform3f(U.uGrey, ...c3(u.grey));
      gl.uniform1f(U.uGlowMax, u.glowMax);
      gl.uniform1f(U.uPx, u.px || 1);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    },
    // Für Tests: Bild als RGBA (nicht vormultipliziert, oben zuerst), verkleinert auf W×H
    read(W, H) {
      const cw = canvas.width, ch = canvas.height;
      const px = new Uint8Array(cw * ch * 4);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.readPixels(0, 0, cw, ch, gl.RGBA, gl.UNSIGNED_BYTE, px);
      const out = new Uint8ClampedArray(W * H * 4);
      for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
          const x0 = Math.floor((x * cw) / W), x1 = Math.max(x0 + 1, Math.floor(((x + 1) * cw) / W));
          const y0 = Math.floor((y * ch) / H), y1 = Math.max(y0 + 1, Math.floor(((y + 1) * ch) / H));
          let r = 0, g = 0, b = 0, a = 0, n = 0;
          for (let yy = y0; yy < y1; yy++) {
            const row = (ch - 1 - yy) * cw;
            for (let xx = x0; xx < x1; xx++) { const i = (row + xx) * 4; r += px[i]; g += px[i + 1]; b += px[i + 2]; a += px[i + 3]; n++; }
          }
          const o = (y * W + x) * 4;
          const k = a > 0 ? 255 / a : 0;
          out[o] = r * k; out[o + 1] = g * k; out[o + 2] = b * k; out[o + 3] = a / n;
        }
      }
      return out;
    },
  };
}
