# Tradurre l'interfaccia
English: [translate.md](translate.md)

Serve un account GitHub; non serve installare nulla. checkIR nasce in italiano e inglese; altre lingue sono benvenute.

1. Su GitHub apri [`web/lang/en.json`](../../web/lang/en.json) e copia il contenuto.
2. Usa **Add file → Create new file** nella cartella `web/lang/`, chiamalo `<codice>.json` (per esempio `fr.json`) e incolla. L'editor web di GitHub ti propone di creare un ramo e una pull request.
3. Traduci solo i **valori**, mai le chiavi (la parte prima dei due punti). Lascia intatti i segnaposto come `{n}`. Il separatore decimale nei numeri è il punto.
4. Invia la pull request. Un controllo automatico (`tools/controlla_lingue.py`) confronta le tue chiavi con il file inglese e ti dice cosa manca o è in più.

I testi sanitari (schede, allerte, avvertenze) tornano a un revisore elencato quando vengono tradotti; non sono pubblicati finché non sono approvati. Se preferisci non usare l'editor, apri il modulo «Traduzione»: [nuova issue](https://github.com/Freeesta/checkir/issues/new?template=translation.yml).
