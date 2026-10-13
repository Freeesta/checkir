import unittest
from pathlib import Path

import controlla_contrasti as c


class Contrasti(unittest.TestCase):
    def test_known_ratios(self):
        self.assertAlmostEqual(c.ratio("#000000", "#ffffff"), 21.0, places=1)
        self.assertAlmostEqual(c.ratio("#0072b2", "#ffffff"), 5.2, places=1)
        self.assertAlmostEqual(c.ratio("#e69f00", "#ffffff"), 2.3, places=1)

    def test_current_stylesheet_passes(self):
        self.assertEqual(c.problems(c.CSS.read_text(encoding="utf-8")), [])

    def test_weak_role_is_reported(self):
        css = c.CSS.read_text(encoding="utf-8").replace("--color-sample: #3b528b;", "--color-sample: #addc30;", 1)
        self.assertTrue(any("light --color-sample" in p for p in c.problems(css)))

    def test_forced_dark_block_must_match_media_block(self):
        css = c.CSS.read_text(encoding="utf-8")
        start = css.index(':root[data-theme="dark"]')
        broken = css[:start] + css[start:].replace("--bg: #0e1521;", "--bg: #000000;", 1)
        self.assertTrue(any("forced dark" in p for p in c.problems(broken)))


if __name__ == "__main__":
    unittest.main()
