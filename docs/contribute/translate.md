# Translate the interface
Italiano: [translate.it.md](translate.it.md)

You need a GitHub account; you do not need to install anything. checkIR has Italian and English from the start; other languages are welcome.

1. On GitHub open [`web/lang/en.json`](../../web/lang/en.json) and copy its content.
2. Use **Add file → Create new file** in the `web/lang/` folder, name it `<code>.json` (for example `fr.json`) and paste. GitHub's web editor will offer to create a branch and a pull request for you.
3. Translate only the **values**, never the keys (the part before the colon). Keep placeholders such as `{n}` untouched. Decimal separator in numbers is the point.
4. Submit the pull request. An automatic check (`tools/controlla_lingue.py`) compares your keys with the English file and tells you what is missing or extra.

Health texts (sheets, alerts, warnings) go back to a health reviewer when translated; they are not published until approved. If you prefer not to use the editor, open the form "Translation": [new issue](https://github.com/Freeesta/checkir/issues/new?template=translation.yml).
