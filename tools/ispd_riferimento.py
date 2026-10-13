"""Reference checks of the Berkeley DB container with the official tool `db_dump` (package `db-util`).

Not part of the public CI. Two modes:

    python3 tools/ispd_riferimento.py fixtures
        runs db_dump on crates/ftir-core/tests/fixtures/ispd/*.ispd and compares every pair with the truth file
        (proves that the fixture generator writes real Berkeley DB files);

    python3 tools/ispd_riferimento.py impronte CARTELLA USCITA.json
        writes, for every .ispd under CARTELLA, the number of pairs and a digest of their fingerprints
        (db_upgrade runs on a copy). The Rust test `ispd_real` compares the reader with this file.

Fingerprint of a pair: SHA-256 of (key length as 4 bytes little endian, key, value). The digest of a file is the
SHA-256 of the sorted fingerprints in hexadecimal, joined by newlines.
"""
from __future__ import annotations

import hashlib
import json
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
FIXTURES = ROOT / "crates" / "ftir-core" / "tests" / "fixtures" / "ispd"


def unescape(s: str) -> bytes:
    out = bytearray()
    i = 0
    while i < len(s):
        c = s[i]
        if c == "\\":
            if s[i + 1] == "\\":
                out.append(92)
                i += 2
            else:
                out.append(int(s[i + 1 : i + 3], 16))
                i += 3
        else:
            out += c.encode("latin-1")
            i += 1
    return bytes(out)


def records(path: Path) -> list[tuple[bytes, bytes]]:
    """Pairs of a database as printed by `db_dump -p` after `db_upgrade` on a copy."""
    with tempfile.TemporaryDirectory() as tmp:
        copy = Path(tmp) / "x.db"
        shutil.copy(path, copy)
        subprocess.run(["db_upgrade", str(copy)], check=True, capture_output=True)
        text = subprocess.run(
            ["db_dump", "-p", str(copy)], check=True, capture_output=True
        ).stdout.decode("latin-1")
    lines = text.split("\n")
    i = lines.index("HEADER=END") + 1
    out = []
    while i + 1 < len(lines) and lines[i].startswith(" "):
        out.append((unescape(lines[i][1:]), unescape(lines[i + 1][1:])))
        i += 2
    return out


def fingerprint(key: bytes, value: bytes) -> str:
    return hashlib.sha256(len(key).to_bytes(4, "little") + key + value).hexdigest()


def digest(pairs: list[tuple[bytes, bytes]]) -> dict:
    prints = sorted(fingerprint(k, v) for k, v in pairs)
    return {"pairs": len(prints), "digest": hashlib.sha256("\n".join(prints).encode()).hexdigest()}


def check_fixtures() -> int:
    bad = 0
    for truth_path in sorted(FIXTURES.glob("*.truth.json")):
        truth = json.loads(truth_path.read_text(encoding="utf-8"))
        got = digest(records(FIXTURES / f"{truth['name']}.ispd"))
        ok = got == truth["container"]
        bad += not ok
        print(("ok  " if ok else "FAIL"), truth["name"], got["pairs"], "pairs")
    return 1 if bad else 0


def write_fingerprints(folder: Path, out: Path) -> int:
    result = {}
    for p in sorted(folder.rglob("*.ispd")):
        try:
            result[str(p.relative_to(folder))] = digest(records(p))
        except subprocess.CalledProcessError as e:
            result[str(p.relative_to(folder))] = {"error": e.stderr.decode("latin-1")[:200]}
    out.write_text(json.dumps(result, indent=0, sort_keys=True) + "\n", encoding="utf-8")
    print(len(result), "files")
    return 0


def main(argv: list[str]) -> int:
    if argv[:1] == ["fixtures"]:
        return check_fixtures()
    if argv[:1] == ["impronte"] and len(argv) == 3:
        return write_fingerprints(Path(argv[1]), Path(argv[2]))
    print(__doc__)
    return 2


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
