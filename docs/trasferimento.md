# Trasferimento in un'organizzazione

Nel codice della pagina il repository è scritto in UNA riga: `REPO_OWNER` (e `REPO_NAME`) in `web/appname.js`. Da lì derivano `GITHUB_URL` e `SITE_URL` (usati da `web/proponi.js`, `web/pagina.js` per il link delle issue nell'informativa, `tools/genera_identita.mjs`) e i test (`tests_e2e/schede.mjs`). Il sito usa percorsi relativi. I workflow usano `${{ github.repository }}`: non vanno toccati.

## Da cambiare a mano (nome scritto)
- `web/appname.js`: `REPO_OWNER` (e `REPO_NAME` se cambia).
- `Cargo.toml` (`repository`), `CITATION.cff` (`repository-code`).
- `README.md`, `README.it.md` (indirizzo del sito); `CONTRIBUTING.md`/`.it.md`, `GOVERNANCE.md`/`.it.md`, `docs/contribute/*.md` (link a issue e moduli).
- `.github/ISSUE_TEMPLATE/config.yml` (tre URL), `.github/CODEOWNERS` (`@Freeesta`: in un'organizzazione usa `@org/team`), `data/reviewers.json` (account del manutentore, resta personale).
- `CLAUDE.md` (righe 1 e «Dati privati»), `docs/agenti/dati.md`, `docs/agenti/pagina_confronto.md`, `.claude/agents/controllo-github.md` (nome `Freeesta/checkir[-data]`).
- `tests_e2e/link_ammessi.json` e `tools/controlla_nome.py` NON cambiano (leggono la costante).
- Anche `Freeesta/checkir-data` va trasferito (o ricreato) nella stessa organizzazione; aggiorna segreti e variabile `CHECKIR_DATA`.

## Passi su GitHub
1. Settings → General → Transfer ownership → organizzazione (GitHub lascia i reindirizzamenti dal vecchio indirizzo).
2. Settings → Pages: sorgente «GitHub Actions»; verifica che il workflow `pages` pubblichi il nuovo indirizzo `https://<org>.github.io/checkir/`.
3. Settings → Rules → Rulesets: ricrea (o verifica) il ruleset di `main`: controllo richiesto `ci-ok`, PR obbligatoria, niente push forzato.
4. Settings → General → «Allow auto-merge»: attivalo.
5. Merge queue: nelle organizzazioni diventa disponibile; attivala nel ruleset di `main` con `ci-ok` come controllo richiesto (`ci.yml` ascolta già `merge_group`).
6. Ricontrolla segreti (`NOMI_VIETATI`), ambienti e l'app Claude sull'organizzazione; poi `git grep -n -i <vecchio-proprietario>` deve restare vuoto.
