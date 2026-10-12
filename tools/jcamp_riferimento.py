"""Regenerates the golden values of the JCAMP-DX fixtures with the reference python library `jcamp` (pip install jcamp).

Not part of the CI: run it by hand when a fixture changes, then commit tests/golden/jcamp/*.json together with the
reason. The Rust test `jcamp_fixtures` compares the reader with these files (relative difference <= 1e-9).

    python3 tools/jcamp_riferimento.py
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import jcamp

ROOT = Path(__file__).resolve().parent.parent
FIXTURES = ROOT / "crates" / "ftir-core" / "tests" / "fixtures" / "jcamp"
GOLDEN = ROOT / "crates" / "ftir-core" / "tests" / "golden" / "jcamp"


def main() -> int:
    GOLDEN.mkdir(parents=True, exist_ok=True)
    for old in GOLDEN.glob("*.json"):
        old.unlink()
    done = 0
    for truth_path in sorted(FIXTURES.glob("*.truth.json")):
        truth = json.loads(truth_path.read_text(encoding="utf-8"))
        if not truth["oracle"]:
            continue
        name = truth["name"]
        data = jcamp.readfile(str(FIXTURES / f"{name}.jdx"))
        out = {
            "x": [float(v) for v in data["x"]],
            "y": [float(v) for v in data["y"]],
            "reference": f"python jcamp {jcamp.__version__}",
        }
        (GOLDEN / f"{name}.json").write_text(json.dumps(out) + "\n", encoding="utf-8")
        done += 1
    print(f"{done} golden files written")
    return 0


if __name__ == "__main__":
    sys.exit(main())
