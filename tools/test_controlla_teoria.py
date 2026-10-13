"""Negative controls of tools/controlla_teoria.py: the check must fail when the two languages drift apart."""
import json
import shutil
import tempfile
import unittest
from pathlib import Path

import controlla_teoria as ct


class Teoria(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp())
        self.web = self.tmp / "teoria"
        shutil.copytree(ct.ROOT / "web" / "teoria", self.web)

    def tearDown(self):
        shutil.rmtree(self.tmp)

    def edit(self, rel, fn):
        p = self.web / rel
        data = json.loads(p.read_text(encoding="utf-8"))
        fn(data)
        p.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")

    def test_real_files_pass(self):
        self.assertEqual(ct.problems(self.web), [])

    def test_a_missing_label_in_one_language_fails(self):
        self.edit("en/02-molle.json", lambda d: d["interactive"]["labels"].pop("note"))
        self.assertTrue(any("differ" in p for p in ct.problems(self.web)))

    def test_an_unknown_source_fails(self):
        self.edit("it/01-che-cosa-vede.json", lambda d: d["sources"].append("nowhere"))
        self.assertTrue(any("unknown source" in p for p in ct.problems(self.web)))

    def test_a_link_to_an_unknown_term_fails(self):
        self.edit("it/01-che-cosa-vede.json", lambda d: d["body"].append("[[nothing|text]]"))
        self.assertTrue(any("unknown term" in p for p in ct.problems(self.web)))

    def test_too_many_words_fail(self):
        self.edit("it/03-modi.json", lambda d: d["body"].append("parola " * 130))
        self.assertTrue(any("words" in p for p in ct.problems(self.web)))

    def test_a_reassuring_word_fails(self):
        self.edit("en/06-strumento.json", lambda d: d["body"].append("The result is safe."))
        self.assertTrue(any("safe" in p for p in ct.problems(self.web)))

    def test_a_label_read_by_the_code_but_missing_fails(self):
        self.edit("it/02-molle.json", lambda d: d["interactive"]["labels"].pop("ghost"))
        self.edit("en/02-molle.json", lambda d: d["interactive"]["labels"].pop("ghost"))
        self.assertTrue(any("ghost" in p for p in ct.problems(self.web)))


if __name__ == "__main__":
    unittest.main()
