# Sviluppare
English: [develop.md](develop.md)

- Ramo `claude/<argomento>` o `<tuo-nome>/<argomento>` da `origin/main` → pull request → merge commit (mai rebase né push forzato). Una PR piccola per argomento, con i test accanto al codice.
- Codice e commenti in inglese; messaggi di commit e documenti per le chat in italiano. Ogni commit porta la riga `Signed-off-by:` ([Developer Certificate of Origin 1.1](https://developercertificate.org/)).
- Prima di aprire la PR: `cargo test --locked --release`, `python3 tools/controlla_rust.py`, `python3 tools/controlla_soglie.py`, `python3 tools/controlla_lingue.py`, `npm ci && npx tsc -p tsconfig.json --noEmit`, `bash tools/costruisci_sito.sh && node tests_e2e/fumo.mjs`.
- Ogni testo visibile è una chiave in `web/lang/it.json` ed `en.json`; i numeri passano da `formatNumber`.
- Mai dati veri, nomi di persone o campioni, né librerie non redistribuibili nel repository pubblico.
- Leggi `CLAUDE.md` e il file d'area in `docs/agenti/` del lavoro che tocchi (sono scritti in italiano).
