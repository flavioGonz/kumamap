const CACHE_NAME = "kumamap-mobile-v6";
// Auto-detect basePath from service worker URL:
//   /maps/sw.js → BASE = "/maps"
//   /sw.js       → BASE = ""
const BASE = new URL(self.location).pathname.replace(/\/sw\.js$/, "");
const PRECACHE_URLS = [
  BASE + "/mobile",
  BASE + "/mobile/alerts",
  BASE + "/mobile/settings",
  BASE + "/mobile/offline",
  BASE + "/icon-192.svg",
  BASE + "/icon-512.svg",
];

// Install: precache shell
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS))
  );
  self.skipWaiting();
});

// Activate: clean old caches
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Fetch: smart strategy per route type
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // API calls: network only with offline fallback
  if (url.pathname.startsWith(BASE + "/api/") || url.pathname.startsWith("/api/")) {
    event.respondWith(
      fetch(event.request)
        .catch(() => new Response('{"error":"offline"}', {
          status: 503,
          headers: { "Content-Type": "application/json" },
        }))
    );
    return;
  }

  // Camera/RTSP streams: network only, no caching
  if (url.pathname.includes("/camera/") || url.pathname.includes("/rtsp")) {
    event.respondWith(fetch(event.request));
    return;
  }

  // Navigation: network first, fallback to cache, then offline page
  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          // Cache successful navigation responses
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          return response;
        })
        .catch(() =>
          caches.match(event.request)
            .then((cached) => cached || caches.match(BASE + "/mobile/offline"))
        )
    );
    return;
  }

  // Static assets: stale-while-revalidate
  event.respondWith(
    caches.match(event.request).then((cached) => {
      const fetchPromise = fetch(event.request)
        .then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() => cached);
      return cached || fetchPromise;
    })
  );
});

// ── Push Notifications ──────────────────────────────────────────────────────

self.addEventListener("push", (event) => {
  if (!event.data) return;

  let payload;
  try {
    payload = event.data.json();
  } catch {
    payload = { title: "KumaMap", body: event.data.text() };
  }

  const title = payload.title || "KumaMap";
  const options = {
    body: payload.body || "",
    icon: BASE + "/icon-192.svg",
    badge: BASE + "/icon-192.svg",
    vibrate: [200, 100, 200],
    tag: payload.tag || "kumamap-alert",
    renotify: true,
    data: payload.data || {},
    actions: payload.actions || [],
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

// Click on notification → open /mobile or focus existing tab
self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const urlToOpen = event.notification.data?.url || (BASE + "/mobile");

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if (client.url.includes("/mobile") && "focus" in client) {
          return client.focus();
        }
      }
      return self.clients.openWindow(urlToOpen);
    })
  );
});
