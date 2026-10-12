"""Size limits of the first-party code and of the agent documents, against a base that can only shrink.

Limits (change them only by a decision of the owner, written in the decisions file):
  - a source file over MAX_FILE lines, a top-level function over MAX_FUNC lines  -> warning
  - an agent document (CLAUDE.md, docs/agenti/*.md) with lines over MAX_DOC_LINE characters or over MAX_DOC_BYTES -> warning
The check FAILS only when the list gets worse than the saved base (tools/soglie_base.json): an entry over a limit that is not
in the base, or one that grew by more than SLACK (at least SLACK_MIN lines) over its base. The base can only shrink.
In a new project the base starts EMPTY and should stay empty: then every warning is a failure.

    python3 tools/controlla_soglie.py             # report + exit 1 if worse than the base
    python3 tools/controlla_soglie.py --lista     # also print every entry over a limit
    python3 tools/controlla_soglie.py --aggiorna  # rewrite the base from the current code; refuses if anything got worse

Only standard library; deterministic (reads the files tracked by git). Adapt SKIP, DOC_GLOBS and SOURCE_EXT to the project.
"""
from __future__ import annotations

import ast
import json
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
BASE = ROOT / "tools" / "soglie_base.json"
MAX_FILE, MAX_FUNC = 500, 80
MAX_DOC_LINE, MAX_DOC_BYTES = 600, 25 * 1024
SOURCE_EXT = (".rs", ".js", ".mjs", ".ts", ".py")
SKIP = ("vendor/", "/target/", "node_modules/", "generated/")     # third-party or generated code
DOC_GLOBS = ("CLAUDE.md", "docs/agenti/*.md")                     # the documents the chats read
DOC_SKIP: set[str] = set()                                        # generated documents (e.g. a code map) by file name
KINDS = ("file", "funzioni", "doc_righe", "doc_kb")
LABEL = {"file": "file", "funzioni": "function", "doc_righe": "document (long lines)", "doc_kb": "document (bytes)"}
SLACK = 0.10
SLACK_MIN = 10

JS_DEF = re.compile(r"^( {0,2})(?:export\s+)?(?:default\s+)?(?:async\s+)?(?:function\*?\s+([A-Za-z_$][\w$]*)"
                    r"|(?:const|let)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?(?:\([^)]*\)|[A-Za-z_$][\w$]*)\s*=>)")
RS_DEF = re.compile(r"^( {0,4})(?:pub(?:\([a-z]+\))?\s+)?(?:const\s+)?(?:async\s+)?(?:unsafe\s+)?(fn|struct|enum|trait)\s+([A-Za-z_]\w*)")


def tracked() -> list[str]:
    out = subprocess.run(["git", "ls-files"], cwd=ROOT, capture_output=True, text=True, check=True).stdout.split("\n")
    return sorted(f for f in out if f.endswith(SOURCE_EXT) and not any(k in f for k in SKIP))


def definizioni(path: str, text: str) -> list[tuple[str, int, int]]:
    """Top-level definitions of a file as (name, first line, length in lines), in file order."""
    if path.endswith(".py"):
        try:
            tree = ast.parse(text)
        except SyntaxError:
            return []
        return [(n.name, n.lineno, (n.end_lineno or n.lineno) - n.lineno + 1) for n in tree.body
                if isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef))]
    lines = text.split("\n")
    rx = RS_DEF if path.endswith(".rs") else JS_DEF
    starts: list[tuple[str, int, int]] = []
    for i, line in enumerate(lines, 1):
        m = rx.match(line)
        if m:
            name = m.group(3) if path.endswith(".rs") else (m.group(2) or m.group(3))
            starts.append((name, i, len(m.group(1))))
    found = []
    for k, (name, i, ind) in enumerate(starts):
        end = len(lines)
        for _n2, j, ind2 in starts[k + 1:]:
            if ind2 <= ind:
                end = j - 1
                break
        while end > i and not lines[end - 1].strip():
            end -= 1
        found.append((name, i, end - i + 1))
    return found


def misura() -> dict[str, dict[str, int]]:
    files: dict[str, int] = {}
    funcs: dict[str, int] = {}
    for f in tracked():
        text = (ROOT / f).read_text(encoding="utf-8", errors="replace")
        n = text.count("\n") + 1
        if n > MAX_FILE:
            files[f] = n
        for name, _line, length in definizioni(f, text):
            if length > MAX_FUNC:
                k = f"{f}::{name}"
                funcs[k] = max(funcs.get(k, 0), length)
    long_lines: dict[str, int] = {}
    big: dict[str, int] = {}
    docs = sorted({p for g in DOC_GLOBS for p in ROOT.glob(g)})
    for d in docs:
        if d.name in DOC_SKIP or not d.is_file():
            continue
        raw = d.read_bytes()
        rel = d.relative_to(ROOT).as_posix()
        n = sum(1 for line in raw.decode("utf-8", errors="replace").split("\n") if len(line) > MAX_DOC_LINE)
        if n:
            long_lines[rel] = n
        if len(raw) > MAX_DOC_BYTES:
            big[rel] = len(raw)
    return {"file": files, "funzioni": funcs, "doc_righe": long_lines, "doc_kb": big}


def peggiori(now: dict[str, dict[str, int]], base: dict[str, dict[str, int]]) -> list[str]:
    bad = []
    for kind in KINDS:
        for k, v in sorted(now[kind].items()):
            b = base.get(kind, {}).get(k)
            if b is None:
                bad.append(f"NEW {LABEL[kind]} over the limit: {k} ({v})")
            elif v > b + (max(SLACK_MIN, int(b * SLACK)) if kind in ("file", "funzioni") else 0):
                bad.append(f"GREW {k}: {b} -> {v}")
    return bad


def main() -> int:
    now = misura()
    saved = json.loads(BASE.read_text(encoding="utf-8")) if BASE.exists() else {}
    base = {kind: saved.get(kind, {}) for kind in KINDS}
    bad = peggiori(now, base)
    if "--aggiorna" in sys.argv:
        if bad and BASE.exists():
            print("refusing to update the base, it would get worse:\n  " + "\n  ".join(bad))
            return 1
        new = {kind: {k: min(v, base[kind].get(k, v)) for k, v in now[kind].items()} for kind in KINDS}
        BASE.write_text(json.dumps(new, indent=1, sort_keys=True, ensure_ascii=False) + "\n", encoding="utf-8")
        print("base written: " + ", ".join(f"{len(new[k])} {LABEL[k]}" for k in KINDS))
        return 0
    print("over the limits: " + ", ".join(f"{len(now[k])} {LABEL[k]} (base {len(base[k])})" for k in KINDS))
    if "--lista" in sys.argv:
        for kind in KINDS:
            for k, v in sorted(now[kind].items(), key=lambda kv: -kv[1]):
                print(f"  {v:6d}  {k}")
    for b in bad:
        print("FAIL " + b)
    shrunk = [k for kind in KINDS for k in base[kind] if k not in now[kind]]
    if shrunk and not bad:
        print(f"note: {len(shrunk)} entries of the base are now under the limit: run with --aggiorna to narrow it")
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
