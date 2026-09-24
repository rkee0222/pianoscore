const CACHE = 'scoreflow-shell-v3';
const root = new URL('./', self.location.href);
const url = (path = '') => new URL(path, root).href;
const SHELL = [url(), url('index.html'), url('manifest.webmanifest'), url('icon.svg'), url('icon-180.png')];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await cache.addAll(SHELL);
    // Vite filenames are content-hashed. Discover and cache them on the first install.
    const html = await (await fetch(url('index.html'))).text();
    const assets = [...html.matchAll(/(?:src|href)="([^"#]+)"/g)]
      .map((match) => url(match[1]))
      .filter((asset) => asset.startsWith(root.href));
    await Promise.allSettled(assets.map((asset) => cache.add(asset)));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  event.respondWith(caches.match(event.request).then((cached) => cached || fetch(event.request).then((response) => {
    if (response.ok) caches.open(CACHE).then((cache) => cache.put(event.request, response.clone()));
    return response;
  }).catch(() => caches.match(url('index.html')))));
});
