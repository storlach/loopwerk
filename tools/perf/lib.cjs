// Mess-Hilfen: Server wie GitHub Pages (gzip, max-age=600, ETag, wahlweise HTTP/2), Browser mit Drosselung.
const http = require('http');
const http2 = require('http2');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const crypto = require('crypto');
const os = require('os');
const { chromium } = require('playwright');

const ROOT = process.env.LW_ROOT || path.resolve(__dirname, '../..');
const { SKELETON_HEAD } = require(path.join(ROOT, 'tests/serve.cjs'));
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css', '.json': 'application/json', '.md': 'text/markdown', '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.txt': 'text/plain', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
const COMPRESS = /^(text\/|application\/(json|manifest\+json)|image\/svg)/;
const cache = new Map();

function resolveFile(p) {
  if (p === '/') p = '/index.html';
  if (p.startsWith('/werkstatt/')) {
    const name = p.slice('/werkstatt/'.length) || 'index.html';
    const file = require(path.join(ROOT, 'tools/werkstatt-page.cjs')).werkstattFiles(SKELETON_HEAD)[name];
    if (!file) return null;
    return { body: Buffer.from(file[0]), type: name.endsWith('.html') ? TYPES['.html'] : file[1] };
  }
  const file = path.join(ROOT, p);
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) return null;
  let body = fs.readFileSync(file);
  if (p === '/index.html') body = Buffer.concat([Buffer.from(SKELETON_HEAD), body, Buffer.from('</body></html>')]);
  return { body, type: TYPES[path.extname(file)] || 'application/octet-stream' };
}

function entry(p, gzip) {
  const key = p + (gzip ? '|gz' : '');
  if (cache.has(key)) return cache.get(key);
  const f = resolveFile(p);
  if (!f) { cache.set(key, null); return null; }
  const etag = '"' + crypto.createHash('sha1').update(f.body).digest('hex').slice(0, 16) + '"';
  const doGz = gzip && COMPRESS.test(f.type);
  const e = { raw: f.body.length, type: f.type, etag, body: doGz ? zlib.gzipSync(f.body, { level: 6 }) : f.body, gz: doGz };
  cache.set(key, e);
  return e;
}

// gzip: komprimieren wie Pages; maxAge: Cache-Control (Pages: 600); log: Liste aller Anfragen
function start({ h2 = false, gzip = true, maxAge = 600, port = 0 } = {}) {
  const log = [];
  const handler = (req, res) => {
    const p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (p === '/werkstatt') { res.writeHead(301, { location: '/werkstatt/' }); res.end(); return; }
    const e = entry(p, gzip && /gzip/.test(req.headers['accept-encoding'] || ''));
    if (!e) { res.writeHead(404); res.end('not found'); log.push({ p, status: 404, bytes: 0 }); return; }
    const head = { 'content-type': e.type, etag: e.etag, 'cache-control': maxAge == null ? 'no-store' : `max-age=${maxAge}`, vary: 'Accept-Encoding' };
    if (req.headers['if-none-match'] === e.etag) { res.writeHead(304, head); res.end(); log.push({ p, status: 304, bytes: 0, raw: e.raw }); return; }
    if (e.gz) head['content-encoding'] = 'gzip';
    head['content-length'] = e.body.length;
    res.writeHead(200, head);
    res.end(e.body);
    log.push({ p, status: 200, bytes: e.body.length, raw: e.raw });
  };
  const server = h2
    ? http2.createSecureServer({ key: fs.readFileSync(path.join(__dirname, 'key.pem')), cert: fs.readFileSync(path.join(__dirname, 'cert.pem')), allowHTTP1: true }, handler)
    : http.createServer(handler);
  return new Promise((resolve) => server.listen(port, '127.0.0.1', () => {
    const origin = `${h2 ? 'https' : 'http'}://127.0.0.1:${server.address().port}`;
    resolve({ server, origin, log, close: () => new Promise((r) => { server.close(r); server.closeAllConnections?.(); setTimeout(r, 200); }) });
  }));
}

// Netz etwa 4G (wie Lighthouse „Slow 4G“ ist 1,6 Mbit/150 ms; hier „4G mittel“: 9 Mbit/s runter, 1,5 hoch, 85 ms je Anfrage)
const NET = {
  '4g': { offline: false, latency: 85, downloadThroughput: 9e6 / 8, uploadThroughput: 1.5e6 / 8, connectionType: 'cellular4g' },
  'slow4g': { offline: false, latency: 150, downloadThroughput: 1.6e6 / 8, uploadThroughput: 0.75e6 / 8, connectionType: 'cellular4g' },
  none: { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 },
  offline: { offline: true, latency: 0, downloadThroughput: 0, uploadThroughput: 0 },
};

async function launch(extra = []) {
  return chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required', '--ignore-certificate-errors', '--enable-precise-memory-info', ...extra] });
}

async function newPage(browser, { viewport = { width: 1440, height: 900 }, mobile = false, cpu = 1, net = 'none', context = null, init = null } = {}) {
  const ctx = context || await browser.newContext({
    viewport: mobile ? { width: 390, height: 844 } : viewport, hasTouch: mobile, isMobile: mobile, deviceScaleFactor: mobile ? 3 : 1, ignoreHTTPSErrors: true,
  });
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Network.enable');
  if (net !== 'none') await cdp.send('Network.emulateNetworkConditions', NET[net]);
  if (cpu !== 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: cpu });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  // Lange Aufgaben, erstes Bild, Bildabstände: vor dem Laden einhängen
  await page.addInitScript(() => {
    window.__lt = [];
    try { new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__lt.push({ s: e.startTime, d: e.duration }); }).observe({ type: 'longtask', buffered: true }); } catch { /* egal */ }
    window.__paint = {};
    try { new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__paint[e.name] = e.startTime; }).observe({ type: 'paint', buffered: true }); } catch { /* egal */ }
    window.__marks = {};
    const t0 = performance.now();
    const iv = setInterval(() => {
      const boot = document.getElementById('boot');
      const app = document.getElementById('app');
      if (boot && !window.__marks.splashSeen) window.__marks.splashSeen = performance.now();
      if (!window.__marks.ready && window.loopwerk?.ready) window.__marks.ready = performance.now();
      if (!window.__marks.splashDone && boot && (boot.classList.contains('done') || boot.hidden)) window.__marks.splashDone = performance.now();
      if (!window.__marks.appReady && app && app.classList.contains('ready')) window.__marks.appReady = performance.now();
      if (window.__marks.ready && window.__marks.splashDone) clearInterval(iv);
    }, 4);
    // Bildabstände messen
    window.__frames = { run: false, list: [] };
    window.__startFrames = () => {
      const f = window.__frames; f.list = []; f.run = true; let last = performance.now();
      const step = (t) => { if (!f.run) return; f.list.push(t - last); last = t; requestAnimationFrame(step); };
      requestAnimationFrame((t) => { last = t; requestAnimationFrame(step); });
      window.__ltMark = performance.now();
    };
    window.__stopFrames = () => {
      const f = window.__frames; f.run = false;
      const l = f.list.slice().sort((a, b) => a - b);
      const sum = l.reduce((a, b) => a + b, 0);
      const q = (p) => l.length ? l[Math.min(l.length - 1, Math.floor(l.length * p))] : 0;
      const lts = window.__lt.filter((e) => e.s >= window.__ltMark);
      return {
        frames: l.length, ms: Math.round(sum), fps: l.length ? +(1000 * l.length / sum).toFixed(1) : 0, p50: +q(0.5).toFixed(1), p95: +q(0.95).toFixed(1), max: +(l[l.length - 1] || 0).toFixed(1),
        over33: l.filter((x) => x > 33.4).length, over50: l.filter((x) => x > 50).length,
        lt: lts.length, ltSum: Math.round(lts.reduce((a, e) => a + e.d, 0)), ltMax: Math.round(Math.max(0, ...lts.map((e) => e.d))),
      };
    };
  });
  if (init) await page.addInitScript(init);
  return { page, cdp, ctx, errors };
}

const median = (a) => { const s = a.slice().sort((x, y) => x - y); const n = s.length; return n ? (n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2) : NaN; };
const stats = (a, digits = 0) => {
  const f = (x) => +x.toFixed(digits);
  return a.length ? { med: f(median(a)), min: f(Math.min(...a)), max: f(Math.max(...a)), n: a.length } : { med: NaN, n: 0 };
};
const fmt = (s) => `${s.med} (${s.min}–${s.max}, n=${s.n})`;
const load = () => os.loadavg().map((x) => x.toFixed(2)).join(' ');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

module.exports = { ROOT, start, launch, newPage, NET, median, stats, fmt, load, sleep };
