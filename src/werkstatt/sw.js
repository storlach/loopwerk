// Service Worker von Krachwerk (ausgeliefert als /werkstatt/sw.js, gilt nur für /werkstatt/).
// Netz zuerst, damit jede neue Fassung sofort ankommt; ohne Netz aus dem Zwischenspeicher – so startet die App auch offline.
// Schriften (Google Fonts) ändern sich nicht: Zwischenspeicher zuerst.

const CACHE = 'krachwerk-v3'; // v3: Speicher v2 (ADR 011) – ein alter Stand öffnete die DB mit Version 1 (VersionError)
// Wird beim Erzeugen der Seite (tools/werkstatt-page.cjs) mit allen Dateien unter src/ und vendor/lamejs gefüllt; Pfade relativ zu dieser Datei
const PRECACHE = [/*PRECACHE*/];
const FONTS = /^https:\/\/fonts\.(googleapis|gstatic)\.com\//;

self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    // einzeln, damit eine fehlende Datei nicht alles verhindert
    await Promise.all(PRECACHE.map((u) => cache.add(new Request(u, { cache: 'reload' })).catch(() => {})));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k.startsWith('krachwerk-') && k !== CACHE) await caches.delete(k);
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (FONTS.test(req.url)) { e.respondWith(cacheFirst(req)); return; }
  if (url.origin !== self.location.origin) return;
  e.respondWith(networkFirst(req));
});

async function networkFirst(req) {
  const cache = await caches.open(CACHE);
  try {
    const res = await fetch(req);
    if (res.ok) cache.put(req, res.clone());
    return res;
  } catch (err) {
    const hit = await cache.match(req, { ignoreSearch: req.mode === 'navigate' });
    if (hit) return hit;
    throw err;
  }
}

async function cacheFirst(req) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok || res.type === 'opaque') cache.put(req, res.clone());
  return res;
}
