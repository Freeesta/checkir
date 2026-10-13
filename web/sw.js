// Service worker: makes the site work offline. Cache name carries the project prefix. VERSION is written by the build
// (tools/versione_sw.mjs: hash of this file and of everything in FILES); "dev" only when web/ is served as it is.
const VERSION = "dev";
const ID = new URL(self.location.href).searchParams.get("id") || "app";
const CACHE = ID + "-v" + VERSION;
const LIBRARIES = "librerie/";
const FILES = []; // precache list: written into site/sw.js by the build (tools/versione_sw.mjs); never edit it

/** Library packages named by the general manifest: cached on install so the libraries work offline. A failure here never blocks the install. */
async function cacheLibraries(cache) {
  try {
    const res = await fetch(LIBRARIES + "libraries.json", { cache: "reload" });
    if (!res.ok) return;
    await cache.put(LIBRARIES + "libraries.json", res.clone());
    for (const lib of (await res.json()).libraries ?? []) {
      if (!/^[a-z0-9-]+$/.test(String(lib.path))) continue;
      for (const f of ["manifest.json", "index.json", "data.bin"]) await cache.add(`${LIBRARIES}${lib.path}/${f}`);
    }
  } catch {
    // offline libraries are a bonus: the page loads them from the network when it can
  }
}

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then(async (c) => { await c.addAll(FILES); await cacheLibraries(c); }).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((ks) => Promise.all(ks.filter((k) => k.startsWith(ID + "-") && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;
  if (new URL(e.request.url).pathname.includes("/" + LIBRARIES)) {
    // Packages change with the build, not with VERSION: network first, the cached copy when offline.
    e.respondWith(fetch(e.request).then((res) => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); }
      return res;
    }).catch(() => caches.match(e.request).then((hit) => hit || Response.error())));
    return;
  }
  e.respondWith(caches.match(e.request).then((hit) => hit || fetch(e.request)));
});
