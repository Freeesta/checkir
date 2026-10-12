"""Writes the synthetic example data under data/ (two fictitious substances, one form each, one spectrum, one draft datasheet).

Nothing here is a real substance or a real measurement: Lorentz bands on a linear baseline with seeded noise, as in
`ftir_core::synthetic` (same model; this Python copy exists because the data tools are standard-library Python).

    python3 tools/dati/genera_sintetico.py        # rewrites data/substances/synthetic-*/
"""
from __future__ import annotations

import hashlib
import json
import random
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import jcamp  # noqa: E402
import qualita  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent.parent
DATA = ROOT / "data"
DAY = "2026-10-12"
BANDS = [(1700.0, 8.0, 0.55), (1450.0, 10.0, 0.35), (1250.0, 12.0, 0.45), (1100.0, 15.0, 0.6), (3000.0, 20.0, 0.2), (800.0, 9.0, 0.3)]


def spectrum_points(seed: int) -> tuple[list[float], list[float]]:
    rng = random.Random(seed)
    xs = [400.0 + 2.0 * i for i in range(1801)]
    ys = []
    for x in xs:
        v = 0.02 + 0.01 * (x - 400) / 3600
        v += sum(h / (1 + ((x - c) / w) ** 2) for c, w, h in BANDS)
        ys.append(v + rng.gauss(0, 0.0015))
    return xs, ys


def dump(path: Path, obj: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(obj, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def substance(sid: str, label: str, key: str, cas: str) -> dict:
    return {
        "schema": "ftir-substance/1", "id": sid, "type": "compound",
        "names": {"en": {"preferred": f"Synthetic example {label}"}, "it": {"preferred": f"Esempio sintetico {label}"}},
        "iupac": f"synthetic example {label} (fictitious, not a real substance)", "formula": "C10H10", "molar_mass_g_mol": 130.19,
        "smiles": "C", "inchi": f"InChI=1S/synthetic-{label.lower()}", "inchikey": key, "external_ids": {"cas": cas},
        "classes": {"chemical": ["others"], "effect": ["no_psychoactive_effect_expected"], "typical_role": ["diluent_excipient"]},
        "sources": [{"field": "all", "source": "synthetic-generator", "consulted": DAY}],
    }


def form(sid: str, key: str) -> dict:
    return {"schema": "ftir-form/1", "id": f"{sid}-base", "substance": sid, "form_type": "free_base", "stereo": "unspecified",
            "inchikey_form": key, "notes": {"en": "Fictitious form for tests.", "it": "Forma fittizia per i test."},
            "sources": [{"field": "all", "source": "synthetic-generator", "consulted": DAY}]}


def spectrum(sid: str, text: str, xs: list[float], ys: list[float]) -> dict:
    sp_id = f"{sid}-base.checkir.001"
    meta = {
        "schema": "ftir-spectrum/1", "id": sp_id, "form": f"{sid}-base", "role": "reference",
        "technique": {"method": "ATR", "crystal": "diamond", "reflections": 1},
        "instrument": {"manufacturer": "Synthetic", "model": "Generator"}, "resolution_cm1": 4, "scans": 32,
        "range_cm1": [400, 4000], "step_cm1": 2, "y_axis": "absorbance", "atr_correction": False, "processing": [],
        "measured": "2026-10", "provenance": {"type": "certified_standard", "supplier": "Synthetic data (not a measurement)"},
        "library": {"name": "checkir-community", "version": "0.0.1"},
        "contributors": [{"public_name": "checkir synthetic generator"}], "license": "CC-BY-4.0",
        "sha256": hashlib.sha256(text.encode("utf-8")).hexdigest(), "original_format": "JCAMP-DX 5.01",
        "review": {"state": "proposed", "reviewers": [], "date": DAY},
    }
    j = jcamp.parse(text)
    meta["quality"] = {"checks": [{"criterion": c, "result": r, **({} if v is None else {"value": v})} for c, r, v in qualita.checks(j, meta)]}
    return meta


SECTIONS = ["molecule", "category", "ftir_limits", "effects", "doses", "risks", "interactions", "harm_reduction", "sources", "license"]
CLAIM = {"en": "Placeholder statement for tests, not a real claim. [f:synthetic-generator]", "it": "Frase segnaposto per i test, non è un'affermazione reale. [f:synthetic-generator]"}


def datasheet(sid: str) -> dict:
    return {"schema": "datasheet/1", "substance": sid, "version": 1, "section_state": {k: "draft" for k in SECTIONS}, "reviewers": [],
            "reviewed": DAY, "review_by": "2028-09-30", "doses": [], "show_doses": False, "authors": ["checkir synthetic generator"], "ai_assisted": True}


def texts(lang: str) -> str:
    return "\n".join(f"## {k}\n\n{CLAIM[lang]}\n" for k in SECTIONS)


def main() -> None:
    for i, (label, key, cas) in enumerate([("A", "SYNTHETICAAAAA-EXAMPLEONE-N", "00-00-0"), ("B", "SYNTHETICBBBBB-EXAMPLETWO-N", "00-00-1")]):
        sid = f"synthetic-{label.lower()}"
        base = DATA / "substances" / sid
        dump(base / "substance.json", substance(sid, label, key, cas))
        dump(base / "forms" / f"{sid}-base.json", form(sid, key))
        if label == "A":
            xs, ys = spectrum_points(20261012 + i)
            text = jcamp.write({"TITLE": f"{sid}-base.checkir.001", "XUNITS": "1/CM", "YUNITS": "ABSORBANCE", "RESOLUTION": "4",
                                "SAMPLING PROCEDURE": "ATR"}, xs, ys, ["Synthetic spectrum for tests; not a measurement."])
            (base / "spectra").mkdir(parents=True, exist_ok=True)
            (base / "spectra" / f"{sid}-base.checkir.001.jdx").write_text(text, encoding="utf-8")
            dump(base / "spectra" / f"{sid}-base.checkir.001.json", spectrum(sid, text, xs, ys))
            dump(base / "datasheet" / "datasheet.json", datasheet(sid))
            for lang in ("it", "en"):
                (base / "datasheet" / f"texts.{lang}.md").write_text(texts(lang), encoding="utf-8")


if __name__ == "__main__":
    main()
