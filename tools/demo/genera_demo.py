"""Writes the DEMO spectra under data/demo/ from the service's own measurements (private repository, read only).

Run by hand, never in CI. The measurements are Shimadzu `.ispd` files kept in the private data repository; each one is cleaned
with the contract `anonimizza/1` by the Rust example `export_demo` (nothing is copied from the original file except the
numbers of the spectra and a few physical parameters), then written as JCAMP-DX + `ftir-spectrum/1` JSON.

    CHECKIR_DATA=/path/to/private/clone python3 tools/demo/genera_demo.py --mappa MAPPA.json

MAPPA.json is `{"demos": {"demo-NN": "<path of the .ispd under CHECKIR_DATA>", ...}, "forbidden": ["<regex>", ...]}`. It carries
the service's sample codes and the words that must never appear, so it lives in the private repository (or outside any
repository) and is NEVER committed here. The script ends by searching the files it wrote for the `forbidden` regular
expressions, the sample codes (taken from the paths) and the generic patterns: any hit is an error.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "dati"))
import jcamp  # noqa: E402
import qualita  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent.parent
OUT = ROOT / "data" / "demo"
DAY = "2026-10-13"
NOTE = "FTIR identification by the service, not confirmed with another technique."
ORIGIN = "checkir demo, servizio di drug checking (Torino)"
# demo id -> (form id of the identity proposed by FTIR, extra files: sample + background interferograms for the teaching pages)
DEMOS: dict[str, tuple[str, bool]] = {
    "demo-01": ("cocaine-hydrochloride", True), "demo-02": ("cocaine-base", False), "demo-03": ("mdma-hydrochloride", False),
    "demo-04": ("ketamine-hydrochloride", False), "demo-05": ("amphetamine-sulfate-racemate", False),
    "demo-06": ("4-mmc-hydrochloride", False), "demo-07": ("4-cmc-hydrochloride", False), "demo-08": ("thca-a-free-acid", False),
    "demo-09": ("caffeine-anhydrous", True), "demo-10": ("paracetamol-solid", False),
    "demo-11": ("cellulose-microcrystalline", False), "demo-12": ("mixture-cocaine-hydrochloride", False),
    "demo-13": ("mixture-heroin-hydrochloride", False),
}
# Patterns every written file must be free of, whatever the map says: paths and user folders. The service-specific words
# (code prefixes, place names, serial-number markers, user names) come from the private map, never from this public file.
GENERIC_FORBIDDEN = [r"[A-Za-z]:\\", r"/home/", r"Users?[\\/]"]


def run_export(ispd: Path) -> dict:
    cmd = ["cargo", "run", "-q", "--release", "-p", "ftir-core", "--example", "export_demo", "--", str(ispd)]
    done = subprocess.run(cmd, cwd=ROOT, capture_output=True, text=True, check=True)
    return json.loads(done.stdout)


def jcamp_text(title: str, kind: str, spec: dict, doc: dict) -> str:
    """JCAMP-DX of one spectrum or interferogram; x and y are written with the precision of the source file."""
    inter = kind != "spectrum"
    lines = [
        f"##TITLE={title}", "##JCAMP-DX=5.01", f"##DATA TYPE={'INTERFEROGRAM' if inter else 'INFRARED SPECTRUM'}",
        f"##ORIGIN={ORIGIN}",
        f"##XUNITS={'CM' if inter else '1/CM'}", f"##YUNITS={'ARBITRARY UNITS' if inter else 'ABSORBANCE'}",
        f"##RESOLUTION={doc['resolution_cm1']:g}", "##SAMPLING PROCEDURE=ATR",
        "$$ ATR, diamond crystal, single reflection (QATR-S)", f"$$ Instrument: {doc['model']}",
        f"$$ {NOTE}", "$$ License: CC BY 4.0",
    ]
    if inter:
        lines.append(f"$$ {kind.replace('_', ' ')}: optical path difference in cm")
    xs, ys = spec["x"], spec["y"]
    fx, fy = ("{:.6f}", "{:.7g}") if inter else ("{:.3f}", "{:.6f}")
    lines += [f"##FIRSTX={fx.format(xs[0])}", f"##LASTX={fx.format(xs[-1])}", f"##NPOINTS={len(xs)}", "##XYPOINTS=(XY..XY)"]
    lines += [f"{fx.format(x)}, {fy.format(y)}" for x, y in zip(xs, ys)]
    return "\n".join([*lines, "##END=", ""])


def meta_json(demo_id: str, form: str, text: str, doc: dict, main: dict) -> dict:
    j = jcamp.parse(text)
    xs = main["x"]
    meta = {
        "schema": "ftir-spectrum/1", "id": f"{form}.demo.{demo_id[-3:].replace('-', '0')}", "form": form, "role": "reference",
        "technique": {"method": "ATR", "crystal": "diamond", "reflections": 1},
        "instrument": {"manufacturer": "Shimadzu", "model": doc["model"]}, "resolution_cm1": doc["resolution_cm1"],
        "range_cm1": [round(xs[0], 3), round(xs[-1], 3)], "step_cm1": round((xs[-1] - xs[0]) / (len(xs) - 1), 3),
        "y_axis": "absorbance", "atr_correction": False, "processing": [], "measured": doc["measured"],
        "provenance": {"type": "unconfirmed_sample", "supplier": "Drug checking service (identification by FTIR only)"},
        "library": {"name": "checkir-demo", "version": "0.1.0"},
        "contributors": [{"public_name": "Drug checking service", "body": "Drug checking service (Torino)"}],
        "license": "CC-BY-4.0", "sha256": hashlib.sha256(text.encode("utf-8")).hexdigest(),
        "original_format": "Shimadzu LabSolutions IR (.ispd), cleaned with anonimizza/1",
        "review": {"state": "proposed", "reviewers": [], "date": DAY},
    }
    checks = qualita.checks(j, meta)
    meta["quality"] = {"checks": [{"criterion": c, "result": r, **({} if v is None else {"value": v})} for c, r, v in checks]}
    return meta


def write_demo(demo_id: str, ispd: Path, extras: bool) -> dict:
    doc = run_export(ispd)
    spectra = {s["name"]: s for s in doc["spectra"]}
    main = spectra["main"]
    text = jcamp_text(demo_id, "spectrum", main, doc)
    form = DEMOS[demo_id][0]
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / f"{demo_id}.jdx").write_text(text, encoding="utf-8")
    meta = meta_json(demo_id, form, text, doc, main)
    (OUT / f"{demo_id}.json").write_text(json.dumps(meta, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    written = [f"{demo_id}.jdx", f"{demo_id}.json"]
    if extras:
        for name, suffix in (("sample_interferogram", "sample-interferogram"), ("background_interferogram", "background-interferogram")):
            title = f"{demo_id}.{suffix}"
            (OUT / f"{title}.jdx").write_text(jcamp_text(title, name, spectra[name], doc), encoding="utf-8")
            written.append(f"{title}.jdx")
    fails = [c["criterion"] for c in meta["quality"]["checks"] if c["result"] != "pass"]
    return {"id": demo_id, "files": written, "report": doc["report"], "not_pass": fails}


def summarise(r: dict) -> str:
    stripped = sum(c["count"] for c in r["report"]["changes"] if c["action"] == "togli")
    coarse = sum(c["count"] for c in r["report"]["changes"] if c["action"] == "generalizza")
    keys = sorted({c["key"] for c in r["report"]["changes"] if c["action"] == "togli"})
    return f"{r['id']}: {stripped} fields stripped ({', '.join(keys)}), {coarse} dates reduced to month, {r['report']['kept']} kept; quality not pass: {r['not_pass'] or '-'}"


def audit(files: list[Path], codes: list[str], forbidden: list[str]) -> list[str]:
    """Searches the written files for forbidden patterns and for the sample codes of the map; returns the hits."""
    words = [*GENERIC_FORBIDDEN, *forbidden, *(re.escape(c) for c in codes)]
    patterns = [re.compile(p, re.IGNORECASE) for p in words]
    return [f"{f.name}: {p.pattern}" for f in files for p in patterns if p.search(f.read_text(encoding="utf-8"))]


def main(argv: list[str]) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--mappa", required=True, help="private JSON: demo id -> .ispd path under CHECKIR_DATA")
    args = ap.parse_args(argv)
    base = os.environ.get("CHECKIR_DATA")
    if not base:
        print("CHECKIR_DATA is not set")
        return 2
    given = json.loads(Path(args.mappa).read_text(encoding="utf-8"))
    mapping, forbidden = given["demos"], given.get("forbidden", [])
    if sorted(mapping) != sorted(DEMOS):
        print("the map must list exactly " + ", ".join(sorted(DEMOS)))
        return 2
    results = [write_demo(d, Path(base) / mapping[d], DEMOS[d][1]) for d in sorted(DEMOS)]
    for r in results:
        print(summarise(r))
    codes = [Path(p).stem.split(".")[-1] for p in mapping.values()] + [Path(p).stem for p in mapping.values()]
    hits = audit([OUT / f for r in results for f in r["files"]], codes, forbidden)
    print("audit:", "no forbidden pattern in the files written" if not hits else hits)
    return 1 if hits else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
