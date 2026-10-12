# Proporre uno spettro senza Git
English: [spectrum.md](spectrum.md)

Per i chimici e i servizi che hanno misurato uno spettro di riferimento. Serve un account GitHub gratuito e nient'altro. I campi da compilare sono elencati in [card.it.md](card.it.md).

1. **Crea un account GitHub** (gratuito), oppure accedi.
2. **Prepara il contributo in checkIR** (pulsante «Prepara contributo», *in arrivo*). Carica lo spettro, scegli la sostanza confermata e premi il pulsante. Il programma crea un file `.zip` con lo spettro **pulito** (senza nome del campione, operatore, percorso del file o numero di serie; data ridotta al mese) e una scheda JSON. Prima di salvarlo mostra l'anteprima di tutto il contenuto. Finché il pulsante non esiste, chiedi aiuto a un manutentore con una issue.
3. **Apri il modulo** «Proponi uno spettro»: [nuova issue](https://github.com/Freeesta/checkir/issues/new?template=spectrum.yml).
4. **Trascina il `.zip` nel modulo** (GitHub accetta allegati ZIP, JSON, CSV e TXT fino a 25 MB, vedi i [documenti di GitHub](https://docs.github.com/en/get-started/writing-on-github/working-with-advanced-formatting/attaching-files)), spunta le caselle di dichiarazione e invia.
5. **Revisione.** Un manutentore lo trasforma in pull request; un chimico di un altro servizio lo rivede; ricevi le notifiche dei commenti. Ogni versione resta nella storia pubblica.

## Cosa non possiamo accettare
- Dati personali di qualsiasi tipo; luoghi più precisi della provincia; date più precise del mese.
- Spettri di librerie commerciali o con licenza ristretta (NIST, SDBS, librerie dei produttori) o che non hai il diritto di pubblicare.
- Spettri senza provenienza: forma (base, sale…), tecnica e accessorio, risoluzione e scansioni, e come è stata confermata l'identità.
- Informazioni di sintesi, estrazione, potenziamento o taglio; venditori o luoghi dove acquistare sostanze.

I nuovi spettri sono pubblicati con licenza CC BY 4.0. Puoi firmare con nome, con affiliazione (solo con l'assenso del tuo ente) o con uno pseudonimo. Niente account GitHub? Per ora non possiamo accettare contributi via e-mail, perché dovremmo trattare indirizzi e-mail (dati personali).
