const ROOT = new URL('./', self.location.href);
const CACHE = 'jexfold-v3';
const PRECACHE_ASSETS = [];
const CORE = ['', 'manifest.webmanifest', 'wasm/jexfold_codec.js', 'wasm/jexfold_codec.wasm', ...PRECACHE_ASSETS]
  .map(path => new URL(path, ROOT).href);

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(async cache => {
    await cache.addAll(CORE);
    const response = await fetch(ROOT.href, { cache: 'no-cache' });
    const html = await response.clone().text();
    await cache.put(ROOT.href, response);
    const assets = [...html.matchAll(/(?:src|href)="([^"]+)"/g)]
      .map(match => new URL(match[1], ROOT).href)
      .filter(url => new URL(url).origin === self.location.origin);
    await cache.addAll([...new Set(assets)]);
  }).then(() => self.skipWaiting()));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET' || new URL(event.request.url).origin !== self.location.origin) return;
  event.respondWith(caches.match(event.request).then(cached => cached || fetch(event.request).then(response => {
    if (response.ok) { const copy = response.clone(); void caches.open(CACHE).then(cache => cache.put(event.request, copy)); }
    return response;
  }).catch(() => event.request.mode === 'navigate' ? caches.match(ROOT.href) : undefined)));
});
