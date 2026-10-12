# Test, strumenti e CI (`tests_e2e/`, `tools/`, `.github/`)
Stato attuale. ≤ 25 KB, righe ≤ 600 caratteri.

## Struttura
- `tools/controlla_soglie.py` (file, funzioni, documenti; base `tools/soglie_base.json`), `controlla_rust.py` (clippy/fmt; `clippy_base.json`), `controlla_lingue.py` (cataloghi), `controlla_nomi.py` (nomi vietati dal segreto `NOMI_VIETATI`, file > 1 MB), `costruisci_sito.sh` (pagina + `.wasm` in `site/`).
- `.github/workflows/ci.yml`: `changes` → `rust`, `deny`, `web`, `limits`, `data` → `ci-ok` (unico controllo richiesto). `pages.yml` pubblica a ogni push su main; `notte.yml` prove lente; `advisories.yml` avvisi giornalieri. `dependabot.yml` cargo, npm, actions.
- `deny.toml`: licenze e sorgenti ammesse. `.claude/agents/`: subagenti meccanici.

## Prove
- `tests_e2e/fumo.mjs` (Playwright + axe-core; `BROWSER` sceglie il motore del browser, `CHROMIUM_PATH` un eseguibile locale).

## Trappole
- I nomi dei job richiesti devono restare allineati al ruleset (`ci-ok`). Le basi delle soglie restano vuote.
