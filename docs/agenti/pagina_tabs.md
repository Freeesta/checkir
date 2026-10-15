# Pagina: schede aperte e vista affiancata
Stato attuale. ≤ 15 KB, righe ≤ 600 caratteri.

## Struttura
- Modello (`state.js`): `tabs: Tab[]` (`{id, kind: file|sheet, code, sheet, view}`), `focusTab`, `split {panes, orientation, linked}`, `tabNotice`. Una scheda di file = un file radice e i suoi derivati (residui C1-r1…): il tetto conta le schede, non i residui. Id della scheda = codice radice.
- Scambio della vista: i campi di `VIEW_FIELDS` (`active`, `selected`, `labels`, `overlay`, `showPeaks`, `peakFocus`, `ruleRange`, `subtraction`, `recall`, `rangesOpen`, `rangeChoice`, `rangeError`, `sheetLang`) restano in cima allo stato e valgono per la scheda a fuoco.
- Cambiando scheda `tabs.js` li salva in `view` della scheda che perde il fuoco e ripristina quelli della nuova (`emptyView(code)` se è nuova) in UN `update`; così i moduli che leggono `s.selected`, `s.peakFocus`… non cambiano. Perdere il fuoco toglie anche `rangeTable` dei suoi codici (`ranges_table.js` lo ricostruisce da solo).
- `tabs.js` (senza DOM, funzioni pure che restituiscono una patch): `rootOf`, `tabOfCode`, `focusedTab`, `codesOf`, `focusPatch(s, id, code?)`, `openFilePatch`, `openSheetPatch`, `closePatch` (fuoco alla vicina a destra, altrimenti a sinistra; sotto 2 riquadri la vista affiancata finisce), `movePatch`, `canOpenFile`, `canOpenSheet`, `pointsInMemory`, `syncActive(s, code)` (nella scheda a fuoco cambia solo `active`, altrimenti `focusPatch`; lo usano `selectFile` e `undo`).
- `tabs_wire.js` (`tabActions`): `focusTab`, `selectFile`, `closeTab` (una scheda di file chiude con `closeFile`), `closeOtherTabs`, `moveTab` (annuncio `status.tab_moved`). `tabs_ui.js` `buildTabs(host, ctx)` → `{refresh}` e `menuRows(tab, s, ctx)` (righe del menu: sposta a sinistra/destra, chiudi, chiudi le altre).
- Barra `#doc-tabs` in `index.html` dentro `<main>`, prima di `#panes > #pane-main` (`role=tabpanel`, `aria-labelledby` = linguetta a fuoco; senza schede la barra è nascosta e il ruolo tolto). Non usare l'id `tabbar` (è la barra delle sezioni sotto 45em). Linguetta: `button role=tab#tab-<id>.doc-tab` con icona, codice, nome del file (`.tab-name`, ellissi, `title` = nome intero) e X (`span.tab-close`, non un button: axe darebbe nested-interactive); nome accessibile «Analisi C1 nome.jdx».
- Tastiera (attivazione manuale): ← → ciclici, Home, End spostano il fuoco; Invio/Spazio mostrano; Canc chiude; Ctrl+Maiusc+← → spostano; Menu, Maiusc+F10 e tasto destro aprono il menu (`openMenu`); clic centrale chiude. Azioni `tab.close` (`w`) e `tab.next` (`j`); Ctrl+W non si usa. `#tabs-list` (fuori dal tablist) elenca tutte le schede. `#tabs-notice` mostra `tabNotice` e sparisce alla prima apertura riuscita o chiusura.
- Stile `css/tabs.css`: filetto superiore 3 px `--tab-file`/`--tab-sheet` più icona, linguetta a fuoco su `--panel` con bordo `--accent`; sotto 45em la barra scorre dentro il suo contenitore, sotto 24em solo icona e codice; nascosta in stampa e in colloquio.

## Tipi di scheda
- `tab_kinds.js` `TAB_KINDS` (registro statico) e `kindOf(tab)`: `{kind, icon, nameKey, panel, label(tab, s)}`. Riga `file`: icona `file`, `tabs.kind.file`, pannello `pane-main`, etichetta = codice + nome del file. Un tipo nuovo = una riga.
- Riga `sheet`: icona `sheet`, `tabs.kind.sheet` («Scheda della sostanza {name}»), pannello `sheet-pane`, etichetta = nome della sostanza (code e name uguali; `css/tabs-sheet.css` mostra solo il primo), `render` = `renderSheetTab`. Nella scheda restano `{id, name, cuts}` (id linguetta `sheet-<id>`); `openSheetPatch(s, sheet)` in `tabs.js` apre in coda o porta a fuoco quella già aperta; `canOpenSheet` ferma a `SHEETS_MAX` (20).
- `sheet_tab.js`: crea da sé `#sheet-pane` (`section.pane-sheet`, `role=tabpanel`, `aria-labelledby` della linguetta a fuoco) accanto a `#pane-main` e con un `subscribe` interno (`syncSheetPane`) nasconde il principale e imposta `body[data-sheet-tab]`; disegna la scheda completa (h2 col nome, 13 sezioni, fonti, link alla pagina) solo quando cambiano linguetta o lingua, rileggendo i dati; fuori fuoco il DOM viene tolto.
- Il fuoco va al titolo solo all'apertura (evento `sheet-opened` di `openSheet`), non quando si mostra la linguetta con la tastiera. In stampa (`print.css`) la sostanza a fuoco esce sola in A4.

## Vista affiancata
Non ancora costruita.

## Memoria
- `files.js` `OPEN_BUDGET = {tabs: 20, sheets: 20, points: 2^22}`: al massimo 4 194 304 punti in tutto (radici e residui, 16 B per punto → ≤ 64 MiB), contratto e non misura. `addSpectrum` oltre il tetto delle schede o dei punti rifiuta (`tabNotice` + `fileError` `err.tabs.limit` / `err.tabs.points`, restituisce ""); `addResidual` rifiuta solo sui punti e non apre una scheda; `openFiles` apre i primi e annuncia `status.tabs_skipped`. Oltre il tetto non si chiude nulla da solo.
- Le schede non si ripristinano al ricaricamento (salvarle vorrebbe dire salvare spettri o riferimenti ai file); nessuna preferenza nuova.

## Prove
- `tests_e2e/tabs_sheets.mjs` + `scenari/315-sheetTabs.mjs`: da «Scheda completa» la linguetta arancione accanto a C1, seconda apertura = stessa linguetta, file e sostanza alternati con frecce e Invio conservano la vista, 21ª sostanza rifiutata con avviso e annuncio, riordino, stampa PDF, nulla in storage, nessuna scheda dopo il ricaricamento, axe chiaro/scuro/en, 320 px.
- `tests_e2e/tabs.mjs` + `scenari/310-tabs.mjs`: parte pura (scambio della vista, chiusura, spostamento, tetti, punti) e browser: tre file = tre linguette, vista di ciascuna che torna, residuo nella scheda di C1, tastiera, menu, `w`, `j`, X e clic centrale, 21º file rifiutato con avviso e annuncio, tetto dei punti, nulla in storage, nessuna scheda dopo il ricaricamento, axe chiaro/scuro/en, 320 px.

## Trappole
- Il nome del file sta in sezione 1, nel tooltip del chip e nelle linguette (`#doc-tabs`); la prova di `caricamento.mjs` ammette solo questi posti. Nell'annuncio di spostamento va il codice, mai il nome.
- `selectFile` e `undo` passano da `syncActive`, mai da `update({active})` diretto: altrimenti il fuoco non segue la scheda del residuo.
- Le chiavi `nameKey` del registro sono lette da `controlla_lingue.py` come `labelKey`.
