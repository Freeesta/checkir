"""Tests of the issue forms and labels: run with `python3 -m unittest discover -s tools/dati -p 'test_*.py'`.

Every form must tell the writer that everything is public, have unique field ids (the ids are a contract: the program
pre-fills forms from the URL), and carry the declaration boxes that fit it.
"""
import unittest
from pathlib import Path

import yaml

GITHUB = Path(__file__).resolve().parent.parent.parent / ".github"
FORMS = sorted(p for p in (GITHUB / "ISSUE_TEMPLATE").glob("*.yml") if p.name != "config.yml")
# forms that carry text or data into the project also need the DCO and the licence boxes
CONTRIBUTING = {"sheet.yml", "new-sheet.yml", "translation.yml", "spectrum.yml"}
EXPECTED = {"sheet.yml", "new-sheet.yml", "translation.yml", "spectrum.yml", "alert.yml", "bug.yml"}


def declarations(form: dict) -> str:
    boxes = [e for e in form["body"] if e["type"] == "checkboxes"]
    return " ".join(o["label"] for b in boxes for o in b["attributes"]["options"]).lower()


class IssueForms(unittest.TestCase):
    def test_expected_forms_exist(self):
        self.assertEqual({p.name for p in FORMS}, EXPECTED)

    def test_structure(self):
        label_names = {entry["name"] for entry in yaml.safe_load((GITHUB / "labels.yml").read_text(encoding="utf-8"))}
        for path in FORMS:
            form = yaml.safe_load(path.read_text(encoding="utf-8"))
            with self.subTest(form=path.name):
                for key in ("name", "description", "labels", "body"):
                    self.assertIn(key, form)
                self.assertEqual(form["body"][0]["type"], "markdown")
                self.assertIn("PUBLIC", form["body"][0]["attributes"]["value"])
                ids = [e["id"] for e in form["body"] if "id" in e]
                self.assertEqual(len(ids), len(set(ids)), "field ids must be unique")
                self.assertTrue(all(e["type"] == "markdown" or "id" in e for e in form["body"]))
                self.assertLessEqual(set(form["labels"]), label_names, "a label of the form is not in labels.yml")
                text = declarations(form)
                self.assertIn("personal data", text)
                if path.name in CONTRIBUTING:
                    self.assertIn("developer certificate of origin", text)
                    self.assertRegex(text, r"cc by(-sa)? 4\.0")

    def test_field_ids_of_the_sheet_form_are_stable(self):
        form = yaml.safe_load((GITHUB / "ISSUE_TEMPLATE" / "sheet.yml").read_text(encoding="utf-8"))
        ids = [e["id"] for e in form["body"] if "id" in e]
        self.assertEqual(ids, ["substance", "section", "language", "version", "text", "sources", "public_name", "declarations"])

    def test_blank_issues_off(self):
        config = yaml.safe_load((GITHUB / "ISSUE_TEMPLATE" / "config.yml").read_text(encoding="utf-8"))
        self.assertIs(config["blank_issues_enabled"], False)
        self.assertTrue(any("discussions" in c["url"] for c in config["contact_links"]))
        self.assertTrue(any("CODE_OF_CONDUCT" in c["url"] for c in config["contact_links"]))


class Labels(unittest.TestCase):
    def test_unique_and_complete(self):
        labels = yaml.safe_load((GITHUB / "labels.yml").read_text(encoding="utf-8"))
        names = [entry["name"] for entry in labels]
        self.assertEqual(len(names), len(set(names)))
        for needed in ("bug", "spectrum", "sheet", "translation", "alert", "urgent", "needs-review", "conduct"):
            self.assertIn(needed, names)
        for entry in labels:
            self.assertRegex(entry["color"], r"^[0-9a-f]{6}$")
            self.assertTrue(entry["description"])
            self.assertLessEqual(len(entry["description"]), 100)

    def test_workflow_never_interpolates_issue_text(self):
        text = (GITHUB / "workflows" / "labels.yml").read_text(encoding="utf-8")
        self.assertNotIn("github.event.issue", text)
        self.assertNotIn("github.event.pull_request", text)
        self.assertNotIn("pull_request_target", text)


if __name__ == "__main__":
    unittest.main()
