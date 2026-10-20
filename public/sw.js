// ZKWAConnect service worker: offline fallback for pages, and new-message push notifications.
// API calls and app data are never cached (always live).
const CACHE = "zkwa-shell-v1"
const OFFLINE = "/offline.html"

self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll([OFFLINE, "/icons/zkwaconnect-icon-192.png"])).then(() => self.skipWaiting()))
})

self.addEventListener("activate", event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim()))
})

self.addEventListener("fetch", event => {
  const request = event.request
  if (request.method !== "GET" || request.mode !== "navigate") return
  event.respondWith(fetch(request).catch(() => caches.match(OFFLINE)))
})

self.addEventListener("push", event => {
  let data = { title: "ZKWAConnect", body: "You have a new message", url: "/app/inbox", tag: "zkwa" }
  try { data = { ...data, ...event.data.json() } } catch (error) { /* plain text push */ }
  event.waitUntil(self.registration.showNotification(data.title, {
    body: data.body, tag: data.tag, renotify: true, data: { url: data.url },
    icon: "/icons/zkwaconnect-icon-192.png", badge: "/icons/zkwaconnect-icon-96.png",
  }))
})

self.addEventListener("notificationclick", event => {
  event.notification.close()
  const url = (event.notification.data && event.notification.data.url) || "/app/inbox"
  event.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(windows => {
    for (const client of windows) if ("focus" in client) { client.navigate(url); return client.focus() }
    return self.clients.openWindow(url)
  }))
})
