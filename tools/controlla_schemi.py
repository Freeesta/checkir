"""T3 - privacy of the data schemas in docs/schemi/ (rule R3, R6).

  - no property is named like personal data (name, surname, email, phone, address, tax code, birth, age, gender, ip, lat, lon,
    coordinates, notes, free comment; English and Italian). A justified exception goes in EXCEPTIONS, with the reason;
  - every object with `properties` is closed (`additionalProperties: false`), every free map has a typed value schema, so an
    unexpected field such as `email` is rejected by name (conditional fragments inside if/then/anyOf are not objects of the data);
  - a property that holds the date of a measurement or of a sampling has the month format YYYY-MM (never the day).

    python3 tools/controlla_schemi.py [DIR]      # DIR defaults to docs/schemi

Only standard library.
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
FORBIDDEN = {
    "name", "first_name", "last_name", "full_name", "surname", "nome", "cognome",
    "email", "e_mail", "phone", "telephone", "mobile", "telefono", "cellulare",
    "address", "indirizzo", "tax_code", "fiscal_code", "codice_fiscale", "document_number",
    "birth", "birth_date", "birthdate", "date_of_birth", "nascita", "data_nascita",
    "age", "eta", "gender", "sex", "genere", "sesso",
    "ip", "ip_address", "lat", "lon", "lng", "latitude", "longitude", "coordinates", "coordinate", "location", "luogo",
    "note", "notes", "comment", "comments", "commento", "free_text", "testo_libero",
}
MEASUREMENT_DATES = {
    "measured", "acquired", "acquisition_date", "measurement_date", "scan_date", "sampled", "sampling_date",
    "collected", "collected_at", "datetime", "timestamp", "created", "created_at",
}
MONTH = "^[0-9]{4}-(0[1-9]|1[0-2])$"
# (schema file, pointer of the property) -> why it is not personal data
EXCEPTIONS = {
    ("ftir-library-1.json", "/name"): "id of the library (a lowercase slug), not a person",
    ("ftir-spectrum-1.json", "/library/name"): "id of the library (a lowercase slug), not a person",
    ("ftir-form-1.json", "/notes"): "reviewed text about the chemical form, per language; no person",
}


def _norm(name: str) -> str:
    return re.sub(r"[^a-z]+", "_", name.lower()).strip("_")


def _walk(node: object, file: str, ptr: str, out: list[str]) -> None:
    if not isinstance(node, dict):
        return
    props = node.get("properties")
    if isinstance(props, dict):
        if node.get("additionalProperties") is not False:
            out.append(f"{file}: {ptr or '/'}: object with properties must set additionalProperties: false")
        for name, sub in props.items():
            where = f"{ptr}/{name}"
            if _norm(name) in FORBIDDEN and (file, where) not in EXCEPTIONS:
                out.append(f"{file}: {where}: property name '{name}' looks like personal data")
            if _norm(name) in MEASUREMENT_DATES and not (isinstance(sub, dict) and sub.get("pattern") == MONTH):
                out.append(f"{file}: {where}: a date of measurement must have the pattern {MONTH} (year and month)")
            _walk(sub, file, where, out)
    elif node.get("type") == "object" and "patternProperties" not in node:
        if not isinstance(node.get("additionalProperties"), dict):
            out.append(f"{file}: {ptr or '/'}: free object without a typed value schema")
    for key in ("items", "additionalProperties"):
        _walk(node.get(key), file, ptr, out)
    for sub in (node.get("$defs") or {}).values():
        _walk(sub, file, ptr, out)


def problems(schema: dict, file: str) -> list[str]:
    out: list[str] = []
    _walk(schema, file, "", out)
    return out


def check_dir(directory: Path) -> list[str]:
    out: list[str] = []
    files = sorted(directory.glob("*.json"))
    for path in files:
        out += problems(json.loads(path.read_text(encoding="utf-8")), path.name)
    names = {p.name for p in files}
    out += [f"EXCEPTIONS lists a missing schema: {f}" for f, _ in EXCEPTIONS if f not in names] if directory == ROOT / "docs" / "schemi" else []
    return out


def main(argv: list[str]) -> int:
    directory = Path(argv[0]) if argv else ROOT / "docs" / "schemi"
    found = check_dir(directory)
    for p in found:
        print(p)
    print("OK" if not found else f"{len(found)} problem(s)")
    return 1 if found else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
