# Develop
Italiano: [develop.it.md](develop.it.md)

- Branch `claude/<topic>` or `<your-name>/<topic>` from `origin/main` → pull request → merge commit (never rebase or force-push). One small PR per topic, with tests next to the code.
- Code and comments in English; commit messages and chat documents in Italian. Every commit carries a `Signed-off-by:` line ([Developer Certificate of Origin 1.1](https://developercertificate.org/)).
- Before opening the PR run: `cargo test --locked --release`, `python3 tools/controlla_rust.py`, `python3 tools/controlla_soglie.py`, `python3 tools/controlla_lingue.py`, `npm ci && npx tsc -p tsconfig.json --noEmit`, `bash tools/costruisci_sito.sh && node tests_e2e/fumo.mjs`.
- Every visible text is a key in `web/lang/it.json` and `en.json`; numbers go through `formatNumber`.
- Never real data, names of people or samples, or non-redistributable libraries in this public repository.
- Read `CLAUDE.md` and the area file in `docs/agenti/` for the work you touch (they are written in Italian).
