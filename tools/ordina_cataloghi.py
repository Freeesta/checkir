"""Sorts the keys of the page catalogs (web/lang/<code>.json) so that two pull requests adding keys in different areas do not collide.

    python3 tools/ordina_cataloghi.py          # rewrites the catalogs sorted (run it after adding keys)
Same format as the files already have: indent 2, no ASCII escapes, final newline. controlla_lingue.py fails on an unsorted catalog.
"""
from __future__ import annotations

import json
from pathlib import Path

LANG = Path(__file__).resolve().parent.parent / "web" / "lang"


def sorted_text(text: str) -> str:
    """The catalog text with its keys in order."""
    data = json.loads(text)
    return json.dumps(dict(sorted(data.items())), indent=2, ensure_ascii=False) + "\n"


def main() -> int:
    for p in sorted(LANG.glob("*.json")):
        text = p.read_text(encoding="utf-8")
        if sorted_text(text) != text:
            p.write_text(sorted_text(text), encoding="utf-8")
            print(f"sorted {p.name}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
