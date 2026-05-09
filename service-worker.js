const CACHE_NAME = "xiaoshouji-pwa-v6";

const APP_SHELL = [
  "./",
  "./index.html",
  "./manifest.webmanifest?v=6",
  "./css/style.css?v=5",
  "./js/ai.js",
  "./js/main.js?v=5",
  "./js/memory.js",
  "./js/moments.js",
  "./js/prompt.js",
  "./js/storage.js",
  "./js/time.js",
  "./assets/avatar/default-role.svg",
  "./assets/avatar/default-user.svg",
  "./assets/pwa/icon-180.png",
  "./assets/pwa/icon-192.png",
  "./assets/pwa/icon-512.png"
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

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request).catch(() => caches.match("./index.html"))
    );
    return;
  }

  const url = new URL(event.request.url);
  if (url.pathname.endsWith(".js") || url.pathname.endsWith(".css") || url.pathname.endsWith(".webmanifest")) {
    event.respondWith(
      fetch(event.request)
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
