const CACHE_NAME = "kumamap-mobile-v2";
const PRECACHE_URLS = ["/mobile", "/mobile/offline"];

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

// Fetch: network-first for API, cache-first for static assets
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // API calls: network only (real-time data)
  if (url.pathname.startsWith("/api/")) {
    event.respondWith(fetch(event.request).catch(() => new Response('{"error":"offline"}', { status: 503, headers: { "Content-Type": "application/json" } })));
    return;
  }

  // Navigation: network first, fallback to cache
  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request).catch(() => caches.match("/mobile/offline").then((r) => r || caches.match("/mobile")))
    );
    return;
  }

  // Static assets: stale-while-revalidate
  event.respondWith(
    caches.match(event.request).then((cached) => {
      const fetchPromise = fetch(event.request).then((response) => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return response;
      }).catch(() => cached);
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
    icon: "/icon-192.svg",
    badge: "/icon-192.svg",
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

  const urlToOpen = event.notification.data?.url || "/mobile";

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      // Focus existing tab if open
      for (const client of clients) {
        if (client.url.includes("/mobile") && "focus" in client) {
          return client.focus();
        }
      }
      // Open new tab
      return self.clients.openWindow(urlToOpen);
    })
  );
});
