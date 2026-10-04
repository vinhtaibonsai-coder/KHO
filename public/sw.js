/// <reference lib="webworker" />

const CACHE_VERSION = "v2.5.2";
const STATIC_CACHE = `lua-nhut-static-${CACHE_VERSION}`;
const IMAGE_CACHE = `lua-nhut-images-${CACHE_VERSION}`;
const OFFLINE_FALLBACK = "/offline.html";

const PRECACHE_ASSETS = [
  "/",
  "/manifest.webmanifest",
  "/offline.html",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/apple-touch-icon.png",
  "/icon.svg",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => {
      return cache.addAll(PRECACHE_ASSETS);
    })
  );
  // Không force skipWaiting ngay để tránh reload lúc user đang nhập form
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter(
            (key) =>
              (key.startsWith("lua-nhut-static-") && key !== STATIC_CACHE) ||
              (key.startsWith("lua-nhut-images-") && key !== IMAGE_CACHE)
          )
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // 1. Tuyệt đối không cache method khác GET (POST, PUT, DELETE, PATCH)
  if (req.method !== "GET") {
    return;
  }

  // 2. Tuyệt đối không cache API xác thực, private token hoặc api session
  if (
    url.pathname.startsWith("/api/auth") ||
    url.pathname.startsWith("/api/simulator")
  ) {
    return;
  }

  // 3. Navigation Request (Truy cập trang HTML) -> Network First, Fallback về Cache hoặc /offline.html
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((response) => {
          if (response.status === 200) {
            const clone = response.clone();
            caches.open(STATIC_CACHE).then((cache) => cache.put(req, clone));
          }
          return response;
        })
        .catch(async () => {
          const cached = await caches.match(req);
          if (cached) return cached;
          const fallback = await caches.match(OFFLINE_FALLBACK);
          if (fallback) return fallback;
          return new Response("Ngoại tuyến", {
            status: 503,
            headers: { "Content-Type": "text/plain; charset=utf-8" },
          });
        })
    );
    return;
  }

  // 4. Static Next.js Bundles & Fonts (_next/static/*) -> Cache First
  if (url.pathname.startsWith("/_next/static/") || url.pathname.includes("/fonts/")) {
    event.respondWith(
      caches.match(req).then((cached) => {
        if (cached) return cached;
        return fetch(req).then((response) => {
          if (response.status === 200) {
            const clone = response.clone();
            caches.open(STATIC_CACHE).then((cache) => cache.put(req, clone));
          }
          return response;
        });
      })
    );
    return;
  }

  // 5. Ảnh (png, jpg, svg, webp) -> Stale-While-Revalidate
  if (
    req.destination === "image" ||
    /\.(png|jpg|jpeg|svg|webp|ico)$/i.test(url.pathname)
  ) {
    event.respondWith(
      caches.match(req).then((cached) => {
        const fetchPromise = fetch(req)
          .then((networkRes) => {
            if (networkRes.status === 200) {
              const clone = networkRes.clone();
              caches.open(IMAGE_CACHE).then((cache) => cache.put(req, clone));
            }
            return networkRes;
          })
          .catch(() => cached);
        return cached || fetchPromise;
      })
    );
    return;
  }

  // 6. Dữ liệu kho API (/api/items) -> Network First (không cache mù)
  if (url.pathname.startsWith("/api/items")) {
    event.respondWith(
      fetch(req).catch(async () => {
        // Trả lỗi mạng để giao diện client-side đọc từ IndexedDB an toàn
        return new Response(
          JSON.stringify({ error: "offline", offline: true }),
          {
            status: 503,
            headers: { "Content-Type": "application/json; charset=utf-8" },
          }
        );
      })
    );
    return;
  }
});
