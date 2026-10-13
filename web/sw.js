// Service worker: makes the site work offline. Cache name carries the project prefix; bump VERSION to renew it.
const VERSION = "16";
const ID = new URL(self.location.href).searchParams.get("id") || "app";
const CACHE = ID + "-v" + VERSION;
const LIBRARIES = "librerie/";
const FILES = [
  "./", "index.html", "style.css", "main.js", "appname.js", "manifest.webmanifest", "img/logo.svg", "img/icon-16.png", "img/icon-32.png", "img/icon-192.png", "img/icon-512.png", "img/icon-maskable-192.png", "img/icon-maskable-512.png", "img/apple-touch-icon.png", "img/favicon.svg", "img/favicon.ico", "i18n.js", "chart.js", "chart_cursors.js", "chart_input.js", "view_link.js", "spectrum.js", "view.js", "engine.js", "icons.svg", "state.js", "actions.js", "panels.js", "header.js", "tooltip.js", "dom.js", "theme.js", "controls.js", "dialogs.js", "workarea.js", "shortcuts.js", "help.js", "files.js", "cartella.js", "cartella_ui.js", "librerie.js", "libpanel.js", "importa.js", "nomi.js", "opfs.js", "alerts.js", "match.js", "match.worker.js", "results.js", "layers.js", "peaks.js", "peaks_panel.js", "chart_marks.js", "decision.js", "sheet.js", "schede.js", "schede_ui.js", "sheet_panel.js", "talk.js", "subtract.js", "subtract_view.js", "strips.js", "schede_prova.js", "print.css",
  "pagina.js", "avvertenze.js", "pagine/avvertenze/", "pagine/avvertenze/index.html", "pagine/informativa/", "pagine/informativa/index.html",
  "lang/it.json", "lang/en.json", "wasm/ftir_wasm.js", "wasm/ftir_wasm_bg.wasm",
];

/** The substance sheets named by the index: cached on install so the sheets open offline. A failure never blocks the install. */
async function cacheSheets(cache) {
  try {
    const res = await fetch("schede/index.json", { cache: "reload" });
    if (!res.ok) return;
    await cache.put("schede/index.json", res.clone());
    await cache.add("schede/sources.json");
    for (const id of (await res.json()).sheets ?? []) if (/^[a-z0-9-]+$/.test(id)) await cache.add(`schede/${id}.json`);
  } catch {
    // the sheets load from the network when it is there
  }
}

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
  e.waitUntil(caches.open(CACHE).then(async (c) => { await c.addAll(FILES); await cacheLibraries(c); await cacheSheets(c); }).then(() => self.skipWaiting()));
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
  if (/\/(librerie|schede)\//.test(new URL(e.request.url).pathname)) {
    // Packages and sheets change with the build, not with VERSION: network first, the cached copy when offline.
    e.respondWith(fetch(e.request).then((res) => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); }
      return res;
    }).catch(() => caches.match(e.request).then((hit) => hit || Response.error())));
    return;
  }
  e.respondWith(caches.match(e.request).then((hit) => hit || fetch(e.request)));
});
