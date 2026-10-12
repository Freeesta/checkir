"""Checks that the product name is written in one place only.

The word NAME may appear in the files of the page (web/) only in web/appname.js and inside repository URLs
(github.com/<owner>/NAME..., <owner>.github.io/NAME...). The manifest is generated (tools/genera_identita.mjs), not tracked.

    python3 tools/controlla_nome.py
"""
from __future__ import annotations

import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
NAME = "checkir"
ALLOWED_FILES = ("web/appname.js",)
URL = re.compile(r"(?:github\.com/[\w.-]+/|[\w-]+\.github\.io/)" + NAME + r"[\w./-]*", re.IGNORECASE)
BINARY_SKIP = (".png", ".jpg", ".ico", ".woff", ".woff2", ".wasm")


def offenders(files: dict[str, str]) -> list[str]:
    """Return 'path:line' for each line that has the name outside the allowed places."""
    bad = []
    for path, text in files.items():
        if path in ALLOWED_FILES:
            continue
        for n, line in enumerate(text.splitlines(), 1):
            if NAME in URL.sub("", line).lower():
                bad.append(f"{path}:{n}")
    return bad


def page_files() -> dict[str, str]:
    out = {}
    for f in subprocess.run(["git", "ls-files", "web"], cwd=ROOT, capture_output=True, text=True, check=True).stdout.split():
        if "/vendor/" in f or f.endswith(BINARY_SKIP) or not (ROOT / f).is_file():
            continue
        out[f] = (ROOT / f).read_text(encoding="utf-8", errors="ignore")
    return out


def main() -> int:
    bad = offenders(page_files())
    for b in bad:
        print(f"FAIL the product name outside web/appname.js: {b}")
    print(f"{len(bad)} problems")
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
