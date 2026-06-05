const CACHE_NAME = "cladogram-v1";

// 1. Compile the explicit inventory list of EVERY asset file your game uses
const ASSETS_TO_CACHE = [
  "./",
  "./index.html",
  "./manifest.json",
  "./web/style.css",
  "./web/app.js",
  "./web/data/clades.js",
  "./web/data/species.js",
  "./web/modules/Autocomplete.js",
  "./web/modules/Game.js",
  "./web/modules/Storage.js",
  "./web/modules/Tree.js",
  "./web/images/icon-32.png",
  "./web/images/icon-180.png",
  "./web/images/icon-192.png",
  "./web/images/icon-512.png",
];

// 2. Install Event: Cache all critical system files instantly on app registration
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log("Caching cladogram game core engines...");
      return cache.addAll(ASSETS_TO_CACHE);
    }),
  );
  // Force the waiting service worker to become the active service worker immediately
  self.skipWaiting();
});

// 3. Activate Event: Clean up outdated caches from old project builds
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          if (cache !== CACHE_NAME) {
            console.log("Clearing stale cache configuration arrays...");
            return caches.delete(cache);
          }
        }),
      );
    }),
  );
  self.clients.claim();
});

// 4. Fetch Event: Network-first falling back to offline cache strategy
self.addEventListener("fetch", (event) => {
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // If it's a valid network response, clone it into cache update records
        if (response.status === 200) {
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseClone);
          });
        }
        return response;
      })
      .catch(() => {
        // If network fails (offline), serve the asset instantly from internal storage
        return caches.match(event.request);
      }),
  );
});
