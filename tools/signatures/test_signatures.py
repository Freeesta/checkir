"""Tests of the `signatures` rules with synthetic API answers: `python3 -m unittest discover -s tools/signatures -p 'test_*.py'`."""
import copy
import json
import unittest
from datetime import date

import check_signatures as cli
import evaluate as ev
import sheets as sh

TODAY = date(2026, 10, 13)
HEAD, OLD = "h" * 40, "o" * 40
SHEET = "data/substances/caffeine/datasheet/datasheet.json"
TEXTS = "data/substances/caffeine/datasheet/texts.en.md"
ALL_DRAFT = {s: "draft" for s in sh.SECTIONS}
LIST = {"schema": "reviewers/1", "reviewers": [
    {"github": "Chem", "public_name": "Chem Ist", "roles": ["chemist"], "languages": ["en"], "verified": "2026-10", "expires": "2028-10", "status": "active"},
    {"github": "Doc", "public_name": "Doc Tor", "roles": ["health"], "languages": ["en"], "verified": "2026-10", "expires": "2028-10", "status": "active"},
    {"github": "Gone", "public_name": "Gone", "roles": ["health"], "languages": ["en"], "verified": "2024-01", "expires": "2026-01", "status": "active"},
    {"github": "Paused", "public_name": "Paused", "roles": ["health"], "languages": ["en"], "verified": "2026-01", "expires": "2027-01", "status": "suspended"},
]}


def sheet(**over):
    doc = {"schema": "datasheet/1", "substance": "caffeine", "version": 1, "section_state": dict(ALL_DRAFT), "reviewers": [],
           "reviewed": "2026-09-01", "review_by": "2028-08-31", "doses": [], "interactions": [], "show_doses": False,
           "authors": ["x"], "ai_assisted": True}
    doc.update(over)
    return doc


def texts(effects="Old effects. [f:a]"):
    return f"## molecule\nM [f:a]\n\n## effects\n{effects}\n"


def review(login, state="APPROVED", commit=HEAD):
    return {"user": {"login": login}, "state": state, "commit_id": commit}


class Fake:
    """Same methods as GitHubClient, answering from dictionaries."""

    def __init__(self, base, head, reviews=(), author="proposer", commit_users=("proposer",), changed=None, listed=LIST):
        self.base, self.head, self._reviews = base, head, list(reviews)
        self.author, self.commit_users = author, commit_users
        self.changed = changed if changed is not None else sorted(set(base) | set(head))
        self.base["data/reviewers.json"] = json.dumps(listed)
        self.head.setdefault("data/reviewers.json", json.dumps(listed))

    def pr(self):
        return {"user": {"login": self.author}, "head": {"sha": HEAD}, "base": {"sha": "b" * 40}}

    def files(self):
        return [{"filename": f, "status": "modified"} for f in self.changed if f != "data/reviewers.json"]

    def commits(self):
        return [{"author": {"login": u}, "committer": {"login": "web-flow"}} for u in self.commit_users]

    def reviews(self):
        return self._reviews

    def file_at(self, path, side):
        return (self.base if side == "base" else self.head).get(path)


def files(doc, text):
    return {SHEET: json.dumps(doc), TEXTS: text}


def keys(fake):
    return sorted(k for k, _ in ev.evaluate(fake, TODAY))


def signed_head(role="health", name="Doc Tor", sections=("effects",), **over):
    state = dict(ALL_DRAFT, effects="approved")
    entry = {"public_name": name, "role": role, "sections": list(sections), "date": "2026-10-13"}
    return sheet(version=2, section_state=state, reviewers=[entry], reviewed="2026-10-13", review_by="2028-10-12", **over)


def base_approved():
    return files(sheet(section_state=dict(ALL_DRAFT, effects="approved"), reviewers=[]), texts())


class Rules(unittest.TestCase):
    def test_no_sheet_file_passes(self):
        fake = Fake({"README.md": "a"}, {"README.md": "b"})
        self.assertEqual(keys(fake), [])

    def test_health_text_with_health_approval_passes(self):
        fake = Fake(base_approved(), files(signed_head(), texts("New effects. [f:a]")), [review("Doc")])
        self.assertEqual(keys(fake), [])

    def test_missing_approval(self):
        fake = Fake(base_approved(), files(signed_head(), texts("New. [f:a]")), [])
        self.assertEqual(keys(fake), ["signatures.missing_approval", "signatures.signature_without_approval"])

    def test_wrong_role_does_not_count(self):
        fake = Fake(base_approved(), files(signed_head(), texts("New. [f:a]")), [review("Chem")])
        self.assertIn("signatures.missing_approval", keys(fake))

    def test_reviewer_who_wrote_a_commit_does_not_count(self):
        fake = Fake(base_approved(), files(signed_head(), texts("New. [f:a]")), [review("Doc")], commit_users=("proposer", "doc"))
        self.assertIn("signatures.missing_approval", keys(fake))

    def test_pull_request_author_does_not_count(self):
        fake = Fake(base_approved(), files(signed_head(), texts("New. [f:a]")), [review("Doc")], author="Doc")
        self.assertIn("signatures.missing_approval", keys(fake))

    def test_approval_on_an_old_commit_does_not_count(self):
        fake = Fake(base_approved(), files(signed_head(), texts("New. [f:a]")), [review("Doc", commit=OLD)])
        self.assertIn("signatures.missing_approval", keys(fake))

    def test_changes_requested_after_approval_cancels_it(self):
        fake = Fake(base_approved(), files(signed_head(), texts("New. [f:a]")), [review("Doc"), review("Doc", "CHANGES_REQUESTED")])
        self.assertIn("signatures.missing_approval", keys(fake))

    def test_expired_and_suspended_reviewers_do_not_count(self):
        for login in ("Gone", "Paused", "Stranger"):
            fake = Fake(base_approved(), files(signed_head(), texts("New. [f:a]")), [review(login)])
            self.assertIn("signatures.missing_approval", keys(fake), login)

    def test_reviewers_list_is_read_at_base(self):
        head = files(signed_head(), texts("New. [f:a]"))
        head["data/reviewers.json"] = json.dumps(LIST)
        empty = {"schema": "reviewers/1", "reviewers": []}
        fake = Fake(base_approved(), head, [review("Doc")], listed=empty)
        fake.head["data/reviewers.json"] = json.dumps(LIST)
        self.assertIn("signatures.missing_approval", keys(fake))



class Signatures(unittest.TestCase):
    def test_signature_in_json_without_approval(self):
        fake = Fake(base_approved(), files(signed_head(), texts("New. [f:a]")), [review("Chem")])
        self.assertIn("signatures.signature_without_approval", keys(fake))

    def test_signature_with_wrong_name_is_rejected(self):
        fake = Fake(base_approved(), files(signed_head(name="Someone Else"), texts("New. [f:a]")), [review("Doc")])
        self.assertIn("signatures.signature_without_approval", keys(fake))

    def test_role_cannot_sign_section(self):
        head = signed_head(role="chemist", name="Chem Ist")
        fake = Fake(base_approved(), files(head, texts("New. [f:a]")), [review("Chem")])
        self.assertIn("signatures.role_cannot_sign", keys(fake))

    def test_health_section_not_listed_in_json(self):
        head = signed_head()
        head["reviewers"] = []
        fake = Fake(base_approved(), files(head, texts("New. [f:a]")), [review("Doc")])
        self.assertEqual(keys(fake), ["signatures.signature_not_listed"])

    def test_draft_section_needs_no_signature(self):
        base = files(sheet(), texts())
        head = files(sheet(version=2), texts("Edited. [f:a]"))
        self.assertEqual(keys(Fake(base, head)), [])

    def test_ftir_limits_needs_chemist_and_health(self):
        base = files(sheet(), "## ftir_limits\nold\n")
        state = dict(ALL_DRAFT, ftir_limits="approved")
        entries = [{"public_name": "Chem Ist", "role": "chemist", "sections": ["ftir_limits"], "date": "2026-10-13"}]
        head = files(sheet(version=2, section_state=state, reviewers=entries, reviewed="2026-10-13", review_by="2028-10-12"), "## ftir_limits\nnew\n")
        self.assertEqual(keys(Fake(base, head, [review("Chem")])), ["signatures.missing_approval"])

    def test_dose_data_change_is_a_health_change(self):
        base = base_approved()
        base[SHEET] = json.dumps(sheet(section_state=dict(ALL_DRAFT, doses="approved")))
        head_doc = sheet(version=2, section_state=dict(ALL_DRAFT, doses="approved"), show_doses=True)
        fake = Fake(base, files(head_doc, texts()), [], changed=[SHEET])
        self.assertEqual(keys(fake), ["signatures.missing_approval"])

    def test_unknown_section_and_text_outside_sections(self):
        base = files(sheet(), texts())
        head = files(sheet(version=2), "intro\n## invented\nx\n")
        self.assertEqual(keys(Fake(base, head)), ["sheet.text_outside_section", "sheet.unknown_section"])


class Renewal(unittest.TestCase):
    def renewal(self, role="health", name="Doc Tor", **over):
        base = files(sheet(), texts())
        entry = {"public_name": name, "role": role, "sections": ["effects"], "date": "2026-10-13"}
        head_doc = sheet(version=2, reviewers=[entry], reviewed="2026-10-13", review_by="2028-10-12", **over)
        return base, files(head_doc, texts()), [SHEET]

    def test_renewal_needs_only_the_health_signature(self):
        base, head, changed = self.renewal()
        self.assertEqual(keys(Fake(base, head, [review("Doc")], changed=changed)), [])

    def test_renewal_with_chemist_only_fails(self):
        base, head, changed = self.renewal("chemist", "Chem Ist")
        self.assertIn("signatures.missing_approval", keys(Fake(base, head, [review("Chem")], changed=changed)))

    def test_renewal_without_new_date_fails(self):
        base, head, changed = self.renewal()
        doc = json.loads(head[SHEET])
        doc["reviewed"], doc["review_by"] = "2026-09-01", "2028-08-31"
        doc["reviewers"][0]["date"] = "2026-09-01"
        head[SHEET] = json.dumps(doc)
        self.assertIn("signatures.renewal_not_dated", keys(Fake(base, head, [review("Doc")], changed=changed)))


class Metadata(unittest.TestCase):
    def check(self, **over):
        base = files(sheet(), texts())
        head = files(sheet(**{"version": 2, **over}), texts("Edit. [f:a]"))
        return keys(Fake(base, head))

    def test_version_must_go_up_by_one(self):
        self.assertEqual(self.check(version=3), ["sheet.version_not_incremented"])

    def test_review_due_at_most_24_months(self):
        self.assertEqual(self.check(review_by="2028-09-02"), ["sheet.review_due_out_of_range"])
        self.assertEqual(self.check(review_by="2028-09-01"), [])

    def test_bad_date_and_future_review(self):
        self.assertEqual(self.check(reviewed="01/09/2026"), ["sheet.bad_date"])
        self.assertEqual(self.check(reviewed="2026-11-01", review_by="2028-10-31"), ["sheet.reviewed_in_future"])

    def test_invalid_json_is_reported(self):
        base = files(sheet(), texts())
        head = {SHEET: "{", TEXTS: texts()}
        self.assertEqual(keys(Fake(base, head)), ["sheet.invalid_json"])

    def test_new_sheet_starts_at_version_one(self):
        head = files(sheet(), texts())
        self.assertEqual(keys(Fake({}, head)), [])
        self.assertEqual(keys(Fake({}, files(sheet(version=2), texts()))), ["sheet.version_not_incremented"])


class Helpers(unittest.TestCase):
    def test_add_months_clamps_the_day(self):
        self.assertEqual(sh.add_months(date(2026, 8, 31), 24), date(2028, 8, 31))
        self.assertEqual(sh.add_months(date(2026, 2, 28), 12), date(2027, 2, 28))
        self.assertEqual(sh.add_months(date(2028, 2, 29), 12), date(2029, 2, 28))

    def test_output_never_echoes_unsafe_text(self):
        line = cli.format_finding("sheet.x", {"substance": "a\n::error::pwn", "role": "health"})
        self.assertEqual(line, "sheet.x role=health substance=?")

    def test_main_rejects_bad_arguments(self):
        self.assertEqual(cli.main(["x", "not a repo", "1"]), 2)
        self.assertEqual(cli.main(["x", "a/b", "1; rm"]), 2)

    def test_pure_function_does_not_mutate_inputs(self):
        before = copy.deepcopy(LIST)
        keys(Fake(base_approved(), files(signed_head(), texts("New. [f:a]")), [review("Doc")]))
        self.assertEqual(before, LIST)


if __name__ == "__main__":
    unittest.main()
