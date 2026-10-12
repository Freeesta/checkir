# Propose a spectrum without Git
Italiano: [spectrum.it.md](spectrum.it.md)

For chemists and services that measured a reference spectrum. You need a free GitHub account and nothing else. The fields you will fill in are listed in [card.md](card.md).

1. **Create a GitHub account** (free), or sign in.
2. **Prepare the contribution in checkIR** (button "Prepare contribution", *coming soon*). Load the spectrum, choose the confirmed substance and press the button. The program creates a `.zip` with the **cleaned** spectrum (no sample name, operator, file path or serial number; date reduced to the month) and a JSON sheet. Before saving it shows a preview of everything inside. Until the button exists, ask a maintainer in an issue to help you.
3. **Open the form** "Propose a spectrum": [new issue](https://github.com/Freeesta/checkir/issues/new?template=spectrum.yml).
4. **Drag the `.zip` into the form** (GitHub accepts ZIP, JSON, CSV and TXT attachments up to 25 MB, see the [GitHub docs](https://docs.github.com/en/get-started/writing-on-github/working-with-advanced-formatting/attaching-files)), tick the declaration boxes and submit.
5. **Review.** A maintainer turns it into a pull request; a chemist from a different service reviews it; you receive notifications of the comments. Every version stays in the public history.

## What we cannot accept
- Personal data of any kind; places more precise than a province; dates more precise than a month.
- Spectra from commercial or restricted libraries (NIST, SDBS, vendor libraries) or that you have no right to publish.
- Spectra without provenance: form (base, salt…), technique and accessory, resolution and scans, and how the identity was confirmed.
- Synthesis, extraction, potentiation or cutting information; vendors or places to buy substances.

New spectra are published under CC BY 4.0. You can sign with your name, an affiliation (only with your institution's consent) or a pseudonym. No GitHub account? For now we cannot take contributions by e-mail, because that would mean handling e-mail addresses (personal data).
