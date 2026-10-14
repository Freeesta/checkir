# Governance
English: [GOVERNANCE.md](GOVERNANCE.md)

Come si prendono le decisioni in checkIR oggi e come cambierà quando entreranno altre persone. Questa pagina descrive lo stato **attuale**; quando qualcosa cambia, la pagina si riscrive.

## 1. Principi
- Il programma propone, la persona esperta decide. Nulla di ciò che il programma mostra è una diagnosi o un parere medico, e nulla è mai «sicuro», «puro» o «pulito».
- Tutto è pubblico e tracciabile: ogni modifica è una pull request con la sua discussione.
- Nessun server, nessun sistema di account e nessun login nostro. Chiunque può segnalare un errore tramite GitHub (account gratuito, pseudonimi ammessi) con il [modulo degli errori](https://github.com/Freeesta/checkir/issues/new?template=bug.yml); l'account lo gestisce GitHub, non checkIR.
- Nessun dato personale nel progetto o nei contributi.
- checkIR è un software di elaborazione dati e una wiki: ciò che sta in `main` è pubblicato. I testi li scrivono e li correggono i manutentori; non ci sono firme, stati di revisione né scadenze di revisione. Ogni affermazione ha comunque una fonte. Modificare la wiki dal sito non è possibile.

## 2. Ruoli (oggi)
| Ruolo | Chi | Che cosa può fare |
|---|---|---|
| Lettore | chiunque | Usa il programma e legge le schede. Nessun account, nessun tracciamento. |
| Segnalatore | chiunque abbia un account GitHub, pseudonimo ammesso | Segnala un errore con il modulo degli errori; discute. Nessun permesso di scrittura sul repository. |
| Manutentore | Freeesta (l'account GitHub del proprietario del progetto) | Scrive e corregge codice e testi, unisce le pull request, modera, pubblica le versioni. |

- **Oggi c'è un solo manutentore.** Non c'è un'organizzazione GitHub né un contatto pubblico; i problemi si segnalano su GitHub (vedi [CODE_OF_CONDUCT.it.md](CODE_OF_CONDUCT.it.md) e [SECURITY.md](SECURITY.md)).
- I testi sanitari (effetti, dosi, rischi, interazioni, riduzione del danno) non sono pareri medici. Le dosi che una scheda contiene sono sempre mostrate, ciascuna con la sua fonte.

## 3. Chi decide che cosa
| Argomento | Regola |
|---|---|
| Codice (`crates/`, `web/`, `tools/`, `.github/`) | Pull request, CI verde (`ci-ok`), unisce il manutentore. |
| Schede e testi sanitari | Ogni affermazione ha una fonte (`[f:id]`); lo impongono i controlli dei dati in CI, anche per le sezioni sanitarie. |
| Spettri e regole delle bande | Provenienza e licenza (CC BY 4.0) dichiarate; mai spettri di librerie commerciali o riservate. |
| Allerte | Una fonte per ogni allerta; un'allerta che non vale più si ritira con una pull request. |
| Traduzioni | Catalogo completo; il controllo delle lingue passa. |
| Processo, ruoli, questa pagina | Si cambiano con una pull request, aperta ai commenti almeno 14 giorni salvo che corregga un errore. |
- **Disaccordo:** la discussione resta nella issue o nella pull request e decide il manutentore. Nel dubbio si pubblica il testo più prudente (meno affermazioni).
- **Limiti dell'FTIR** (componenti sotto circa il 5 % non rilevati, sostanze potenti in tracce, nessuna quantità) sono sempre mostrati e non si possono togliere.

## 4. Dalla segnalazione al sito
1. Un errore si segnala con il [modulo degli errori](https://github.com/Freeesta/checkir/issues/new?template=bug.yml). Il manutentore lo smista (etichetta `triage`) entro circa 7 giorni.
2. Il manutentore lo corregge in una pull request; girano i controlli automatici (`ci-ok`): schema, fonti, parole vietate, nomi vietati, dati personali, DCO.
3. Il manutentore unisce; il sito si ricostruisce e si pubblica. Tutto ciò che è pubblicato si corregge allo stesso modo, in ogni momento; la storia di Git conserva ogni versione.

## 5. Conflitti di interesse
Chi scrive una modifica dichiara nella pull request ogni legame con produttori o venditori di sostanze, kit o strumenti. Chiunque può sollevare un dubbio nella pull request o tramite il canale del Codice di condotta.

## 6. Moderazione
Contenuti fuori tema, offensivi o pericolosi (dati personali, sintesi, venditori, richieste di consigli personali sulla dose) sono nascosti o rimossi e gli utenti possono essere bloccati, con gli strumenti di GitHub. I dati personali pubblicati per errore si rimuovono subito, anche dalla storia quando serve.

## 7. Come cambia questa governance
- Le modifiche a questa pagina seguono il processo sopra. Passare a un'organizzazione GitHub, aggiungere manutentori o cambiare licenze richiede una decisione del proprietario del progetto ed è annunciato prima qui.
- Aggiungere un login, un server o qualunque servizio che tratti dati degli utenti cambierebbe i principi del progetto e richiede una decisione esplicita e documentata del proprietario.
- Le regole si riesaminano quando entra un secondo manutentore o un primo servizio partner.
