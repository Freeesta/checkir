# CLAUDE.md — checkir (repository Freeesta/checkir)
Questo file è già nel contesto di ogni chat: non rileggerlo. Leggi il file d'area del tuo lavoro (§5). Tienilo ≤ 12 KB: ogni KB lo paga ogni turno di ogni chat.

**Non leggere** (bloccati da `.claude/settings.json`; grep resta permesso): `site/`, `target/`, `web/vendor/`.

## 1. Il progetto
- **checkir**: analisi FTIR open source per il drug checking (servizi di riduzione del danno e laboratori). Nome visibile SOLO in `web/appname.js`; i prefissi dei dati salvati nel browser sono `checkir.` / `checkir-` (decisi una volta, mai rinominati).
- **Distribuzione**: sito statico su GitHub Pages, funziona offline (service worker); tutto gira nel browser; i file dell'utente non lasciano il computer.
- **Prima versione (priorità)**: carica-file, visualizzatore dello spettro, match immediato con le librerie, spiegazione dei picchi con regioni IR evidenziate, scheda della sostanza se c'è match. Ogni PR deve avvicinare questo traguardo.
- **Principi da non violare**: 1. il programma propone, la persona esperta decide; 2. incertezza sempre visibile, mai «verde = sicuro» (i colori indicano la confidenza dell'identificazione)
  3. niente avvisi generici fissi sui limiti nel piè di pagina (decisione del proprietario, 13/10/2026): restano incertezza e allerte di ogni risultato
  4. non è una diagnosi né un parere medico; 5. niente esce dal browser, nessuna telemetria, nessun dato personale (lo provano i test di rete, non un testo); 6. Rust per il calcolo, HTML/JS senza bundler; 7. due lingue (it, en) dalla nascita, decimale col punto; 8. WCAG 2.2 AA, ogni grafico con la sua tabella dei dati.
- **Dati privati**: MAI nel repository pubblico (nemmeno «per un test»); stanno in `Freeesta/checkir-data`. La lista `NOMI_VIETATI` (segreto di GitHub) non compare mai nel pubblico. Librerie di terzi: solo con permesso e attribuzione dichiarati.

## 2. Regole di lavoro
- **Consegna = sito pubblicato**: finito quando è in `main` e il workflow `pages` di quel commit è riuscito.
- **Flusso**: ramo `claude/<argomento>` da `origin/main` → PR → merge commit (mai rebase né push forzato). Prima di unire `git merge origin/main`. Le PR le unisce il Coordinatore a CI verde; le chat di sviluppo lasciano la PR aperta.
- **Perimetro**: ogni chat tocca solo ciò che dice il suo prompt; a fine lavoro UN messaggio al Coordinatore (max 5 righe).
- **Commit**: titolo breve in italiano + 1-3 righe; codice e commenti in inglese; mai nomi di modelli nei commit e nel codice.
- **Documenti**: CLAUDE.md e `docs/agenti/` descrivono solo lo stato attuale; quando cambi un comportamento RISCRIVI la riga; una funzione nuova = una riga nel file della sua area; riga ≤ 600 caratteri, file ≤ 25 KB.
- **Consumo**: una sessione per pacchetto; leggi solo il file d'area che serve; `grep -n` e letture a intervalli; raggruppa le modifiche e prova una volta alla fine. A fine PR, sopra 200k token, blocco di consegna al Coordinatore e stop.
- **Subagenti** (`.claude/agents/`): cercatore, verificatore, controllo-github, archivista, sostituzioni, estrattore, inventario-testi, stato-sessioni. Mai a un subagente: decisioni, codice nuovo, testi scientifici o sanitari, asserzioni dei test, commit, push, merge.

## 3. Verifica e test
- Rust: `cargo test --locked --release`; wasm: `cargo build --locked --release --target wasm32-unknown-unknown -p ftir-wasm`.
- Pagina: `bash tools/costruisci_sito.sh` (costruisce `site/`, richiede `wasm-bindgen-cli` alla versione di `Cargo.lock`), poi `npm ci && node tests_e2e/fumo.mjs` (axe, tastiera, 320 px, chiaro/scuro, it/en). Un front end non provato nel browser è rotto.
- Soglie (basi che nascono VUOTE e restano vuote): `python3 tools/controlla_soglie.py`, `python3 tools/controlla_rust.py`, `python3 tools/controlla_lingue.py`, `npx tsc -p tsconfig.json --noEmit`, `python3 tools/controlla_nomi.py`. Dopo `cargo fmt` rilancia le soglie.
- Limiti: funzione ≤ 80 righe, file ≤ 500, documenti ≤ 25 KB e righe ≤ 600 caratteri. Nessun test né misura di velocità o memoria; la memoria si garantisce col contratto di budget.
- Dati sintetici: `ftir_core::sintetico` (bande di Lorentz, linea di base, rumore con seme fisso). Dati veri: i test che li chiedono si saltano senza il repository privato (variabile `CHECKIR_DATA`).
- CI: `ci-ok` è l'unico controllo richiesto; `changes` decide quali job girano (rust, web, data); `limits` gira sempre. La notte (`notte.yml`) fa tutto; `advisories.yml` ogni giorno.

## 4. Architettura
- **Crate**: `ftir-core` (calcolo puro, `forbid(unsafe_code)`, senza dipendenze), `ftir-lib` (pacchetti di libreria `ftir-library/1`), `ftir-wasm` (ponte wasm-bindgen: solo funzioni sottili che restituiscono JSON). Nessuna dipendenza nativa nel grafo WASM.
- **Registri statici** (slice, niente plugin a runtime): `READERS`, `STEPS`, `COMPARISONS` in `ftir-core`; aggiungere un modulo = un file + UNA riga nel registro; il test di conformità scorre le voci. Regole come dati JSON (`bands/1`, `alerts/1`, `classes/1`) con schema in `docs/schemi/`.
- **Un solo modello**: `Spectrum` con `Role` (campione, riferimento, residuo, sottrazione, media); unità nei nomi dei campi (`wavenumber_cm1`).
- **Errori**: `{error, error_key, params}`; la pagina traduce `error_key`. **Budget**: ogni `apri` riceve `Budget` (byte, punti).
- **Pagina**: solo moduli ES, `// @ts-check` + JSDoc, `tsc` stretto; nessuna logica in `index.html`; CSP stretta; un solo catalogo caricato; numeri solo da `formatNumber`; colori solo da variabili CSS (Okabe-Ito).
- **Formati salvati**: le cache si ricostruiscono; i documenti dell'utente si leggono a N e N−1 e si scrivono a N.

## 5. File d'area (leggi solo quello del tuo lavoro)
| Se tocchi… | Leggi |
|---|---|
| `crates/ftir-core`, `crates/ftir-wasm` | `docs/agenti/motore.md` |
| `crates/ftir-lib`, `tools/libreria/` | `docs/agenti/libreria.md` |
| `web/` | `docs/agenti/pagina.md` |
| `data/`, `docs/schemi/` | `docs/agenti/dati.md` |
| `tests_e2e/`, `tools/`, `.github/` | `docs/agenti/test.md` |
| CSP, esportazioni, anonimizzazione, avvertenze, informativa | `docs/agenti/riservatezza.md` |

## 6. Trappole generali
- `ftir-wasm` non ha `forbid(unsafe_code)`: il codice generato da wasm-bindgen lo richiede; non metterci logica.
- La versione di `wasm-bindgen-cli` deve essere uguale a quella in `Cargo.lock`, altrimenti il sito non parte (lo script la legge da solo).
- `cargo fmt` può allungare una funzione oltre 80 righe: rilancia `controlla_soglie.py`.
- Il service worker precarica l'elenco `FILES` di `web/sw.js`: un modulo nuovo va aggiunto lì (`VERSION` la scrive la build, `tools/versione_sw.mjs`: mai alzarla a mano; un nome di `FILES` che non c'è nel sito ferma la build).
- Ogni chiave del catalogo deve comparire nel codice come `t("x.y")` o `data-i18n*="x.y"` letterale, altrimenti `controlla_lingue.py` la dà orfana.

## Compact instructions
Nel riassunto tieni: pacchetto e PR (numero, ramo, stato CI), punti fatti e da fare del prompt, decisioni prese e perché, errori aperti con il comando che li riproduce, file toccati. Togli: contenuto dei file letti, log, output dei test passati.
