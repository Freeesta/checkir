"""Tests of the review-deadline issues with a fake API and fixed dates: `python3 -m unittest discover -s tools/signatures -p 'test_*.py'`."""
import json
import tempfile
import unittest
from datetime import date
from pathlib import Path

import expiry as ex

TODAY = date(2026, 10, 13)


def item(substance, due, approved=("effects",)):
    return {"substance": substance, "review_by": date.fromisoformat(due), "approved": list(approved)}


class FakeIssues:
    """Open issues kept in memory, changed by `run` exactly as the real client would change them."""

    def __init__(self):
        self.issues: list[dict] = []
        self.next = 1

    def run(self, items, today):
        actions = ex.plan(items, self.issues, today)
        for a in actions:
            if a["op"] == "create":
                self.issues.append({"number": self.next, "title": a["title"], "body": a["body"], "labels": list(a["labels"])})
                self.next += 1
            elif a["op"] == "update":
                found = next(i for i in self.issues if i["number"] == a["number"])
                found.update(body=a["body"], labels=list(a["labels"]))
            else:
                self.issues = [i for i in self.issues if i["number"] != a["number"]]
        return actions


class Expiry(unittest.TestCase):
    def test_states_on_fixed_dates(self):
        self.assertIsNone(ex.state_of(date(2026, 11, 13), TODAY))
        self.assertEqual(ex.state_of(date(2026, 11, 12), TODAY), ex.EXPIRING)
        self.assertEqual(ex.state_of(date(2026, 10, 13), TODAY), ex.EXPIRING)
        self.assertEqual(ex.state_of(date(2026, 10, 12), TODAY), ex.EXPIRED)

    def test_second_run_creates_no_duplicate(self):
        api = FakeIssues()
        items = [item("caffeine", "2026-10-20"), item("lactose", "2026-09-01"), item("mannitol", "2028-01-01")]
        self.assertEqual([a["op"] for a in api.run(items, TODAY)], ["create", "create"])
        self.assertEqual(api.run(items, TODAY), [])
        self.assertEqual(sorted(i["title"] for i in api.issues), ["review due/expired: caffeine", "review due/expired: lactose"])

    def test_issue_goes_from_expiring_to_expired_in_place(self):
        api = FakeIssues()
        items = [item("caffeine", "2026-10-20")]
        api.run(items, TODAY)
        self.assertEqual(api.issues[0]["labels"], ["expiring", "needs-review"])
        self.assertEqual([a["op"] for a in api.run(items, date(2026, 10, 21))], ["update"])
        self.assertEqual(len(api.issues), 1)
        self.assertEqual(sorted(api.issues[0]["labels"]), ["expired", "needs-review"])
        self.assertEqual(api.run(items, date(2026, 10, 22)), [])

    def test_other_labels_are_kept(self):
        api = FakeIssues()
        api.run([item("caffeine", "2026-10-20")], TODAY)
        api.issues[0]["labels"].append("urgent")
        api.run([item("caffeine", "2026-10-20")], TODAY)
        self.assertIn("urgent", api.issues[0]["labels"])

    def test_renewed_sheet_closes_its_issue(self):
        api = FakeIssues()
        api.run([item("caffeine", "2026-10-20")], TODAY)
        actions = api.run([item("caffeine", "2028-10-12")], TODAY)
        self.assertEqual([a["op"] for a in actions], ["close"])
        self.assertEqual(api.issues, [])

    def test_unrelated_issues_are_never_touched(self):
        issues = [{"number": 5, "title": "something else", "body": "", "labels": ["expired"]}]
        self.assertEqual(ex.plan([], issues, TODAY), [])

    def test_existing_duplicates_update_only_the_oldest(self):
        title = ex.PREFIX + "caffeine"
        issues = [{"number": 9, "title": title, "body": "x", "labels": ["expiring"]}, {"number": 4, "title": title, "body": "x", "labels": ["expiring"]}]
        actions = ex.plan([item("caffeine", "2026-10-20")], issues, TODAY)
        self.assertEqual([(a["op"], a["number"]) for a in actions], [("update", 4)])

    def test_load_sheets_reads_deadlines_and_skips_broken_files(self):
        with tempfile.TemporaryDirectory() as tmp:
            docs = {"a": json.dumps({"substance": "a", "review_by": "2026-10-20", "section_state": {"effects": "approved", "doses": "draft"}}),
                    "b": "{"}
            for sid, text in docs.items():
                folder = Path(tmp) / "data" / "substances" / sid / "datasheet"
                folder.mkdir(parents=True)
                (folder / "datasheet.json").write_text(text, encoding="utf-8")
            loaded = ex.load_sheets(Path(tmp))
        self.assertEqual([(s["substance"], s["approved"]) for s in loaded], [("a", ["effects"])])


if __name__ == "__main__":
    unittest.main()
