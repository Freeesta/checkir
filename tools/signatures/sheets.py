"""Pure helpers for substance sheets: sections, who signs them, which sections a change touched, date arithmetic."""
from __future__ import annotations

import calendar
import json
import re
from datetime import date

SECTIONS = ("molecule", "category", "effects", "doses", "risks", "interactions", "sources", "license")
# Roles that must sign a changed section (docs/agenti/dati.md): health texts need a health professional, chemistry a chemist.
REQUIRED_ROLES = {
    "molecule": ("chemist",),
    "category": ("chemist",),
    "effects": ("health",),
    "doses": ("health",),
    "risks": ("health",),
    "interactions": ("health",),
    "sources": (),
    "license": (),
}
# Data fields of datasheet.json that belong to a signed section; every other field is metadata.
FIELD_SECTION = {"doses": "doses", "show_doses": "doses", "timings": "effects", "interactions": "interactions"}
METADATA_FIELDS = ("schema", "substance", "version", "section_state", "reviewers", "reviewed", "review_by", "authors", "ai_assisted")
RENEWAL_FIELDS = ("version", "reviewed", "review_by", "reviewers")

SHEET_PATH = re.compile(r"^data/substances/([a-z0-9]+(?:-[a-z0-9]+)*)/datasheet/(datasheet\.json|texts\.([a-z]{2,3})\.md)$")
HEADING = re.compile(r"^## (\S+)\s*$")
DATE = re.compile(r"^[0-9]{4}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$")
SAFE_ID = re.compile(r"^[A-Za-z0-9._-]{1,64}$")


def parse_date(text) -> date | None:
    if not isinstance(text, str) or not DATE.match(text):
        return None
    try:
        return date.fromisoformat(text)
    except ValueError:
        return None


def add_months(day: date, months: int) -> date:
    index = day.year * 12 + day.month - 1 + months
    year, month = divmod(index, 12)
    return date(year, month + 1, min(day.day, calendar.monthrange(year, month + 1)[1]))


def parse_sections(text: str | None) -> dict[str, str]:
    """Split a texts.<lang>.md file by its `## key` headings; text before the first heading is kept under ''."""
    out: dict[str, list[str]] = {}
    key = ""
    for line in (text or "").splitlines():
        match = HEADING.match(line)
        if match:
            key = match.group(1)
            out.setdefault(key, [])
        else:
            out.setdefault(key, []).append(line)
    return {k: "\n".join(v).strip() for k, v in out.items() if k or "\n".join(v).strip()}


def text_touched(base: str | None, head: str | None) -> set[str]:
    """Section keys (possibly unknown, '' for text outside any section) whose text differs between two versions."""
    before, after = parse_sections(base), parse_sections(head)
    return {k for k in set(before) | set(after) if before.get(k) != after.get(k)}


def load_sheet(text: str | None):
    """(document or None, error flag): None without error when the file does not exist."""
    if text is None:
        return None, False
    try:
        doc = json.loads(text)
    except ValueError:
        return None, True
    return (doc, False) if isinstance(doc, dict) else (None, True)


def data_touched(base: dict | None, head: dict) -> set[str]:
    """Signed sections whose data fields changed in datasheet.json."""
    base = base or {}
    return {section for field, section in FIELD_SECTION.items() if base.get(field) != head.get(field)}


def is_renewal(base: dict | None, head: dict, texts_changed: bool) -> bool:
    """A renewal changes no text and no data: only version, dates and the signature list."""
    if base is None or texts_changed:
        return False
    keys = (set(base) | set(head)) - set(RENEWAL_FIELDS)
    return all(base.get(k) == head.get(k) for k in keys)


def section_states(doc: dict | None) -> dict:
    states = (doc or {}).get("section_state")
    return states if isinstance(states, dict) else {}
