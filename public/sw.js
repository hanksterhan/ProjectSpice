// Service worker: NetworkFirst for recipe pages, CacheFirst for images,
// StaleWhileRevalidate for static assets.

const CACHE_VER = 1;
const RECIPE_CACHE = `recipes-v${CACHE_VER}`;
const IMAGE_CACHE = `images-v${CACHE_VER}`;
const ASSET_CACHE = `assets-v${CACHE_VER}`;
const MAX_RECIPE_ENTRIES = 30;
const MAX_IMAGE_ENTRIES = 100;

const KNOWN_CACHES = [RECIPE_CACHE, IMAGE_CACHE, ASSET_CACHE];

self.addEventListener("install", (e) => {
  e.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    Promise.all([
      self.clients.claim(),
      caches.keys().then((keys) =>
        Promise.all(
          keys
            .filter((k) => !KNOWN_CACHES.includes(k))
            .map((k) => caches.delete(k))
        )
      ),
    ])
  );
});

self.addEventListener("fetch", (e) => {
  const { request } = e;
  if (request.method !== "GET") return;

  const url = new URL(request.url);

  // Skip non-same-origin, API routes, and auth routes
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return;
  if (url.pathname === "/login" || url.pathname === "/logout") return;
  // Skip React Router data fetches (Accept header includes text/x-component)
  if (request.headers.get("Accept")?.includes("text/x-component")) return;

  // R2 images
  if (url.pathname.startsWith("/images/")) {
    e.respondWith(cacheFirst(request, IMAGE_CACHE, MAX_IMAGE_ENTRIES));
    return;
  }

  // Static hashed assets (Vite build outputs)
  if (url.pathname.startsWith("/assets/")) {
    e.respondWith(staleWhileRevalidate(request, ASSET_CACHE));
    return;
  }

  // Recipe detail pages — NetworkFirst with offline fallback
  if (/^\/recipes\/[^/]+$/.test(url.pathname)) {
    e.respondWith(networkFirst(request, RECIPE_CACHE, MAX_RECIPE_ENTRIES));
    return;
  }
});

async function networkFirst(request, cacheName, maxEntries) {
  const cache = await caches.open(cacheName);
  try {
    const response = await fetch(request);
    if (response.ok) {
      cache.put(request, response.clone());
      trimCache(cache, maxEntries);
    }
    return response;
  } catch {
    const cached = await cache.match(request);
    if (cached) return cached;
    return new Response(offlinePage(), {
      status: 503,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }
}

async function cacheFirst(request, cacheName, maxEntries) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response.ok) {
      cache.put(request, response.clone());
      if (maxEntries) trimCache(cache, maxEntries);
    }
    return response;
  } catch {
    return new Response("", { status: 503 });
  }
}

async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  const networkPromise = fetch(request).then((r) => {
    if (r.ok) cache.put(request, r.clone());
    return r;
  }).catch(() => null);
  return cached ?? (await networkPromise) ?? new Response("", { status: 503 });
}

async function trimCache(cache, max) {
  const keys = await cache.keys();
  if (keys.length > max) {
    for (const key of keys.slice(0, keys.length - max)) {
      await cache.delete(key);
    }
  }
}

self.addEventListener("message", (e) => {
  if (e.data?.type === "CLEAR_RECIPE_CACHE") {
    caches.delete(RECIPE_CACHE);
  }
});

function offlinePage() {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Offline — ProjectSpice</title><style>body{font-family:system-ui,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#fafaf9;color:#1c1917}.card{text-align:center;padding:2rem;max-width:20rem}h1{font-size:1.25rem;font-weight:600;margin:0 0 .5rem}p{font-size:.875rem;color:#78716c;margin:0 0 1.5rem}a{color:#ea580c;font-size:.875rem}</style></head><body><div class="card"><h1>You're offline</h1><p>This recipe hasn't been cached yet. Open it while connected to view it offline.</p><a href="/">Go home</a></div></body></html>`;
}
