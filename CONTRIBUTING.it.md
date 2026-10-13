# Contribuire
English: [CONTRIBUTING.md](CONTRIBUTING.md)

checkIR è fatto da chimici, operatori sanitari, traduttori e sviluppatori. Scegli il tuo percorso; per i primi tre non serve Git.

| Sei… | Puoi… | Parti da qui |
|---|---|---|
| Un chimico | proporre uno spettro di riferimento, rivedere spettri e regole delle bande | [docs/contribute/spectrum.it.md](docs/contribute/spectrum.it.md), [card.it.md](docs/contribute/card.it.md) |
| Un operatore sanitario | proporre o correggere una scheda, rivedere i testi sanitari | [docs/contribute/sheet.it.md](docs/contribute/sheet.it.md) |
| Un traduttore | tradurre l'interfaccia nella tua lingua | [docs/contribute/translate.it.md](docs/contribute/translate.it.md) |
| Uno sviluppatore | correggere errori, costruire funzioni | [docs/contribute/develop.it.md](docs/contribute/develop.it.md) |

## Regole per tutti
- Leggi il [Codice di condotta](CODE_OF_CONDUCT.it.md).
- Nessun dato personale in alcun contributo: niente nomi, contatti, foto, luoghi più precisi della provincia, date più precise del mese.
- Niente istruzioni di sintesi, estrazione, potenziamento o taglio; niente venditori o luoghi dove acquistare sostanze.
- Solo spettri che hai il diritto di pubblicare; mai spettri di librerie commerciali o con licenza ristretta.
- Licenze: codice MIT OR Apache-2.0; nuovi spettri e dati CC BY 4.0; schede delle sostanze CC BY-SA 4.0. Mantieni i tuoi diritti d'autore; non c'è nessun CLA.
- I testi sanitari li approva sempre un revisore elencato in data/reviewers.json. Il programma propone, il chimico decide, niente è mai «sicuro».
- Segnala un problema o una famiglia di sostanze pericolosa con i [moduli delle issue](https://github.com/Freeesta/checkir/issues/new/choose).

## Proporre una modifica a una scheda di sostanza
Non serve Git. Serve un account GitHub gratuito (va bene uno pseudonimo; GitHub vede il tuo indirizzo IP e il tuo account).
1. Apri la scheda e scegli la sezione da correggere. Oppure apri il [modulo «Correggi una scheda»](https://github.com/Freeesta/checkir/issues/new?template=sheet.yml) e compilalo.
2. Scrivi frasi brevi, un fatto ciascuna, e indica una fonte (DOI o link) per ogni affermazione sanitaria. Non scrivere mai «sicuro», «puro» o «pulito».
3. Spunta le dichiarazioni: nessun dato personale, il Developer Certificate of Origin ([DCO 1.1](https://developercertificate.org/)) e la licenza CC BY-SA 4.0. Se modifichi il file direttamente su GitHub, aggiungi `Signed-off-by: Tuo Nome <nome>` come ultima riga del messaggio del commit (oppure usa `git commit -s`).
4. Un manutentore smista la proposta entro circa una settimana (etichette come `needs-review`). I revisori elencati in [data/reviewers.json](data/reviewers.json) la discutono e approvano la pull request. Le sezioni sanitarie (effetti, dosi, rischi, interazioni, riduzione del danno) richiedono una fonte per ogni affermazione e l'approvazione di un revisore elencato; niente è mai «sicuro».
5. Unisce solo un amministratore. Il tuo nome pubblico (o pseudonimo) compare nei crediti. Ciò che scrivi non si cancella dalla storia di Git senza l'aiuto dei manutentori: non scrivere dati personali.
Non hai GitHub? Chiedi in una Discussion come inviare senza account; un manutentore può caricarla per te con lo pseudonimo che scegli.
