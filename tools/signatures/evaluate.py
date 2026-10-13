"""Evaluation of one pull request against the sheet signature rules (see check.py for the individual rules)."""
from __future__ import annotations

from datetime import date

import check as ck
import sheets as sh

Finding = ck.Finding


def evaluate(client, today: date) -> list[Finding]:
    """All findings for the pull request behind `client`; an empty list means the check passes."""
    groups = ck.group_sheets(client.files())
    if not groups:
        return []
    pr = client.pr()
    listed = ck.reviewers_by_login(sh.load_sheet(client.file_at("data/reviewers.json", "base"))[0])
    approvers = ck.valid_approvers(pr, client.reviews(), client.commits(), listed, today)
    found: list[ck.Finding] = []
    for sid in sorted(groups):
        found += evaluate_sheet(client, sid, groups[sid], approvers, today)
    return found


def evaluate_sheet(client, sid: str, info: dict, approvers: dict, today: date) -> list[Finding]:
    base_doc, bad_base = sh.load_sheet(client.file_at(f"data/substances/{sid}/datasheet/datasheet.json", "base"))
    head_doc, bad_head = sh.load_sheet(client.file_at(f"data/substances/{sid}/datasheet/datasheet.json", "head"))
    if bad_base or bad_head:
        return [("sheet.invalid_json", {"substance": sid})]
    if head_doc is None:
        return [("sheet.missing_datasheet", {"substance": sid})]
    text_sections, found = ck.sheet_texts(client, sid, info)
    touched = text_sections | sh.data_touched(base_doc, head_doc)
    draft_only = draft_only_change(touched, base_doc, head_doc)
    found += version_findings(sid, base_doc, head_doc, draft_only) + ck.date_findings(sid, head_doc, base_doc, today)
    entries = ck.new_entries(base_doc, head_doc)
    found += ck.entry_findings(sid, entries, approvers, head_doc.get("reviewed"))
    renewal = sh.is_renewal(base_doc, head_doc, bool(info["texts"]))
    if renewal:
        need = {("", "health")}
        if head_doc.get("reviewed") == (base_doc or {}).get("reviewed"):
            found.append(("signatures.renewal_not_dated", {"substance": sid}))
    else:
        need = required_pairs(touched, base_doc, head_doc)
    return found + ck.coverage_findings(sid, need, entries, approvers)


def draft_only_change(touched: set[str], base: dict | None, head: dict) -> bool:
    """True when an existing sheet changed only sections that are `draft` both before and after: nothing signed is rewritten, so no new version is due."""
    if base is None or not touched:
        return False
    before, after = sh.section_states(base), sh.section_states(head)
    return all(before.get(s) != "approved" and after.get(s) != "approved" for s in touched)


def version_findings(sid: str, base: dict | None, head: dict, draft_only: bool = False) -> list[Finding]:
    """Normally version = base + 1; a draft-only change may also keep it (a bump is allowed and is not a renewal, since text or data changed)."""
    expected = 1 if base is None else (base.get("version") or 0) + 1
    if draft_only and head.get("version") in (expected - 1, expected):
        return []
    if head.get("version") != expected:
        return [("sheet.version_not_incremented", {"substance": sid})]
    return []


def required_pairs(touched: set[str], base: dict | None, head: dict) -> set[tuple[str, str]]:
    """(section, role) pairs that need a signature: changed sections that the new version publishes as approved."""
    before, after = sh.section_states(base), sh.section_states(head)
    promoted = {s for s in sh.SECTIONS if after.get(s) == "approved" and before.get(s) != "approved"}
    return {(s, role) for s in (touched | promoted) if after.get(s) == "approved" for role in sh.REQUIRED_ROLES.get(s, ())}
