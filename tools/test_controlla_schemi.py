"""Tests of tools/controlla_schemi.py: the real schemas pass, and a trial schema with personal data or open objects fails."""
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import controlla_schemi as cs  # noqa: E402

MONTH = cs.MONTH


def schema(props: dict, extra: object = False) -> dict:
    return {"type": "object", "properties": props, "additionalProperties": extra}


class RealSchemas(unittest.TestCase):
    def test_docs_schemi_pass(self):
        self.assertEqual(cs.check_dir(cs.ROOT / "docs" / "schemi"), [])


class Trial(unittest.TestCase):
    def test_clean_schema_passes(self):
        s = schema({"measured": {"type": "string", "pattern": MONTH}, "scans": {"type": "integer"}})
        self.assertEqual(cs.problems(s, "t.json"), [])

    def test_personal_field_fails(self):
        for name in ("email", "Phone", "tax-code", "birth_date", "ip", "lat", "notes", "cognome", "nome"):
            found = cs.problems(schema({name: {"type": "string"}}), "t.json")
            self.assertTrue(any("personal data" in p for p in found), name)

    def test_nested_personal_field_fails(self):
        s = schema({"operator": schema({"email": {"type": "string"}})})
        self.assertTrue(any("/operator/email" in p for p in cs.problems(s, "t.json")))

    def test_open_object_fails(self):
        self.assertTrue(any("additionalProperties" in p for p in cs.problems(schema({"a": {"type": "string"}}, extra=True), "t.json")))
        self.assertTrue(any("free object" in p for p in cs.problems({"type": "object"}, "t.json")))

    def test_day_precision_measurement_date_fails(self):
        for pattern in ("^[0-9]{4}-[0-9]{2}-[0-9]{2}$", None):
            prop = {"type": "string"} if pattern is None else {"type": "string", "pattern": pattern}
            self.assertTrue(any("YYYY-MM" in p or "year and month" in p for p in cs.problems(schema({"measured": prop}), "t.json")))

    def test_conditional_fragments_are_not_data_objects(self):
        s = schema({"a": {"type": "string"}})
        s["allOf"] = [{"if": {"properties": {"a": {"const": "x"}}}, "then": {"required": ["a"]}}]
        self.assertEqual(cs.problems(s, "t.json"), [])


class Command(unittest.TestCase):
    def test_exit_code_on_a_bad_directory(self):
        with tempfile.TemporaryDirectory() as d:
            (Path(d) / "bad-1.json").write_text(json.dumps(schema({"email": {"type": "string"}})))
            run = subprocess.run([sys.executable, str(cs.ROOT / "tools" / "controlla_schemi.py"), d], capture_output=True, text=True)
            self.assertEqual(run.returncode, 1)
            self.assertIn("email", run.stdout)


if __name__ == "__main__":
    unittest.main()
