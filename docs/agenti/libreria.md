# Librerie (`crates/ftir-lib`, `tools/libreria/`)
Stato attuale. ≤ 25 KB, righe ≤ 600 caratteri.

## Formato `ftir-library/1`
- Un pacchetto per libreria, in tre file: `manifest.json` (`ftir-library/1`: nome, versione, data, licenza SPDX, attribuzione it/en, `terms` it/en facoltativo = condizioni di un permesso di terzi, `{app}` sta per il nome del prodotto, griglia, `n_spectra`, `sha256_data`, `private` solo per le librerie importate dall'utente).
- `index.json` (`ftir-library-index/1`: una riga per spettro nell'ordine di `data.bin`: id, forma, sostanza, nomi it/en, classi, InChIKey, qualità `pass`/`warning`, tipo di provenienza).
- `data.bin` (float32 little-endian, uno spettro dopo l'altro sulla griglia del manifesto; punto non misurato = NaN, i bit si conservano). Schemi in `docs/schemi/ftir-library-1.json` e `ftir-library-index-1.json`.
- `native.bin` (facoltativo, float32 little-endian, nell'ordine di `index.json`: per spettro `[punti, risoluzione_cm1|NaN, x…, y…]`; i punti del file originale in assorbanza, solo conversione d'unità, mai ricampionati né lisciati). La pagina lo disegna come «il riferimento»; `data.bin` serve solo al calcolo. Una libreria senza `native.bin` (cache vecchia) non ha sovrapposizione finché non si reimporta.
- Griglia di `Grid::STANDARD`: 650-3800 cm⁻¹, passo 2 (1576 punti, 6304 byte per spettro), la stessa di `griglia/1`; la decide MATCH.
- Se la griglia cambia, cambia la versione del pacchetto e si ricostruisce: il pacchetto è una cache, mai migrato. Un `schema` diverso → `library.schema_unknown`.
- I pacchetti non si committano: li costruisce la CI. Una libreria privata importata dall'utente usa lo stesso formato con `private: true`, resta nel browser e non si esporta. Spettri di terzi in `data/` solo con permesso scritto per il sito pubblico (testo e registro nel privato): oggi `swgdrug-ir`.

## Codice (`crates/ftir-lib/src/`)
- `manifest.rs` (`Manifest`, `Grid`; `parse`/`to_json`), `index.rs` (`Row`, `parse_index`, `index_to_json`; id duplicati = errore), `data.rs` (`write_data`, `read_data`, `Matrix`, `Limits::STANDARD` = 256 MiB e 50 000 spettri).
- `package.rs`: `Package::open` controlla schema, conteggi, dimensione e SHA-256; `write_package` scrive i tre file.
- `build.rs` (`resample_jcamp`: lettore JCAMP del motore → assorbanza → passo `griglia/1`, nessuna seconda implementazione; `build_one`: riga d'indice e valori da `substance.json` + `spettro.json` + `.jdx`, rifiuta SHA-256 diverso e `unconfirmed_sample`).
- Limiti e SHA-256 si controllano PRIMA di decodificare; un byte cambiato → `library.sha256_mismatch`. Errori come `EngineError` con chiavi `library.<caso>` (tradotte in `web/lang/*.json`; il prefisso `library.` è dinamico in `controlla_lingue.py`).

## Costruttore (`tools/libreria/`)
- `costruisci.rs` è il binario `costruisci-libreria` di `ftir-lib`: `cargo run --release -p ftir-lib --bin costruisci-libreria -- [--data data] [--out target/libreria] [--library checkir-community] [--date AAAA-MM-GG]` legge `data/substances/*/spectra/*.json+.jdx`, tiene gli spettri con `library.name` richiesto (una sola versione) e scrive `<out>/<libreria>/{manifest.json,index.json,data.bin}`.
- `librerie.json`: elenco delle librerie da pubblicare (`id`, `enabled`; senza `license` = comunitaria CC BY 4.0, altrimenti `license`, `attribution` it/en obbligatoria e `terms` it/en); `--config` le costruisce tutte e scrive il manifesto generale.
- `riferimento.py` (a mano, fuori dalla CI; NumPy) riscrive `crates/ftir-lib/tests/golden/resample.json`: tre file JCAMP (asse discendente passo 1.93, ascendente passo 1.03 più largo della griglia, trasmittanza % passo 4) con il risultato di `numpy.interp`.

## Libreria pubblica `swgdrug-ir`
- 11 spettri ATR-FTIR della SWGDRUG IR Library (release JCAMP del 15/05/2024, versione `2024-05-15`) per i 10 tagli: caffeina, paracetamolo, fenacetina, levamisolo HCl, procaina HCl, benzocaina, lidocaina base e HCl·H₂O, alfa-lattosio, mannitolo, mio-inositolo. Permesso scritto SWGDRUG del 13/10/2026 (non commerciale; citazione con versione; disclaimer e «SWGDRUG does not endorse» nei `terms`, mostrati nel pannello librerie). Si rigenerano con `tools/dati/importa_swgdrug.py --source <cartella JCAMP privata>`; nessun altro spettro SWGDRUG entra.
- Prova della libreria (13/10/2026, solo `swgdrug-ir`): 0 falsi «probabile», 0 falsi «da verificare», 0 gemelli (r ≥ 0.90); miglior r₁ tra sostanze diverse ≤ 0.50. La tabella «copertura delle forme» conta tutto come «sale o altra forma»: `is_base` del motore legge il nome della forma, non l'id (`lidocaine-base`).

## Prove
- `crates/ftir-lib/tests/library.rs`: andata e ritorno bit per bit (NaN compresi); OGNI byte di `data.bin` cambiato è rifiutato; dimensione, conteggio, limiti, schema e campi del manifesto/indice; parità ≤ 1e-9 (relativa al massimo) con `numpy.interp` sulle tre casistiche; lo spettro sintetico di `data/` diventa riga e pacchetto; JCAMP alterato o provenienza non ammessa non entrano.

## Nel browser (PR 2)
- `crates/ftir-lib/src/bridge.rs`: punti d'ingresso testo-dentro/testo-fuori che `ftir-wasm` inoltra (`library_open`, `library_resample`, `library_build`); `ftir-wasm` ora dipende da `ftir-lib`. `library_open` controlla schema, conteggi, dimensione, SHA-256 e limiti e restituisce il manifesto; `library_resample` porta un JCAMP-DX sulla griglia standard in float32;
- `library_build` costruisce manifesto e indice di una libreria importata (`private: true`, licenza `LicenseRef-private`); `data.bin` è il Float32Array little-endian che la pagina già possiede.
- Pacchetti pubblici: `tools/costruisci_sito.sh` lancia `costruisci-libreria --config tools/libreria/librerie.json --out site/librerie`.
- Il file di configurazione elenca `{id, enabled}` (più licenza e testi per i terzi); il binario scrive `site/librerie/<id>/{manifest,index,data}` e il manifesto generale `libraries.json` (`ftir-libraries/1`: `id`, `path`, `version`, `spectra`, `enabled`, un interruttore per libreria). Una libreria in più = una riga nel file di configurazione.
- `web/librerie.js`: carica il manifesto generale e i pacchetti (`fetch`), poi le librerie private da OPFS; ogni pacchetto passa da `library_open`; i vettori restano in memoria (`libraryValues`), lo stato (`state.libraries`) ha solo `id, version, spectra, license, attribution, private, enabled`. `libraryActions` dà a `ctx` importa, annulla, rimuovi e attiva/disattiva (l'interruttore vale per la sessione). `findNames(testo)` = indice dei nomi (`web/nomi.js`: nomi it/en e InChIKey, prefisso senza accenti né maiuscole, una voce per sostanza).
- `web/importa.js`: JCAMP-DX scelti dall'utente (file o cartella) → una riga per file con `library_resample`; della sorgente si conservano solo lo spettro e il nome del file (come nome del composto); i metadati non entrano mai. Barra di avanzamento (`state.libraryJob`), annullabile; niente viene salvato se non va a buon fine tutto il pacchetto.
- `web/opfs.js`: cartella `checkir-libraries/<id>/` con i tre file; senza `createWritable` (Safari vecchi) la libreria resta in memoria e la pagina lo dice.
- `web/libpanel.js`: sezione 2 (elenco con versione, licenza, attribuzione, «Condizioni della licenza» se il manifesto ha `terms` — è la pagina crediti delle librerie: disclaimer e non-approvazione di un ente stanno qui, mai nei risultati —, pubblica/privata, interruttore, rimozione delle private).
- `web/sw.js` (`VERSION` 8): all'installazione mette in cache i pacchetti nominati da `librerie/libraries.json` (un errore non blocca l'installazione); per `/librerie/` va prima in rete e ripiega sulla copia in cache, così una libreria ricostruita arriva senza alzare `VERSION`.
- Non ancora fatto: cache dei vettori pre-elaborati (derivata, AsLS), gemelli `twins/1`, indice dei picchi (aspettano SEGNALE PR2, CONFRONTO, PICCHI); importazione Shimadzu (manca il lettore); ripresa di un'importazione interrotta; sinonimi e CAS nell'indice dei nomi (il formato `ftir-library-index/1` non li ha).
- Prove: `crates/ftir-lib/tests/bridge.rs`, `tests_e2e/librerie.mjs` (indice dei nomi, importazione, OPFS, rimozione, offline, axe) e `libraryImportScenario` di `riservatezza.mjs`.
