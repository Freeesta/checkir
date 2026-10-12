// Service worker: makes the site work offline. Cache name carries the project prefix; bump VERSION to renew it.
const VERSION = "3";
const ID = new URL(self.location.href).searchParams.get("id") || "app";
const CACHE = ID + "-v" + VERSION;
const FILES = [
  "./", "index.html", "style.css", "main.js", "appname.js", "manifest.webmanifest", "img/logo.svg", "img/icon-16.png", "img/icon-32.png", "img/icon-192.png", "img/icon-512.png", "img/icon-maskable-192.png", "img/icon-maskable-512.png", "img/apple-touch-icon.png", "img/favicon.svg", "img/favicon.ico", "i18n.js", "chart.js", "spectrum.js", "view.js", "engine.js",
  "lang/it.json", "lang/en.json", "wasm/ftir_wasm.js", "wasm/ftir_wasm_bg.wasm",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
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
  e.respondWith(caches.match(e.request).then((hit) => hit || fetch(e.request)));
});
