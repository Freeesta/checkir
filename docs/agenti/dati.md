# Dati (`data/`, `docs/schemi/`)
Stato attuale. ≤ 25 KB, righe ≤ 600 caratteri.

## Struttura
- `docs/schemi/`: vuoto; gli schemi nascono con i pacchetti dati (`<nome>-<N>.json`, unità nei nomi dei campi).
- `data/`: non esiste ancora; ospiterà solo dati aperti con licenza verificata e attribuzione per voce.

## Contratti e formati
- Regole come dati: `bands/1`, `alerts/1`, `classes/1` (da definire). Le cache si ricostruiscono; i documenti dell'utente si leggono a N e N−1.

## Prove
- Il job `data` della CI valida i dati contro gli schemi (oggi nessun dato).

## Trappole
- Mai dati veri o librerie non redistribuibili in questo repository; stanno nel privato `Freeesta/checkir-data`.
