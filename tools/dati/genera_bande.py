"""Builds data/bands/*.json from the source tables bande_regole.py, bande_testi_a.py, bande_testi_b.py and bande_didattica.py.

    python3 tools/dati/genera_bande.py            # write data/bands/{rules,groups,modes,regions}.json and texts.{it,en}.json
    python3 tools/dati/genera_bande.py --verifica # exit 1 if the files on disk differ from what the tables generate

The generated files are never edited by hand. Automatic step: the lower limit of every strong band is moved 10 cm-1 down (ATR shift of strong
bands, up to -14 cm-1 in the literature) and the window given by the sources is kept in range_literature_cm1.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import bande_didattica  # noqa: E402
import bande_regole as T  # noqa: E402
import bande_sostanze  # noqa: E402
import bande_sostanze_testi  # noqa: E402
import bande_testi_a  # noqa: E402
import bande_testi_b  # noqa: E402
import bande_verifiche as V  # noqa: E402

OUT = Path(__file__).resolve().parent.parent.parent / "data" / "bands"
VERSION = "2026-10.1"
INTENSITY = {"F": "strong", "M": "medium", "d": "weak", "v": "variable"}
SHAPE = {"s": "sharp", "m": "medium", "L": "broad", "mL": "very_broad", "2": "doublet", "n": "multiplet"}
SUB_INTENSITY = {"s": "strong", "m": "medium", "w": "weak", "v": "variable"}
SUB_SHAPE = {"s": "sharp", "m": "medium", "b": "broad", "B": "very_broad"}
ATR_SHIFT_CM1 = 10
LEVELS = ("counsellor", "chemist")


def rule(row: tuple) -> dict:
    rid, lo, hi, group, mode, bond, inten, shape, requires, excludes, friends, sources = row
    r: dict = {"id": rid, "version": 1, "range_cm1": {"min": lo, "max": hi}}
    if INTENSITY[inten] == "strong" and group != "artifact_co2":
        r["range_cm1"]["min"] = max(400, lo - ATR_SHIFT_CM1)
        r["range_literature_cm1"] = {"min": lo, "max": hi}
    r.update(group=group, mode=mode, bond=bond, intensity=INTENSITY[inten], shape=SHAPE[shape])
    if rid in T.CAND_ONLY:
        r["scope"] = "candidate_only"
    cond = {k: v for k, v in (("requires_any", requires), ("excludes", excludes)) if v}
    if cond:
        r["conditions"] = cond
    if friends:
        r["false_friends"] = friends
    r.update(sources=sources.split(), status="draft")
    if rid in V.VERIFIED:
        cls, strength, spectra = V.VERIFIED[rid]
        r.update(status="verified_spectra", diagnostic_for=[{"class": cls, "strength": strength}], verified_on=sorted(spectra))
    return r


def groups() -> list[dict]:
    out = []
    for gid, parent, it, en, hint, family in T.GROUPS:
        g = {"id": gid, **({"parent": parent} if parent else {}), "names": {"it": it, "en": en}, "formula_hint": hint, "family": family}
        out.append(g)
    return out


def modes() -> list[dict]:
    return [{"id": m, "names": {"it": it, "en": en}, "kind": kind, "symmetry": sym, "in_plane": plane,
             "definition_key": f"modes.{m}.definition", "animation": anim, "example_groups": ex}
            for m, it, en, kind, sym, plane, anim, ex in T.MODES]


def regions() -> list[dict]:
    return [{"id": i, "range_cm1": {"min": lo, "max": hi}, "family": fam, "sources": src.split()} for i, lo, hi, fam, src in T.REGIONS]


def texts() -> dict[str, dict[str, str]]:
    both = {**bande_testi_a.TESTI_A, **bande_testi_b.TESTI_B}
    out: dict[str, dict[str, str]] = {"it": {}, "en": {}}
    for rid, (c_it, c_en, k_it, k_en) in both.items():
        out["it"][f"bands.{rid}.counsellor"], out["en"][f"bands.{rid}.counsellor"] = c_it, c_en
        out["it"][f"bands.{rid}.chemist"], out["en"][f"bands.{rid}.chemist"] = k_it, k_en
    for rid, (it, en) in bande_didattica.TEACHING.items():
        out["it"][f"bands.{rid}.teaching"], out["en"][f"bands.{rid}.teaching"] = it, en
    for mid, (it, en) in bande_didattica.MODES_TXT.items():
        out["it"][f"modes.{mid}.definition"], out["en"][f"modes.{mid}.definition"] = it, en
    for gid, (n_it, n_en, s_it, s_en) in bande_didattica.REGIONS_TXT.items():
        out["it"][f"regions.{gid}.name"], out["en"][f"regions.{gid}.name"] = n_it, n_en
        out["it"][f"regions.{gid}.short"], out["en"][f"regions.{gid}.short"] = s_it, s_en
    for (sub, form, pos), (it, en) in bande_sostanze_testi.TEXTS.items():
        out["it"][text_key(sub, form, pos)], out["en"][text_key(sub, form, pos)] = it, en
    return out


def text_key(substance: str, form: str, position: int) -> str:
    return "substance_bands." + f"{substance}.{form}.{position}".replace("-", "_")


def band(rules: dict, d: dict, b: tuple) -> dict:
    pos, tol, inten, shape, rid, group, mode, sources, measured = b
    if rid:
        group, mode = group or rules[rid]["group"], mode or rules[rid]["mode"]
    spectra = list(d["spectra"]) if measured else []
    verified = len(spectra) >= 2
    out = {"position_cm1": pos, "tolerance_cm1": tol, "intensity": SUB_INTENSITY[inten], "shape": SUB_SHAPE[shape], "group": group, "mode": mode}
    if rid:
        out["rule_id"] = rid
    if (d["substance"], d["form"], pos) in bande_sostanze_testi.TEXTS:
        out["text_key"] = text_key(d["substance"], d["form"], pos)
    out.update(sources=list(sources), status="verified_spectra" if verified else "draft")
    if spectra:
        out["verified_on"] = sorted(spectra)
    return out


def substance_files() -> dict[str, str]:
    rules = {r[0]: rule(r) for r in T.RULES}
    files = {}
    for d in bande_sostanze.SUBSTANCES:
        doc = {"schema": "substance-bands/1", "version": VERSION, "substance": d["substance"], "form": d["form"], "note": d["note"],
               "bands": [band(rules, d, b) for b in d["bands"]]}
        body = ",\n".join("  " + json.dumps(b, ensure_ascii=False, separators=(", ", ": ")) for b in doc.pop("bands"))
        head = json.dumps(doc, ensure_ascii=False, indent=1)[:-2]
        files[f"substance-bands/{d['substance']}-{d['form']}.json"] = f'{head},\n "bands": [\n{body}\n ]\n}}\n'
    return files


def line_per_item(schema: str, key: str, items: list[dict]) -> str:
    body = ",\n".join("  " + json.dumps(i, ensure_ascii=False, separators=(", ", ": ")) for i in items)
    return f'{{\n "schema": "{schema}",\n "version": "{VERSION}",\n "{key}": [\n{body}\n ]\n}}\n'


def build() -> dict[str, str]:
    files = {
        "rules.json": line_per_item("bands/1", "rules", [rule(r) for r in T.RULES]),
        "groups.json": line_per_item("groups/1", "groups", groups()),
        "modes.json": json.dumps({"schema": "modes/1", "version": VERSION, "modes": modes()}, ensure_ascii=False, indent=1) + "\n",
        "regions.json": line_per_item("regions/1", "regions", regions()),
    }
    files.update(substance_files())
    for lang, tx in texts().items():
        body = ",\n".join(f"  {json.dumps(k)}: {json.dumps(v, ensure_ascii=False)}" for k, v in sorted(tx.items()))
        files[f"texts.{lang}.json"] = f'{{\n "schema": "band-texts/1",\n "version": "{VERSION}",\n "language": "{lang}",\n "texts": {{\n{body}\n }}\n}}\n'
    return files


def main(argv: list[str]) -> int:
    files = build()
    if argv == ["--verifica"]:
        stale = [n for n, c in files.items() if not (OUT / n).is_file() or (OUT / n).read_text(encoding="utf-8") != c]
        for n in stale:
            print(f"data/bands/{n} differs from the tables: run tools/dati/genera_bande.py")
        extra = [p.name for p in (OUT / "substance-bands").glob("*.json") if f"substance-bands/{p.name}" not in files]
        for n in extra:
            print(f"data/bands/substance-bands/{n} belongs to no table: remove it or add it to bande_sostanze.py")
        return 1 if stale or extra else 0
    (OUT / "substance-bands").mkdir(parents=True, exist_ok=True)
    for n, c in files.items():
        (OUT / n).write_text(c, encoding="utf-8")
    print("written", ", ".join(files))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
