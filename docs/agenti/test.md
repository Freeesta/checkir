# Test, strumenti e CI (`tests_e2e/`, `tools/`, `.github/`)
Stato attuale. ≤ 25 KB, righe ≤ 600 caratteri.

## Struttura
- `tools/controlla_soglie.py` (file, funzioni, documenti; base `tools/soglie_base.json`), `controlla_rust.py` (clippy/fmt; `clippy_base.json`), `controlla_lingue.py` (cataloghi), `controlla_nomi.py` (motivi regex del segreto `NOMI_VIETATI`, uno per riga, senza distinzione maiuscole; file > 1 MB; test in `test_controlla_nomi.py`), `costruisci_sito.sh` (pagina + `.wasm` in `site/`), `tools/dati/` (validatore degli schemi dati, vedi `dati.md`).
- Nome e colori: `controlla_nome.py` (la parola del nome solo in `web/appname.js` e negli URL della repo; test in `test_controlla_nome.py`), `controlla_contrasti.py` (contrasto WCAG dei ruoli colore di `style.css`, chiaro e scuro; test in `test_controlla_contrasti.py`), `genera_identita.mjs` (manifest e meta dell'anteprima da `appname.js`), `genera_immagini.mjs` (immagini di `web/img/`, a mano).
- `.github/workflows/ci.yml`: `changes` → `rust`, `deny`, `web`, `limits`, `data` → `ci-ok` (unico controllo richiesto). `pages.yml` pubblica a ogni push su main; `signatures.yml` (controllo firme delle schede, da aggiungere ai controlli obbligatori del ruleset), `notte.yml` prove lente; `advisories.yml` avvisi giornalieri. `dependabot.yml` cargo, npm, actions.
- `deny.toml`: licenze e sorgenti ammesse. `.claude/agents/`: subagenti meccanici.

## Prove
- `tests_e2e/registri.mjs` (conformità di `ACTIONS`/`PANELS`, senza browser, chiamato da `fumo.mjs`).
- `tests_e2e/riservatezza.mjs` (T1 statico + T2 canarino, vedi `riservatezza.md`; passo a parte del job `web`).
- `tests_e2e/fumo.mjs` (Playwright + axe-core; `BROWSER` sceglie il motore del browser, `CHROMIUM_PATH` un eseguibile locale).

## Trappole
- I nomi dei job richiesti devono restare allineati al ruleset (`ci-ok`). Le basi delle soglie restano vuote.
- `tools/versione_sw.mjs` (ultimo passo di `costruisci_sito.sh`): scrive in `site/sw.js` la `VERSION` = primi 12 esadecimali dello SHA-256 di `sw.js` (senza la riga VERSION) e dei file di `FILES`; `web/sw.js` ha `"dev"`. Un nome di `FILES` assente dal sito ferma la build. Prova in `tests_e2e/versione.mjs` (dentro `fumo.mjs`). Le PR non toccano più `VERSION`.
- Dopo un cambio di lingua i test aspettano `body[data-lang-ready]` (scritto da `main.js` a fine `setLang` e all'avvio, dopo il ridisegno), mai `<html lang>`, che cambia prima del ridisegno dei testi. Attese su stato o evento, non pause.
