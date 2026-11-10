// Service Worker von Krachwerk (ausgeliefert als /werkstatt/sw.js, gilt nur für /werkstatt/), ADR 014.
// tools/werkstatt-page.cjs setzt davor self.PRECACHE = { version, files, fonts }: alle Dateien der App (Seite, Module,
// Worklets, Rechen-Worker, MP3-Encoder, Icons), version = Prüfsumme über alle. Beim Installieren wird die Liste vollständig
// geladen – nach dem ersten Besuch startet und nimmt Krachwerk ohne Netz auf.
// Start: Hat der Browser die Dateien vor weniger als 9 Minuten geholt, liefert sein Speicher sie noch selbst (Pages:
// max-age=600) – schneller als jede Antwort aus diesem Worker, also lässt er sie durch. Sonst und ohne Netz antwortet er
// aus seinem Speicher, ohne aufs Netz zu warten; eine neue Fassung lädt er im Hintergrund, sie gilt ab dem nächsten Start.

const PRE = self.PRECACHE || { version: 'dev', files: [], fonts: null };
const CACHE = 'krachwerk-' + PRE.version;
const RUNTIME = 'krachwerk-runtime'; // Schriften, Zeitstempel und alles, was nicht in der Liste steht
const FONTS = /^https:\/\/fonts\.(googleapis|gstatic)\.com\//;
const FRESH_MS = 9 * 60 * 1000;
const STAMP = new URL('./__last-start', self.location).href; // wann der Browser die Dateien zuletzt selbst geholt hat
const stamp = async (t) => (await caches.open(RUNTIME)).put(STAMP, new Response(String(t)));
const HOME = new URL('./', self.location).href;
// Seiten, deren Dateien der Browser-Speicher liefert (clientId); geht der Worker zwischendurch schlafen, gilt der Speicher
const passClients = new Set();
let listCache = null; // einmal öffnen statt je Anfrage (der Start fragt über 100 Dateien gleichzeitig an)
const openList = () => (listCache ||= caches.open(CACHE));

self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    // no-cache: beim Server nachfragen (meist „unverändert“), damit alle Dateien zur selben Fassung gehören
    await cache.addAll(PRE.files.map((f) => new Request(f, { cache: 'no-cache' })));
    await stamp(Date.now());
    if (PRE.fonts) {
      try {
        const rt = await caches.open(RUNTIME);
        const css = await fetch(PRE.fonts);
        if (css.ok) {
          const text = await css.clone().text();
          await rt.put(PRE.fonts, css);
          const urls = [...text.matchAll(/url\((https:\/\/fonts\.gstatic\.com\/[^)]+)\)/g)].map((m) => m[1]);
          await Promise.all(urls.map(async (u) => { const r = await fetch(u); if (r.ok) await rt.put(u, r); }));
        }
      } catch { /* Schriften sind schön, aber nicht nötig */ }
    }
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k.startsWith('krachwerk-') && k !== CACHE && k !== RUNTIME) await caches.delete(k);
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  if (FONTS.test(req.url)) { e.respondWith(cacheFirst(req)); return; }
  if (new URL(req.url).origin !== self.location.origin) return;
  if (req.mode === 'navigate') { e.respondWith(navigate(req, e.resultingClientId)); return; }
  if (passClients.has(e.clientId) && self.navigator.onLine) return; // Browser-Speicher, ohne Umweg
  e.respondWith(fromList(req));
});

async function navigate(req, clientId) {
  const rt = await caches.open(RUNTIME);
  const last = Number(await (await rt.match(STAMP))?.text()) || 0;
  if (self.navigator.onLine && Date.now() - last < FRESH_MS) {
    try {
      const res = await fetch(req);
      if (res.ok) { if (clientId) passClients.add(clientId); stamp(Date.now()); return res; }
    } catch { /* ohne Netz: aus dem Speicher */ }
  }
  return fromList(req);
}

// Seite (auch /werkstatt/index.html und mit Suchteil) und Dateien der Liste aus dem Speicher, sonst Netz mit Rückfall
async function fromList(req) {
  const cache = await openList();
  const nav = req.mode === 'navigate';
  const hit = await cache.match(nav ? HOME : req, { ignoreSearch: nav });
  if (hit) return hit;
  const rt = await caches.open(RUNTIME);
  try {
    const res = await fetch(req);
    if (res.ok) rt.put(req, res.clone());
    return res;
  } catch (err) {
    const old = await rt.match(req, { ignoreSearch: nav });
    if (old) return old;
    throw err;
  }
}

async function cacheFirst(req) {
  const cache = await caches.open(RUNTIME);
  const hit = await cache.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok || res.type === 'opaque') cache.put(req, res.clone());
  return res;
}
