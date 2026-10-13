"""Review deadlines of the substance sheets: which sheets are expiring or expired, and what to do with their issues.

`plan` is pure: it takes the sheets and the open issues and returns actions (create, update, close), so a second run over
the same state returns nothing. The issue body holds no day counts, only dates, so it does not change from night to night.
"""
from __future__ import annotations

import json
from datetime import date, timedelta
from pathlib import Path

import sheets as sh

WARN_DAYS = 30
EXPIRING, EXPIRED, NEEDS = "expiring", "expired", "needs-review"
STATE_LABELS = (EXPIRING, EXPIRED)
PREFIX = "review due/expired: "


def load_sheets(root: Path) -> list[dict]:
    """Every data/substances/<id>/datasheet/datasheet.json as {'substance', 'review_by', 'approved'}; unreadable ones are skipped."""
    out = []
    for path in sorted(root.glob("data/substances/*/datasheet/datasheet.json")):
        try:
            doc = json.loads(path.read_text(encoding="utf-8"))
        except ValueError:
            continue
        due = sh.parse_date(doc.get("review_by")) if isinstance(doc, dict) else None
        if due is None or not isinstance(doc.get("substance"), str):
            continue
        states = sh.section_states(doc)
        out.append({"substance": doc["substance"], "review_by": due, "approved": [s for s in sh.SECTIONS if states.get(s) == "approved"]})
    return out


def state_of(review_by: date, today: date) -> str | None:
    if review_by < today:
        return EXPIRED
    return EXPIRING if review_by <= today + timedelta(days=WARN_DAYS) else None


def body_of(item: dict, state: str) -> str:
    sections = ", ".join(item["approved"]) or "none"
    return (f"Substance: {item['substance']}\nReview deadline: {item['review_by'].isoformat()}\nState: {state}\n"
            f"Approved sections that need a new signature: {sections}\n\n"
            "A pull request that only renews the dates needs the signature of a health reviewer; "
            "if the deadline passes, the site shows the texts with a warning and hides the dose table.\n"
            "Automatic issue of the nightly run: it is updated, not duplicated, and closed when the sheet is renewed.")


def plan(items: list[dict], issues: list[dict], today: date) -> list[dict]:
    """Actions to bring the open issues in line with the sheets. `issues`: open issues with `number`, `title`, `body`, `labels` (names)."""
    by_title: dict[str, dict] = {}
    for issue in sorted(issues, key=lambda i: i["number"]):
        by_title.setdefault(issue["title"], issue)
    actions: list[dict] = []
    due_titles = set()
    for item in items:
        state = state_of(item["review_by"], today)
        title = PREFIX + item["substance"]
        if state is None:
            continue
        due_titles.add(title)
        body, issue = body_of(item, state), by_title.get(title)
        if issue is None:
            actions.append({"op": "create", "title": title, "body": body, "labels": [state, NEEDS]})
            continue
        labels = sorted({l for l in issue["labels"] if l not in STATE_LABELS} | {state, NEEDS})
        if body != issue.get("body") or labels != sorted(issue["labels"]):
            actions.append({"op": "update", "number": issue["number"], "body": body, "labels": labels})
    for title, issue in by_title.items():
        if title.startswith(PREFIX) and title not in due_titles:
            actions.append({"op": "close", "number": issue["number"]})
    return actions
