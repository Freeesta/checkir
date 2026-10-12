# Pagina (`web/`)
Stato attuale. ≤ 25 KB, righe ≤ 600 caratteri.

## Struttura
- `index.html`: scheletro con CSP, link «salta», selettore lingua, sezione grafico e tabella; nessuna logica.
- `main.js`: avvio (lingua, motore, grafico, cambio lingua, service worker); imposta `body[data-ready]`.
- `appname.js`: `APP_NAME` (visibile, «checkIR»), `APP_ID` (tecnico, «checkir», mai rinominato), `STORAGE_PREFIX`; è l'unico file col nome. I cataloghi usano `{app}`, che `t()` riempie con `APP_NAME`. `manifest.webmanifest` è generato da `tools/genera_manifest.mjs` (dentro `costruisci_sito.sh`), non committato; il service worker riceve l'id da `sw.js?id=`. `i18n.js`: `pickLang`, `loadLang`, `t`, `applyCatalog`, `formatNumber`, `parseNumber`.
- `lang/it.json`, `lang/en.json`: cataloghi piatti `area.component.item`.
- `engine.js`: carica `wasm/ftir_wasm.js` (costruito dal workflow, non committato). `spectrum.js`: `parseSpectrum`, `visibleIndices`. `view.js`: `zoom`, `pan`, `clamp` (funzioni pure).
- `chart.js`: `draw` (SVG), `renderTable` (dati dell'intervallo visibile), `wire` (tastiera + pulsanti, senza trascinamento).
- `style.css`: variabili Okabe-Ito, tema scuro, riduci animazioni, colori forzati. `sw.js`: cache `<APP_ID>-v<VERSION>`.

## Contratti e formati
- Il motore restituisce spettri come JSON `{wavenumber_cm1: [...], y: [...]}`. Chiavi di errore: `err.*` (dinamiche).

## Prove
- `tests_e2e/fumo.mjs`: curva e tabella, versione motore, nome unico (appname.js sostituito con «provanome»), axe chiaro/scuro/en, 320 px, tastiera (+, 0), lingue, decimale col punto.

## Trappole
- `tsc` non controlla `sw.js` né `web/wasm`. Nuovi moduli: aggiungerli a `FILES` in `sw.js`.
