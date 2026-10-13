"""Checks of the theory section (web/teoria/): the same chapters, keys and numbers in it and en; references that exist; length limits.

  - the two languages have the same chapters (n, id, slug), the same figure and interactive ids, the same label keys, the same items,
    tables of the same shape, the same glossary ids, the same sources, further reading and glossary terms;
  - every id in `sources`, `further_reading`, `glossary_terms`, `see_also` and every link [[id|text]] exists (fonti.json, glossary);
  - key message <= 25 words, text for everyone <= 120 words, box for chemists <= 250 words (links count as their text);
  - the label keys that the code of an interactive reads (`L.key` in spring.js, modes.js, dipole.js) exist in every language;
  - no text reassures (the words of tools/check_words.py), in any language;
  - a published link of fonti.json is https and its licence is stated (or the source is a project source).

    python3 tools/controlla_teoria.py            # also called by controlla_lingue.py
Only the standard library.
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(Path(__file__).resolve().parent))
from check_words import hits  # noqa: E402

LANGS = ("it", "en")
LINK = re.compile(r"\[\[([a-z0-9-]+)\|([^\]]+)\]\]")
LIMITS = {"key_message": 25, "body": 120, "for_chemists": 250}


def words(text: str) -> int:
    return len(LINK.sub(r"\2", text).split())


def strings(node: object) -> list[str]:
    """Every string of a JSON value (for the word check)."""
    if isinstance(node, str):
        return [node]
    if isinstance(node, list):
        return [s for x in node for s in strings(x)]
    if isinstance(node, dict):
        return [s for k, v in node.items() if k not in ("id", "slug", "schema", "lang", "status", "params") for s in strings(v)]
    return []


def load(web: Path, lang: str, name: str) -> dict:
    return json.loads((web / lang / name).read_text(encoding="utf-8"))


def shape(ch: dict) -> dict:
    """What must be equal in the two languages."""
    fig, inter = ch["figure"], ch.get("interactive")
    return {
        "n": ch["n"], "id": ch["id"], "figure": fig["id"], "labels": sorted(fig.get("labels", {})),
        "table": [len(fig["data_table"]["columns"]), len(fig["data_table"]["rows"])] if "data_table" in fig else None,
        "interactive": None if inter is None else [inter["id"], sorted(inter["labels"]), [(i["id"], i.get("params")) for i in inter.get("items", [])]],
        "paragraphs": [len(ch["body"]), len(ch["for_chemists"])],
        "refs": [ch["sources"], ch["further_reading"], ch["glossary_terms"], ch["status"]],
        "links": sorted({m[0] for m in LINK.findall(" ".join(ch["body"] + ch["for_chemists"]))}),
    }


def problems(web: Path = ROOT / "web" / "teoria") -> list[str]:
    out: list[str] = []
    if not web.is_dir():
        return out
    sources = {s["id"]: s for s in json.loads((web / "fonti.json").read_text(encoding="utf-8"))["sources"]}
    for s in sources.values():
        if s["type"] != "project" and not s.get("license"):
            out.append(f"fonti.json: {s['id']} has no licence")
        if "url" in s and not s["url"].startswith("https://"):
            out.append(f"fonti.json: {s['id']} link is not https")
    index = {lang: load(web, lang, "indice.json")["chapters"] for lang in LANGS}
    gloss = {lang: {e["id"]: e for e in load(web, lang, "glossario.json")["entries"]} for lang in LANGS}
    if [(c["n"], c["id"], c["slug"]) for c in index["it"]] != [(c["n"], c["id"], c["slug"]) for c in index["en"]]:
        out.append("indice.json: the chapters differ between it and en")
    if set(gloss["it"]) != set(gloss["en"]):
        out.append(f"glossario.json: ids differ between it and en: {sorted(set(gloss['it']) ^ set(gloss['en']))}")
    for lang in LANGS:
        for e in gloss[lang].values():
            out += [f"{lang}/glossario.json: {e['id']} sees an unknown term {s}" for s in e["see_also"] if s not in gloss[lang]]
            out += [f"{lang}/glossario.json: {e['id']}: {w}" for w in hits(lang, e["definition"] + " " + e["term"])]
            if sorted(e["see_also"]) != sorted(gloss["it"].get(e["id"], e)["see_also"]):
                out.append(f"glossario.json: see_also of {e['id']} differs between it and en")
    shapes: dict[str, dict[str, dict]] = {}
    for lang in LANGS:
        for entry in index[lang]:
            ch = load(web, lang, entry["slug"] + ".json")
            where = f"{lang}/{entry['slug']}.json"
            shapes.setdefault(entry["slug"], {})[lang] = shape(ch)
            if (ch["n"], ch["id"]) != (entry["n"], entry["id"]) or ch["title"] != entry["title"]:
                out.append(f"{where}: n, id or title differ from indice.json")
            for key in LIMITS:
                total = sum(words(p) for p in ch[key]) if isinstance(ch[key], list) else words(ch[key])
                if total > LIMITS[key]:
                    out.append(f"{where}: {key} has {total} words (limit {LIMITS[key]})")
            ids = [("sources", i) for i in ch["sources"] + ch["further_reading"]]
            out += [f"{where}: unknown source {i}" for _, i in ids if i not in sources]
            out += [f"{where}: unknown glossary term {i}" for i in ch["glossary_terms"] if i not in gloss[lang]]
            text = " ".join(ch["body"] + ch["for_chemists"])
            out += [f"{where}: link to an unknown term {m[0]}" for m in LINK.findall(text) if m[0] not in gloss[lang]]
            out += [f"{where}: {w}" for s in strings(ch) for w in hits(lang, s)]
            inter = ch.get("interactive")
            if inter:
                code = (web / f"{inter['id']}.js").read_text(encoding="utf-8")
                used = set(re.findall(r"\b(?:L|spec\.labels)\.([a-z_0-9]+)", code))
                out += [f"{where}: {inter['id']}.js reads the label {k}, which the chapter does not define" for k in sorted(used - set(inter["labels"]))]
    for slug, by in shapes.items():
        if len(by) == 2 and by["it"] != by["en"]:
            diff = [k for k in by["it"] if by["it"][k] != by["en"][k]]
            out.append(f"{slug}: it and en differ in {diff}")
    return out


def main() -> int:
    found = problems()
    for p in found:
        print("FAIL teoria: " + p)
    print(f"theory section: {len(found)} problem(s)")
    return 1 if found else 0


if __name__ == "__main__":
    sys.exit(main())
