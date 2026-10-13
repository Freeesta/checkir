# checkIR
English: [README.md](README.md)

Analisi FTIR open source per il drug checking, per i servizi di riduzione del danno e i laboratori.

## 1. Cosa fa
- Si carica uno spettro infrarosso (FTIR-ATR), lo si vede e lo si confronta con le librerie di spettri.
- Il programma propone sostanze candidate e spiega i picchi, evidenziando le regioni infrarosse coinvolte.
- Se c'è un match, mostra la scheda della sostanza. Il programma propone; il chimico qualificato decide e firma.
- È un sito statico (Rust compilato in WebAssembly, HTML/JS semplice) e, una volta caricato, funziona anche offline.

## 2. Cosa NON fa
- Non è una diagnosi, non è un parere medico e non è un'analisi di laboratorio accreditata.
- Non vede i componenti sotto il 5 % circa in peso.
- Non esclude sostanze potenti a basse dosi (per esempio analoghi del fentanil e nitazeni).
- Non misura le quantità. Un risultato non significa mai che un campione sia sicuro.

## 3. Provalo in 1 minuto
Apri il sito: <https://freeesta.github.io/checkir/>. Carica un file di spettro (o scegli uno spettro dimostrativo): il programma lo mostra, lo confronta con le librerie e spiega i picchi.

## 4. Privacy in 3 righe
- I tuoi file sono letti ed elaborati solo nel tuo browser; non viene inviato nulla a nessuno.
- Niente cookie, niente statistiche, niente script o font di terzi.
- I contributi non contengono mai dati personali (data al mese, nessun luogo, nessun nome, nessuna foto).

## 5. Licenze e citazione
- Codice: MIT OR Apache-2.0 ([LICENSE](LICENSE)). Nuovi spettri e dati: CC BY 4.0. Schede delle sostanze: CC BY-SA 4.0. Componenti di terzi: [LICENZE-TERZI.md](LICENZE-TERZI.md).
- Per citare il software usa [CITATION.cff](CITATION.cff) (GitHub mostra il pulsante «Cite this repository»).
- Il codice è sviluppato con l'aiuto di assistenti IA; l'IA non è autrice, chi pubblica risponde di tutto.

## Contribuire
Non serve saper programmare: vedi [CONTRIBUTING.it.md](CONTRIBUTING.it.md) per i quattro percorsi (chimici, operatori sanitari, traduttori, sviluppatori). Leggi anche il [Codice di condotta](CODE_OF_CONDUCT.it.md). Problemi di sicurezza: [SECURITY.md](SECURITY.md).
