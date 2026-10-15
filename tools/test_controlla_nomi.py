"""Tests of tools/controlla_nomi.py (run: python3 -m unittest discover -s tools -p 'test_*.py')."""
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import controlla_nomi as cn  # noqa: E402


class PatternTests(unittest.TestCase):
    def test_serial_pattern_matches_only_the_shape(self):
        p = cn.compile_patterns(r"UBC-\d{4}-\d{5}")
        self.assertTrue(p[0].search("sn ubc-1234-56789 end"))
        self.assertFalse(p[0].search("UBC-12-345"))

    def test_plain_name_is_case_insensitive(self):
        p = cn.compile_patterns("Mario Rossi")
        self.assertTrue(p[0].search("by MARIO ROSSI"))

    def test_blank_lines_are_ignored(self):
        self.assertEqual(len(cn.compile_patterns("a\n\n  \nb\n")), 2)

    def test_empty_secret_gives_no_patterns(self):
        self.assertEqual(cn.compile_patterns(""), [])

    def test_invalid_regex_is_an_error_naming_the_line(self):
        with self.assertRaises(ValueError) as ctx:
            cn.compile_patterns("ok\n(unclosed")
        self.assertIn("line 2", str(ctx.exception))

    def test_windows_user_path_pattern(self):
        p = cn.compile_patterns(r"C:\\Users\\[^\\]+\\")
        self.assertTrue(p[0].search(r"open C:\Users\someone\Desktop\x.ispd"))


class SizeTests(unittest.TestCase):
    def test_library_packages_may_be_big_and_binary_files_are_not_read(self):
        big = cn.ROOT / "tools" / "_big_probe.tmp"
        big.write_bytes(b"x" * (cn.MAX_BYTES + 1))
        try:
            self.assertEqual(len(cn.big_files(["tools/_big_probe.tmp"])), 1)
            self.assertEqual(cn.big_files(["librerie/x/data.bin"]), [])
            self.assertEqual(cn.hits(["librerie/x/data.bin"], cn.compile_patterns("zzz")), [])
        finally:
            big.unlink()


if __name__ == "__main__":
    unittest.main()
