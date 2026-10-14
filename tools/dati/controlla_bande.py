"""Checks of the band data under data/bands/ beyond the JSON Schemas: references, sources, widths, status, texts, wording, privacy.

    python3 tools/dati/controlla_bande.py [DATA_DIR]      # default: data/ ; one line per problem, exit 1 if any

Files: rules.json (bands/2), groups.json, modes.json, regions.json, texts.<lang>.json (band-texts/1), substance-bands/*.json (substance-bands/2).
Checks: schema (each message names the rule, group, mode or region, not just an index); every cited id exists (group, mode, rule, class, source);
at least one source per rule; window at least 10 cm-1 wide unless the group family is artifact; ATR widening of strong bands applied;
diagnostic_for only from status verified_spectra (checked on at least two opaque spectrum ids); every text key
exists in every language and no key is orphan; forbidden reassuring words (also "fentanyl-free", "negative result", "purity", "ok to use", "green
light" and their Italian equivalents); no personal data and no forbidden private names (NOMI_VIETATI) in any string.
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import controlla_dati  # noqa: E402
import valida_schemi  # noqa: E402

LANGUAGES = ("it", "en")
LEVELS = ("counsellor", "chemist")
ATR_SHIFT_CM1 = 10
EXTRA_FORBIDDEN = re.compile(
    r"\b(senza fentanil\w*|fentanyl[- ]free|negativ[oi]|purezza|purity|ok da usare|ok to use|okay to use|via libera|green light)\b"
    r"|\b(negative|negativa) (result|sample|test|risultato|campione)\b|\b(result|sample|test) (is |was )?negative\b", re.I)
POINTER = re.compile(r"^/([a-z_]+)/(\d+)((?:/[^:]*)?): (.*)$", re.S)
ITEM_NAME = {"rules": "rule", "groups": "group", "modes": "mode", "regions": "region", "bands": "band"}


def load(path: Path) -> object:
    return json.loads(path.read_text(encoding="utf-8"))


def name_errors(label: str, data: dict, messages: list[str]) -> list[str]:
    """Schema messages with the id of the offending rule, group, mode or region in front of the JSON pointer."""
    out = []
    for m in messages:
        hit = POINTER.match(m)
        items = data.get(hit.group(1)) if hit else None
        if hit and isinstance(items, list) and int(hit.group(2)) < len(items):
            item = items[int(hit.group(2))]
            who = item.get("id") or f"position {item.get('position_cm1', hit.group(2))}"
            out.append(f"{label}: {ITEM_NAME.get(hit.group(1), 'item')} '{who}' (/{hit.group(1)}/{hit.group(2)}{hit.group(3)}): {hit.group(4)}")
        else:
            out.append(f"{label}: {m}")
    return out


def load_checked(root: Path, problems: list[str]) -> dict:
    """Parse every band file and validate it against its schema; returns {relative name: data}."""
    files: dict[str, dict] = {}
    base = root / "bands"
    paths = [base / n for n in ("rules.json", "groups.json", "modes.json", "regions.json")]
    paths += sorted(base.glob("texts.*.json")) + sorted((base / "substance-bands").glob("*.json"))
    for path in paths:
        label = path.relative_to(root).as_posix()
        if not path.is_file():
            problems.append(f"{label}: missing")
            continue
        try:
            data = load(path)
        except ValueError as e:
            problems.append(f"{label}: cannot read as JSON: {e}")
            continue
        errors = valida_schemi.check_data(data)
        problems += name_errors(label, data, errors) if isinstance(data, dict) else errors
        if not errors:
            files[label] = data
    return files


def check_groups_modes_regions(files: dict, ids: dict, sources: set[str]) -> list[str]:
    out = []
    groups = {g["id"]: g for g in files.get("bands/groups.json", {}).get("groups", [])}
    modes = {m["id"]: m for m in files.get("bands/modes.json", {}).get("modes", [])}
    ids["groups"], ids["modes"] = groups, modes
    for gid, g in groups.items():
        if "parent" in g and g["parent"] not in groups:
            out.append(f"bands/groups.json: group '{gid}' has an unknown parent '{g['parent']}'")
        seen, cur = {gid}, g.get("parent")
        while cur in groups:
            if cur in seen:
                out.append(f"bands/groups.json: group '{gid}' is in a parent cycle")
                break
            seen.add(cur)
            cur = groups[cur].get("parent")
    for mid, m in modes.items():
        out += [f"bands/modes.json: mode '{mid}' lists an unknown example group '{x}'" for x in m["example_groups"] if x not in groups]
        if m["definition_key"] != f"modes.{mid}.definition":
            out.append(f"bands/modes.json: mode '{mid}' has definition_key '{m['definition_key']}', expected modes.{mid}.definition")
    for r in files.get("bands/regions.json", {}).get("regions", []):
        out += [f"bands/regions.json: region '{r['id']}' cites an unknown source '{s}'" for s in r["sources"] if s not in sources]
        if r["range_cm1"]["min"] >= r["range_cm1"]["max"]:
            out.append(f"bands/regions.json: region '{r['id']}' has min >= max")
    for label, d in (("bands/groups.json", "groups"), ("bands/modes.json", "modes"), ("bands/regions.json", "regions")):
        listed = [x["id"] for x in files.get(label, {}).get(d, [])]
        out += [f"{label}: duplicate id '{i}'" for i in sorted({i for i in listed if listed.count(i) > 1})]
    return out


def check_rule(r: dict, ctx: dict) -> list[str]:
    who = f"bands/rules.json: rule '{r['id']}'"
    out = []
    groups, modes = ctx["groups"], ctx["modes"]
    if r["group"] not in groups:
        out.append(f"{who}: unknown group '{r['group']}'")
    if r["mode"] not in modes:
        out.append(f"{who}: unknown mode '{r['mode']}'")
    if not r["sources"]:
        out.append(f"{who}: no source (every rule needs at least one)")
    out += [f"{who}: unknown source '{s}'" for s in r["sources"] if s not in ctx["sources"]]
    lo, hi = r["range_cm1"]["min"], r["range_cm1"]["max"]
    artifact = groups.get(r["group"], {}).get("family") == "artifact"
    if lo >= hi or (hi - lo < 10 and not artifact):
        out.append(f"{who}: window {lo}-{hi} cm-1 is narrower than 10 cm-1 (only artifacts may be)")
    if r["intensity"] == "strong" and not artifact:
        lit = r.get("range_literature_cm1")
        if not lit or lit["max"] != hi or lo != max(400, lit["min"] - ATR_SHIFT_CM1):
            out.append(f"{who}: a strong band needs the ATR widening of {ATR_SHIFT_CM1} cm-1 on the lower limit (tools/dati/genera_bande.py does it)")
    elif "range_literature_cm1" in r:
        out.append(f"{who}: range_literature_cm1 is only for widened strong bands")
    for c in r.get("diagnostic_for", []):
        if c["class"] not in ctx["classes"]:
            out.append(f"{who}: diagnostic_for names an unknown class '{c['class']}'")
        if r["status"] == "literature":
            out.append(f"{who}: diagnostic_for needs status verified_spectra, found literature")
    if r["status"] != "literature" and len(r.get("verified_on", [])) < 2:
        out.append(f"{who}: status {r['status']} needs at least two spectra in verified_on")
    return out


def check_rules(files: dict, ctx: dict) -> list[str]:
    rules = files.get("bands/rules.json", {}).get("rules", [])
    ids = [r["id"] for r in rules]
    ctx["rules"] = set(ids)
    ctx["windows"] = {r["id"]: r["range_cm1"] for r in rules}
    out = [f"bands/rules.json: duplicate rule id '{i}'" for i in sorted({i for i in ids if ids.count(i) > 1})]
    for r in rules:
        out += check_rule(r, ctx)
        refs = [("false_friends", x) for x in r.get("false_friends", [])]
        refs += [(k, x) for k, v in r.get("conditions", {}).items() for x in v]
        out += [f"bands/rules.json: rule '{r['id']}': {k} cites unknown rule '{x}'" for k, x in refs if x not in ctx["rules"]]
        out += [f"bands/rules.json: rule '{r['id']}': {k} cites itself" for k, x in refs if x == r["id"]]
    return out


def check_substance_bands(files: dict, ctx: dict) -> tuple[list[str], set[str]]:
    out: list[str] = []
    keys: set[str] = set()
    for label, doc in files.items():
        if not label.startswith("bands/substance-bands/"):
            continue
        for b in doc["bands"]:
            who = f"{label}: band at {b['position_cm1']} cm-1"
            if b["group"] not in ctx["groups"] or b["mode"] not in ctx["modes"]:
                out.append(f"{who}: unknown group '{b['group']}' or mode '{b['mode']}'")
            if "rule_id" in b and b["rule_id"] not in ctx["rules"]:
                out.append(f"{who}: unknown rule_id '{b['rule_id']}'")
            win = ctx["windows"].get(b.get("rule_id", ""))
            if win and not win["min"] - b["tolerance_cm1"] <= b["position_cm1"] <= win["max"] + b["tolerance_cm1"]:
                out.append(f"{who}: lies outside the window {win['min']}-{win['max']} of its rule '{b['rule_id']}'")
            out += [f"{who}: unknown source '{s}'" for s in b["sources"] if s not in ctx["sources"]]
            if b["status"] != "literature" and len(b.get("verified_on", [])) < 2:
                out.append(f"{who}: status {b['status']} needs at least two spectra in verified_on")
            if "text_key" in b:
                keys.add(b["text_key"])
        positions = [b["position_cm1"] for b in doc["bands"]]
        out += [f"{label}: position {p} cm-1 appears twice" for p in sorted({p for p in positions if positions.count(p) > 1})]
    return out, keys


def expected_keys(files: dict, extra: set[str]) -> tuple[set[str], set[str]]:
    """(required keys, optional keys): counsellor and chemist per rule, definition per mode, name and short per region."""
    required = set(extra)
    optional = set()
    for r in files.get("bands/rules.json", {}).get("rules", []):
        required |= {f"bands.{r['id']}.{lv}" for lv in LEVELS}
        optional.add(f"bands.{r['id']}.teaching")
    required |= {m["definition_key"] for m in files.get("bands/modes.json", {}).get("modes", [])}
    for r in files.get("bands/regions.json", {}).get("regions", []):
        required |= {f"regions.{r['id']}.name", f"regions.{r['id']}.short"}
    return required, optional


def check_texts(files: dict, extra: set[str]) -> list[str]:
    out: list[str] = []
    required, optional = expected_keys(files, extra)
    texts = {lang: files[f"bands/texts.{lang}.json"]["texts"] for lang in LANGUAGES if f"bands/texts.{lang}.json" in files}
    for lang in LANGUAGES:
        if lang not in texts:
            out.append(f"bands/texts.{lang}.json: missing or invalid (every key must exist in every language)")
    for lang, tx in texts.items():
        if files[f"bands/texts.{lang}.json"]["language"] != lang:
            out.append(f"bands/texts.{lang}.json: the language field does not match the file name")
        out += [f"bands/texts.{lang}.json: key '{k}' is missing" for k in sorted(required - set(tx))]
        out += [f"bands/texts.{lang}.json: key '{k}' belongs to no rule, mode, region or assignment" for k in sorted(set(tx) - required - optional)]
    if len(texts) == 2:
        a, b = texts["it"], texts["en"]
        out += [f"bands/texts: key '{k}' exists in {'it' if k in a else 'en'} but not in {'en' if k in a else 'it'}" for k in sorted(set(a) ^ set(b))]
    return out


def check_wording(files: dict, forbidden: list[re.Pattern[str]]) -> list[str]:
    out = []
    for label, doc in files.items():
        if label.startswith("bands/texts."):
            lines = [(f": key '{k}'", v) for k, v in doc["texts"].items()]
        else:
            lines = [("", s) for s in controlla_dati.strings(doc)]
        out += controlla_dati.personal(label, lines, forbidden)
        for where, text in lines:
            masked = controlla_dati.ALLOWED_PHRASES.sub(" ", text)
            for rx in (controlla_dati.FORBIDDEN, EXTRA_FORBIDDEN):
                hit = rx.search(masked)
                if hit:
                    out.append(f"{label}{where}: forbidden word '{hit.group(0)}' (the program never says a sample is safe, pure, clean, negative or free of something)")
    return out


def reference_ids(root: Path) -> dict:
    sources = {s["id"] for s in load(root / "sources.json")["sources"]}
    classes = {c["id"] for c in load(root / "classes.json")["classes"]}
    return {"sources": sources, "classes": classes}


def check_bands(root: Path) -> list[str]:
    problems: list[str] = []
    files = load_checked(root, problems)
    if problems:
        return problems
    ctx = reference_ids(root)
    problems += check_groups_modes_regions(files, ctx, ctx["sources"])
    problems += check_rules(files, ctx)
    sub, keys = check_substance_bands(files, ctx)
    problems += sub + check_texts(files, keys) + check_wording(files, controlla_dati.forbidden_names())
    return problems


def main(argv: list[str]) -> int:
    root = Path(argv[0]) if argv else Path(__file__).resolve().parent.parent.parent / "data"
    problems = check_bands(root)
    for p in problems:
        print(p)
    print("OK" if not problems else f"{len(problems)} problem(s)")
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
