"""Tests of the data checker: the shipped data pass, and each rule fails with a clear message when broken."""
import json
import os
import shutil
import tempfile
import unittest
from pathlib import Path
from unittest import mock

import controlla_dati as c

DATA = Path(__file__).resolve().parent.parent.parent / "data"
SUB = "substances/synthetic-a"
JDX = f"{SUB}/spectra/synthetic-a-base.checkir.001.jdx"
META = f"{SUB}/spectra/synthetic-a-base.checkir.001.json"


class Base(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name) / "data"
        shutil.copytree(DATA, self.root)

    def tearDown(self):
        self.tmp.cleanup()

    def edit(self, rel, fn):
        p = self.root / rel
        p.write_text(fn(p.read_text(encoding="utf-8")), encoding="utf-8")

    def edit_json(self, rel, fn):
        p = self.root / rel
        o = json.loads(p.read_text(encoding="utf-8"))
        fn(o)
        p.write_text(json.dumps(o), encoding="utf-8")

    def problems(self):
        return "\n".join(c.check_data(self.root))


class Privacy(Base):
    def test_shipped_data_pass(self):
        self.assertEqual(c.check_data(DATA), [])

    def test_serial_number_in_jcamp_comment(self):
        self.edit(JDX, lambda t: t.replace("$$ Synthetic", "$$ Serial number: AB12345\n$$ Synthetic", 1))
        out = self.problems()
        self.assertIn("possible serial number", out)
        self.assertIn("synthetic-a-base.checkir.001.jdx:", out)

    def test_windows_path_in_jcamp(self):
        self.edit(JDX, lambda t: t.replace("$$ Synthetic", "$$ C:\\Users\\someone\\x.jdx\n$$ Synthetic", 1))
        self.assertIn("file path", self.problems())

    def test_reassuring_word_in_texts(self):
        self.edit(f"{SUB}/datasheet/texts.it.md", lambda t: t.replace("segnaposto", "sicuro", 1))
        self.assertIn("forbidden reassuring word 'sicuro'", self.problems())

    def test_english_reassuring_word_and_allowed_phrase(self):
        self.edit(f"{SUB}/datasheet/texts.en.md", lambda t: t.replace("Placeholder", "A pure sample. Placeholder", 1))
        self.assertIn("'pure'", self.problems())
        self.edit(f"{SUB}/datasheet/texts.en.md", lambda t: t.replace("A pure sample.", "No dose is safe.", 1))
        self.assertEqual(self.problems(), "")

    def test_claim_without_source(self):
        self.edit(f"{SUB}/datasheet/texts.en.md", lambda t: t.replace("[f:synthetic-generator]", "", 4))
        self.assertIn("without a source", self.problems())

    def test_unknown_source_in_text(self):
        self.edit(f"{SUB}/datasheet/texts.en.md", lambda t: t.replace("[f:synthetic-generator]", "[f:nope]", 1))
        self.assertIn("unknown source id 'nope'", self.problems())


class Integrity(Base):
    def test_duplicate_inchikey(self):
        key = json.loads((DATA / SUB / "substance.json").read_text())["inchikey"]
        self.edit_json("substances/synthetic-b/substance.json", lambda o: o.update(inchikey=key))
        self.assertIn("already used", self.problems())

    def test_sha_mismatch(self):
        self.edit(JDX, lambda t: t.replace("400.0, ", "400.0,  ", 1))
        self.assertIn("sha256 does not match", self.problems())

    def test_header_mismatch(self):
        self.edit(JDX, lambda t: t.replace("##XUNITS=1/CM", "##XUNITS=NANOMETERS"))
        self.assertIn("##XUNITS=NANOMETERS", self.problems())

    def test_unknown_class(self):
        self.edit_json(f"{SUB}/substance.json", lambda o: o["classes"].update(effect=["stimulant_x"]))
        self.assertIn("class 'stimulant_x'", self.problems())

    def test_review_deadline_over_24_months(self):
        self.edit_json(f"{SUB}/datasheet/datasheet.json", lambda o: o.update(review_by="2029-12-01"))
        self.assertIn("more than 24 months", self.problems())

    def test_stored_quality_must_match_the_file(self):
        self.edit_json(META, lambda o: o["quality"]["checks"][5].update(result="fail"))
        self.assertIn("quality 'noise' is stored as fail", self.problems())

    def test_forbidden_name_secret(self):
        with mock.patch.dict(os.environ, {"NOMI_VIETATI": "Synthetic generator"}):
            self.assertIn("forbidden private name", self.problems())


if __name__ == "__main__":
    unittest.main()
