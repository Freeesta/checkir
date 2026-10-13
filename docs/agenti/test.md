# Test, strumenti e CI (`tests_e2e/`, `tools/`, `.github/`)
Stato attuale. ≤ 25 KB, righe ≤ 600 caratteri.

## Struttura
- `tools/controlla_soglie.py` (file, funzioni, documenti; base `tools/soglie_base.json`), `controlla_rust.py` (clippy/fmt; `clippy_base.json`), `controlla_lingue.py` (cataloghi), `controlla_nomi.py` (motivi regex del segreto `NOMI_VIETATI`, uno per riga, senza distinzione maiuscole; file > 1 MB; test in `test_controlla_nomi.py`), `costruisci_sito.sh` (pagina + `.wasm` in `site/`), `tools/dati/` (validatore degli schemi dati, vedi `dati.md`).
- Nome e colori: `controlla_nome.py` (la parola del nome solo in `web/appname.js` e negli URL della repo; test in `test_controlla_nome.py`), `controlla_contrasti.py` (contrasto WCAG dei ruoli colore di `style.css`, chiaro e scuro; test in `test_controlla_contrasti.py`), `genera_identita.mjs` (manifest e meta dell'anteprima da `appname.js`), `genera_immagini.mjs` (immagini di `web/img/`, a mano).
- `.github/workflows/ci.yml`: `changes` → `rust`, `deny`, `web`, `limits`, `data` → `ci-ok` (unico controllo richiesto). `pages.yml` pubblica a ogni push su main; `signatures.yml` (controllo firme delle schede, da aggiungere ai controlli obbligatori del ruleset), `notte.yml` prove lente; `advisories.yml` avvisi giornalieri. `dependabot.yml` cargo, npm, actions.
- `deny.toml`: licenze e sorgenti ammesse. `.claude/agents/`: subagenti meccanici.

## Prove
- `tests_e2e/registri.mjs` (conformità di `ACTIONS`/`PANELS`, senza browser, chiamato da `fumo.mjs`).
- `tests_e2e/prova.mjs` (la Prova della libreria: libreria sintetica con un gemello noto, report, CSV, niente rete; chiamato da `fumo.mjs`).
- `tests_e2e/riservatezza.mjs` (T1 statico + T2 canarino, vedi `riservatezza.md`; passo a parte del job `web`).
- `tests_e2e/fumo.mjs` (Playwright + axe-core; `BROWSER` sceglie il motore del browser, `CHROMIUM_PATH` un eseguibile locale). Dopo le prove del guscio esegue, in ordine di nome, ogni `tests_e2e/scenari/*.mjs`: il file ha un `export default ({ browser, base, check, axe }) => …` e di norma richiama lo scenario del suo file d'area. Un pacchetto nuovo aggiunge un file (prefisso numerico per l'ordine, es. `250-nome.mjs`) e non tocca `fumo.mjs`.

## Trappole
- I nomi dei job richiesti devono restare allineati al ruleset (`ci-ok`). Le basi delle soglie restano vuote.
- `tools/versione_sw.mjs` (ultimo passo di `costruisci_sito.sh`): scrive in `site/sw.js` l'elenco `FILES` (tutti i file di `site/` tranne `sw.js` e `librerie/`, più `./` e le cartelle con `index.html`) e la `VERSION` = primi 12 esadecimali dello SHA-256 di `sw.js` (senza la riga VERSION) e dei file di `FILES`; `web/sw.js` ha `FILES = []` e `"dev"`. Prova in `tests_e2e/versione.mjs` (dentro `fumo.mjs`). **Non toccare l'elenco `FILES` né `VERSION` in `web/sw.js`**: un file nuovo in `web/` entra da solo nella build; è la causa dei conflitti tra PR in parallelo.
- Cataloghi `web/lang/*.json`: chiavi in ordine alfabetico (`python3 tools/ordina_cataloghi.py` le riordina; `controlla_lingue.py` fallisce se non lo sono), così le aggiunte di aree diverse non cadono tutte in coda. `docs/agenti/` è diviso in file d'area ≤ 15 KB: aggiungi la riga al file della tua funzione, non a un altro.
