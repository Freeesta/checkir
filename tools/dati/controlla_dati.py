"""Checks of the open data under data/ beyond the JSON Schemas: references, uniqueness, files, quality, privacy, wording.

    python3 tools/dati/controlla_dati.py [DATA_DIR]      # default: data/ ; prints one line per problem, exit 1 if any

Checks: schema of every JSON; id = folder name; unique ids and InChIKeys (compounds); references (form -> substance, spectrum -> form,
class, source, relation and alert targets); .jdx/.json coherence and SHA-256; quality metrics equal to the recomputed ones and no
failing criterion; no unconfirmed samples; no personal fields (regular expressions + the secret list NOMI_VIETATI) in JCAMP and JSON;
datasheet texts: fixed section keys, a source on every claim in the health sections, forbidden reassuring words, review deadline.
"""
from __future__ import annotations

import json
import os
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import jcamp  # noqa: E402
import qualita  # noqa: E402
import valida_schemi  # noqa: E402

SECTIONS = ["molecule", "category", "effects", "doses", "risks", "interactions", "sources", "license"]
CLAIM_SECTIONS = {"effects", "doses", "risks", "interactions"}
FORBIDDEN = re.compile(r"\b(sicur[oaie]|pur[oaie]|pulit[oaie]|innocu[oaie]|nessun rischio|safe|pure|clean|harmless)\b", re.I)
ALLOWED_PHRASES = re.compile(r"nessuna dose è sicura|no dose is safe|sostanza pura|pure substance", re.I)
PERSONAL = [
    (re.compile(r"\b(serial|seriale|s/n|sn)\b\s*(number|no\.?|nr\.?|numero)?\s*[:=#]?\s*[A-Za-z0-9-]{4,}", re.I), "possible serial number"),
    (re.compile(r"\b[A-Za-z]:\\|/home/|/Users/|\\Users\\"), "file path"),
    (re.compile(r"[\w.+-]+@[\w-]+\.[\w.]+"), "e-mail address"),
    (re.compile(r"\b(operator|operatore|analyst|analista|owner)\b\s*[:=]", re.I), "operator or owner field"),
]
FAIL_ON = "fail"


def load(path: Path) -> object:
    return json.loads(path.read_text(encoding="utf-8"))


def strings(node: object):
    if isinstance(node, str):
        yield node
    elif isinstance(node, dict):
        for k, v in node.items():
            yield from strings(k)
            yield from strings(v)
    elif isinstance(node, list):
        for v in node:
            yield from strings(v)


def personal(label: str, lines: list[tuple[str, str]], forbidden: list[re.Pattern[str]]) -> list[str]:
    out = []
    for where, text in lines:
        for rx, what in PERSONAL:
            if rx.search(text):
                out.append(f"{label}{where}: {what} ('{text.strip()[:60]}'): personal data must not be in open data")
        out += [f"{label}{where}: matches a forbidden private name" for rx in forbidden if rx.search(text)]
    return out


def forbidden_names() -> list[re.Pattern[str]]:
    sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
    import controlla_nomi  # noqa: PLC0415 - tools/controlla_nomi.py
    return controlla_nomi.compile_patterns(os.environ.get("NOMI_VIETATI", ""))


def check_texts(label: str, path: Path, source_ids: set[str]) -> list[str]:
    out = []
    text = path.read_text(encoding="utf-8")
    heads = re.findall(r"^## (\S+)\s*$", text, re.M)
    if heads != SECTIONS:
        out.append(f"{label}: section headings must be exactly {SECTIONS} in this order, found {heads}")
    for m in FORBIDDEN.finditer(ALLOWED_PHRASES.sub(" ", text)):
        out.append(f"{label}: forbidden reassuring word '{m.group(0)}' (the program never says a sample is safe, pure or clean)")
    for block in re.split(r"^## ", text, flags=re.M)[1:]:
        name, _, body = block.partition("\n")
        for para in [p.strip() for p in re.split(r"\n\s*\n", body) if p.strip()]:
            refs = re.findall(r"\[f:([a-z0-9-]+)\]", para)
            if name.strip() in CLAIM_SECTIONS and not refs:
                out.append(f"{label}: section '{name.strip()}' has a statement without a source [f:id]: '{para[:50]}'")
            out += [f"{label}: unknown source id '{r}'" for r in refs if r not in source_ids]
    return out


def check_sheet(label: str, sheet: dict) -> list[str]:
    out = []
    y, m, d = (int(x) for x in sheet["reviewed"].split("-"))
    ry, rm, rd = (int(x) for x in sheet["review_by"].split("-"))
    if (ry - y) * 12 + (rm - m) + (1 if rd > d else 0) > 24:
        out.append(f"{label}: review_by is more than 24 months after reviewed")
    if "approved" in sheet["section_state"].values() and not sheet["reviewers"]:
        out.append(f"{label}: a section is approved but there are no reviewers")
    return out


def check_spectrum(label: str, jdx: Path, meta_path: Path, meta: dict, forbidden: list[re.Pattern[str]]) -> tuple[list[str], list[float] | None]:
    import hashlib  # noqa: PLC0415
    out: list[str] = []
    raw = jdx.read_bytes()
    text = raw.decode("utf-8", errors="replace")
    out += personal(f"{jdx}", [(f":{n}", t) for n, t in enumerate(text.splitlines(), 1)], forbidden)
    if hashlib.sha256(raw).hexdigest() != meta["sha256"]:
        out.append(f"{meta_path}: sha256 does not match {jdx.name}")
    try:
        j = jcamp.parse(text)
    except ValueError as e:
        return out + [f"{jdx}: not readable JCAMP-DX: {e}"], None
    h = j.headers
    pairs = [("TITLE", h["TITLE"], meta["id"]), ("XUNITS", h["XUNITS"], "1/CM"), ("YUNITS", h["YUNITS"].upper(), meta["y_axis"].upper()),
             ("SAMPLING PROCEDURE", h["SAMPLING PROCEDURE"].upper(), meta["technique"]["method"].upper())]
    out += [f"{jdx}: ##{k}={a} but the .json says {b}" for k, a, b in pairs if a != b]
    try:
        if float(h["RESOLUTION"]) != float(meta["resolution_cm1"]):
            out.append(f"{jdx}: ##RESOLUTION={h['RESOLUTION']} but the .json says {meta['resolution_cm1']}")
    except ValueError:
        out.append(f"{jdx}: ##RESOLUTION is not a number")
    if meta["provenance"]["type"] == "unconfirmed_sample":
        out.append(f"{meta_path}: an unconfirmed sample never enters a library")
    computed = qualita.checks(j, meta)
    stored = {c["criterion"]: c["result"] for c in meta["quality"]["checks"]}
    for crit, res, _ in computed:
        if stored.get(crit) != res:
            out.append(f"{meta_path}: quality '{crit}' is stored as {stored.get(crit)} but the file gives {res}")
        if res == FAIL_ON:
            out.append(f"{jdx}: quality criterion '{crit}' fails (see ARCHITETTO_DATI_2 section 8)")
    return out, j.ys


def collect(root: Path) -> tuple[list[str], dict]:
    problems: list[str] = []
    ctx: dict = {"sources": set(), "classes": {}, "substances": {}, "forms": set()}
    for name in ("sources.json", "classes.json", "aliases.json"):
        problems += valida_schemi.check_file(root / name)
    if problems:
        return problems, ctx
    ctx["sources"] = {s["id"] for s in load(root / "sources.json")["sources"]}
    ctx["classes"] = {c["id"]: c for c in load(root / "classes.json")["classes"]}
    return problems, ctx


def check_data(root: Path) -> list[str]:
    problems, ctx = collect(root)
    if problems:
        return problems
    forbidden = forbidden_names()
    seen_keys: dict[str, str] = {}
    spectra: list[tuple[str, str, list[float]]] = []
    for c in ctx["classes"].values():
        if c["source"] not in ctx["sources"] or ("parent" in c and c["parent"] not in ctx["classes"]):
            problems.append(f"classes.json: class '{c['id']}' has an unknown source or parent")
    for path in sorted((root / "substances").glob("*/substance.json")):
        problems += check_substance(path, root, ctx, forbidden, seen_keys, spectra)
    for a, b in ((x, y) for x in range(len(spectra)) for y in range(x + 1, len(spectra))):
        (ida, suba, ya), (idb, subb, yb) = spectra[a], spectra[b]
        if suba != subb and len(ya) == len(yb) and qualita.correlation(ya, yb) >= 0.98:
            problems.append(f"{ida} and {idb} (different substances) correlate >= 0.98: possible identity error or IR-indistinguishable pair (review; candidate ir_ambiguity alert)")
    for path in sorted((root / "alerts").glob("*.json")) if (root / "alerts").is_dir() else []:
        problems += valida_schemi.check_file(path)
    return problems


def check_substance(path: Path, root: Path, ctx: dict, forbidden: list[re.Pattern[str]], seen_keys: dict, spectra: list) -> list[str]:
    out = valida_schemi.check_file(path)
    if out:
        return out
    sub, folder = load(path), path.parent
    sid = sub["id"]
    if sid != folder.name:
        out.append(f"{path}: id '{sid}' differs from the folder name '{folder.name}'")
    if sub["type"] == "compound":
        if sub["inchikey"] in seen_keys:
            out.append(f"{path}: InChIKey {sub['inchikey']} already used by {seen_keys[sub['inchikey']]}")
        seen_keys[sub["inchikey"]] = sid
    for axis, ids in sub["classes"].items():
        want = {"chemical": "chemical", "effect": "effect", "typical_role": "role"}[axis]
        out += [f"{path}: class '{i}' is unknown or not on the {want} axis" for i in ids if ctx["classes"].get(i, {}).get("axis") != want]
    out += [f"{path}: unknown source '{s['source']}'" for s in sub["sources"] if s["source"] not in ctx["sources"]]
    out += personal(f"{path}", [("", t) for t in strings(sub)], forbidden)
    for fp in sorted(folder.glob("forms/*.json")):
        out += valida_schemi.check_file(fp)
        form = load(fp)
        if form.get("substance") != sid or form.get("id") != fp.stem:
            out.append(f"{fp}: 'substance' must be '{sid}' and 'id' must match the file name")
        ctx["forms"].add(form.get("id"))
    for mp in sorted(folder.glob("spectra/*.json")):
        sp = valida_schemi.check_file(mp)
        out += sp
        if sp:
            continue
        meta = load(mp)
        if meta["id"] != mp.stem or meta["form"] not in ctx["forms"] or not meta["id"].startswith(meta["form"] + "."):
            out.append(f"{mp}: id must match the file name and start with an existing form id")
        community = meta["library"]["name"] in ("checkir-community", "checkir-demo")
        if (meta["license"] == "CC-BY-4.0") != community:
            out.append(f"{mp}: checkir-community and checkir-demo spectra are CC-BY-4.0; a third-party library with written permission uses LicenseRef-permission-<body>")
        jdx = mp.with_suffix(".jdx")
        if not jdx.is_file():
            out.append(f"{mp}: missing {jdx.name}")
            continue
        o, ys = check_spectrum(str(jdx), jdx, mp, meta, forbidden)
        out += o
        out += personal(f"{mp}", [("", t) for t in strings(meta)], forbidden)
        if ys:
            spectra.append((meta["id"], sid, ys))
    out += check_datasheet(folder / "datasheet", ctx, forbidden)
    return out


def check_datasheet(folder: Path, ctx: dict, forbidden: list[re.Pattern[str]]) -> list[str]:
    if not folder.is_dir():
        return []
    out = valida_schemi.check_file(folder / "datasheet.json")
    if out:
        return out
    sheet = load(folder / "datasheet.json")
    out += check_sheet(str(folder / "datasheet.json"), sheet)
    out += personal(str(folder / "datasheet.json"), [("", t) for t in strings(sheet)], forbidden)
    out += [f"{folder / 'datasheet.json'}: forbidden reassuring word '{m.group(0)}'" for t in strings(sheet) for m in FORBIDDEN.finditer(ALLOWED_PHRASES.sub(" ", t))]
    if not (folder / "texts.en.md").is_file():
        out.append(f"{folder}: texts.en.md is required (Italian falls back to English, not the reverse)")
    for tp in sorted(folder.glob("texts.*.md")):
        out += check_texts(str(tp), tp, ctx["sources"])
        out += personal(str(tp), [(f":{n}", t) for n, t in enumerate(tp.read_text(encoding="utf-8").splitlines(), 1)], forbidden)
    return out


def main(argv: list[str]) -> int:
    root = Path(argv[0]) if argv else Path(__file__).resolve().parent.parent.parent / "data"
    problems = check_data(root)
    for p in problems:
        print(p)
    print("OK" if not problems else f"{len(problems)} problem(s)")
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
