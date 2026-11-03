// Raumlicht als Shader (WebGL 2): fließender Nebel aus verzerrtem Rauschen, darin leuchtende Höhenlinien.
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

// Zweiter Durchgang, volle Auflösung: Licht, Farben und scharfe Höhenlinien aus dem vergrößerten Nebel
const FS = `#version 300 es
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
out vec4 o;

float hash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
vec3 toWhite(vec3 c, float k) { return mix(c, uWhite, k); }

void main() {
  float L = max(uRes.x, uRes.y);
  vec2 uv = vec2(gl_FragCoord.x / uRes.x, 1.0 - gl_FragCoord.y / uRes.y); // y nach unten wie im Raum
  vec2 P = uv * uRes / L;
  float bass = uBand.x, mids = uBand.y, highs = uBand.z;

  // Nebel aus der kleinen Textur (weich vergrößert), zwei Kanäle für 16 Bit Genauigkeit
  vec4 tx = texture(uField, gl_FragCoord.xy / uRes);
  float f = tx.r + tx.g / 255.0;
  float d = smoothstep(0.22, 0.82, f);

  // Grund: Anthrazit-Rauch, auch in der Stille
  vec3 col = uGrey * uIdle * (0.35 + 1.1 * d);

  // Bass: warmes Licht von unten, durch den Nebel gefiltert
  float bot = smoothstep(1.0 - (0.42 + 0.36 * bass), 1.08, uv.y);
  col += uC0 * uK * bass * bot * (0.25 + 1.3 * d) * 1.15;

  // Mitten: Farbwolken leben im Nebel statt als flache Flecken
  vec2 dc = (P - 0.5 * uRes / L) / vec2(0.6, 0.45);
  col += uC1 * uK * (0.4 + 0.6 * uA) * 0.32 * exp(-dot(dc, dc) * 1.6) * (0.3 + 1.0 * d);
  for (int i = 0; i < 6; i++) {
    vec4 c = uCloud[i];
    if (c.w < 0.002) continue;
    vec2 dp = (P - c.xy) / vec2(c.z, c.z * 0.8);
    col += uCloudC[i] * c.w * exp(-dot(dp, dp) * 2.4) * (0.15 + 1.25 * d);
  }

  // Höhen: zarter Saum oben und funkelnde Punkte
  float topg = smoothstep(0.42, 0.0, uv.y);
  col += uC2 * uK * highs * topg * (0.25 + 0.6 * d) * 0.55;
  if (highs > 0.01) {
    vec2 g = P * 46.0;
    vec2 id = floor(g);
    float h = hash(id);
    if (h > 0.93) {
      vec2 st = fract(g) - 0.5 - (vec2(hash(id + 3.1), hash(id + 7.7)) - 0.5) * 0.6;
      float tw = pow(0.5 + 0.5 * sin(uT * (1.5 + 3.0 * hash(id + 1.3)) + h * 40.0), 3.0);
      col += toWhite(uC2, 0.5) * uK * highs * smoothstep(0.55, 0.0, uv.y) * tw * exp(-dot(st, st) * 40.0) * 1.6;
    }
  }

  // Säule an der Abspielmarke (und die ausblendende nach einem Sprung)
  float beam = 0.0;
  if (uCol.y > 0.002) {
    float dx = (uv.x - uCol.x) * uRes.x / L;
    float ys = smoothstep(uCol.z - 0.03, uCol.z + 0.05, uv.y) * smoothstep(uCol.w + 0.03, uCol.w - 0.05, uv.y);
    beam = uCol.y * ys * exp(-dx * dx / 0.0035);
    float trail = uCol.y * ys * exp(-pow(max(0.0, -dx - 0.01), 2.0) / 0.012) * step(dx, 0.0);
    col += uColC * (0.75 * beam + 0.16 * trail) * (0.5 + 0.8 * d);
  }
  if (uGhost.y > 0.002) {
    float dx = (uv.x - uGhost.x) * uRes.x / L;
    float ys = smoothstep(uGhost.z - 0.03, uGhost.z + 0.05, uv.y) * smoothstep(uGhost.w + 0.03, uGhost.w - 0.05, uv.y);
    float gb = uGhost.y * ys * exp(-dx * dx / 0.0035);
    beam += gb;
    col += uColC * 0.75 * gb * (0.5 + 0.8 * d);
  }

  // Höhenlinien des Nebels: dünne Lichtlinien, die Marke und die Taktwelle lassen sie aufleuchten
  float lv = f * 7.0 - uT * 0.07;
  float w = max(fwidth(lv), 1e-4);
  float cd = abs(fract(lv - 0.5) - 0.5) / w;
  float line = 1.0 - clamp(cd / uPx - 0.45, 0.0, 1.0);
  float hc = cd / uPx;
  float halo = exp(-hc * hc * 0.08);
  float wave = 0.0;
  for (int i = 0; i < 4; i++) {
    vec4 wv = uWave[i];
    if (wv.w < 0.002) continue;
    float e = (length((P - wv.xy) / vec2(1.0, 0.85)) - wv.z) / 0.035;
    wave += wv.w * exp(-e * e);
  }
  float lum = dot(col, vec3(0.2126, 0.7152, 0.0722));
  float lit = uIdle * 0.25 + uK * (0.04 + 0.12 * uA) + 1.2 * lum + 1.2 * beam + 0.8 * wave;
  vec3 lc = toWhite(normalize(col + 1e-4) * 0.9, 0.35 + 0.4 * min(1.0, beam * 2.0));
  col += lc * lit * (0.4 + 0.6 * d) * (0.38 * line + 0.1 * halo);

  // Nachglühen nach lauten Stellen: heller Schimmer im Nebel
  vec3 gsum = uGlow;
  if (gsum.x + gsum.y + gsum.z > 0.01) {
    vec2 gc = (P - 0.5 * uRes / L) / vec2(0.5, 0.36);
    float area = gsum.x * smoothstep(0.45, 1.05, uv.y) + gsum.y * exp(-dot(gc, gc)) + gsum.z * smoothstep(0.4, 0.0, uv.y);
    col += toWhite(normalize(col + 1e-4), 0.55) * uGlowMax * 0.6 * area * (0.3 + 1.0 * d);
  }

  // Kontrast: Ränder zurück ins Dunkel, wenn Licht da ist
  float e = length((uv - 0.5) / 0.62);
  float vig = e < 0.6 ? 0.0 : (e < 0.8 ? 0.35 * (e - 0.6) / 0.2 : mix(0.35, 0.85, clamp((e - 0.8) / 0.2, 0.0, 1.0)));
  col *= 1.0 - uVig * vig;

  col = col / (1.0 + 0.35 * col);
  col += (hash(gl_FragCoord.xy) - 0.5) / 255.0; // ruhiges Rauschen gegen Farbstufen
  col = clamp(col, 0.0, 1.0);
  o = vec4(col, max(col.r, max(col.g, col.b)));
}`;

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
  let prog, fieldProg;
  try {
    prog = link(FS);
    fieldProg = link(FIELD_FS);
  } catch (e) {
    console.warn('Raumlicht ohne Shader:', e.message);
    return null;
  }
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  const U = {};
  for (const n of ['uRes', 'uT', 'uK', 'uA', 'uBand', 'uGlow', 'uC0', 'uC1', 'uC2', 'uWhite', 'uCloud', 'uCloudC', 'uCol', 'uColC', 'uGhost', 'uWave', 'uVig', 'uIdle', 'uGrey', 'uGlowMax', 'uPx', 'uField']) U[n] = gl.getUniformLocation(prog, n);
  const FU = { res: gl.getUniformLocation(fieldProg, 'uRes'), t: gl.getUniformLocation(fieldProg, 'uT'), bass: gl.getUniformLocation(fieldProg, 'uBass') };
  // Nebel-Textur (RGBA8, weich gefiltert) mit eigenem Framebuffer
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  for (const [k, v] of [[gl.TEXTURE_MIN_FILTER, gl.LINEAR], [gl.TEXTURE_MAG_FILTER, gl.LINEAR], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_2D, k, v);
  const fbo = gl.createFramebuffer();
  let fw = 0, fh = 0;
  let lost = false;
  canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); lost = true; });
  const cloud = new Float32Array(24), cloudC = new Float32Array(18), waves = new Float32Array(16);
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
      // 2) Licht und Linien in voller Auflösung
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.useProgram(prog);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.uniform1i(U.uField, 0);
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
