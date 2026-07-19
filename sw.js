/* ===================== VocabY Service Worker ===================== */
/* Bu fayl saytni internetsiz ham ishlaydigan qiladi (asosiy fayllarni keshlaydi). */

const CACHE_NAME = 'vocaby-cache-v2';
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './firebase-init.js',
  './manifest.json',
  './logo.png'
];

self.addEventListener('install', (event)=>{
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(ASSETS_TO_CACHE))
      .then(()=> self.skipWaiting())
  );
});

self.addEventListener('activate', (event)=>{
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(()=> self.clients.claim())
  );
});

self.addEventListener('fetch', (event)=>{
  const req = event.request;

  // Faqat GET so'rovlarni keshlaymiz
  if(req.method !== 'GET') return;

  const url = new URL(req.url);
  // Faqat o'z saytimiz fayllarini keshlaymiz — Firebase/Firestore/Google Fonts
  // so'rovlariga tegmaymiz, ular internetga to'g'ridan-to'g'ri boradi.
  if(url.origin !== self.location.origin) return;

  event.respondWith(
    caches.match(req).then(cached => {
      const networkFetch = fetch(req).then(res => {
        if(res && res.status === 200){
          const resClone = res.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(req, resClone));
        }
        return res;
      }).catch(()=> cached);
      // Avval keshdan tez ko'rsatamiz, orqa fonda yangilaymiz (stale-while-revalidate)
      return cached || networkFetch;
    })
  );
});
