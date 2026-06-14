// CyberHUD Service Worker — instalación PWA + caché 100% offline (incluye CDN)
const CACHE = 'cyberhud-v3';

// Archivos locales del app shell (precache obligatorio)
const LOCAL_ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icon-192.png',
  './icon-512.png',
  './icon-maskable-512.png'
];

// Recursos externos (CDN) necesarios para que la app funcione sin internet.
// Se precachean en la instalación; si alguno falla no aborta la instalación.
const CDN_ASSETS = [
  'https://unpkg.com/lucide@latest',
  'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js',
  'https://cdn.jsdelivr.net/npm/html5-qrcode@2.3.8/html5-qrcode.min.js',
  'https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@300;400;600;800&family=Outfit:wght@300;400;500;600;700;800&display=swap'
];

self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await cache.addAll(LOCAL_ASSETS);
    // CDN: tolerar fallos individuales (modo no-cors para opacas)
    await Promise.all(CDN_ASSETS.map(async (url) => {
      try {
        const res = await fetch(url, { mode: 'no-cors' });
        await cache.put(url, res);
      } catch (_) { /* ignorar */ }
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

// Estrategia: cache-first con relleno en segundo plano.
// Para HTML (navegaciones) intenta red primero y cae al index.html offline.
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;

  // Navegaciones / documentos HTML -> network-first con fallback offline
  if (req.mode === 'navigate' || (req.headers.get('accept') || '').includes('text/html')) {
    e.respondWith((async () => {
      try {
        const fresh = await fetch(req);
        const cache = await caches.open(CACHE);
        cache.put(req, fresh.clone()).catch(() => {});
        return fresh;
      } catch (_) {
        const cached = await caches.match(req);
        return cached || (await caches.match('./index.html'));
      }
    })());
    return;
  }

  // Resto (JS/CSS/fuentes/imágenes/CDN) -> cache-first
  e.respondWith((async () => {
    const cached = await caches.match(req);
    if (cached) return cached;
    try {
      const res = await fetch(req);
      const cache = await caches.open(CACHE);
      cache.put(req, res.clone()).catch(() => {});
      return res;
    } catch (_) {
      return cached || Response.error();
    }
  })());
});
