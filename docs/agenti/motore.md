# Motore (`crates/`)
Stato attuale. ≤ 25 KB, righe ≤ 600 caratteri.

## Struttura
- `ftir-core/src/spectrum.rs`: tipo unico `Spectrum` (`role`, `y_unit`, `wavenumber_cm1`, `y`) e i suoi enum `Role`, `YUnit`.
- `ftir-core/src/error.rs`: `EngineError {error, error_key, params}` con `json()`; `EngineResult<T>`.
- `ftir-core/src/budget.rs`: `Budget {max_bytes, max_points}`, `STANDARD`, `check_bytes`, `check_points`.
- `ftir-core/src/steps.rs`, `comparisons.rs`: registri statici `STEPS`, `COMPARISONS` (vuoti), contratto 1, test di conformità che scorre le voci.
- `ftir-core/src/readers/`: registro `READERS` (contratto `ftir-reader/1`, in `mod.rs`: `Reader {id, version, contract, detect, open}`, `pick(name, head)` sceglie il lettore più sicuro) e modello in `model.rs` (`Document`, `Spectrum`, `Field`, `Warning`, `Limits`, `Options`, `ReadError {key, params}`; `Spectrum` dei lettori ≠ `crate::spectrum::Spectrum`, il lettore non converte né riordina). `sha256.rs`: SHA-256 per la provenienza.
- `readers/jcamp/`: lettore `jcamp-dx` v1. `text.rs` (decodifica UTF-8→Windows-1252, righe, record `##`, commenti `$$`), `asdf.rs` (AFFN, PAC, SQZ/DIF/DUP con controllo Y), `data.rs` (assi, tabelle XYDATA/XYPOINTS/PEAK TABLE, controlli NPOINTS/FIRSTY/MINY/MAXY/DELTAX, unità), `meta.rs` (campi, elenchi `IDENTITY` e `KNOWN`, campi standard), `mod.rs` (blocchi e LINK). Ogni record `##` diventa un `Field` (origine `line N ##ETICHETTA`); `##END` è l'unico scarto (`tests/audit/scarti_jcamp.txt`); le chiavi note stanno in `tests/audit/noti_jcamp.txt` (un test le tiene uguali a `KNOWN`).
- `ftir-core/src/synthetic_jcamp.rs`: scrive le fixture JCAMP sintetiche con la verità (`fixtures()`, `truth_json`); `cargo run --release -p ftir-core --example gen_jcamp_fixtures` riscrive `tests/fixtures/jcamp/`; un test verifica che i file committati siano aggiornati. I valori d'oro di `tests/golden/jcamp/` si rigenerano a mano con `tools/jcamp_riferimento.py` (libreria Python `jcamp`, fuori dalla CI).
- `ftir-core/src/rules.rs`: vuoto; le regole sono dati JSON, non codice.
- `ftir-core/src/synthetic.rs`: `Params`, `Band`, `generate`, `true_value`; RNG SplitMix64 scritto a mano, asse discendente come negli strumenti.
- `ftir-lib`: vuoto. `ftir-wasm/src/lib.rs`: `version()`, `demo_spectrum()` (JSON).

## Contratti e formati
- `ftir-reader/1`: vedi sopra; chiavi di errore e avviso `reader.<formato>.<caso>` (e `reader.<caso>` se comuni), tradotte in `web/lang/*.json`. `steps/1`: `Step {id, version, contract, apply}`. `comparisons/1`: `Comparison {id, version, contract, score in [0,1]}`. Un contratto diverso fa fallire il test di conformità.

## Prove
- JCAMP: `tests/jcamp_fixtures.rs` (verità sintetica, parità ≤ 1e-9 con i valori d'oro, audit di perdita, limiti, errori); `tests/jcamp_real.rs` legge `Library/` di `CHECKIR_DATA` (962 file: nessun errore, NPOINTS rispettato, audit) e si salta senza.
- `sintetico`: stesso seme, stesso spettro; griglia completa; rumore entro il limite; centro della banda dove dichiarato; mezza altezza a una semilarghezza.

## Trappole
- Lint severi (`unwrap_used`, `indexing_slicing`, `cast_possible_truncation`) per modulo con `#![warn]` nei lettori, mai globali.
