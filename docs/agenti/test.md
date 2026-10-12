# Test, strumenti e CI (`tests_e2e/`, `tools/`, `.github/`)
Stato attuale. ≤ 25 KB, righe ≤ 600 caratteri.

## Struttura
- `tools/controlla_soglie.py` (file, funzioni, documenti; base `tools/soglie_base.json`), `controlla_rust.py` (clippy/fmt; `clippy_base.json`), `controlla_lingue.py` (cataloghi), `controlla_nome.py` (la parola del nome solo in `web/appname.js` e negli URL della repo; test in `test_controlla_nome.py`), `controlla_contrasti.py` (contrasto WCAG dei ruoli colore di `style.css`, chiaro e scuro; test in `test_controlla_contrasti.py`), `genera_manifest.mjs` (manifest da `appname.js`), `controlla_nomi.py` (motivi regex del segreto `NOMI_VIETATI`, uno per riga, senza distinzione maiuscole; file > 1 MB; test in `test_controlla_nomi.py`), `costruisci_sito.sh` (pagina + `.wasm` in `site/`).
- `.github/workflows/ci.yml`: `changes` → `rust`, `deny`, `web`, `limits`, `data` → `ci-ok` (unico controllo richiesto). `pages.yml` pubblica a ogni push su main; `notte.yml` prove lente; `advisories.yml` avvisi giornalieri. `dependabot.yml` cargo, npm, actions.
- `deny.toml`: licenze e sorgenti ammesse. `.claude/agents/`: subagenti meccanici.

## Prove
- `tests_e2e/fumo.mjs` (Playwright + axe-core; `BROWSER` sceglie il motore del browser, `CHROMIUM_PATH` un eseguibile locale).

## Trappole
- I nomi dei job richiesti devono restare allineati al ruleset (`ci-ok`). Le basi delle soglie restano vuote.
