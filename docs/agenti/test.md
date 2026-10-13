# Test, strumenti e CI (`tests_e2e/`, `tools/`, `.github/`)
Stato attuale. ≤ 25 KB, righe ≤ 600 caratteri.

## Struttura
- `tools/controlla_soglie.py` (file, funzioni, documenti; base `tools/soglie_base.json`), `controlla_rust.py` (clippy/fmt; `clippy_base.json`), `controlla_lingue.py` (cataloghi), `controlla_nomi.py` (motivi regex del segreto `NOMI_VIETATI`, uno per riga, senza distinzione maiuscole; file > 1 MB; test in `test_controlla_nomi.py`), `costruisci_sito.sh` (pagina + `.wasm` in `site/`), `tools/dati/` (validatore degli schemi dati, vedi `dati.md`).
- Nome e colori: `controlla_nome.py` (la parola del nome solo in `web/appname.js` e negli URL della repo; test in `test_controlla_nome.py`), `controlla_contrasti.py` (contrasto WCAG dei ruoli colore di `style.css`, chiaro e scuro; test in `test_controlla_contrasti.py`), `genera_identita.mjs` (manifest e meta dell'anteprima da `appname.js`), `genera_immagini.mjs` (immagini di `web/img/`, a mano).
- `.github/workflows/ci.yml` (eventi `pull_request`, `push` su main, `merge_group`): `changes` (su merge_group confronta con `merge_group.base_sha`) → `rust`, `deny`, `web-static`, `site` (costruisce il sito UNA volta e lo passa come artefatto `site`) → `web-e2e` (matrix 3 parti di `fumo.mjs`, `SHARD=i/n`) e `web-privacy` (`riservatezza.mjs`), `limits`, `data` → `ci-ok` (unico controllo richiesto, aspetta tutti).
- `pages.yml` pubblica a ogni push su main; `signatures.yml` (controllo firme delle schede; su `merge_group` si limita a riportare verde, le approvazioni sono già state verificate sulla PR), `notte.yml` prove lente (fumo intero, senza SHARD); `advisories.yml` avvisi giornalieri. `dependabot.yml` cargo, npm, actions.
- `deny.toml`: licenze e sorgenti ammesse. `.claude/agents/`: subagenti meccanici.

## Prove
- `tests_e2e/registri.mjs` (conformità di `ACTIONS`/`PANELS`, senza browser, chiamato da `fumo.mjs`).
- `tests_e2e/prova.mjs` (la Prova della libreria: libreria sintetica con un gemello noto, report, CSV, niente rete; chiamato da `fumo.mjs`).
- `tests_e2e/riservatezza.mjs` (T1 statico + T2 canarino, vedi `riservatezza.md`; passo a parte del job `web`).
- `tests_e2e/fumo.mjs` (Playwright + axe-core; `BROWSER` sceglie il motore del browser, `CHROMIUM_PATH` un eseguibile locale; `SHARD=i/n` esegue gli scenari i, i+n, … dell'elenco `scenarios()` (prove del guscio, poi ogni `tests_e2e/scenari/*.mjs` in ordine di nome); la CI ne lancia 3 in parallelo, senza `SHARD` gira tutto. Ogni file di `scenari/` ha un `export default ({ browser, base, check, axe }) => …` e di norma richiama lo scenario del suo file d'area. Uno scenario nuovo = un file (prefisso numerico per l'ordine, es. `250-nome.mjs`), senza toccare `fumo.mjs`).

## Cache e concorrenza della CI
- Le cache (`rust-`, `site-`: cargo, `target`, `wasm-bindgen`) si SALVANO solo nei push su main (`actions/cache/save`) e si ripristinano in ogni corsa con `restore-keys`; i rami delle PR leggono quelle di main. `node_modules` e i browser Playwright sono in `.github/actions/node-deps` (chiave = hash di `package-lock.json`). Il job `site` salva la cache che usa anche `pages.yml`.
- `concurrency` di `ci.yml`: annulla le corse vecchie solo per `pull_request`; main e `merge_group` hanno gruppo per corsa e non si annullano mai. Un job nuovo di `ci.yml` va aggiunto a `needs` e a `RESULTS` di `ci-ok`.

## Trappole
- I nomi dei job richiesti devono restare allineati al ruleset (`ci-ok`). Le basi delle soglie restano vuote.
- `tools/versione_sw.mjs` (ultimo passo di `costruisci_sito.sh`): scrive in `site/sw.js` l'elenco `FILES` (tutti i file di `site/` tranne `sw.js` e `librerie/`, più `./` e le cartelle con `index.html`) e la `VERSION` = primi 12 esadecimali dello SHA-256 di `sw.js` (senza la riga VERSION) e dei file di `FILES`; `web/sw.js` ha `FILES = []` e `"dev"`. Prova in `tests_e2e/versione.mjs` (dentro `fumo.mjs`). **Non toccare l'elenco `FILES` né `VERSION` in `web/sw.js`**: un file nuovo in `web/` entra da solo nella build; è la causa dei conflitti tra PR in parallelo.
- Cataloghi `web/lang/*.json`: chiavi in ordine alfabetico (`python3 tools/ordina_cataloghi.py` le riordina; `controlla_lingue.py` fallisce se non lo sono), così le aggiunte di aree diverse non cadono tutte in coda. `docs/agenti/` è diviso in file d'area ≤ 15 KB: aggiungi la riga al file della tua funzione, non a un altro.
- `tests_e2e/collaudo_c.mjs` (da `fumo.mjs`): disposizione a 1366×768 e 320 px: grafico a tutta larghezza e ≤ 44 % dell'altezza, copertura solo se parziale, fasce in striscia, scheda senza logo, barra di prova fuori da candidati e grafico, sezioni che seguono il passo, livello del chip a 320 px intero.
- Dopo un cambio di lingua i test aspettano `body[data-lang-ready]` (scritto da `main.js` a fine `setLang` e all'avvio, dopo il ridisegno), mai `<html lang>`, che cambia prima del ridisegno dei testi. Attese su stato o evento, non pause.
