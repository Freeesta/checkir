"""Tests of the sheet checks (13 sections, signing roles, tiers, synthesis words, counselling, cuts, families, structures)."""
import json
import unittest
from pathlib import Path

import controlla_schede as cs
from test_controlla_dati import SUB, Base

SHEET = f"{SUB}/datasheet/datasheet.json"
CLAIM = {"en": "Placeholder statement for tests, not a real claim. [f:synthetic-generator]", "it": "Frase segnaposto per i test, non è un'affermazione reale. [f:synthetic-generator]"}


def full_texts(lang, **override):
    body = {s: [CLAIM[lang]] for s in cs.SECTIONS}
    body["sources"], body["license"] = ["Sources: [f:synthetic-generator]"], ["Licence."]
    body.update(override)
    return "".join(f"## {k}\n\n" + "\n\n".join(v) + "\n\n" for k, v in body.items())


class WithFullSheet(Base):
    def full(self, **override):
        self.edit_json(SHEET, lambda o: o.update(section_state={k: "draft" for k in cs.SECTIONS}))
        for lang in ("en", "it"):
            (self.root / SUB / "datasheet" / f"texts.{lang}.md").write_text(full_texts(lang, **override.get(lang, {})), encoding="utf-8")


class Full(WithFullSheet):
    def test_thirteen_sections_pass(self):
        self.full()
        self.assertEqual(self.problems(), "")

    def test_old_eight_sections_still_pass(self):
        self.assertEqual(self.problems(), "")

    def test_section_out_of_order(self):
        self.full()
        self.edit(f"{SUB}/datasheet/texts.en.md", lambda t: t.replace("## history", "## zzz").replace("## origin", "## history").replace("## zzz", "## origin"))
        self.assertIn("section headings must be", self.problems())

    def test_section_too_long(self):
        self.full(en={"history": [CLAIM["en"] + " x" * 700]}, it={"history": [CLAIM["it"] + " x" * 700]})
        self.assertIn("section 'history' is longer than 1200", self.problems())

    def test_health_claim_with_only_secondary_source(self):
        self.full()
        self.edit_json("sources.json", lambda o: o["sources"][[s["id"] for s in o["sources"]].index("synthetic-generator")].update(tier="secondary"))
        self.assertIn("cites only secondary sources", self.problems())

    def test_synthesis_words_in_origin(self):
        txt = {"en": {"origin": ["Heat to 80 °C under reflux. [f:synthetic-generator]"]}, "it": {"origin": ["Scaldare a 80 °C a riflusso. [f:synthetic-generator]"]}}
        self.full(**txt)
        out = self.problems()
        self.assertIn("word of a synthesis ('°C')", out)
        self.assertIn("'reflux'", out)

    def test_band_numbers_are_not_synthesis(self):
        ok = {"en": {"origin": ["Impurity band at 1320 cm-1. [f:synthetic-generator]"]}, "it": {"origin": ["Banda dell'impurezza a 1320 cm-1. [f:synthetic-generator]"]}}
        self.full(**ok)
        self.assertEqual(self.problems(), "")

    def test_chemist_cannot_approve_health_section(self):
        self.full()
        self.edit_json(SHEET, lambda o: (o["section_state"].update(counselling="approved"),
                                         o.update(reviewers=[{"public_name": "A", "role": "chemist", "sections": ["counselling"], "date": "2026-10-12"}])))
        self.assertIn("cannot sign 'counselling'", self.problems())

    def test_approved_needs_signature_of_the_right_role(self):
        self.full()
        self.edit_json(SHEET, lambda o: (o["section_state"].update(cuts="approved"),
                                         o.update(reviewers=[{"public_name": "A", "role": "chemist", "sections": ["molecule"], "date": "2026-10-12"}])))
        self.assertIn("'cuts' is approved without a signature by a chemist", self.problems())



class Structured(WithFullSheet):
    def test_unknown_cut(self):
        self.full()
        self.edit_json(SHEET, lambda o: o.update(cuts=[{"cut": "unobtainium", "frequency": "common", "source": "synthetic-generator"}]))
        self.assertIn("cut 'unobtainium' is neither", self.problems())

    def test_counselling_points_match_paragraphs(self):
        self.full()
        self.edit_json(SHEET, lambda o: o.update(counselling=[{"key": "a.b", "topic": "dosing", "source": "synthetic-generator"}] * 2))
        self.assertIn("1 counselling paragraphs for 2 points", self.problems())

    def test_show_doses_false_for_potent_classes(self):
        self.edit_json(f"{SUB}/substance.json", lambda o: o["classes"].update(chemical=["fentanyls"]))
        self.edit_json(SHEET, lambda o: o.update(show_doses=True, doses=[{"route": "oral", "unit": "ug", "source": "synthetic-generator", "evidence_type": "clinical"}]))
        self.assertIn("show_doses must be false", self.problems())

    def test_user_reported_doses_must_say_so(self):
        self.edit_json(SHEET, lambda o: o.update(show_doses=True, doses=[{"route": "oral", "unit": "mg", "source": "synthetic-generator", "evidence_type": "user_reported"}]))
        self.assertIn("user-reported", self.problems())

    def test_languages_must_have_the_same_citations(self):
        self.full()
        self.edit(f"{SUB}/datasheet/texts.it.md", lambda t: t.replace("[f:synthetic-generator]", "", 1))
        self.assertIn("differs from the English text", self.problems())

    def test_structure_flag_needs_file(self):
        self.edit_json(SHEET, lambda o: o.update(structure_svg=True))
        self.assertIn("structure.svg is missing", self.problems())

    def test_section_state_must_match_texts(self):
        self.full()
        self.edit_json(SHEET, lambda o: o["section_state"].pop("history"))
        self.assertIn("without a section_state", self.problems())


class Families(Base):
    def family(self, tweak=None):
        d = self.root / "families" / "benzodiazepines"
        d.mkdir(parents=True)
        doc = {"schema": "family-sheet/1", "id": "benzodiazepines", "version": 1, "section_state": {k: "draft" for k in cs.FAMILY_SECTIONS}, "reviewers": [],
               "reviewed": "2026-10-12", "review_by": "2028-09-30", "authors": ["Example"], "ai_assisted": True}
        if tweak:
            tweak(doc)
        (d / "family.json").write_text(json.dumps(doc), encoding="utf-8")
        for lang in ("en", "it"):
            body = "".join(f"## {k}\n\n{CLAIM[lang] if k not in ('sources', 'license') else 'x'}\n\n" for k in cs.FAMILY_SECTIONS)
            (d / f"texts.{lang}.md").write_text(body, encoding="utf-8")

    def test_family_passes(self):
        self.family()
        self.assertEqual(self.problems(), "")

    def test_family_id_must_be_a_class(self):
        self.family()
        (self.root / "families" / "benzodiazepines").rename(self.root / "families" / "nope")
        self.edit_json("families/nope/family.json", lambda o: o.update(id="nope"))
        self.assertIn("is not a class in classes.json", self.problems())

    def test_family_texts_need_english(self):
        self.family()
        (self.root / "families" / "benzodiazepines" / "texts.en.md").unlink()
        self.assertIn("texts.en.md is required", self.problems())


class Structures(unittest.TestCase):
    def test_verify_passes_on_shipped_data(self):
        try:
            import rdkit  # noqa: F401
        except ImportError:
            self.skipTest("RDKit not installed")
        import genera_strutture as g
        svg = g.render("CCO", "Ethanol")
        self.assertIn('role="img"', svg)
        self.assertNotIn("<text", svg)
        self.assertNotRegex(svg, r"#[0-9A-Fa-f]{6}")
        self.assertNotIn("style=", svg)
        self.assertIn('stroke="currentColor"', svg)
        self.assertEqual(g.main(["--verifica"]), 0)


if __name__ == "__main__":
    unittest.main()
