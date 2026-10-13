"""Validates open-data JSON files against the schemas in docs/schemi/ (JSON Schema draft 2020-12).

The schema of a file is named by its own "schema" field ("ftir-substance/1" -> docs/schemi/ftir-substance-1.json).
Every error names the file, the JSON pointer of the offending field and what is wrong with it.

    python3 tools/dati/valida_schemi.py FILE...        # validate files
    python3 tools/dati/valida_schemi.py --schemi       # check that the schemas themselves are valid and documented (it + en)
    python3 tools/dati/valida_schemi.py --fixture      # valid fixtures must pass, invalid ones must fail naming the field

Needs `jsonschema` (version pinned in tools/dati/requirements.txt).
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

from jsonschema import Draft202012Validator

ROOT = Path(__file__).resolve().parent.parent.parent
SCHEMAS = ROOT / "docs" / "schemi"
FIXTURES = ROOT / "tests" / "fixture" / "schemi"


def load_schema(name: str) -> dict:
    """`name` is the value of the "schema" field, e.g. "ftir-spectrum/1"."""
    path = SCHEMAS / (name.replace("/", "-") + ".json")
    if not path.is_file():
        raise FileNotFoundError(f"unknown schema '{name}' (expected {path.relative_to(ROOT)})")
    return json.loads(path.read_text(encoding="utf-8"))


def check_data(data: object) -> list[str]:
    """Error messages for one parsed document; each starts with the JSON pointer of the field."""
    if not isinstance(data, dict) or not isinstance(data.get("schema"), str):
        return ["/schema: the document must be an object with a string field 'schema' such as 'ftir-substance/1'"]
    try:
        schema = load_schema(data["schema"])
    except FileNotFoundError as e:
        return [f"/schema: {e}"]
    errors = sorted(Draft202012Validator(schema).iter_errors(data), key=lambda e: [str(p) for p in e.absolute_path])
    return ["/" + "/".join(str(p) for p in e.absolute_path) + f": {e.message}" for e in errors]


def check_file(path: Path) -> list[str]:
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError) as e:
        return [f"{path}: cannot read as JSON: {e}"]
    return [f"{path}: {m}" for m in check_data(data)]


def undocumented(node: object, where: str = "") -> list[str]:
    """Every property (not the partial overrides inside if/then) needs both `description` and `description_it`."""
    bad: list[str] = []
    if isinstance(node, dict):
        for key, sub in node.get("properties", {}).items():
            if not (isinstance(sub, dict) and sub.get("description") and sub.get("description_it")):
                bad.append(f"{where}/{key}")
            bad += undocumented(sub, f"{where}/{key}")
        bad += undocumented(node.get("items"), where)
    return bad


def check_schemas() -> list[str]:
    out: list[str] = []
    for path in sorted(SCHEMAS.glob("*.json")):
        schema = json.loads(path.read_text(encoding="utf-8"))
        try:
            Draft202012Validator.check_schema(schema)
        except Exception as e:  # noqa: BLE001 - report any metaschema failure with the file name
            out.append(f"{path.name}: not a valid draft 2020-12 schema: {e}")
        out += [f"{path.name}: {p} lacks description or description_it" for p in undocumented(schema)]
        if schema.get("properties", {}).get("schema", {}).get("const", "").replace("/", "-") + ".json" != path.name:
            out.append(f"{path.name}: its 'schema' const does not match the file name")
    return out


def check_fixtures() -> list[str]:
    out: list[str] = []
    expected = json.loads((FIXTURES / "attesi.json").read_text(encoding="utf-8"))
    for path in sorted(FIXTURES.glob("*/valid/*.json")):
        out += [f"valid fixture rejected: {m}" for m in check_file(path)]
    seen = set()
    for path in sorted(FIXTURES.glob("*/invalid/*.json")):
        key = path.relative_to(FIXTURES).as_posix()
        seen.add(key)
        errors = check_file(path)
        if not errors:
            out.append(f"invalid fixture accepted: {key}")
        elif key not in expected:
            out.append(f"invalid fixture without expectation in attesi.json: {key}")
        elif not any(expected[key] in e for e in errors):
            out.append(f"{key}: no message names '{expected[key]}': {errors}")
    out += [f"attesi.json lists a missing fixture: {k}" for k in expected if k != "_comment" and k not in seen]
    out += check_theory_content()
    return out


def check_theory_content() -> list[str]:
    """The real files of the theory section (chapters, indices, glossaries, sources) follow their schemas."""
    files = sorted(p for lang in ("it", "en") for p in (ROOT / "web" / "teoria" / lang).glob("*.json")) + [ROOT / "web" / "teoria" / "fonti.json"]
    return [m for path in files if path.is_file() for m in check_file(path)]


def main(argv: list[str]) -> int:
    if argv == ["--schemi"]:
        problems = check_schemas()
    elif argv == ["--fixture"]:
        problems = check_fixtures()
    elif argv and not argv[0].startswith("--"):
        problems = [m for a in argv for m in check_file(Path(a))]
    else:
        print(__doc__)
        return 2
    for p in problems:
        print(p)
    print("OK" if not problems else f"{len(problems)} problem(s)")
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
