// Service worker: makes the site work offline. Cache name carries the project prefix; bump VERSION to renew it.
const VERSION = "1";
const CACHE = "checkir-v" + VERSION;
const FILES = [
  "./", "index.html", "stile.css", "main.js", "appname.js", "i18n.js", "grafico.js", "spettro.js", "vista.js", "motore.js",
  "lang/it.json", "lang/en.json", "wasm/ftir_wasm.js", "wasm/ftir_wasm_bg.wasm",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((ks) => Promise.all(ks.filter((k) => k.startsWith("checkir-") && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;
  e.respondWith(caches.match(e.request).then((hit) => hit || fetch(e.request)));
});
