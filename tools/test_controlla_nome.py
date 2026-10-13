import unittest

import controlla_nome as c


class Offenders(unittest.TestCase):
    def test_allowed_file_and_urls(self):
        files = {
            "web/appname.js": 'export const APP_ID = "checkir";',
            "web/a.js": "see https://github.com/Freeesta/checkir/issues and freeesta.github.io/checkir/",
        }
        self.assertEqual(c.offenders(files), [])

    def test_name_elsewhere_fails_with_line(self):
        files = {"web/lang/it.json": '{\n  "a": "Benvenuto in CheckIR"\n}'}
        self.assertEqual(c.offenders(files), ["web/lang/it.json:2"])

    def test_url_on_line_does_not_hide_a_second_use(self):
        files = {"web/a.js": "github.com/o/checkir checkir"}
        self.assertEqual(c.offenders(files), ["web/a.js:1"])


if __name__ == "__main__":
    unittest.main()
