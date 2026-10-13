"""Tests of the band data checker: the shipped data pass, and each rule fails with a message that names the offender."""
import json
import shutil
import tempfile
import unittest
from pathlib import Path

import controlla_bande as c
import genera_bande

DATA = Path(__file__).resolve().parent.parent.parent / "data"
OPAQUE = ["vs-0123456789ab", "vs-ba9876543210"]


class Base(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name) / "data"
        shutil.copytree(DATA, self.root)

    def tearDown(self):
        self.tmp.cleanup()

    def edit_json(self, rel, fn):
        p = self.root / rel
        o = json.loads(p.read_text(encoding="utf-8"))
        fn(o)
        p.write_text(json.dumps(o, ensure_ascii=False), encoding="utf-8")

    def rule(self, rid, fn):
        def go(o):
            fn(next(r for r in o["rules"] if r["id"] == rid))
        self.edit_json("bands/rules.json", go)

    def text(self, lang, key, fn):
        def go(o):
            o["texts"][key] = fn(o["texts"].get(key, ""))
        self.edit_json(f"bands/texts.{lang}.json", go)

    def problems(self):
        return "\n".join(c.check_bands(self.root))


class ShippedData(Base):
    def test_shipped_data_pass(self):
        self.assertEqual(self.problems(), "")

    def test_generated_files_match_the_tables(self):
        self.assertEqual(genera_bande.main(["--verifica"]), 0)

    def test_every_rule_has_a_source_and_three_levels_where_common(self):
        rules = json.loads((DATA / "bands/rules.json").read_text(encoding="utf-8"))["rules"]
        self.assertEqual(len(rules), 79)
        self.assertTrue(all(r["sources"] for r in rules))
        verified = {r["id"] for r in rules if r["status"] != "draft"}
        self.assertEqual(verified, {"co.aryl_ketone", "o_ch2_o.c_o", "o_ch2_o.ring", "co.ketone.sat", "co.amide"})
        self.assertTrue(all(r["diagnostic_for"] and len(r["verified_on"]) >= 2 for r in rules if r["id"] in verified))
        texts = json.loads((DATA / "bands/texts.it.json").read_text(encoding="utf-8"))["texts"]
        self.assertEqual(sum(k.endswith(".teaching") for k in texts), 20)


class Failures(Base):
    def test_rule_without_source_names_the_rule(self):
        self.rule("oh.free", lambda r: r.update(sources=[]))
        self.assertIn("rule 'oh.free'", self.problems())

    def test_unknown_source(self):
        self.rule("oh.free", lambda r: r.update(sources=["nobody2020"]))
        self.assertIn("rule 'oh.free': unknown source 'nobody2020'", self.problems())

    def test_unknown_group_mode_and_rule_references(self):
        self.rule("oh.free", lambda r: r.update(group="nothing", mode="nowhere", false_friends=["no.such"]))
        p = self.problems()
        for part in ("unknown group 'nothing'", "unknown mode 'nowhere'", "false_friends cites unknown rule 'no.such'"):
            self.assertIn(part, p)

    def test_narrow_window(self):
        self.rule("cn.nitrile", lambda r: r.update(range_cm1={"min": 2200, "max": 2205}))
        self.assertIn("rule 'cn.nitrile': window 2200-2205", self.problems())

    def test_strong_band_without_atr_widening(self):
        self.rule("co.amide", lambda r: (r.pop("range_literature_cm1"), r.update(range_cm1={"min": 1630, "max": 1690})))
        self.assertIn("rule 'co.amide': a strong band needs the ATR widening", self.problems())

    def test_diagnostic_needs_verified_spectra(self):
        self.rule("co.acid", lambda r: r.update(diagnostic_for=[{"class": "synthetic_cathinones", "strength": "strong"}]))
        self.assertIn("diagnostic_for needs status verified_spectra", self.problems())

    def test_verified_needs_two_opaque_spectra(self):
        self.rule("co.acid", lambda r: r.update(status="verified_spectra", verified_on=OPAQUE[:1]))
        self.assertIn("needs at least two spectra in verified_on", self.problems())
        self.rule("co.acid", lambda r: r.update(verified_on=["Cathinone 4-MMC.ispd", OPAQUE[0]]))
        self.assertIn("rule 'co.acid'", self.problems())

    def test_verified_with_two_opaque_ids_passes(self):
        self.rule("co.acid", lambda r: r.update(status="verified_spectra", verified_on=OPAQUE,
                                                       diagnostic_for=[{"class": "synthetic_cathinones", "strength": "strong"}]))
        self.assertNotIn("co.acid", self.problems())

    def test_reassuring_word_in_a_text(self):
        self.text("it", "bands.oh.free.counsellor", lambda t: t + " Il campione è sicuro.")
        self.assertIn("key 'bands.oh.free.counsellor': forbidden word 'sicuro'", self.problems())

    def test_other_forbidden_phrases(self):
        for lang, phrase in (("it", "Campione senza fentanil."), ("en", "Fentanyl-free sample."), ("en", "A negative result."),
                             ("it", "Alta purezza."), ("en", "Ok to use."), ("it", "Via libera.")):
            self.tearDown()
            self.setUp()
            self.text(lang, "bands.oh.free.chemist", lambda t, p=phrase: t + " " + p)
            self.assertIn("forbidden word", self.problems(), phrase)

    def test_missing_translation_names_the_key(self):
        self.edit_json("bands/texts.en.json", lambda o: o["texts"].pop("bands.oh.free.chemist"))
        p = self.problems()
        self.assertIn("bands/texts.en.json: key 'bands.oh.free.chemist' is missing", p)
        self.assertIn("exists in it but not in en", p)

    def test_orphan_key(self):
        for lang in ("it", "en"):
            self.text(lang, "bands.ghost.chemist", lambda t: "x")
        self.assertIn("key 'bands.ghost.chemist' belongs to no rule", self.problems())

    def test_personal_data_in_a_text(self):
        self.text("en", "bands.oh.free.teaching", lambda t: "Contact someone@example.org")
        self.assertIn("e-mail address", self.problems())

    def test_group_cycle_and_duplicate_ids(self):
        self.edit_json("bands/groups.json", lambda o: o["groups"][0].update(parent="alcohol"))
        self.assertIn("parent cycle", self.problems())
        self.edit_json("bands/groups.json", lambda o: o["groups"].append(dict(o["groups"][1])))
        self.assertIn("duplicate id", self.problems())


class SubstanceBands(Base):
    FILE = "bands/substance-bands/cocaine-hydrochloride.json"

    def band(self, pos, fn):
        def go(o):
            fn(next(b for b in o["bands"] if b["position_cm1"] == pos))
        self.edit_json(self.FILE, go)

    def test_thirteen_demo_substances_ship(self):
        files = sorted((DATA / "bands/substance-bands").glob("*.json"))
        self.assertEqual(len(files), 13)
        for f in files:
            for b in json.loads(f.read_text(encoding="utf-8"))["bands"]:
                self.assertEqual(b["status"] == "verified_spectra", len(b.get("verified_on", [])) >= 2, f"{f.name} {b['position_cm1']}")

    def test_band_outside_its_rule_window_names_file_and_rule(self):
        self.band(1728, lambda b: b.update(position_cm1=1600, tolerance_cm1=6))
        out = self.problems()
        self.assertIn("cocaine-hydrochloride.json: band at 1600 cm-1: lies outside the window", out)
        self.assertIn("'co.ester.sat'", out)

    def test_verified_band_with_one_spectrum_fails(self):
        self.band(1728, lambda b: b.update(verified_on=OPAQUE[:1]))
        self.assertIn("needs at least two spectra in verified_on", self.problems())

    def test_file_name_instead_of_opaque_id_fails(self):
        self.band(1728, lambda b: b.update(verified_on=["Cocaine HCl.DX", OPAQUE[0]]))
        self.assertIn("verified_on", self.problems())

    def test_band_without_source_fails(self):
        self.band(1728, lambda b: b.update(sources=[]))
        self.assertIn("sources", self.problems())

    def test_unknown_text_key_is_missing_in_both_languages(self):
        self.band(1728, lambda b: b.update(text_key="substance_bands.cocaine.hydrochloride.9999"))
        self.assertIn("key 'substance_bands.cocaine.hydrochloride.9999' is missing", self.problems())


if __name__ == "__main__":
    unittest.main()
