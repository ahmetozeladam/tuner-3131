// Service worker: uygulama dosyalarını telefona kaydeder, internet yokken de çalışır.
const CACHE = 'akord-v1';
const FILES = [
  './', './index.html', './style.css', './script.js',
  './manifest.json', './icon-192.png', './icon-512.png', './apple-touch-icon.png',
];

// Kurulum: dosyaları önbelleğe al
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)));
  self.skipWaiting();
});

// Eski önbellekleri temizle
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Önce internetten dene (güncel kod gelsin), olmazsa önbellekten ver
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy));
        return res;
      })
      .catch(() => caches.match(e.request))
  );
});
