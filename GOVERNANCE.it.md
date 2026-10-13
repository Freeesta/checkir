# Governance
English: [GOVERNANCE.md](GOVERNANCE.md)

Come si prendono le decisioni in checkIR oggi e come cambierà quando entreranno altre persone. Questa pagina descrive lo stato **attuale**; quando qualcosa cambia, la pagina si riscrive.

## 1. Principi
- Il programma propone, la persona esperta decide. Nulla di ciò che il programma mostra è una diagnosi o un parere medico, e nulla è mai «sicuro», «puro» o «pulito».
- Tutto è pubblico e tracciabile: ogni modifica è una pull request con la sua discussione.
- Nessun server, nessun sistema di account e nessun login nostro. Chiunque può proporre una modifica tramite GitHub (account gratuito, pseudonimi ammessi) usando i [moduli delle issue](https://github.com/Freeesta/checkir/issues/new/choose); l'account lo gestisce GitHub, non checkIR.
- Nessun dato personale nel progetto, nei contributi o nel processo di revisione.

## 2. Ruoli (oggi)
| Ruolo | Chi | Cosa può fare |
|---|---|---|
| Lettore | chiunque | Usa il programma, legge schede e storia. Nessun account, nessun tracciamento. |
| Proponente | chiunque abbia un account GitHub, anche pseudonimo | Apre issue e pull request; discute. Nessun permesso di scrittura sul repository. |
| Revisore | le persone elencate in [data/reviewers.json](data/reviewers.json) | Approva le pull request per i contenuti del proprio ruolo. Non ha permessi di scrittura. |
| Manutentore | Freeesta (l'account GitHub del proprietario del progetto) | Unisce le pull request, modifica `data/reviewers.json`, modera, pubblica le versioni. |

- **Oggi c'è una sola persona** che è l'unico manutentore e l'unico revisore. Non c'è un'organizzazione GitHub né un contatto pubblico; i problemi si segnalano su GitHub (vedi [CODE_OF_CONDUCT.it.md](CODE_OF_CONDUCT.it.md) e [SECURITY.md](SECURITY.md)).
- **Oggi non è richiesta la firma di un professionista sanitario.** I testi sanitari (effetti, dosi, rischi, interazioni, riduzione del danno) sono rivisti dal revisore sopra, che non è un professionista sanitario. Finché non entra un professionista sanitario, le schede devono dire che i loro testi sanitari **non** sono stati rivisti da uno e non devono essere presentate come parere medico. Le dosi non si mostrano mai per le sostanze potenti.

## 3. Chi decide cosa
| Argomento | Decide | Regola |
|---|---|---|
| Codice (`crates/`, `web/`, `tools/`, `.github/`) | Manutentore | Pull request, CI verde (`ci-ok`), unisce il manutentore. |
| Schede e testi sanitari | Revisore | Ogni affermazione sanitaria ha una fonte; il proponente non approva la propria proposta. |
| Spettri e regole delle bande | Revisore | Provenienza e licenza (CC BY 4.0) dichiarate; mai spettri di librerie commerciali o riservate. |
| Allerte urgenti | Revisore | Pubblicate subito ma ben segnate «in revisione»; revisione completa entro 30 giorni o ritiro. |
| Traduzioni | Revisore | Catalogo completo; il controllo delle lingue passa. |
| Processo, ruoli, questa pagina | Manutentore | Si cambia con una pull request, aperta ai commenti almeno 14 giorni salvo correzione di un errore. |
- **Disaccordo:** tra proponente e revisore decide il revisore; la discussione resta aperta. Nel dubbio si pubblica il testo più prudente (meno affermazioni, più avvertenze).
- **Limiti dell'FTIR** (componenti sotto circa il 5 % non rilevati, sostanze potenti in tracce, nessuna quantità) sono sempre mostrati e un contributo non può toglierli.

## 4. Flusso di revisione
1. Una proposta arriva come issue o pull request. Il manutentore la smista (etichette come `needs-review`) entro circa 7 giorni.
2. Girano i controlli automatici: schema, fonti, parole vietate, nomi vietati, dati personali, DCO.
3. Il revisore discute e approva o chiede modifiche. Tempi attesi: schede e spettri entro circa 30 giorni.
4. Il manutentore unisce; il sito è ricostruito e pubblicato. Il proponente è citato con il nome pubblico o lo pseudonimo che sceglie (la CC BY-SA richiede l'attribuzione).
5. Le pull request ferme da 60 giorni ricevono un promemoria; a 120 giorni si chiudono e si possono riaprire.

## 5. Come si diventa revisore
1. Apri una Discussion o una issue indicando quale ruolo vorresti (chimico, sanitario, linguistico) e quali lingue leggi.
2. Il manutentore verifica la qualifica (per un chimico, l'affiliazione a un servizio di drug checking, a un laboratorio pubblico o a un'università, oppure due referenze di revisori attivi; per un revisore sanitario, l'iscrizione a un albo professionale o un'attestazione di un ente). Le prove non si pubblicano e non si conserva alcuna copia di documenti d'identità.
3. Il manutentore ti aggiunge a `data/reviewers.json` con una pull request e una breve motivazione. Si elencano solo dati pubblici: nome GitHub, nome pubblico (o pseudonimo), ruolo, lingue, mese di verifica e scadenza.
4. Il ruolo dura 24 mesi ed è rinnovabile. Si sospende o si revoca per inattività oltre 12 mesi, violazione del Codice di condotta, conflitto di interessi non dichiarato, errore grave ripetuto o su richiesta. Un account compromesso si sospende subito.
5. Quando i revisori attivi sono più di uno: ogni sezione sanitaria richiede un revisore con il ruolo sanitario; gli spettri li controlla un chimico di un servizio diverso dal contributore; le allerte urgenti richiedono due revisori. Fino ad allora valgono le regole sopra (un solo revisore) e le schede mostrano «revisione interna di un solo revisore».

## 6. Conflitti di interesse
Il revisore dichiara nella pull request ogni legame con produttori o venditori di sostanze, kit o strumenti e non approva contenuti in cui un tale legame esiste. Chiunque può sollevare un dubbio nella pull request o tramite il canale del Codice di condotta.

## 7. Revisioni scadute
Ogni scheda ha una data di revisione e una data «da rivedere entro» (al massimo 24 mesi). Dopo quella data la scheda mostra un avviso che le informazioni potrebbero non essere aggiornate e la tabella delle dosi è nascosta fino al rinnovo. È ammessa una pull request di solo rinnovo (nuova data, nessuna modifica del testo).

## 8. Moderazione
Contenuti fuori tema, offensivi o pericolosi (dati personali, sintesi, venditori, richieste di consigli personali sulla dose) sono nascosti o rimossi e gli utenti possono essere bloccati, con gli strumenti di GitHub. I dati personali pubblicati per errore si rimuovono subito, anche dalla storia quando serve.

## 9. Come cambia questa governance
- Le modifiche a questa pagina seguono il processo sopra. Passare a un'organizzazione GitHub, aggiungere manutentori o cambiare licenze richiede una decisione del proprietario del progetto ed è annunciato prima qui.
- Aggiungere un login, un server o qualunque servizio che tratti dati degli utenti cambierebbe i principi del progetto e richiede una decisione esplicita e documentata del proprietario.
- Le regole si riesaminano quando entra un secondo manutentore, un primo revisore sanitario o un primo servizio partner.
