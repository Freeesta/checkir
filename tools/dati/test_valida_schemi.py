"""Tests of the schema validator: run with `python3 -m unittest discover -s tools/dati -p 'test_*.py'`."""
import unittest

import valida_schemi as v


class Schemas(unittest.TestCase):
    def test_schemas_valid_and_documented(self):
        self.assertEqual(v.check_schemas(), [])

    def test_fixtures(self):
        self.assertEqual(v.check_fixtures(), [])

    def test_unknown_schema_is_named(self):
        self.assertIn("unknown schema", v.check_data({"schema": "nope/1"})[0])

    def test_missing_schema_field(self):
        self.assertTrue(v.check_data([1])[0].startswith("/schema"))


if __name__ == "__main__":
    unittest.main()
