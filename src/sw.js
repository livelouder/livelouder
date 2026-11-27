// Live Louder service worker: lets phones install the site like an app, and keeps the last-seen pages
// (including My gigs, which lives on the phone) working when there's no signal at a gig.
// Always tries the network first, so people never see stale gigs when they're online.
const CACHE = 'll-v2';
const CORE = ['/', '/my-gigs.html', '/gigs/index.html', '/style.css', '/app.js', '/account.js', '/friends.js', '/profile.js', '/messages.html', '/messages.js', '/icon-192.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(CORE)).catch(() => {}));
  self.skipWaiting();
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request, url = new URL(req.url);
  // Only plain page and file requests from this site. Sign-in, functions and data services always go straight to the network.
  if (req.method !== 'GET' || url.origin !== location.origin || url.pathname.startsWith('/.netlify/')) return;
  e.respondWith(
    fetch(req).then(res => {
      if (res.ok && res.type === 'basic') { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)).catch(() => {}); }
      return res;
    }).catch(() => caches.match(req, {ignoreSearch: req.mode === 'navigate'}).then(hit => hit || (req.mode === 'navigate' ? caches.match('/my-gigs.html') : undefined)))
  );
});
