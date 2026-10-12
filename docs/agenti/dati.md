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

## Contributi dalla comunità
- Moduli delle issue in `.github/ISSUE_TEMPLATE/` (`sheet`, `new-sheet`, `translation`, `spectrum`, `alert`, `bug`; issue vuote disattivate): bilingui en/it, avviso «tutto è pubblico» in testa, caselle senza dati personali (+ DCO e licenza per chi porta testi o dati). Gli `id` dei campi sono un contratto: la pagina (pacchetto PROPONI) precompila il modulo da URL con `?template=sheet.yml&substance=…&section=…`; `section` usa le 10 chiavi fisse delle schede, `language` usa `en`/`it`.
- Etichette come dati in `.github/labels.yml`; il workflow `labels` le crea/aggiorna al push su `main` (`tools/sync_labels.py`, PyYAML fissato, mai testo di issue in `run:`). Un'etichetta nuova usata da un modulo va aggiunta lì (lo controlla `tools/dati/test_issue_forms.py`).

## Prove
- `pip install -r tools/dati/requirements.txt` (jsonschema fissato), poi `python3 tools/dati/valida_schemi.py --schemi | --fixture | FILE...` e `python3 -m unittest discover -s tools/dati -p 'test_*.py'`. Il job `data` della CI esegue questi tre comandi e `python3 tools/dati/controlla_dati.py` (filtro: `data/`, `docs/schemi/`, `tests/fixture/schemi/`, `tools/dati/`).

## Trappole
- Mai dati veri o librerie non redistribuibili in questo repository; stanno nel privato `Freeesta/checkir-data`. Le fixture sono sintetiche.
- Una nuova fixture non valida va elencata in `attesi.json`, altrimenti `--fixture` fallisce.
- `controlla_soglie.py` non guarda i JSON, ma i `.py` di `tools/dati/` sì (file ≤ 500 righe, funzioni ≤ 80).
