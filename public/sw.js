const CACHE_NAME = 'trace-app-shell-v1'

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.add('./')).then(() => self.skipWaiting()))
})

self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then((names) => Promise.all(names.filter((name) => name !== CACHE_NAME).map((name) => caches.delete(name)))).then(() => self.clients.claim()))
})

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET' || new URL(event.request.url).origin !== self.location.origin) return
  event.respondWith(fetch(event.request).then((response) => {
    if (response.ok) void caches.open(CACHE_NAME).then((cache) => cache.put(event.request, response.clone()))
    return response
  }).catch(async () => {
    const cached = await caches.match(event.request)
    if (cached) return cached
    if (event.request.mode === 'navigate') return (await caches.match('./'))
    return Response.error()
  }))
})
