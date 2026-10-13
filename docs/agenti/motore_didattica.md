# Motore: didattica e miscele
Stato attuale. ≤ 15 KB, righe ≤ 600 caratteri. Altri file d'area del motore: `motore.md` (lettori, anonimizzazione, sintetici), `motore_segnale.md`, `motore_confronto.md`, `motore_picchi.md`, `motore_didattica.md`.

## Struttura
- **Motore didattico** (`ftir-core::didactic`, sezione Teoria; errori `didactic.<caso>` in `web/lang`): `spring` (Hooke), `depth` (`penetration_depth` in µm, errore sotto l'angolo critico), `ratio` (T = S/B, A = −log₁₀T, punti assenti NaN → `null`), `fft` (radix-2 nostra, `fft`/`ifft`, lunghezza potenza di due), `apodization` (boxcar, triangular, happ_genzel, blackman_harris_3), `interferogram` (righe o bande lorentziane).
  `spectrum`: tronca a |OPD| ≤ OPD_max, apodizza, zero-filling (potenza di due), FFT con lo ZPD all'indice 0, `Real` o `Magnitude`, senza correzione di fase; risoluzione 1/OPD_max. `json`: ponte `ftir-wasm/src/didactic.rs` (`didactic_*`).
- **Miscele** (`ftir-core::miscele`, ponte `ftir-wasm::miscele_analizza|miscele_sottrai`, ingresso JSON `{sample, candidates[]}`, soglie `data/soglie/soglie_miscele-1.json`, tagli `data/tagli.json`, tutti dati con schema in `docs/schemi/`): `nnls` (Lawson-Hanson, scipy ≤ 1e-9), `seleziona` (selezione in avanti su assorbanza grezza + fondo cubico a segno libero, max 3, arresto sotto 2 % di varianza, attivo unico con deroga al 10 %, tagli sempre ammessi).
- Miscele (moduli): `spazio` (griglia, riferimenti ad area 1, classifica dei primi 25 + tagli: la pagina passa TUTTO il pool), `residuo` (picchi non spiegati con PICCHI, criterio a bande solo calcolato).
- Miscele (seguito): `iterativa` (sottrazione automatica ≤ 3 giri con `sottrazione/1`, fattori riaggiustati insieme e arrotondati a 0.01, avviso `over_subtraction` sul residuo levigato). Il contributo è «allo spettro», mai % in peso; `high_residual` scatta con varianza non spiegata > 15 % o picchi non spiegati; niente bootstrap.

## Prove
- Didattica: `tests/didactic.rs` (valori verificati, riga entro un passo, due righe a metà risoluzione non separate, larghezze relative ≈ 0.67/1.0/1.25, T↔A); `tests/didactic_parity.rs` (NumPy ≤ 1e-9, fixture da `tools/teoria_riferimento.py` a mano).
- Miscele: `tests/miscele.rs` (sintetici), `tests/miscele_parita.rs` (golden di `tools/miscele_riferimento.py`, scipy), `tests/miscele_real.rs` (si salta senza `CHECKIR_DATA`: legge `studio/miscele/miscele_reale_seme11.json` del privato, fatto da `tools/miscele_riferimento_reale.py`; stessi componenti dello script Python su 16 miscele).
