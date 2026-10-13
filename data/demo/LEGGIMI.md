# data/demo/ — spettri dimostrativi · demonstration spectra

**Italiano.** Tredici spettri FTIR **veri**, misurati da un servizio di drug checking con uno strumento IRSpirit-X (ATR a diamante, una riflessione, risoluzione 4 cm⁻¹, assorbanza; senza correzione ATR: non risulta applicata). Servono a chi vuole provare il sito senza avere file propri. Licenza CC BY 4.0 (vedi `../LICENZE-DATI.md`).

- **L'identità è una proposta, non una conferma.** Ogni nome qui sotto è l'identificazione FTIR del servizio, confrontata con librerie di altri strumenti; non è stata confermata con un'altra tecnica (per esempio GC-MS). Un componente sotto circa il 5 % non si vede in FTIR.
- **Pulizia dei metadati.** I file originali (formato `.ispd`) restano privati. Qui ci sono solo i numeri dello spettro e pochi parametri fisici (risoluzione, modello, mese della misura): nome del file, utente, numeri di serie, percorsi, storia delle elaborazioni, commenti e date complete sono stati tolti con il contratto `anonimizza/1`. Non c'è nessuna sottrazione fatta con librerie di terzi.
- **File.** `demo-NN.jdx` (JCAMP-DX, spettro principale) e `demo-NN.json` (`ftir-spectrum/1`). Per `demo-01` e `demo-09` ci sono anche gli interferogrammi del campione e del fondo (`*.sample-interferogram.jdx`, `*.background-interferogram.jdx`), per spiegare come si passa dall'interferogramma allo spettro.
- **Rigenerazione.** `tools/demo/genera_demo.py` (a mano, fuori dalla CI; serve il repository privato in sola lettura).

| File | Identità proposta (FTIR) | Perché è utile |
|---|---|---|
| demo-01 | cocaina cloridrato | il caso più frequente |
| demo-02 | cocaina base | sale contro base della stessa molecola |
| demo-03 | MDMA (forma «di strada») | non coincide con gli standard di MDMA cloridrato (r ≈ 0.82): forma cristallina diversa, ipotesi non verificata |
| demo-04 | ketamina cloridrato | chetone non coniugato |
| demo-05 | anfetamina solfato (racemo) | controione inorganico; racemo contro enantiomero |
| demo-06 | mefedrone (4-MMC) cloridrato | catinone; una possibile traccia di un secondo componente, sotto soglia: esempio del limite |
| demo-07 | 4-CMC (clefedrone) cloridrato | catinone alogenato; un picco non spiegato |
| demo-08 | THCA-A (prodotto della cannabis) | acido carbossilico e fenolo |
| demo-09 | caffeina | taglio con due C=O |
| demo-10 | paracetamolo | ammide e fenolo; una banda larga non spiegata |
| demo-11 | cellulosa microcristallina | eccipiente; polisaccaride |
| demo-12 | **miscela**: cocaina cloridrato con fenacetina e levamisolo (identificazione del servizio) | picchi non spiegati dalla sola cocaina: nove, tra cui alcuni compatibili con la fenacetina |
| demo-13 | **miscela**: eroina cloridrato monoidrata con mannitolo e almeno un altro componente non identificato | nove picchi non spiegati dall'eroina; due (circa 1655 e 1551 cm⁻¹) non sono spiegati nemmeno dal mannitolo |

**English.** Thirteen **real** FTIR spectra, measured by a drug checking service with an IRSpirit-X (diamond ATR, single reflection, 4 cm⁻¹ resolution, absorbance; no ATR correction is recorded). They let people try the site without files of their own. Licence CC BY 4.0 (see `../LICENZE-DATI.md`).

- **The identity is a proposal, not a confirmation.** Each name above is the service's FTIR identification, compared with libraries from other instruments; it was not confirmed with another technique (for example GC-MS). A component below about 5 % is not visible by FTIR.
- **Metadata cleaning.** The original files (`.ispd`) stay private. Only the spectrum numbers and a few physical parameters (resolution, model, month of the measurement) are published: file name, user, serial numbers, paths, processing history, comments and full dates were removed with the `anonimizza/1` contract. No subtraction made with a third-party library is included.
- **Files.** `demo-NN.jdx` (JCAMP-DX, main spectrum) and `demo-NN.json` (`ftir-spectrum/1`). `demo-01` and `demo-09` also have the sample and background interferograms, to explain how an interferogram becomes a spectrum.
- **Regeneration.** `tools/demo/genera_demo.py` (by hand, outside CI; needs the private repository read-only).
- `demo-12` and `demo-13` are real mixtures: they keep peaks that the identified components do not explain. That is the point: the program proposes, the expert decides.
