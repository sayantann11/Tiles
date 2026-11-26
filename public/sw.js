// TileDesk service worker: the app opens instantly and works offline. API calls always go to the network.
const VERSION = 'td-v1.0.0';
const SHELL = ['./', 'index.html', 'share.html', 'css/app.css', 'manifest.webmanifest', 'fonts/manrope.woff2', 'fonts/bricolage.woff2',
  'icons/icon-192.png', 'icons/icon-512.png',
  'js/app.js', 'js/core.js', 'js/store.js', 'js/logic.js', 'js/ui.js', 'js/parts.js', 'js/docs.js', 'js/seed.js',
  'js/v-home.js', 'js/v-stock.js', 'js/v-docs.js', 'js/v-parties.js', 'js/v-more.js', 'js/v-reports.js', 'js/v-settings.js', 'js/vendor/qrcode.mjs'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('message', e => { if (e.data === 'skip') self.skipWaiting(); });
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin || url.pathname.includes('/api/')) return;
  if (e.request.mode === 'navigate') {
    const page = url.pathname.endsWith('share.html') ? 'share.html' : 'index.html';
    // fresh page when online (2.5 s limit), cached page when offline or slow
    e.respondWith((async () => {
      const cached = await caches.match(new URL(page, self.registration.scope).href);
      const net = fetch(e.request);
      if (!cached) return net;
      return Promise.race([net, new Promise((_, rej) => setTimeout(rej, 2500))]).then(r => r.ok ? r : cached).catch(() => cached);
    })());
    return;
  }
  e.respondWith(caches.match(e.request, { ignoreSearch: true }).then(r => r || fetch(e.request).then(res => {
    if (res.ok) { const copy = res.clone(); caches.open(VERSION).then(c => c.put(e.request, copy)); }
    return res;
  })));
});
