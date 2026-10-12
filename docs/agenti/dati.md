# Dati (`data/`, `docs/schemi/`)
Stato attuale. ≤ 25 KB, righe ≤ 600 caratteri.

## Struttura
- `docs/schemi/<nome>-<N>.json`: JSON Schema draft 2020-12 di `ftir-substance/1`, `ftir-form/1`, `ftir-spectrum/1`, `classes/1`, `alerts/1`, `datasheet/1` (dati della scheda; i testi stanno in `testi.<lingua>.md`), `ftir-library/1` (manifesto) e `ftir-library-index/1` (indice). Ogni proprietà ha `description` (en) e `description_it`; ogni schema è chiuso (`additionalProperties: false`), così un campo personale come `serial_number` viene rifiutato per nome. Nomi di campi e valori degli enum in inglese; unità nei nomi (`resolution_cm1`).
- `tests/fixture/schemi/<schema>/{valid,invalid}/*.json` + `attesi.json` (per ogni non valida, il testo che il messaggio d'errore deve contenere, di solito il campo).
- `data/`: `LEGGIMI.md`, `LICENZE-DATI.md` (it/en), `sources.json` (`sources/1`), `classes.json` (`classes/1`: 3 assi, mappatura UNODC EWA col testo esatto, fonte per voce), `aliases.json` (`aliases/1`), `substances/<id>/{substance.json, forms/, spectra/*.jdx+*.json, datasheet/{datasheet.json, texts.<lingua>.md}}`, `alerts/` (non ancora creata). Oggi solo esempi sintetici (`synthetic-a`, `synthetic-b`, rigenerabili con `tools/dati/genera_sintetico.py`); nessuna sostanza reale. Le sezioni `## <chiave>` di `texts.*.md` sono le 10 chiavi fisse; `texts.en.md` è obbligatorio.

## Contratti e formati
- Tre livelli: sostanza → forma → spettro; chiave = `id` stabile minuscolo; InChIKey obbligatoria solo per `type: compound` (la forma porta la propria `inchikey_form`). Licenze: spettri e dati chimici CC BY 4.0, schede e allerte CC BY-SA 4.0, terzi `LicenseRef-permission-<ente>` (mai in `data/`).
- Aggiungere un campo facoltativo non cambia versione; cambiare significato, obbligatorietà o toglierlo → `/2`. Le cache si ricostruiscono; i documenti dell'utente si leggono a N e N−1.
- Regole non esprimibili nello schema (scheda `review_by` ≤ 24 mesi, parole vietate, fonte per ogni affermazione, unicità di id e InChIKey, coerenza `.jdx`/`.json`) sono controlli di `tools/dati/controlla_dati.py`:
  - id = cartella, InChIKey unica, riferimenti (forma, classe e asse, fonte), SHA-256 e intestazioni `.jdx` = `.json`, `quality` = valori ricalcolati da `qualita.py` (nessun criterio `fail`),
  - niente `unconfirmed_sample`, campi personali (regex + `NOMI_VIETATI`) in JCAMP/JSON/testi, parole vietate (con eccezioni fisse «nessuna dose è sicura», «sostanza pura»), `[f:id]` su ogni capoverso di effects/doses/risks/interactions,
  - `review_by` ≤ 24 mesi, correlazione ≥ 0.98 tra sostanze diverse.
  - Soglie di qualità provvisorie (MATCH le calibra). Il lettore JCAMP (`jcamp.py`) legge solo `##XYPOINTS=(XY..XY)`; altri layout si convertono prima dell'ingresso in `data/`.

## Revisori e flusso delle proposte
- `data/reviewers.json` (`reviewers/1`, `docs/schemi/reviewers-1.json`): solo `github`, `public_name`, `roles` (chemist, health, linguist), `languages`, `organisation_public` facoltativo, `verified`/`expires` (AAAA-MM, scadenza ≤ 24 mesi), `status`; schema chiuso, un campo `email` o `phone` viene rifiutato per nome. Oggi c'è solo l'amministratore (`Freeesta`, chimico); nessun revisore sanitario finché non ne è verificato uno (`test_reviewers.py` lo impone e va cambiato di proposito).
- Flusso: 1 modulo `sheet` o modifica su github.com → 2 triage entro 7 giorni (etichette) → 3 PR con CI (`ci-ok`) → 4 revisori approvano l'ultimo commit (i revisori NON hanno scrittura) → 5 il futuro controllo `signatures` collega approvazioni, ruoli di `reviewers.json` e `datasheet.json` → 6 sezioni sanitarie: serve un `health` → 7 unisce solo un amministratore → 8 Pages ricostruisce → 9 il proponente compare nei crediti → 10 `reviewers.json` e `.github/` li cambia solo un amministratore (CODEOWNERS).
- `.github/CODEOWNERS` elenca SOLO gli amministratori (GitHub richiede scrittura per i code owner); `.github/pull_request_template.md` porta le caselle DCO, licenza, nessun dato personale, «sezioni sanitarie toccate?».

## Prove
- `pip install -r tools/dati/requirements.txt` (jsonschema fissato), poi `python3 tools/dati/valida_schemi.py --schemi | --fixture | FILE...` e `python3 -m unittest discover -s tools/dati -p 'test_*.py'`. Il job `data` della CI esegue questi tre comandi e `python3 tools/dati/controlla_dati.py` (filtro: `data/`, `docs/schemi/`, `tests/fixture/schemi/`, `tools/dati/`).

## Trappole
- Mai dati veri o librerie non redistribuibili in questo repository; stanno nel privato `Freeesta/checkir-data`. Le fixture sono sintetiche.
- Una nuova fixture non valida va elencata in `attesi.json`, altrimenti `--fixture` fallisce.
- `controlla_soglie.py` non guarda i JSON, ma i `.py` di `tools/dati/` sì (file ≤ 500 righe, funzioni ≤ 80).
