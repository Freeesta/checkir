# Contributi (`.github/`, segnalazioni)
Stato attuale. ≤ 15 KB, righe ≤ 600 caratteri. Il resto dei dati: `dati.md`.

## Modello wiki
- checkIR è un software di elaborazione dati e una wiki scritta dai manutentori: ciò che sta in `main` è pubblicato. Nessuna firma, nessun revisore, nessuno stato di sezione, nessuna scadenza: una sezione è solo scritta o «Non ancora redatta» (segnaposto `[f:checkir-section-pending]`).
- Modificare la wiki o proporre testi dal sito o con un modulo non è possibile (funzione futura, nessun segnaposto nella pagina). Il pubblico segnala errori con il modulo `bug`; il manutentore corregge con una PR (`ci-ok`) e la unisce; Pages ricostruisce. Autori nei crediti: `authors` di `datasheet.json` e `family.json`.
- Qualità dei dati, non firma: ogni affermazione ha una fonte `[f:id]`; nelle sezioni sanitarie (effects, doses, risks, interactions, counselling) un capoverso senza fonte, o con sole fonti `secondary`, fa fallire `controlla_dati.py`. Le righe di `doses` sono sempre mostrate.
- `.github/CODEOWNERS` elenca SOLO gli amministratori (GitHub richiede scrittura per i code owner); `.github/pull_request_template.md` porta le caselle DCO, licenza, nessun dato personale, «sezioni sanitarie toccate? ogni affermazione ha una fonte».

## Moduli ed etichette
- Un solo modulo delle issue: `.github/ISSUE_TEMPLATE/bug.yml` (issue vuote disattivate; `config.yml` rimanda a Discussioni, Codice di condotta e avvisi di sicurezza): bilingue en/it, avviso «tutto è pubblico» in testa, casella senza dati personali; lo controlla `tools/dati/test_issue_forms.py`.
- Etichette come dati in `.github/labels.yml` (`bug`, `triage` da smistare, `urgent` entro 48 ore, temi `sheet`/`spectrum`/`alert`/`translation` per le PR); il workflow `labels` le crea/aggiorna al push su `main` (`tools/sync_labels.py`, PyYAML fissato, mai testo di issue in `run:`) e non ne cancella.
