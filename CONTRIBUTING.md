# Contributing
Italiano: [CONTRIBUTING.it.md](CONTRIBUTING.it.md)

checkIR is built by chemists, health workers, translators and developers. Pick your path; you do not need Git for the first three.

| You are… | You can… | Start here |
|---|---|---|
| A chemist | propose a reference spectrum, review spectra and band rules | [docs/contribute/spectrum.md](docs/contribute/spectrum.md), [card.md](docs/contribute/card.md) |
| A health worker | propose or correct a substance sheet, review health texts | [docs/contribute/sheet.md](docs/contribute/sheet.md) |
| A translator | translate the interface into your language | [docs/contribute/translate.md](docs/contribute/translate.md) |
| A developer | fix bugs, build features | [docs/contribute/develop.md](docs/contribute/develop.md) |

## Rules for everyone
- Read the [Code of Conduct](CODE_OF_CONDUCT.md).
- No personal data in any contribution: no names, contacts, photos, places more precise than a province, dates more precise than a month.
- No synthesis, extraction, potentiation or cutting instructions; no vendors or places to buy substances.
- Only spectra you have the right to publish; never spectra from commercial or restricted libraries.
- Licences: code MIT OR Apache-2.0; new spectra and data CC BY 4.0; substance sheets CC BY-SA 4.0. You keep your copyright; there is no CLA.
- Health texts are always approved by a health reviewer. The program proposes, the chemist decides, nothing is ever "safe".
- Report a problem or a dangerous substance family with the [issue forms](https://github.com/Freeesta/checkir/issues/new/choose).

## Propose a change to a substance sheet
You do not need Git. You need a free GitHub account (a pseudonym is fine; GitHub sees your IP address and account).
1. Open the sheet and choose the section you want to correct. Or open the [issue form "Correct a substance sheet"](https://github.com/Freeesta/checkir/issues/new?template=sheet.yml) and fill it in.
2. Write short sentences, one fact each, and give a source (DOI or link) for every health statement. Never write "safe", "pure" or "clean".
3. Tick the declarations: no personal data, the Developer Certificate of Origin ([DCO 1.1](https://developercertificate.org/)), and the licence CC BY-SA 4.0. If you edit the file directly on GitHub, add `Signed-off-by: Your Name <name>` as the last line of the commit message (or use `git commit -s`).
4. A maintainer sorts your proposal within about a week (labels such as `needs-health-reviewer`). Reviewers listed in [data/reviewers.json](data/reviewers.json) discuss it and approve the pull request. Health sections (effects, doses, risks, interactions, harm reduction) are always approved by a health reviewer; doses stay hidden until a health professional signs them.
5. Only an administrator merges. Your public name (or pseudonym) goes in the credits. Nothing you write can be removed from the Git history without the maintainers' help, so keep personal data out.
Not on GitHub? Ask in a Discussion for a way to send it without an account; a maintainer can upload it for you under the pseudonym you choose.
