const CACHE_NAME = 'mixer-v2';
const ASSETS = [
  './',
  './index.html',
  './style.css',
  './script.js',
  './manifest.json',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css',
  'https://cdnjs.cloudflare.com/ajax/libs/jsmediatags/3.9.5/jsmediatags.min.js',
  'https://fonts.googleapis.com/css2?family=Nunito:wght@400;700;900&display=swap'
];

// Installation : mise en cache des assets statiques
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

// Activation : supprime les anciens caches
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Stratégie : Cache First pour les assets statiques, Network First pour le reste
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);

  // Fichiers audio locaux : ne pas mettre en cache (blob:// ou fichiers locaux)
  if (e.request.url.startsWith('blob:') || url.pathname.match(/\.(mp3|flac|ogg|wav|aac|m4a)$/i)) {
    return;
  }

  // Assets statiques connus : Cache First
  if (ASSETS.includes(e.request.url) || ASSETS.includes(url.pathname)) {
    e.respondWith(
      caches.match(e.request).then(cached => cached || fetch(e.request).then(res => {
        const clone = res.clone();
        caches.open(CACHE_NAME).then(c => c.put(e.request, clone));
        return res;
      }))
    );
    return;
  }

  // Tout le reste : Network First, fallback cache
  e.respondWith(
    fetch(e.request).catch(() => caches.match(e.request))
  );
});
