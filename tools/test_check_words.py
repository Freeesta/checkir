import unittest

import check_words as c


class Words(unittest.TestCase):
    def test_clean_catalog_passes(self):
        cats = {"it": {"a": "Probabile"}, "en": {"a": "Probable"}}
        self.assertEqual(c.offenders(cats, {}), [])

    def test_test_key_result_safe_fails(self):
        cats = {"it": {"x.y": "Risultato: sicuro"}, "en": {"x.y": "Result: safe"}}
        bad = c.offenders(cats, {})
        self.assertEqual(len(bad), 2)
        self.assertIn("it:x.y", bad[1] if bad[1].startswith("it") else bad[0])

    def test_each_wrong_word(self):
        for lang, text in [("it", "Campione puro"), ("it", "Via libera"), ("it", "Pulita"), ("it", "OK"), ("it", "Esito: negativo"), ("en", "All clear"), ("en", "A clean sample"), ("en", "Pure"), ("en", "Result: negative"), ("en", "ok")]:
            self.assertTrue(c.hits(lang, text), text)

    def test_words_that_are_fine(self):
        for lang, text in [("it", "Bande negative"), ("en", "Negative bands"), ("en", "Unsafe handling"), ("it", "pure se vuoi"), ("en", "Book a hook")]:
            self.assertEqual(c.hits(lang, text), [], text)

    def test_allowed_key_must_deny(self):
        cats = {"it": {"k": "Un risultato non significa che sia sicuro."}, "en": {"k": "A result does not mean it is safe."}}
        self.assertEqual(c.offenders(cats, {"k": "denies it"}), [])
        cats = {"it": {"k": "È sicuro."}, "en": {"k": "It is safe."}}
        self.assertTrue(any("does not deny" in b for b in c.offenders(cats, {"k": "wrong"})))

    def test_stale_allowed_key_fails(self):
        self.assertTrue(any("does not exist" in b for b in c.offenders({"it": {"a": "x"}}, {"gone": "r"})))


if __name__ == "__main__":
    unittest.main()
