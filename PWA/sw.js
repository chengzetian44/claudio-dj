// Claudio DJ Service Worker — offline-first PWA
const CACHE_NAME = 'claudio-dj-v6';
const STATIC_ASSETS = [
  '/',
  '/css/style.css',
  '/js/particles.js',
  '/js/player.js',
  '/js/chat.js',
  '/js/app.js',
];

// ─── Install: pre-cache static assets ──────────────
self.addEventListener('install', (event) => {
  console.log('[sw] installing...');
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[sw] caching static assets');
      return cache.addAll(STATIC_ASSETS);
    })
  );
  self.skipWaiting();
});

// ─── Activate: clean old caches ─────────────────────
self.addEventListener('activate', (event) => {
  console.log('[sw] activating...');
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      );
    })
  );
  self.clients.claim();
});

// ─── Fetch: cache strategies by resource type ───────
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Skip non-GET requests
  if (event.request.method !== 'GET') return;

  // API requests — network only, no caching
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/stream')) {
    return;
  }

  // Audio/media requests — let browser handle directly (no SW caching)
  // This prevents SW from intercepting streaming audio which breaks mobile playback
  if (event.request.destination === 'audio' ||
      /\.(mp3|m4a|aac|ogg|wav|flac|opus)(\?|$)/i.test(url.pathname) ||
      /music\.(126|163)\.net/i.test(url.hostname)) {
    return;
  }

  // TTS audio cache — cache first
  if (url.pathname.startsWith('/tts/')) {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        const fetchPromise = fetch(event.request).then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        });
        return cached || fetchPromise;
      })
    );
    return;
  }

  // HTML — network first, fallback to cache
  if (event.request.headers.get('accept')?.includes('text/html')) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          return response;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // Static assets — network first, fallback to cache (localhost: always fresh code)
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});
