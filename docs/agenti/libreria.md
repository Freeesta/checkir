# Librerie (`crates/ftir-lib`, `tools/libreria/`)
Stato attuale. ≤ 25 KB, righe ≤ 600 caratteri.

## Formato `ftir-library/1`
- Un pacchetto per libreria, in tre file: `manifest.json` (`ftir-library/1`: nome, versione, data, licenza SPDX, attribuzione it/en, griglia, `n_spectra`, `sha256_data`, `private` solo per le librerie importate dall'utente).
- `index.json` (`ftir-library-index/1`: una riga per spettro nell'ordine di `data.bin`: id, forma, sostanza, nomi it/en, classi, InChIKey, qualità `pass`/`warning`, tipo di provenienza).
- `data.bin` (float32 little-endian, uno spettro dopo l'altro sulla griglia del manifesto; punto non misurato = NaN, i bit si conservano). Schemi in `docs/schemi/ftir-library-1.json` e `ftir-library-index-1.json`.
- Griglia di `Grid::STANDARD`: 650-3800 cm⁻¹, passo 2 (1576 punti, 6304 byte per spettro), la stessa di `griglia/1`; la decide MATCH.
- Se la griglia cambia, cambia la versione del pacchetto e si ricostruisce: il pacchetto è una cache, mai migrato. Un `schema` diverso → `library.schema_unknown`.
- I pacchetti non si committano: li costruisce la CI. Una libreria privata importata dall'utente usa lo stesso formato con `private: true`, resta nel browser e non si esporta. Le librerie di terzi non entrano MAI in questo repository.

## Codice (`crates/ftir-lib/src/`)
- `manifest.rs` (`Manifest`, `Grid`; `parse`/`to_json`), `index.rs` (`Row`, `parse_index`, `index_to_json`; id duplicati = errore), `data.rs` (`write_data`, `read_data`, `Matrix`, `Limits::STANDARD` = 256 MiB e 50 000 spettri).
- `package.rs`: `Package::open` controlla schema, conteggi, dimensione e SHA-256; `write_package` scrive i tre file.
- `build.rs` (`resample_jcamp`: lettore JCAMP del motore → assorbanza → passo `griglia/1`, nessuna seconda implementazione; `build_one`: riga d'indice e valori da `substance.json` + `spettro.json` + `.jdx`, rifiuta SHA-256 diverso e `unconfirmed_sample`).
- Limiti e SHA-256 si controllano PRIMA di decodificare; un byte cambiato → `library.sha256_mismatch`. Errori come `EngineError` con chiavi `library.<caso>` (tradotte in `web/lang/*.json`; il prefisso `library.` è dinamico in `controlla_lingue.py`).

## Costruttore (`tools/libreria/`)
- `costruisci.rs` è il binario `costruisci-libreria` di `ftir-lib`: `cargo run --release -p ftir-lib --bin costruisci-libreria -- [--data data] [--out target/libreria] [--library checkir-community] [--date AAAA-MM-GG]` legge `data/substances/*/spectra/*.json+.jdx`, tiene gli spettri con `library.name` richiesto (una sola versione) e scrive `<out>/<libreria>/{manifest.json,index.json,data.bin}`.
- `riferimento.py` (a mano, fuori dalla CI; NumPy) riscrive `crates/ftir-lib/tests/golden/resample.json`: tre file JCAMP (asse discendente passo 1.93, ascendente passo 1.03 più largo della griglia, trasmittanza % passo 4) con il risultato di `numpy.interp`.

## Prove
- `crates/ftir-lib/tests/library.rs`: andata e ritorno bit per bit (NaN compresi); OGNI byte di `data.bin` cambiato è rifiutato; dimensione, conteggio, limiti, schema e campi del manifesto/indice; parità ≤ 1e-9 (relativa al massimo) con `numpy.interp` sulle tre casistiche; lo spettro sintetico di `data/` diventa riga e pacchetto; JCAMP alterato o provenienza non ammessa non entrano.
