#!/usr/bin/env python3
"""Regression tests for prebuild's canonical module-color generator (stdlib only)."""
from pathlib import Path
import json
import runpy
import unittest

ROOT = Path(__file__).resolve().parents[1]

class PaletteGeneratorTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.generator = ROOT / "scripts" / "apply_lexa_palette.py"
        cls.definitions = runpy.run_path(str(cls.generator))

    def test_generator_matches_shipped_route_map(self):
        published = (ROOT / "src/domain/shared/moduleAccents.ts").read_text()
        generated = self.definitions["ACCENT_SOURCE"]
        self.assertEqual(published.strip(), generated.strip(),
                         "Generator would overwrite checked-in module accents")

    def test_generator_preserves_maintained_tests(self):
        generator_source = self.generator.read_text()
        self.assertNotIn("write(SRC / 'domain/shared/moduleAccents.test.ts'", generator_source)
        tests = (ROOT / "src/domain/shared/moduleAccents.test.ts").read_text()
        self.assertIn("keeps every department route", tests)

    def test_route_family_restrictions(self):
        generated = self.definitions["ACCENT_SOURCE"]
        for expected in (
            "...forPaths('gold', ['/intelligence'])",
            "...forPaths('navy', ['/business-tools'])",
            "...forPaths('indigo', ['/modules/support'])",
            "'/modules/shifts'",
        ):
            with self.subTest(expected=expected):
                self.assertIn(expected, generated)

    def test_prebuild_checks_after_generation(self):
        prebuild = json.loads((ROOT / "package.json").read_text())["scripts"]["prebuild"]
        generator = prebuild.index("python3 scripts/apply_lexa_palette.py")
        second_check = prebuild.rindex("python3 scripts/check_module_group_palette.py")
        self.assertLess(generator, second_check)
        self.assertLess(second_check, prebuild.index("npm test"))

if __name__ == "__main__":
    unittest.main()
