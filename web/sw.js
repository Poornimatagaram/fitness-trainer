// Service worker: a script the browser runs in the background, between the
// page and the network. It lets Spotter open instantly and work offline.
//
// Two caches:
//   app cache   - our own HTML/CSS/JS/icons, precached on install.
//                 Served "stale-while-revalidate": instant from cache, refreshed in
//                 the background, so a new deploy shows up on the next launch.
//   model cache - MediaPipe's WebAssembly runtime and pose model (~19 MB). Their URLs
//                 are versioned and never change, so they are served "cache-first"
//                 and kept across app updates (no re-download when we ship a fix).

const APP_VERSION = 'v1'; // bump to force every client to refresh the app cache
const APP_CACHE = `spotter-app-${APP_VERSION}`;
const MODEL_CACHE = 'spotter-mediapipe-1.1.0'; // keep in sync with TASKS_VISION_VERSION in js/pose.js
const MODEL_HOSTS = ['cdn.jsdelivr.net', 'storage.googleapis.com'];

const APP_SHELL = [
  './',
  'index.html',
  'manifest.webmanifest',
  'css/styles.css',
  'js/app.js',
  'js/camera.js',
  'js/hud.js',
  'js/overlay.js',
  'js/pose.js',
  'js/pwa.js',
  'js/storage.js',
  'js/views.js',
  'js/voice.js',
  'js/core/exercises.js',
  'js/core/features.js',
  'js/core/geometry.js',
  'js/core/landmarks.js',
  'js/core/repCounter.js',
  'js/core/summary.js',
  'icons/favicon.svg',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/maskable-512.png',
  'icons/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(APP_CACHE)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting()), // activate right away instead of waiting for old tabs to close
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      // Delete caches from older versions.
      for (const key of await caches.keys()) {
        if (key !== APP_CACHE && key !== MODEL_CACHE) await caches.delete(key);
      }
      // Take control of already-open pages, so the first visit's model download
      // goes through this worker and gets cached.
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return; // let POSTs etc. go straight to the network
  const url = new URL(request.url);
  if (MODEL_HOSTS.includes(url.hostname)) cacheFirst(event);
  else if (url.origin === self.location.origin) staleWhileRevalidate(event);
});

/** Serve from cache if we have it; otherwise download, save a copy, and serve. */
function cacheFirst(event) {
  event.respondWith(
    (async () => {
      const cached = await caches.match(event.request);
      if (cached) return cached;
      const response = await fetch(event.request);
      if (response.ok) {
        const copy = response.clone();
        event.waitUntil(caches.open(MODEL_CACHE).then((cache) => cache.put(event.request, copy)));
      }
      return response;
    })(),
  );
}

/** Serve from cache immediately (if possible) and refresh the cache in the background. */
function staleWhileRevalidate(event) {
  const { request } = event;
  const network = fetch(request)
    .then((response) => {
      if (response.ok) {
        const copy = response.clone();
        event.waitUntil(caches.open(APP_CACHE).then((cache) => cache.put(request, copy)));
      }
      return response;
    })
    .catch(() => null); // offline
  event.waitUntil(network);

  event.respondWith(
    (async () => {
      const cached = await caches.match(request, { ignoreSearch: true });
      if (cached) return cached;
      const fresh = await network;
      if (fresh) return fresh;
      if (request.mode === 'navigate') return caches.match('index.html'); // offline page load
      return Response.error();
    })(),
  );
}
