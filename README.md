# checkir
Analisi FTIR open source per il drug checking. Un sito statico (Rust compilato in WebAssembly + HTML/JS senza bundler) dove si carica uno spettro, lo si vede, lo si confronta con le librerie e si capiscono i picchi. Tutto gira nel browser: **nessun file lascia il computer**; il sito funziona anche offline.

**Stato**: fondazione. Per ora il sito mostra uno spettro sintetico di prova; caricamento file, confronto con le librerie, spiegazione dei picchi e scheda della sostanza arrivano nei prossimi pacchetti.

**Principio**: il programma propone, la persona esperta decide. L'FTIR ha limiti (componenti sotto il 5 % circa non rilevabili, sostanze potenti in tracce) che il programma mostra sempre. Non è una diagnosi né un parere medico.

## Sviluppo
```
cargo test --locked --release
bash tools/costruisci_sito.sh          # costruisce site/ (pagina + motore .wasm)
npm ci && node tests_e2e/fumo.mjs      # test nel browser con controlli di accessibilità
```
Lingue: italiano e inglese. Licenze: codice MIT OR Apache-2.0, testi CC BY 4.0, dati come dichiarato (vedi `LICENSE`). Componenti di terzi: `LICENZE-TERZI.md`. Come contribuire: `CONTRIBUTING.md`; per chi lavora con un assistente IA: `CLAUDE.md`.

**Uso dell'IA**: il codice è sviluppato con l'aiuto di assistenti IA; l'IA non è autrice, chi pubblica risponde di tutto.
