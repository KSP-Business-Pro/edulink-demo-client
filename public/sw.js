// public/sw.js
// Service Worker EduLink Sup — cache des assets statiques + repli hors-ligne
// Ne met JAMAIS en cache les appels API Supabase (données toujours fraîches)

const CACHE_VERSION = 'edulink-v1';
const STATIC_CACHE = `${CACHE_VERSION}-static`;
const OFFLINE_URL = '/offline.html';

const PRECACHE_URLS = [
  '/offline.html',
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png',
];

// ── Installation : précache les ressources essentielles ──
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => cache.addAll(PRECACHE_URLS))
  );
  self.skipWaiting();
});

// ── Activation : nettoie les anciens caches de versions précédentes ──
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key.startsWith('edulink-') && key !== STATIC_CACHE)
          .map((key) => caches.delete(key))
      )
    )
  );
  // Pas de clients.claim() : on evite de basculer les onglets deja ouverts
  // (session active) sous le nouveau Service Worker sans rechargement complet,
  // ce qui peut interrompre une requete d'authentification en cours.
});

// ── Fetch : stratégie selon le type de requête ──
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Ne jamais intercepter les appels Supabase (données dynamiques) ni les autres origines
  if (url.origin !== self.location.origin) {
    return;
  }
  if (url.pathname.startsWith('/rest/') || url.pathname.startsWith('/auth/') || url.pathname.startsWith('/realtime/')) {
    return;
  }

  // Navigation (chargement de page) : réseau d'abord, repli cache puis page hors-ligne
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() =>
        caches.match(request).then((cached) => cached || caches.match(OFFLINE_URL))
      )
    );
    return;
  }

  // Assets statiques hashés (/assets/*.js, *.css) : cache d'abord, jamais périmés
  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(STATIC_CACHE).then((cache) => cache.put(request, clone));
          }
          return response;
        });
      })
    );
    return;
  }

  // Tout le reste : réseau d'abord, repli cache si hors-ligne
  event.respondWith(
    fetch(request).catch(() => caches.match(request))
  );
});

