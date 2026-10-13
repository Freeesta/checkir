"""Rules of the `signatures` check: who must have approved a pull request that changes a substance sheet.

Only metadata and file contents read through the API are used; nothing of the pull request is executed or interpolated.
The reviewers list is always read at the BASE commit, so a pull request cannot add its own author to it.
A finding is `(key, params)`; the keys are short English identifiers and every param is validated before it is printed.
"""
from __future__ import annotations

import json
from datetime import date, timedelta

import sheets as sh

Finding = tuple[str, dict]


def month_index(month: str) -> int:
    year, mon = month.split("-")
    return int(year) * 12 + int(mon)


def reviewer_valid(reviewer: dict, today: date) -> bool:
    """Active and not expired: `expires` (YYYY-MM) is valid through the end of that month."""
    expires = reviewer.get("expires")
    if reviewer.get("status") != "active" or not isinstance(expires, str) or len(expires) != 7:
        return False
    return month_index(expires) >= today.year * 12 + today.month


def commit_authors(pr: dict, commits: list[dict]) -> set[str]:
    """Logins that wrote the proposal: the pull request author and every commit author or committer (not the web UI itself)."""
    names = {((pr.get("user") or {}).get("login") or "").lower()}
    for commit in commits:
        for key in ("author", "committer"):
            names.add(((commit.get(key) or {}).get("login") or "").lower())
    names.discard("")
    names.discard("web-flow")
    return names


def valid_approvers(pr: dict, reviews: list[dict], commits: list[dict], listed: dict, today: date) -> dict[str, dict]:
    """login (lower case) -> reviewer record, for people whose LATEST decisive review is an approval of the head commit."""
    head = (pr.get("head") or {}).get("sha")
    excluded = commit_authors(pr, commits)
    last: dict[str, dict] = {}
    for review in reviews:
        login = ((review.get("user") or {}).get("login") or "").lower()
        if login and review.get("state") in ("APPROVED", "CHANGES_REQUESTED", "DISMISSED"):
            last[login] = review
    out = {}
    for login, review in last.items():
        reviewer = listed.get(login)
        if review.get("state") == "APPROVED" and review.get("commit_id") == head and login not in excluded \
                and reviewer and reviewer_valid(reviewer, today):
            out[login] = reviewer
    return out


def reviewers_by_login(doc: dict | None) -> dict[str, dict]:
    items = doc.get("reviewers") if isinstance(doc, dict) else None
    return {str(r["github"]).lower(): r for r in items or [] if isinstance(r, dict) and "github" in r}


def group_sheets(files: list[dict]) -> dict[str, dict]:
    """substance id -> {'json': bool, 'texts': {lang: status}} for the sheet files of the pull request."""
    out: dict[str, dict] = {}
    for item in files:
        match = sh.SHEET_PATH.match(item.get("filename", ""))
        if not match:
            continue
        entry = out.setdefault(match.group(1), {"json": False, "texts": {}})
        if match.group(3):
            entry["texts"][match.group(3)] = item.get("status")
        else:
            entry["json"] = True
    return out


def sheet_texts(client, sid: str, info: dict) -> tuple[set[str], list[Finding]]:
    """Section keys whose text changed in any language, plus findings for text outside the fixed sections."""
    touched: set[str] = set()
    found: list[Finding] = []
    for lang in info["texts"]:
        path = f"data/substances/{sid}/datasheet/texts.{lang}.md"
        changed = sh.text_touched(client.file_at(path, "base"), client.file_at(path, "head"))
        if "" in changed:
            found.append(("sheet.text_outside_section", {"substance": sid, "lang": lang}))
        for key in changed - {""}:
            if key in sh.SECTIONS:
                touched.add(key)
            else:
                found.append(("sheet.unknown_section", {"substance": sid, "lang": lang}))
    return touched, found


def date_findings(sid: str, head: dict, base: dict | None, today: date) -> list[Finding]:
    reviewed, due = sh.parse_date(head.get("reviewed")), sh.parse_date(head.get("review_by"))
    if reviewed is None or due is None:
        return [("sheet.bad_date", {"substance": sid})]
    found: list[Finding] = []
    if reviewed > today + timedelta(days=1):
        found.append(("sheet.reviewed_in_future", {"substance": sid}))
    if due <= reviewed or due > sh.add_months(reviewed, 24):
        found.append(("sheet.review_due_out_of_range", {"substance": sid}))
    before = sh.parse_date((base or {}).get("reviewed"))
    if before and reviewed < before:
        found.append(("sheet.reviewed_went_back", {"substance": sid}))
    return found


def new_entries(base: dict | None, head: dict) -> list[dict]:
    old = {json.dumps(e, sort_keys=True) for e in (base or {}).get("reviewers") or []}
    return [e for e in head.get("reviewers") or [] if isinstance(e, dict) and json.dumps(e, sort_keys=True) not in old]


def may_sign(role: str, section: str) -> bool:
    required = sh.REQUIRED_ROLES.get(section)
    return required is not None and (not required or role in required)


def entry_findings(sid: str, entries: list[dict], approvers: dict[str, dict], reviewed: str | None) -> list[Finding]:
    """Every new signature in the JSON needs a valid approval by a person of that name and role."""
    found: list[Finding] = []
    for entry in entries:
        role, name = entry.get("role"), str(entry.get("public_name", "")).casefold()
        sections = entry.get("sections") if isinstance(entry.get("sections"), list) else []
        if not any(r.get("public_name", "").casefold() == name and role in r.get("roles", []) for r in approvers.values()):
            found.append(("signatures.signature_without_approval", {"substance": sid, "role": role}))
        if not all(may_sign(role, s) for s in sections):
            found.append(("signatures.role_cannot_sign", {"substance": sid, "role": role}))
        if entry.get("date") != reviewed:
            found.append(("signatures.signature_date_mismatch", {"substance": sid, "role": role}))
    return found


def coverage_findings(sid: str, need: set[tuple[str, str]], entries: list[dict], approvers: dict[str, dict]) -> list[Finding]:
    """need: pairs (section, role) that must be approved AND listed in a new signature entry ('' = renewal, any section)."""
    found: list[Finding] = []
    for section, role in sorted(need):
        params = {"substance": sid, "section": section or "renewal", "role": role}
        if not any(role in r.get("roles", []) for r in approvers.values()):
            found.append(("signatures.missing_approval", params))
        elif not any(e.get("role") == role and (not section or section in (e.get("sections") or [])) for e in entries):
            found.append(("signatures.signature_not_listed", params))
    return found
