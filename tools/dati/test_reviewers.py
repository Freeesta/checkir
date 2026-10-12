"""Tests of the reviewers list: run with `python3 -m unittest discover -s tools/dati -p 'test_*.py'`."""
import json
import unittest
from pathlib import Path

import valida_schemi as v

DATA = Path(__file__).resolve().parent.parent.parent / "data" / "reviewers.json"


def month_index(month: str) -> int:
    year, mon = month.split("-")
    return int(year) * 12 + int(mon)


class Reviewers(unittest.TestCase):
    def test_list_is_valid(self):
        self.assertEqual(v.check_file(DATA), [])

    def test_github_names_unique_and_expiry_within_24_months(self):
        reviewers = json.loads(DATA.read_text(encoding="utf-8"))["reviewers"]
        names = [r["github"].lower() for r in reviewers]
        self.assertEqual(len(names), len(set(names)))
        for r in reviewers:
            span = month_index(r["expires"]) - month_index(r["verified"])
            self.assertTrue(0 < span <= 24, f"{r['github']}: expiry must be 1-24 months after verification")

    def test_no_health_reviewer_until_a_health_professional_is_verified(self):
        # the first health reviewer is added by a pull request that changes this test on purpose
        reviewers = json.loads(DATA.read_text(encoding="utf-8"))["reviewers"]
        self.assertFalse([r for r in reviewers if "health" in r["roles"]])

    def test_email_is_rejected_by_name(self):
        doc = {"schema": "reviewers/1", "reviewers": [{
            "github": "someone", "public_name": "Someone", "roles": ["chemist"], "languages": ["en"],
            "verified": "2026-10", "expires": "2028-10", "status": "active", "email": "someone@example.org"}]}
        errors = v.check_data(doc)
        self.assertTrue(any("email" in e for e in errors), errors)


if __name__ == "__main__":
    unittest.main()
