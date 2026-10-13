"""Checks of the substance sheets (datasheet/1) and family sheets (family-sheet/1) beyond the JSON Schemas.

Used by controlla_dati.py. Section order and signing roles, a source on every claim, no sheet-wide `secondary`-only health claim,
the words of a synthesis in `origin`, counselling points = paragraphs, cuts that exist, show_doses false where it must be,
and the same paragraphs and citations in every language.
"""
from __future__ import annotations

import json
import re
from pathlib import Path

SECTIONS = ["molecule", "category", "history", "origin", "metabolism", "cuts", "effects", "doses", "risks", "interactions", "counselling", "sources", "license"]
REQUIRED = ["molecule", "category", "effects", "doses", "risks", "interactions", "sources", "license"]
FAMILY_SECTIONS = ["effects", "risks", "interactions", "counselling", "sources", "license"]
CLAIM_SECTIONS = {s for s in SECTIONS if s not in ("sources", "license")}
HEALTH_SECTIONS = {"effects", "doses", "risks", "interactions", "counselling"}
ROLE_OF = {s: "chemist" for s in ("molecule", "category", "history", "origin", "metabolism", "cuts")} | {s: "health" for s in HEALTH_SECTIONS}
LIMITS = {"molecule": 2400, "counselling": 1500}  # characters of a section per language; every other section 1200
DEFAULT_LIMIT = 1200
NO_DOSES_CLASSES = {"fentanyls", "nitazenes", "nbome"}
NO_DOSES_SUBSTANCES = {"ghb", "gbl", "isopropyl-u-47700"}
SYNTHESIS = re.compile(
    r"°\s?C|\b\d+(?:[.,]\d+)?\s?(?:mL|ml|g|mg|mol|M|h|min)\b|\b(?:riflusso|reflux|resa|yield|aggiungere|add|gocciolare|dropwise|filtrare|filter|"
    r"ricristallizzare|recrystalli[sz]e|step|procedura|procedure)\b", re.I)
USER_REPORTED = re.compile(r"user[- ]reported|riferit[aeio] dagli utenti|segnalat[aeio] dagli utenti", re.I)
FORBIDDEN_HEAD = re.compile(r"^## (\S+)\s*$", re.M)


def parse(text: str) -> dict[str, list[str]]:
    """Section key -> paragraphs of a texts.<lang>.md file."""
    out: dict[str, list[str]] = {}
    for block in re.split(r"^## ", text, flags=re.M)[1:]:
        name, _, body = block.partition("\n")
        out[name.strip()] = [p.strip() for p in re.split(r"\n\s*\n", body) if p.strip()]
    return out


def check_headings(label: str, text: str, allowed: list[str], required: list[str]) -> list[str]:
    heads = re.findall(r"^## (\S+)\s*$", text, re.M)
    in_order = [h for h in allowed if h in heads]
    if heads != in_order or any(r not in heads for r in required):
        return [f"{label}: section headings must be {required} plus any of {allowed}, in this order, found {heads}"]
    return []


def check_sections(label: str, text: str, allowed: list[str], required: list[str], source_ids: set[str], tiers: dict[str, str | None]) -> list[str]:
    out = check_headings(label, text, allowed, required)
    for name, paras in parse(text).items():
        limit = LIMITS.get(name, DEFAULT_LIMIT)
        if sum(len(p) for p in paras) > limit:
            out.append(f"{label}: section '{name}' is longer than {limit} characters")
        for para in paras:
            refs = re.findall(r"\[f:([a-z0-9-]+)\]", para)
            if name in CLAIM_SECTIONS and not refs:
                out.append(f"{label}: section '{name}' has a statement without a source [f:id]: '{para[:50]}'")
            out += [f"{label}: unknown source id '{r}'" for r in refs if r not in source_ids]
            if name in HEALTH_SECTIONS and refs and all(tiers.get(r) == "secondary" for r in refs if r in source_ids):
                out.append(f"{label}: a statement in '{name}' cites only secondary sources: '{para[:50]}'")
            if name == "origin":
                masked = re.sub(r"\d[\d.,]*\s?cm-1", " ", para)
                out += [f"{label}: section 'origin' has a word of a synthesis ('{m.group(0)}'); describe classes of precursors only" for m in SYNTHESIS.finditer(masked)]
    return out


def check_parity(folder: Path, allowed: list[str]) -> list[str]:
    """Every language has the same paragraphs, with the same citations in the same order."""
    docs = {tp.name: parse(tp.read_text(encoding="utf-8")) for tp in sorted(folder.glob("texts.*.md"))}
    if len(docs) < 2:
        return []
    names = sorted(docs)
    base = docs["texts.en.md"] if "texts.en.md" in docs else docs[names[0]]
    out = []
    for n in names:
        for sec in allowed:
            a, b = base.get(sec, []), docs[n].get(sec, [])
            cite = lambda ps: [re.findall(r"\[f:[a-z0-9-]+\]", p) for p in ps]  # noqa: E731
            if len(a) != len(b) or (sec != "license" and cite(a) != cite(b)):
                out.append(f"{folder / n}: section '{sec}' differs from the English text in paragraphs or citations")
    return out


def check_signatures(label: str, sheet: dict) -> list[str]:
    out = []
    state = sheet["section_state"]
    signed: dict[str, set[str]] = {}
    for r in sheet["reviewers"]:
        for s in r["sections"]:
            need = ROLE_OF.get(s)
            if need and r["role"] != need:
                out.append(f"{label}: reviewer '{r['public_name']}' ({r['role']}) cannot sign '{s}' (needs {need})")
            signed.setdefault(s, set()).add(r["role"])
    for s, v in state.items():
        need = ROLE_OF.get(s)
        if v == "approved" and need and need not in signed.get(s, set()):
            out.append(f"{label}: section '{s}' is approved without a signature by a {need}")
    return out


def check_sheet_data(label: str, sheet: dict, texts: dict[str, dict[str, list[str]]], ctx: dict, sub: dict | None) -> list[str]:
    out = check_signatures(label, sheet)
    for lang, secs in texts.items():
        present = set(secs)
        extra = set(sheet["section_state"]) - present
        out += [f"{label}: section_state has '{s}' but texts.{lang}.md has no such section" for s in sorted(extra)]
        out += [f"{label}: texts.{lang}.md has section '{s}' without a section_state" for s in sorted(present - set(sheet["section_state"]))]
        points = sheet.get("counselling", [])
        if points and len(secs.get("counselling", [])) != len(points):
            out.append(f"{label}: texts.{lang}.md has {len(secs.get('counselling', []))} counselling paragraphs for {len(points)} points")
        if any(d["evidence_type"] == "user_reported" for d in sheet.get("doses", [])) and not USER_REPORTED.search(" ".join(secs.get("doses", []))):
            out.append(f"{label}: texts.{lang}.md must say in the doses section that the doses are user-reported")
    known = ctx.get("cut_ids", set())
    out += [f"{label}: cut '{c['cut']}' is neither in tagli.json nor a substance" for c in sheet.get("cuts", []) if c["cut"] not in known]
    srcs = ctx["sources"]
    refs = [x["source"] for k in ("cuts", "counselling", "interactions", "doses", "timings") for x in sheet.get(k, [])]
    refs += [x["source"] for x in sheet.get("origin", {}).get("typical_impurities", [])]
    refs += [x["source"] for k in ("pathways", "metabolites") for x in sheet.get("metabolism", {}).get(k, [])]
    if sheet.get("metabolism", {}).get("half_life_h"):
        refs.append(sheet["metabolism"]["half_life_h"]["source"])
    out += [f"{label}: unknown source '{r}'" for r in sorted(set(refs)) if r not in srcs]
    if sub is not None:
        classes = set(sub["classes"].get("chemical", []))
        if (classes & NO_DOSES_CLASSES or sheet["substance"] in NO_DOSES_SUBSTANCES) and sheet.get("show_doses"):
            out.append(f"{label}: show_doses must be false for this substance (potent class or GHB/GBL)")
        for form in sheet.get("identity_extra", {}).get("salt_forms", []):
            if form not in ctx["forms"]:
                out.append(f"{label}: salt form '{form}' is not a form of any substance")
        if sheet.get("structure_svg") and not (Path(label).parent.parent / "structure.svg").is_file():
            out.append(f"{label}: structure_svg is true but structure.svg is missing (run tools/dati/genera_strutture.py)")
    h = sheet.get("metabolism", {}).get("half_life_h")
    if h and h["min"] > h["max"]:
        out.append(f"{label}: half_life_h min is greater than max")
    return out


def check_families(root: Path, ctx: dict, wording) -> list[str]:
    out: list[str] = []
    base = root / "families"
    if not base.is_dir():
        return out
    import valida_schemi  # noqa: PLC0415
    for fj in sorted(base.glob("*/family.json")):
        errs = valida_schemi.check_file(fj)
        out += errs
        if errs:
            continue
        fam = json.loads(fj.read_text(encoding="utf-8"))
        if fam["id"] != fj.parent.name:
            out.append(f"{fj}: id '{fam['id']}' differs from the folder name")
        if fam["id"] not in ctx["classes"]:
            out.append(f"{fj}: family id '{fam['id']}' is not a class in classes.json")
        out += check_signatures(str(fj), fam)
        texts = {}
        for tp in sorted(fj.parent.glob("texts.*.md")):
            text = tp.read_text(encoding="utf-8")
            out += check_sections(str(tp), text, FAMILY_SECTIONS, FAMILY_SECTIONS, ctx["sources"], ctx["tiers"]) + wording(str(tp), text)
            texts[tp.name] = parse(text)
        if not (fj.parent / "texts.en.md").is_file():
            out.append(f"{fj.parent}: texts.en.md is required")
        out += check_parity(fj.parent, FAMILY_SECTIONS)
    return out
