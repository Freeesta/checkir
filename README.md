# checkIR
Italiano: [README.it.md](README.it.md)

Open-source FTIR analysis for drug checking, for harm-reduction services and laboratories.

## 1. What it does
- You load an infrared (FTIR-ATR) spectrum, see it, and compare it with the spectrum libraries.
- The program proposes candidate substances and explains the peaks, highlighting the infrared regions involved.
- If there is a match, it shows the substance sheet. The program proposes; the qualified chemist decides and signs.
- It is a static website (Rust compiled to WebAssembly, plain HTML/JS) and works offline once loaded.

## 2. What it does NOT do
- It is not a diagnosis, not a medical opinion and not an accredited laboratory analysis.
- It does not see components below about 5 % by weight.
- It does not rule out potent substances at low doses (for example fentanyl analogues and nitazenes).
- It does not measure quantities. A result never means that a sample is safe.

## 3. Try it in 1 minute
Open the site: <https://freeesta.github.io/checkir/>. For now it shows a synthetic test spectrum; file loading, library matching and peak explanation are being added step by step.

## 4. Privacy in 3 lines
- Your files are read and processed only in your browser; nothing is sent anywhere.
- No cookies, no analytics, no third-party scripts or fonts.
- Contributions never contain personal data (date to the month, no place, no names, no photos).

## 5. Licences and citation
- Code: MIT OR Apache-2.0 ([LICENSE](LICENSE)). New spectra and data: CC BY 4.0. Substance sheets: CC BY-SA 4.0. Third-party components: [LICENZE-TERZI.md](LICENZE-TERZI.md).
- To cite the software, use [CITATION.cff](CITATION.cff) (GitHub shows a "Cite this repository" button).
- The code is developed with the help of AI assistants; the AI is not an author, the people who publish are responsible for everything.

## Contribute
You do not need to be a programmer: see [CONTRIBUTING.md](CONTRIBUTING.md) for the four paths (chemists, health workers, translators, developers). Please read the [Code of Conduct](CODE_OF_CONDUCT.md). Security issues: [SECURITY.md](SECURITY.md).
