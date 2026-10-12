# Pagina (`web/`)
Stato attuale. ≤ 25 KB, righe ≤ 600 caratteri.

## Struttura
- `index.html`: scheletro con CSP, link «salta», selettore lingua, sezione grafico e tabella; nessuna logica.
- `main.js`: avvio (lingua, motore, grafico, cambio lingua, service worker); imposta `body[data-ready]`.
- `appname.js`: `APP_NAME`, `STORAGE_PREFIX`. `i18n.js`: `pickLang`, `loadLang`, `t`, `applyCatalog`, `formatNumber`, `parseNumber`.
- `lang/it.json`, `lang/en.json`: cataloghi piatti `area.componente.voce`.
- `motore.js`: carica `wasm/ftir_wasm.js` (costruito dal workflow, non committato). `spettro.js`: `leggiSpettro`, `indiciVisibili`. `vista.js`: `zoom`, `sposta`, `dentro` (funzioni pure).
- `grafico.js`: `disegna` (SVG), `tabella` (dati dell'intervallo visibile), `collega` (tastiera + pulsanti, senza trascinamento).
- `stile.css`: variabili Okabe-Ito, tema scuro, riduci animazioni, colori forzati. `sw.js`: cache `checkir-v<VERSION>`.

## Contratti e formati
- Il motore restituisce spettri come JSON `{numero_onda_cm1: [...], y: [...]}`. Chiavi di errore: `err.*` (dinamiche).

## Prove
- `tests_e2e/fumo.mjs`: curva e tabella, versione motore, axe chiaro/scuro/en, 320 px, tastiera (+, 0), lingue, decimale col punto.

## Trappole
- `tsc` non controlla `sw.js` né `web/wasm`. Nuovi moduli: aggiungerli a `FILES` in `sw.js`.
