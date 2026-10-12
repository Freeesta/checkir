# Motore (`crates/`)
Stato attuale. ≤ 25 KB, righe ≤ 600 caratteri.

## Struttura
- `ftir-core/src/spettro.rs`: tipo unico `Spettro` (`ruolo`, `unita_y`, `numero_onda_cm1`, `y`) e i suoi enum `Ruolo`, `UnitaY`.
- `ftir-core/src/errore.rs`: `Errore {error, error_key, params}` con `json()`; `Esito<T>`.
- `ftir-core/src/budget.rs`: `Budget {max_byte, max_punti}`, `STANDARD`, `controlla_byte`, `controlla_punti`.
- `ftir-core/src/lettori.rs`, `passi.rs`, `confronti.rs`: registri statici `LETTORI`, `PASSI`, `CONFRONTI` (vuoti), contratto 1, test di conformità che scorre le voci.
- `ftir-core/src/regole.rs`: vuoto; le regole sono dati JSON, non codice.
- `ftir-core/src/sintetico.rs`: `Parametri`, `Banda`, `genera`, `valore_vero`; RNG SplitMix64 scritto a mano, asse discendente come negli strumenti.
- `ftir-lib`: vuoto. `ftir-wasm/src/lib.rs`: `versione()`, `spettro_prova()` (JSON).

## Contratti e formati
- `lettori/1`: `Lettore {id, contratto, riconosci, apri(&[u8], &Budget)}`. `passi/1`: `Passo {id, versione, contratto, applica}`. `confronti/1`: `Confronto {id, versione, contratto, punteggio in [0,1]}`. Un contratto diverso fa fallire il test di conformità.

## Prove
- `sintetico`: stesso seme, stesso spettro; griglia completa; rumore entro il limite; centro della banda dove dichiarato; mezza altezza a una semilarghezza.

## Trappole
- Lint severi (`unwrap_used`, `indexing_slicing`, `cast_possible_truncation`) per modulo con `#![warn]` nei lettori, mai globali.
