"""Imports the selected spectra of the SWGDRUG IR Library (ATR-FTIR, JCAMP release of 15 May 2024) into data/substances.

Written permission of SWGDRUG (13/10/2026) for these cutting agents only, in a non-commercial open-access tool; the e-mails
stay in the private repository. The source files are not in this repository: pass the folder of the JCAMP release.

    python3 tools/dati/importa_swgdrug.py --source <folder of the SWGDRUG JCAMP 051524 release>

Only a change of layout: the (X++(Y..Y)) data become ##XYPOINTS with the same x and y (YFACTOR applied); no resampling,
no smoothing. The source header is not copied (only title, units, resolution and technique are written anew).
"""
from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import jcamp  # noqa: E402
import qualita  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent.parent
DATA = ROOT / "data"
LIBRARY = {"name": "swgdrug-ir", "version": "2024-05-15"}
CITATION = "IR spectral data provided courtesy of SWGDRUG (swgdrug.org), SWGDRUG IR Library v2024-05-15"
DAY = "2026-10-13"
# SWGDRUG entry number -> form id (the form files live in data/substances/<substance>/forms/).
ENTRIES = {
    "350": "benzocaine-base", "352": "phenacetin-neutral", "354": "paracetamol-neutral", "357": "caffeine-base",
    "358": "levamisole-hcl", "366": "mannitol-neutral", "367": "inositol-neutral", "374": "procaine-hcl",
    "375": "lidocaine-hcl-h2o", "388": "lactose-alpha", "508": "lidocaine-base",
}


def read_source(path: Path) -> tuple[dict[str, str], list[float], list[float]]:
    """Reads an AFFN (X++(Y..Y)) JCAMP-DX file; x of each value = FIRSTX + i * DELTAX."""
    head: dict[str, str] = {}
    rows: list[list[float]] = []
    in_data = False
    for line in path.read_text(encoding="latin-1").splitlines():
        if line.startswith("##"):
            key, _, value = line[2:].partition("=")
            in_data = key.strip().upper() == "XYDATA"
            head.setdefault(key.strip().upper(), value.strip())
        elif in_data and line.strip():
            rows.append([float(v) for v in line.split()[1:]])
    ys = [v * float(head["YFACTOR"]) for r in rows for v in r]
    first, step, n = float(head["FIRSTX"]), float(head["DELTAX"]), int(head["NPOINTS"])
    if len(ys) != n or head["XUNITS"] != "1/CM" or head["YUNITS"] != "ABSORBANCE":
        raise ValueError(f"{path.name}: unexpected layout")
    return head, [first + i * step for i in range(n)], ys


def write_jdx(sid: str, xs: list[float], ys: list[float]) -> bytes:
    lines = [f"##TITLE={sid}", "##JCAMP-DX=5.01", "##DATA TYPE=INFRARED SPECTRUM", "##XUNITS=1/CM", "##YUNITS=ABSORBANCE",
             "##RESOLUTION=4", "##SAMPLING PROCEDURE=ATR", f"$$ {CITATION}.",
             f"##FIRSTX={xs[0]:.4f}", f"##LASTX={xs[-1]:.4f}", f"##NPOINTS={len(xs)}", "##XYPOINTS=(XY..XY)"]
    lines += [f"{x:.4f}, {y:.6f}" for x, y in zip(xs, ys)]
    return ("\n".join([*lines, "##END=", ""])).encode("utf-8")


def metadata(sid: str, form: str, number: str, lot: str, month: str, xs: list[float], raw: bytes) -> dict:
    meta = {
        "schema": "ftir-spectrum/1", "id": sid, "form": form, "role": "reference",
        "technique": {"method": "ATR", "crystal": "diamond", "reflections": 1},
        "instrument": {"manufacturer": "Thermo Nicolet", "model": "iS10"},
        "resolution_cm1": 4, "scans": 32, "apodization": "Norton-Beer strong",
        "range_cm1": [round(xs[0], 1), round(xs[-1], 1)], "step_cm1": round(xs[1] - xs[0], 4),
        "y_axis": "absorbance", "atr_correction": False,
        "processing": ["normalised by the source to 0-1 absorbance (declared: subtraction or addition, multiplied by a scalar)"],
        "measured": month,
        "provenance": {"type": "reference_material", "supplier": "SWGDRUG IR Library (reference standard)", **({"batch": lot} if lot else {})},
        "library": {**LIBRARY, "original_id": f"#{number}"},
        "contributors": [{"public_name": "SWGDRUG", "body": "Scientific Working Group for the Analysis of Seized Drugs"}],
        "license": "LicenseRef-permission-swgdrug",
        "license_terms": {"non_commercial": True, "citation": CITATION, "permission": "written, 2026-10-13, for the listed cutting agents"},
        "sha256": hashlib.sha256(raw).hexdigest(), "original_format": "JCAMP-DX 5.01 (OMNIC), (X++(Y..Y))",
        "review": {"state": "proposed", "reviewers": [], "date": DAY},
    }
    j = jcamp.parse(raw.decode("utf-8"))
    meta["quality"] = {"checks": [{"criterion": c, "result": r, **({} if v is None else {"value": v})} for c, r, v in qualita.checks(j, meta)]}
    return meta


def main(argv: list[str]) -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--source", type=Path, required=True)
    args = ap.parse_args(argv)
    forms = {p.stem: p.parent.parent for p in DATA.glob("substances/*/forms/*.json")}
    for path in sorted(args.source.glob("*.JDX")):
        m = re.match(r"#(\d+) - .*?(?:\(Lot #([^)]+)\))?\.JDX$", path.name)
        if not m or m.group(1) not in ENTRIES:
            continue
        number, lot, form = m.group(1), m.group(2), ENTRIES[m.group(1)]
        head, xs, ys = read_source(path)
        y, mo, _ = head["LONGDATE"].split("/")
        sid = f"{form}.swgdrug.{int(number):03d}"
        raw = write_jdx(sid, xs, ys)
        out = forms[form] / "spectra"
        out.mkdir(exist_ok=True)
        (out / f"{sid}.jdx").write_bytes(raw)
        meta = metadata(sid, form, number, lot.strip() if lot else "", f"{y}-{mo}", xs, raw)
        (out / f"{sid}.json").write_text(json.dumps(meta, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
        print(sid, [c["result"] for c in meta["quality"]["checks"]])
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
