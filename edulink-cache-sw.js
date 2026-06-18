// edulink-cache-sw.js — B2.6 Cache PWA Portail Famille
// Stratégie : Cache-first pour le shell, Network-first pour les données Supabase

const CACHE_NAME   = 'edulink-portail-v1';
const SHELL_ASSETS = [
  '/edulink-portail.html',
  '/manifest.json',
];

// ── Installation : mise en cache du shell ──────────────────────────────────
self.addEventListener('install', function(event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function(cache) {
      return cache.addAll(SHELL_ASSETS);
    }).then(function() {
      return self.skipWaiting();
    })
  );
});

// ── Activation : nettoyage des anciens caches ──────────────────────────────
self.addEventListener('activate', function(event) {
  event.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(
        keys.filter(function(k) { return k !== CACHE_NAME; })
            .map(function(k) { return caches.delete(k); })
      );
    }).then(function() {
      return self.clients.claim();
    })
  );
});

// ── Fetch : stratégies selon l'URL ────────────────────────────────────────
self.addEventListener('fetch', function(event) {
  const url = event.request.url;

  // Supabase API → Network-first, fallback cache
  if (url.includes('supabase.co')) {
    event.respondWith(
      fetch(event.request).then(function(resp) {
        // Mettre en cache les réponses GET Supabase réussies
        if (event.request.method === 'GET' && resp.ok) {
          const clone = resp.clone();
          caches.open(CACHE_NAME).then(function(cache) {
            cache.put(event.request, clone);
          });
        }
        return resp;
      }).catch(function() {
        // Hors-ligne : retourner le cache
        return caches.match(event.request);
      })
    );
    return;
  }

  // Shell HTML → Cache-first
  if (url.includes('edulink-portail.html') || url.endsWith('/')) {
    event.respondWith(
      caches.match(event.request).then(function(cached) {
        const networkFetch = fetch(event.request).then(function(resp) {
          if (resp.ok) {
            caches.open(CACHE_NAME).then(function(cache) {
              cache.put(event.request, resp.clone());
            });
          }
          return resp;
        });
        return cached || networkFetch;
      })
    );
    return;
  }

  // CDN scripts (Firebase, Supabase JS, jsPDF) → Cache-first
  if (url.includes('cdn.jsdelivr.net') || url.includes('cdnjs.cloudflare.com') || url.includes('gstatic.com')) {
    event.respondWith(
      caches.match(event.request).then(function(cached) {
        if (cached) return cached;
        return fetch(event.request).then(function(resp) {
          if (resp.ok) {
            caches.open(CACHE_NAME).then(function(cache) {
              cache.put(event.request, resp.clone());
            });
          }
          return resp;
        });
      })
    );
    return;
  }

  // Tout le reste → réseau direct
  event.respondWith(fetch(event.request));
});

// ── Messages depuis la page ───────────────────────────────────────────────
self.addEventListener('message', function(event) {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  // Accusé de réception ping
  if (event.data && event.data.type === 'PING') {
    event.ports[0].postMessage({ type: 'PONG', cache: CACHE_NAME });
  }
});
