# Pagina (`web/`)
Stato attuale. ≤ 25 KB, righe ≤ 600 caratteri.

## Struttura
- `index.html`: scheletro con CSP, link «salta», selettore lingua, sezione grafico e tabella; nessuna logica.
- `main.js`: avvio (lingua, motore, grafico, cambio lingua, service worker); imposta `body[data-ready]`.
- `appname.js`: `SITE_URL` (indirizzo pubblico), `APP_NAME` (visibile, «checkIR»), `APP_ID` (tecnico, «checkir», mai rinominato), `STORAGE_PREFIX`; è l'unico file col nome. I cataloghi usano `{app}`, che `t()` riempie con `APP_NAME`.
- Generazione: `tools/genera_identita.mjs` (dentro `costruisci_sito.sh`) scrive in `site/` il `manifest.webmanifest` (icone `any` e `maskable`, theme/background color) e riempie in `index.html` i segnaposto `%APP_NAME%`, `%SITE_URL%`, `%DESCRIPTION%` (testo `share.description` in italiano) dei meta Open Graph / Twitter card, che devono stare nell'HTML servito perché i crawler non eseguono script; `web/index.html` da solo mostra i segnaposto; il service worker riceve l'id da `sw.js?id=`. `i18n.js`: `pickLang`, `loadLang`, `t`, `applyCatalog`, `formatNumber`, `parseNumber`.
- `lang/it.json`, `lang/en.json`: cataloghi piatti `area.component.item`.
- `engine.js`: carica `wasm/ftir_wasm.js` (costruito dal workflow, non committato). `spectrum.js`: `parseSpectrum`, `visibleIndices`. `view.js`: `zoom`, `pan`, `clamp` (funzioni pure).
- `chart.js`: `draw` (SVG), `renderTable` (dati dell'intervallo visibile), `wire` (tastiera + pulsanti, senza trascinamento).
- `img/`: anteprima social `og.png` 1200x630, `favicon.svg` (segue il tema)/`favicon.ico`, `apple-touch-icon.png`, icone `icon-maskable-*`, `logo-chiaro|scuro|mono.svg`: tutti generati da `tools/genera_immagini.mjs` (a mano, da rilanciare se cambiano logo o nome; i PNG contengono il nome). `logo.svg` (pillola tonda con la valle di spettro; varianti e motivazione in `docs/identita/logo.md`; monocromo, `currentColor`; nella pagina è una maschera CSS `.logo` colorata con `--colore-nome`) e icone PNG 16/32/192/512 per favicon e manifest.
- `style.css`: variabili Okabe-Ito, ruoli `--colore-nome|campione|riferimento|residuo|allerta|regione` (chiaro e scuro; il grafico usa i ruoli, non i colori `--oi-*`; il riferimento arancio mai per testo), tema scuro, riduci animazioni, colori forzati. `sw.js`: cache `<APP_ID>-v<VERSION>`.

## Contratti e formati
- Il motore restituisce spettri come JSON `{wavenumber_cm1: [...], y: [...]}`. Chiavi di errore: `err.*` (dinamiche).

## Prove
- `tests_e2e/fumo.mjs`: curva e tabella, versione motore, nome unico (appname.js sostituito con «provanome»), axe chiaro/scuro/en, 320 px, tastiera (+, 0), lingue, decimale col punto.

## Trappole
- `tsc` non controlla `sw.js` né `web/wasm`. Nuovi moduli: aggiungerli a `FILES` in `sw.js`.

## Logo
The logo is a round pill with a check mark. The check mark is allowed only in the logo, favicon and app icons (neutral theme colour); it never appears in the results interface (no check mark, "ok" or green on a substance or a match).
