# data/ — dati aperti di checkir · open data of checkir

**Italiano.** Questa cartella contiene i dati aperti del progetto: sostanze, forme, spettri di riferimento, schede, allerte, classi e fonti. Per ora ci sono solo **esempi sintetici** (`synthetic-a`, `synthetic-b`): sostanze fittizie e uno spettro generato al calcolatore, non una misura. Le librerie di terzi non stanno mai qui; i dati veri del servizio non stanno mai in questo repository.

- Struttura: `sostanze` → `forme` → `spettri` (tre livelli; lo spettro dipende dalla forma, per esempio sale o base libera). Cartelle: `substances/<id>/{substance.json, forms/, spectra/*.jdx + *.json, datasheet/}`, `alerts/`, `classes.json`, `sources.json`, `aliases.json`.
- Ogni file ha il campo `schema` e viene controllato contro `docs/schemi/`. Nessun dato personale (numeri di serie, operatori, percorsi, codici di campione) in nessun campo né nei commenti JCAMP.
- Uno spettro entra solo con provenienza dichiarata (standard certificato, materiale di riferimento o campione confermato da un'altra tecnica), metriche di qualità calcolate e revisione.
- I testi delle schede non dicono mai che un campione è «sicuro», «puro» o «pulito»; ogni affermazione sanitaria cita una fonte (`[f:id]` in `sources.json`).
- Controlli in locale: `pip install -r tools/dati/requirements.txt`, poi `python3 tools/dati/controlla_dati.py` e `python3 tools/dati/valida_schemi.py --schemi`.
- Licenze: vedi `LICENZE-DATI.md`.

**English.** This folder holds the project's open data: substances, forms, reference spectra, datasheets, alerts, classes and sources. For now it contains only **synthetic examples** (`synthetic-a`, `synthetic-b`): fictitious substances and a computer-generated spectrum, not a measurement. Third-party libraries never live here; real service data never enter this repository.

- Structure: substance → form → spectrum (three levels; a spectrum depends on the form, e.g. salt or free base). Folders: `substances/<id>/{substance.json, forms/, spectra/*.jdx + *.json, datasheet/}`, `alerts/`, `classes.json`, `sources.json`, `aliases.json`.
- Every file has a `schema` field and is checked against `docs/schemi/`. No personal data (serial numbers, operators, paths, sample codes) in any field or JCAMP comment.
- A spectrum is accepted only with declared provenance (certified standard, reference material, or a sample confirmed by another technique), computed quality metrics and a review.
- Datasheet texts never say a sample is "safe", "pure" or "clean"; every health statement cites a source (`[f:id]` in `sources.json`).
- Local checks: `pip install -r tools/dati/requirements.txt`, then `python3 tools/dati/controlla_dati.py` and `python3 tools/dati/valida_schemi.py --schemi`.
- Licences: see `LICENZE-DATI.md`.
