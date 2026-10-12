# Motore (`crates/`)
Stato attuale. ≤ 25 KB, righe ≤ 600 caratteri.

## Struttura
- `ftir-core/src/spectrum.rs`: tipo unico `Spectrum` (`role`, `y_unit`, `wavenumber_cm1`, `y`) e i suoi enum `Role`, `YUnit`.
- `ftir-core/src/error.rs`: `EngineError {error, error_key, params}` con `json()`; `EngineResult<T>`.
- `ftir-core/src/budget.rs`: `Budget {max_bytes, max_points}`, `STANDARD`, `check_bytes`, `check_points`.
- `ftir-core/src/readers.rs`, `steps.rs`, `comparisons.rs`: registri statici `READERS`, `STEPS`, `COMPARISONS` (vuoti), contratto 1, test di conformità che scorre le voci.
- `ftir-core/src/rules.rs`: vuoto; le regole sono dati JSON, non codice.
- `ftir-core/src/synthetic.rs`: `Params`, `Band`, `generate`, `true_value`; RNG SplitMix64 scritto a mano, asse discendente come negli strumenti.
- `ftir-lib`: vuoto. `ftir-wasm/src/lib.rs`: `version()`, `demo_spectrum()` (JSON).

## Contratti e formati
- `readers/1`: `Reader {id, contract, recognize, open(&[u8], &Budget)}`. `steps/1`: `Step {id, version, contract, apply}`. `comparisons/1`: `Comparison {id, version, contract, score in [0,1]}`. Un contratto diverso fa fallire il test di conformità.

## Prove
- `sintetico`: stesso seme, stesso spettro; griglia completa; rumore entro il limite; centro della banda dove dichiarato; mezza altezza a una semilarghezza.

## Trappole
- Lint severi (`unwrap_used`, `indexing_slicing`, `cast_possible_truncation`) per modulo con `#![warn]` nei lettori, mai globali.
