// Service worker: makes the site work offline. Cache name carries the project prefix. VERSION is written by the build
// (tools/versione_sw.mjs: hash of this file and of everything in FILES); "dev" only when web/ is served as it is.
const VERSION = "dev";
const ID = new URL(self.location.href).searchParams.get("id") || "app";
const CACHE = ID + "-v" + VERSION;
const LIBRARIES = "librerie/";
const FILES = [
  "./", "index.html", "style.css", "main.js", "appname.js", "manifest.webmanifest", "img/logo.svg", "img/icon-16.png", "img/icon-32.png", "img/icon-192.png", "img/icon-512.png", "img/icon-maskable-192.png", "img/icon-maskable-512.png", "img/apple-touch-icon.png", "img/favicon.svg", "img/favicon.ico", "i18n.js", "chart.js", "chart_cursors.js", "chart_input.js", "chart_ranges.js", "ranges.js", "ranges_ui.js", "ranges_table.js", "view_link.js", "spectrum.js", "view.js", "engine.js", "icons.svg", "state.js", "actions.js", "panels.js", "header.js", "tooltip.js", "dom.js", "theme.js", "controls.js", "dialogs.js", "workarea.js", "shortcuts.js", "help.js", "files.js", "cartella.js", "cartella_ui.js", "librerie.js", "libpanel.js", "importa.js", "nomi.js", "opfs.js", "alerts.js", "match.js", "match.worker.js", "peak_index_job.js", "peak_index_cache.js", "results.js", "layers.js", "peaks.js", "peaks_panel.js", "peaks_view.js", "regions.js", "bands_data.js", "peak_card.js", "mode_anim.js", "chart_marks.js", "decision.js", "sheet.js", "sheet_panel.js", "talk.js", "subtract.js", "subtract_view.js", "strips.js", "schede_prova.js", "print.css",
  "pagina.js", "avvertenze.js", "pagine/avvertenze/", "pagine/avvertenze/index.html", "pagine/informativa/", "pagine/informativa/index.html",
  "bands/regions.json", "bands/rules.json", "bands/groups.json", "bands/modes.json", "bands/texts.it.json", "bands/texts.en.json", "bands/sources.json", "lang/it.json", "lang/en.json", "wasm/ftir_wasm.js", "wasm/ftir_wasm_bg.wasm",
];

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
