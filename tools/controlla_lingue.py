"""Checks the translation catalogs of the web page: every visible text is a key, every key exists in every language.

Catalogs: web/lang/<code>.json, flat objects {"area.component.item": "text"}; REF is the reference language (complete).
FAILS when:
  - a key of REF is missing in another catalog, or another catalog has a key that REF does not have;
  - the placeholders ({name}) of a key differ between two languages;
  - the code uses a literal key (t("x.y"), data-i18n="x.y", data-i18n-title="x.y"...) that REF does not define;
  - a key of REF is never used in the code (orphan), unless it starts with a prefix listed in DYNAMIC (keys built at run time).
Only standard library. Adapt WEB, REF, CODE_GLOBS and DYNAMIC to the project.

    python3 tools/controlla_lingue.py
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
WEB = ROOT / "web"
REF = "it"
CODE_GLOBS = ("**/*.js", "**/*.html")
DYNAMIC: tuple[str, ...] = ("err.", "reader.", "theme.")     # keys composed at run time (t(`err.${code}`), error and warning keys of the readers, t(`theme.${mode}`)): never orphans
USE = re.compile(r"""(?:\bt\(\s*["']|data-i18n(?:-[a-z]+)?=["']|\b(?:labelKey|tipKey|titleKey):\s*["'])([a-z0-9_]+(?:\.[a-z0-9_]+)+)["']""")
PLACEHOLDER = re.compile(r"\{([a-zA-Z_][\w]*)")


def catalogs() -> dict[str, dict[str, str]]:
    out = {}
    for p in sorted((WEB / "lang").glob("*.json")):
        out[p.stem] = json.loads(p.read_text(encoding="utf-8"))
    return out


def used_keys() -> set[str]:
    keys: set[str] = set()
    for g in CODE_GLOBS:
        for p in WEB.glob(g):
            if "/lang/" in p.as_posix() or "/vendor/" in p.as_posix():
                continue
            keys.update(USE.findall(p.read_text(encoding="utf-8", errors="replace")))
    return keys


def main() -> int:
    cats = catalogs()
    if REF not in cats:
        print(f"FAIL reference catalog web/lang/{REF}.json not found")
        return 1
    ref = cats[REF]
    bad = []
    for code, cat in cats.items():
        if code == REF:
            continue
        bad += [f"missing in {code}: {k}" for k in sorted(set(ref) - set(cat))]
        bad += [f"extra in {code} (not in {REF}): {k}" for k in sorted(set(cat) - set(ref))]
        for k in sorted(set(ref) & set(cat)):
            if set(PLACEHOLDER.findall(ref[k])) != set(PLACEHOLDER.findall(cat[k])):
                bad.append(f"placeholders differ in {code}: {k}")
    used = used_keys()
    bad += [f"used in the code but not defined: {k}" for k in sorted(used - set(ref))]
    bad += [f"orphan key (never used): {k}" for k in sorted(set(ref) - used) if not k.startswith(DYNAMIC)]
    print(f"{len(cats)} catalogs, {len(ref)} keys in {REF}, {len(used)} literal keys in the code")
    for b in bad:
        print("FAIL " + b)
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
