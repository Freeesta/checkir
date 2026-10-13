# Dati (`data/`, `docs/schemi/`)
Stato attuale. ≤ 25 KB, righe ≤ 600 caratteri.

## Struttura
- `docs/schemi/<nome>-<N>.json`: JSON Schema draft 2020-12 di `ftir-substance/1`, `ftir-form/1`, `ftir-spectrum/1`, `classes/1`, `alerts/1`, `datasheet/1` (dati della scheda; i testi stanno in `testi.<lingua>.md`), `ftir-library/1` (manifesto) e `ftir-library-index/1` (indice). Ogni proprietà ha `description` (en) e `description_it`; ogni schema è chiuso (`additionalProperties: false`), così un campo personale come `serial_number` viene rifiutato per nome. Nomi di campi e valori degli enum in inglese; unità nei nomi (`resolution_cm1`).
- Schemi delle bande IR: `bands/1`, `groups/1`, `modes/1`, `regions/1`, `substance-bands/1`, `band-texts/1` (vedi «Bande IR»); stessa regola: chiusi, `description` + `description_it`.
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

## Bande IR (`data/bands/`)
- `rules.json` (`bands/1`): 79 regole di gruppo, tutte `status: draft` (le firma solo il revisore). `diagnostic_for` solo da `verified_spectra`, con ≥ 2 id opachi `vs-<12 esadecimali>` in `verified_on` (mai nomi di file o codici di campione).
- Finestra = unione degli intervalli delle fonti, ≥ 10 cm⁻¹ (salvo famiglia `artifact`); per le bande **forti** il limite basso è 10 cm⁻¹ sotto la letteratura (spostamento ATR), il valore delle fonti resta in `range_literature_cm1`: lo calcola il generatore, mai a mano.
- `scope: candidate_only` (21 regole) serve solo a nominare il gruppo di una banda già spiegata da un candidato; i picchi li «spiega» solo una sostanza, le regole danno interpretazioni.
- `groups.json` (48 gruppi con albero `parent`, nomi it/en, `formula_hint`, `family` = colore + motivo, mai il solo colore), `modes.json` (13 modi; 7 con animazione 2D del CH₂, gli altri a parole), `regions.json` (10 regioni didattiche, separate dalle quattro zone di punteggio del confronto).
- Testi: `texts.it.json` e `texts.en.json` (`band-texts/1`), chiave `bands.<id>.counsellor|chemist|teaching`, `modes.<id>.definition`, `regions.<id>.name|short`, `substance_bands.*` (trattini degli id → underscore). Ogni chiave esiste in entrambe le lingue; `teaching` solo per le 20 regole più comuni. Licenza dei testi CC BY-SA 4.0, del resto CC BY 4.0.
- Le sorgenti stanno in `tools/dati/bande_regole.py` (regole, gruppi, modi, regioni), `bande_testi_a.py`, `bande_testi_b.py`, `bande_didattica.py`: si modificano quelle e si lancia `python3 tools/dati/genera_bande.py`; `--verifica` (in CI) fallisce se i JSON non coincidono con le tabelle.
- `tools/dati/controlla_bande.py`: schema con il nome della regola nel messaggio; id citati esistenti (gruppo, modo, regola, classe, fonte, revisore); ≥ 1 fonte per regola; larghezza; allargamento ATR; `diagnostic_for` e stato; chiavi di testo in tutte le lingue e nessuna orfana.
  - Parole vietate: sicuro, puro, pulito, innocuo, nessun rischio, «senza fentanil», negativo come giudizio, purezza, «ok da usare», «via libera» e gli equivalenti inglesi; poi dati personali e `NOMI_VIETATI`.
- Fonti dei numeri: `sources.json` (28 voci nuove: Coates 2000, serie Smith su *Spectroscopy*, Gonçalves 2021, Maheux 2016, tabelle UCLA/Boulder/Wikipedia/LibreTexts, NIST, USP, Shimadzu); sono citate per i numeri, i testi sono scritti da noi (LibreTexts è NC e Sigma-Aldrich ©: solo citati). `archive_url` (Wayback) c'è dove esiste una copia; mancano per Boulder, Smith C-O/carbonili/esteri aromatici/immidi e USP.

## Revisori e flusso delle proposte
- `data/reviewers.json` (`reviewers/1`, `docs/schemi/reviewers-1.json`): solo `github`, `public_name`, `roles` (chemist, health, linguist), `languages`, `organisation_public` facoltativo, `verified`/`expires` (AAAA-MM, scadenza ≤ 24 mesi), `status`; schema chiuso, un campo `email` o `phone` viene rifiutato per nome. Oggi c'è solo il proprietario (`Freeesta`, ruoli chemist e health): per decisione del proprietario (12/10/2026) può firmare anche dosi e sezioni sanitarie; resta una fonte per ogni affermazione.
- Flusso: 1 modulo `sheet` o modifica su github.com → 2 triage entro 7 giorni (etichette) → 3 PR con CI (`ci-ok`) → 4 revisori approvano l'ultimo commit (i revisori NON hanno scrittura) → 5 il futuro controllo `signatures` collega approvazioni, ruoli di `reviewers.json` e `datasheet.json` → 6 sezioni sanitarie: serve un revisore con ruolo `health` → 7 unisce solo un amministratore → 8 Pages ricostruisce → 9 il proponente compare nei crediti → 10 `reviewers.json` e `.github/` li cambia solo un amministratore (CODEOWNERS).
- `.github/CODEOWNERS` elenca SOLO gli amministratori (GitHub richiede scrittura per i code owner); `.github/pull_request_template.md` porta le caselle DCO, licenza, nessun dato personale, «sezioni sanitarie toccate?».

## Contributi dalla comunità
- Moduli delle issue in `.github/ISSUE_TEMPLATE/` (`sheet`, `new-sheet`, `translation`, `spectrum`, `alert`, `bug`; issue vuote disattivate): bilingui en/it, avviso «tutto è pubblico» in testa, caselle senza dati personali (+ DCO e licenza per chi porta testi o dati). Gli `id` dei campi sono un contratto: la pagina (pacchetto PROPONI) precompila il modulo da URL con `?template=sheet.yml&substance=…&section=…`; `section` usa le 10 chiavi fisse delle schede, `language` usa `en`/`it`.
- Etichette come dati in `.github/labels.yml`; il workflow `labels` le crea/aggiorna al push su `main` (`tools/sync_labels.py`, PyYAML fissato, mai testo di issue in `run:`). Un'etichetta nuova usata da un modulo va aggiunta lì (lo controlla `tools/dati/test_issue_forms.py`).

## Prove
- `pip install -r tools/dati/requirements.txt` (jsonschema fissato), poi `python3 tools/dati/valida_schemi.py --schemi | --fixture | FILE...` e `python3 -m unittest discover -s tools/dati -p 'test_*.py'`. Il job `data` della CI esegue questi tre comandi e `python3 tools/dati/controlla_dati.py` (filtro: `data/`, `docs/schemi/`, `tests/fixture/schemi/`, `tools/dati/`).

## Trappole
- Mai dati veri o librerie non redistribuibili in questo repository; stanno nel privato `Freeesta/checkir-data`. Le fixture sono sintetiche.
- Una nuova fixture non valida va elencata in `attesi.json`, altrimenti `--fixture` fallisce.
- `controlla_soglie.py` non guarda i JSON, ma i `.py` di `tools/dati/` sì (file ≤ 500 righe, funzioni ≤ 80).
