const CACHE = 'rayito-hub-v35-song-requests-sidebar';
const CORE = [
  './',
  './index.html',
  './style.css',
  './app.css',
  './config.js',
  './playlist.js',
  './legacy.js',
  './app.js',
  './security-bindings.js',
  './favicon.png',
  './avatar.gif',
  './poster.jpg',
  './player-default.svg',
  './assets/games/highway.jpg',
  './assets/games/snake.jpg',
  './assets/games/neon.jpg',
  './assets/games/breakout.jpg',
  './assets/games/cohete.jpg',
  './assets/games/penalty.jpg'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(CORE)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))
    ))
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // SEGURIDAD: jamás cacheamos Supabase, APIs, tokens o recursos cross-origin.
  if (url.origin !== self.location.origin) return;
  if (request.headers.has('Authorization')) return;

  // Navegación: network-first, con index offline como último recurso.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request, { cache: 'no-store' })
        .then((response) => response)
        .catch(() => caches.match('./index.html'))
    );
    return;
  }

  // JS/CSS/config: network-first para evitar ejecutar código viejo tras una actualización.
  if (request.destination === 'script' || request.destination === 'style' || url.pathname.endsWith('/config.js')) {
    event.respondWith(
      fetch(request, { cache: 'no-store' })
        .then((response) => {
          if (response.ok && response.type === 'basic') {
            caches.open(CACHE).then((cache) => cache.put(request, response.clone())).catch(() => {});
          }
          return response;
        })
        .catch(() => caches.match(request))
    );
    return;
  }

  const allowedDestinations = new Set(['image', 'font', 'manifest']);
  if (!allowedDestinations.has(request.destination)) return;

  event.respondWith(
    caches.match(request).then((cached) => cached || fetch(request).then((response) => {
      if (response.ok && response.type === 'basic') {
        caches.open(CACHE).then((cache) => cache.put(request, response.clone())).catch(() => {});
      }
      return response;
    }))
  );
});
