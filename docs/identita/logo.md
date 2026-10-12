# Logo: varianti a confronto
Anteprima: `anteprima.png` (96, 32 e 16 px; chiaro, scuro, monocromatico). Tutte le varianti sono SVG a 64×64 con `currentColor`, nessun gradiente né ombra.

| Sigla | Idea | Note |
|---|---|---|
| A1 | pillola tonda piena con la valle di spettro ritagliata | **In uso** (`web/img/logo.svg`). Pillola + IR, nessun simbolo di approvazione; a 16 px resta leggibile. |
| A2 | pillola tonda a contorno con la valle | Più leggera, a 16 px il tratto sottile si indebolisce. |
| A3 | capsula diagonale con linea di divisione | Dice «pillola» al primo sguardo, non dice «IR»; a 16 px perde dettaglio. |
| B1 | pillola tonda piena con la spunta ritagliata | Il più pulito a 16 px, ma la spunta si legge «approvato» (distintivo di verifica). |
| B2 | spunta nel piano interno (anello + disco) | Come B1, con più dettagli: a 16 px i due piani si impastano. |
| B3 | solo contorno con spunta | Il più leggero; stessa lettura «approvato». |

## Perché A1
- Le regole d'uso del nome vietano la spunta e ogni segno che rassicura («checked ✓»): l'FTIR non esclude componenti sotto ~5 % né sostanze potenti in tracce, e il programma propone, la persona esperta decide. Una spunta, anche neutra, dice «controllato = a posto».
- La valle è la banda di assorbimento del logo precedente: la pillola dà il tema, la valle dà il metodo.
- Monocromo e senza ombre: funziona in chiaro, scuro e in bianco e nero.

## Cambiare logo
1. Copia la variante scelta su `web/img/logo.svg` (deve usare `currentColor`).
2. `node tools/genera_immagini.mjs` rigenera favicon, icone, versioni chiara/scura/mono e `og.png`.
3. Fai un commit con i file cambiati di `web/img/`.
