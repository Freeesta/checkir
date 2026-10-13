"""Forbidden words in the translation catalogs: nothing the page says may reassure.

A result must never read "safe", "pure", "clean", "all clear", "ok" or "negative": the program proposes, the chemist decides, and FTIR
does not see what is below about 5 %. The catalogs web/lang/<code>.json are searched for those words, in the language of each catalog.
A word is allowed only in a key listed in tools/check_words_allow.json, which holds phrases that deny it ("does not mean the substance
is safe"). Each entry has a reason; an entry whose key no longer exists, or whose text has no negation, fails too.

    python3 tools/check_words.py
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
LANG_DIR = ROOT / "web" / "lang"
ALLOW = ROOT / "tools" / "check_words_allow.json"

# Words that are wrong anywhere in a text, by language.
ANYWHERE = {
    "it": [r"sicur[oaie]", r"pur[oai]", r"pulit[oaie]", r"via libera", r"all clear"],
    "en": [r"safe", r"pure", r"clean", r"all clear", r"okay"],
}
# Words that are wrong only when they are the whole answer ("Result: negative", "OK"): alone as the text or after a colon.
ALONE = {"it": ["ok", "negativo", "negativa"], "en": ["ok", "negative"]}
# A text that denies the word may keep it.
NEGATION = re.compile(r"\b(non|mai|nessun[ao]?|nulla|not|never|no|neither|nor|cannot|can't|doesn't|does not|don't)\b", re.IGNORECASE)


def hits(lang: str, text: str) -> list[str]:
    """The forbidden words found in one text."""
    found = [m.group(0) for p in ANYWHERE.get(lang, []) for m in re.finditer(rf"\b{p}\b", text, re.IGNORECASE)]
    plain = text.strip().strip(".!").lower()
    for w in ALONE.get(lang, []):
        if plain == w or re.search(rf":\s*{w}\s*[.!]?\s*$", text, re.IGNORECASE):
            found.append(w)
    return found


def offenders(catalogs: dict[str, dict[str, str]], allow: dict[str, str]) -> list[str]:
    """Messages for every forbidden word outside the allowed keys, and for every allowed key that does not deserve it."""
    out = []
    for lang, cat in sorted(catalogs.items()):
        for key, text in sorted(cat.items()):
            found = hits(lang, text)
            if found and key not in allow:
                out.append(f"{lang}:{key}: forbidden word {sorted(set(found))} in «{text}»")
    for key, reason in sorted(allow.items()):
        texts = [cat[key] for cat in catalogs.values() if key in cat]
        if not texts:
            out.append(f"allow list: key {key} does not exist")
        elif not reason.strip():
            out.append(f"allow list: key {key} has no reason")
        elif not all(NEGATION.search(t) for t in texts):
            out.append(f"allow list: key {key} does not deny the word (no negation in its text)")
    return out


def main() -> int:
    catalogs = {p.stem: json.loads(p.read_text(encoding="utf-8")) for p in sorted(LANG_DIR.glob("*.json"))}
    allow = json.loads(ALLOW.read_text(encoding="utf-8")).get("allowed", {}) if ALLOW.exists() else {}
    bad = offenders(catalogs, allow)
    print(f"{len(catalogs)} catalogs, {len(allow)} allowed keys")
    for b in bad:
        print("FAIL " + b)
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
