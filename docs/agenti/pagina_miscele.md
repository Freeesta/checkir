# Pagina: miscele
Stato attuale. ≤ 15 KB, righe ≤ 600 caratteri. Il calcolo e il cancello della proposta stanno in `ftir-core::miscele` (`motore_didattica.md`); risultati e scheda in `pagina_confronto.md`.

## Struttura
- Miscele (worker): dopo il confronto di un campione `match.worker.js` chiama `mixtureProposal` (`miscele_job.js`, solo orchestrazione: testo JSON di ogni libreria fatto una volta per versione) che manda il pool intero delle librerie attive a `miscele_analizza`; il cancello sta nel motore (`proposal`).
- Miscele (stato): `match.js` `attachMixture` mette la proposta in `results[code].data.mixture` (scartata se firma o spettro non coincidono). `proposal.status` `none` → `null`; `rejected` → `components: []` e `rejected {reason, component}`; `proposed` → componenti non varianti con `explained` (`explained_peaks` del motore) e `minor`.
- `mixture.js`: `mixtureComponents|Candidates|Keys|Taken`, `mixtureChip` (chip «Miscela proposta: A + B» accanto al livello in `results.js`) e `mixtureBlock`, la sezione `[data-mixture]` sopra la tabella in `results.js`: «Miscela: A + B» e per componente «quota del segnale 0.70 · picchi spiegati n» (quota dell'area spiegata, mai % né quantità), «· componente minore» se `minor`; senza componenti ma con `rejected` la sezione `[data-mixture-rejected]` dice solo il motivo («Nessuna miscela proposta: …»), senza pulsante.
- Miscele (sezione): «Picchi non spiegati: n», le allerte della ricerca (`high_residual`, `over_subtraction`, in `alerts.js`) e il pulsante `data-fk=mixture-accept`.
- Miscele (decisione): `decision.js` `listed` aggiunge i componenti ai candidati scegliibili e `acceptMixture` mette la scelta a livello 4 con i componenti. `sheet.js` scrive «Possibile miscela: …» finché la scelta non la contiene; `report.js` ha la tabella `[data-report=mixture]`.
- Miscele (marcatori): `peaks.js` `referencesOf` con una proposta assegna i picchi ai componenti (`byName` = chi spiega, `refName` per riassunto e pannello).

## Prove
- `tests_e2e/scenari/265-mixtureGate.mjs`: libreria esempio-a/caffeina/paracetamolo/lattosio/levamisolo; ignoto → nulla; ignoto + 2 componenti → motivo `high_residual` (it, en, axe, 320 px); 60/40 e 80/20 → due componenti; 90/10 → paracetamolo «componente minore» o motivo.
- `tests_e2e/scenari/135-miscele.mjs` (scoperto da `fumo.mjs`; CSS in `web/css/55-miscele.css`): 0.7·beta + 0.3·alfa (rumore bianco a seme fisso 0.01) su libreria alfa/beta/gamma → «Miscela: beta + alfa», contributi, 0 non spiegati, niente % né «quantità», accettazione a livello 4, scheda, rapporto, marcatori con `byName`, axe e 320 px; beta puro → nessuna proposta.
