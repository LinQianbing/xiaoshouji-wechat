const CACHE_NAME = "xiaoshouji-pwa-v29";

const APP_SHELL = [
  "./",
  "./index.html",
  "./manifest.webmanifest?v=10",
  "./css/style.css?v=18",
  "./css/moments-wechat-fix.css?v=2",
  "./js/ai.js?v=5",
  "./js/main.js?v=25",
  "./js/memory.js",
  "./js/moments.js",
  "./js/prompt.js?v=4",
  "./js/storage.js?v=2",
  "./js/time.js",
  "./assets/avatar/default-role.svg",
  "./assets/avatar/default-user.svg",
  "./assets/pwa/icon-180.png?v=10",
  "./assets/pwa/icon-192.png?v=10",
  "./assets/pwa/icon-512.png?v=10",
  "./assets/pwa/icon-maskable-192.png?v=10",
  "./assets/pwa/icon-maskable-512.png?v=10"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(names.filter((name) => name !== CACHE_NAME).map((name) => caches.delete(name)))
    )
  );
  self.clients.claim();
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request, { cache: "reload" }).catch(() => caches.match("./index.html"))
    );
    return;
  }

  const url = new URL(event.request.url);
  if (url.pathname.endsWith(".js") || url.pathname.endsWith(".css") || url.pathname.endsWith(".webmanifest")) {
    event.respondWith(
      fetch(event.request, { cache: "reload" })
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
          return response;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).then((response) => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        return response;
      });
    })
  );
});
