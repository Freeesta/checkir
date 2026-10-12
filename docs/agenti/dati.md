# Dati (`data/`, `docs/schemi/`)
Stato attuale. ≤ 25 KB, righe ≤ 600 caratteri.

## Struttura
- `docs/schemi/<nome>-<N>.json`: JSON Schema draft 2020-12 di `ftir-substance/1`, `ftir-form/1`, `ftir-spectrum/1`, `classes/1`, `alerts/1`, `datasheet/1` (dati della scheda; i testi stanno in `testi.<lingua>.md`), `ftir-library/1` (manifesto) e `ftir-library-index/1` (indice). Ogni proprietà ha `description` (en) e `description_it`; ogni schema è chiuso (`additionalProperties: false`), così un campo personale come `serial_number` viene rifiutato per nome. Nomi di campi e valori degli enum in inglese; unità nei nomi (`resolution_cm1`).
- `tests/fixture/schemi/<schema>/{valid,invalid}/*.json` + `attesi.json` (per ogni non valida, il testo che il messaggio d'errore deve contenere, di solito il campo).
- `data/`: non esiste ancora; ospiterà solo dati aperti con licenza verificata e attribuzione per voce.

## Contratti e formati
- Tre livelli: sostanza → forma → spettro; chiave = `id` stabile minuscolo; InChIKey obbligatoria solo per `type: compound` (la forma porta la propria `inchikey_form`). Licenze: spettri e dati chimici CC BY 4.0, schede e allerte CC BY-SA 4.0, terzi `LicenseRef-permission-<ente>` (mai in `data/`).
- Aggiungere un campo facoltativo non cambia versione; cambiare significato, obbligatorietà o toglierlo → `/2`. Le cache si ricostruiscono; i documenti dell'utente si leggono a N e N−1.
- Regole non esprimibili nello schema (scheda `review_by` ≤ 24 mesi, parole vietate, fonte per ogni affermazione, unicità di id e InChIKey, coerenza `.jdx`/`.json`) sono controlli di `tools/dati/` (PR 2).

## Prove
- `pip install -r tools/dati/requirements.txt` (jsonschema fissato), poi `python3 tools/dati/valida_schemi.py --schemi | --fixture | FILE...` e `python3 -m unittest discover -s tools/dati -p 'test_*.py'`. Il job `data` della CI esegue questi tre comandi (filtro: `data/`, `docs/schemi/`, `tests/fixture/schemi/`, `tools/dati/`).

## Trappole
- Mai dati veri o librerie non redistribuibili in questo repository; stanno nel privato `Freeesta/checkir-data`. Le fixture sono sintetiche.
- Una nuova fixture non valida va elencata in `attesi.json`, altrimenti `--fixture` fallisce.
- `controlla_soglie.py` non guarda i JSON, ma i `.py` di `tools/dati/` sì (file ≤ 500 righe, funzioni ≤ 80).
