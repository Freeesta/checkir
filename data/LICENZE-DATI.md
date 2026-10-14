# Licenze dei dati · Data licences

| File | Licenza · Licence | Attribuzione · Attribution |
|---|---|---|
| `substances/*/spectra/*` (comunitari · community) | CC BY 4.0 | contributori ed ente nel `.json`; `CONTRIBUTORI.md` generato · contributors and body in the `.json`; generated `CONTRIBUTORI.md` |
| `demo/*` (spettri veri del servizio, puliti con `anonimizza/1` · real spectra of the service, cleaned with `anonimizza/1`) | CC BY 4.0 | ente nel `.json` (`contributors`) · body in the `.json` (`contributors`) |
| `substances/*/datasheet/*`, `alerts/*` | CC BY-SA 4.0 | autori in `datasheet.json` · authors in `datasheet.json` |
| `substance.json`, `forms/`, `classes.json`, `sources.json` | CC BY 4.0 per l'insieme; i campi da Wikidata sono CC0, da ChEBI CC BY 4.0 (attribuzione a ChEBI) · CC BY 4.0 for the whole; Wikidata fields are CC0, ChEBI fields CC BY 4.0 (credit ChEBI) | voce «Fonti dei dati chimici» · "Sources of chemical data" entry |
| `bands/{rules,groups,modes,regions}.json`, `bands/substance-bands/*` | CC BY 4.0 | fonti per regola in `sources.json` (i numeri sono fatti; i testi delle fonti non sono copiati) · sources per rule in `sources.json` (numbers are facts; source texts are not copied) |
| `bands/texts.<lingua>.json` (testi di spiegazione · explanation texts) | CC BY-SA 4.0 | come le schede · like the datasheets |
| `substances/*/spectra/*.swgdrug.*` (libreria `swgdrug-ir` · `swgdrug-ir` library) | `LicenseRef-permission-swgdrug`: uso non commerciale con permesso scritto di SWGDRUG, non aperta · non-commercial use with SWGDRUG's written permission, not open | «IR spectral data provided courtesy of SWGDRUG (swgdrug.org), SWGDRUG IR Library v2024-05-15»; condizioni in `license_terms` e nel pannello delle librerie · conditions in `license_terms` and in the libraries panel |
| altre librerie di terzi · other third-party libraries | `LicenseRef-permission-<ente>`, non aperta, nel sito solo con permesso scritto · not open, on the site only with written permission | attribuzione dell'ente · the body's attribution |
| librerie private dell'utente · user's private libraries | nessuna: non entrano mai nel repository · none: never in the repository | — |

**Italiano.** Per citare la libreria comunitaria: «checkir community FTIR library, vX, CC BY 4.0». Chi contribuisce uno spettro dichiara nella PR: «ho misurato io questo spettro, ho il diritto di pubblicarlo, lo rilascio con CC BY 4.0»; per uno spettro misurato in un servizio serve anche il consenso dell'ente (`contributors[].body`). Per segnalare un errore o chiedere il ritiro di un dato apri una issue nel repository. Gli esempi `synthetic-*` sono fittizi e senza valore scientifico.

**English.** To cite the community library: "checkir community FTIR library, vX, CC BY 4.0". A contributor declares in the PR: "I measured this spectrum myself, I have the right to publish it, and I release it under CC BY 4.0"; for a spectrum measured in a service, the body's consent is also required (`contributors[].body`). To report an error or ask for a withdrawal, open an issue in the repository. The `synthetic-*` examples are fictitious and have no scientific value.
