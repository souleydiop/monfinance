// ═══════════════════════════════════════════════════════════════════════════════
// MONFINANCE SERVICE WORKER v1.0
// Cache-first strategy + offline fallback + background sync
// ═══════════════════════════════════════════════════════════════════════════════

const CACHE_NAME = 'monfinance-v1.0.0';
const STATIC_CACHE = 'monfinance-static-v1.0.0';
const DATA_CACHE = 'monfinance-data-v1.0.0';

// Ressources à mettre en cache au premier install
const STATIC_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './icons/icon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
  'https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700&family=Space+Mono:wght@700&display=swap'
];

// ─── INSTALL ──────────────────────────────────────────────────────────────────
self.addEventListener('install', event => {
  console.log('[SW] Installing MonFinance Service Worker...');
  event.waitUntil(
    caches.open(STATIC_CACHE).then(cache => {
      console.log('[SW] Pre-caching static assets');
      return cache.addAll(STATIC_ASSETS.map(url => new Request(url, { cache: 'reload' })))
        .catch(err => {
          console.warn('[SW] Some assets failed to cache:', err);
        });
    }).then(() => self.skipWaiting())
  );
});

// ─── ACTIVATE ─────────────────────────────────────────────────────────────────
self.addEventListener('activate', event => {
  console.log('[SW] Activating MonFinance Service Worker...');
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames
          .filter(name => name !== STATIC_CACHE && name !== DATA_CACHE)
          .map(name => {
            console.log('[SW] Deleting old cache:', name);
            return caches.delete(name);
          })
      );
    }).then(() => self.clients.claim())
  );
});

// ─── FETCH — Cache-first pour assets, network-first pour data ─────────────────
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests & browser extensions
  if (request.method !== 'GET') return;
  if (url.protocol === 'chrome-extension:') return;

  // Fonts → cache-first, long TTL
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    event.respondWith(cacheFirst(request, STATIC_CACHE));
    return;
  }

  // App shell → cache-first
  if (url.pathname === '/' || url.pathname.endsWith('.html') ||
      url.pathname.endsWith('.js') || url.pathname.endsWith('.css') ||
      url.pathname.endsWith('.png') || url.pathname.endsWith('.svg') ||
      url.pathname.endsWith('.json') || url.pathname.endsWith('.ico')) {
    event.respondWith(cacheFirst(request, STATIC_CACHE));
    return;
  }

  // Default: network with cache fallback
  event.respondWith(networkWithCacheFallback(request));
});

// ─── STRATEGIES ───────────────────────────────────────────────────────────────
async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response.ok) cache.put(request, response.clone());
    return response;
  } catch {
    return offlineFallback();
  }
}

async function networkWithCacheFallback(request) {
  const cache = await caches.open(DATA_CACHE);
  try {
    const response = await fetch(request);
    if (response.ok) cache.put(request, response.clone());
    return response;
  } catch {
    const cached = await cache.match(request);
    return cached || offlineFallback();
  }
}

function offlineFallback() {
  return caches.match('./index.html').then(r => r || new Response(
    '<html><body style="background:#0f172a;color:#e2e8f0;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;text-align:center"><div><div style="font-size:48px;margin-bottom:16px">💰</div><h2 style="color:#22d3ee">MonFinance</h2><p>Mode hors ligne actif</p><p style="color:#475569;font-size:14px">Vos données locales sont disponibles</p></div></body></html>',
    { headers: { 'Content-Type': 'text/html' } }
  ));
}

// ─── BACKGROUND SYNC ──────────────────────────────────────────────────────────
self.addEventListener('sync', event => {
  if (event.tag === 'sync-transactions') {
    console.log('[SW] Background sync triggered');
    event.waitUntil(syncTransactions());
  }
});

async function syncTransactions() {
  // Placeholder for future API sync
  console.log('[SW] Syncing pending transactions...');
}

// ─── PUSH NOTIFICATIONS ───────────────────────────────────────────────────────
self.addEventListener('push', event => {
  if (!event.data) return;
  const data = event.data.json();
  event.waitUntil(
    self.registration.showNotification(data.title || 'MonFinance', {
      body: data.body || 'Nouvelle notification',
      icon: './icons/icon-192.png',
      badge: './icons/icon-72.png',
      tag: 'monfinance-notif',
      renotify: true,
      data: { url: data.url || './' }
    })
  );
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
      if (clientList.length > 0) return clientList[0].focus();
      return clients.openWindow(event.notification.data.url || './');
    })
  );
});

// ─── MESSAGE HANDLER ──────────────────────────────────────────────────────────
self.addEventListener('message', event => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
  if (event.data?.type === 'GET_VERSION') {
    event.ports[0].postMessage({ version: CACHE_NAME });
  }
});
