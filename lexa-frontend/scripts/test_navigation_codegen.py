#!/usr/bin/env python3
"""Regression test: source generators preserve the permission-filtered sidebar.

Run independently with `python3 scripts/test_navigation_codegen.py` from the
frontend. No Node dependencies and no changes to the canonical source tree.
"""
from __future__ import annotations

from hashlib import sha256
from pathlib import Path
from shutil import copytree, ignore_patterns
from subprocess import run
from tempfile import TemporaryDirectory
import unittest

FRONTEND = Path(__file__).resolve().parents[1]
SHELL = 'src/app/layouts/AppShell.tsx'


class NavigationGeneratorTests(unittest.TestCase):
    def test_approved_sidebar_is_active_and_accented(self) -> None:
        source = (FRONTEND / SHELL).read_text(encoding='utf-8')
        for anchor in (
            'const visibleNavSections = navSections.map(section',
            'const filteredNav =',
            '{filteredNav.map((section) => (',
            'className="lexa-nav-module-link"',
            'data-module-accent={moduleAccentForPath(item.to)}',
            'isEmployeeNavigationAllowed(',
            'className="lexa-nav-pin',
        ):
            with self.subTest(anchor=anchor):
                self.assertIn(anchor, source)

    def test_unknown_sidebar_fails_without_overwriting_it(self) -> None:
        with TemporaryDirectory(prefix='lexa-navigation-invalid-') as tmp:
            temp_frontend = Path(tmp) / 'lexa-frontend'
            copytree(FRONTEND, temp_frontend, ignore=ignore_patterns(
                'node_modules', 'dist', 'coverage', '__pycache__', '.vite', '.git'
            ))
            shell = temp_frontend / SHELL
            source = shell.read_text(encoding='utf-8')
            self.assertIn('{filteredNav.map((section) => (', source)
            corrupted = source.replace('{filteredNav.map((section) => (', '{unknownNav.map((section) => (', 1)
            shell.write_text(corrupted, encoding='utf-8')
            result = run(['python3', 'scripts/complete_modules.py'], cwd=temp_frontend,
                         capture_output=True, text=True, check=False)
            self.assertNotEqual(result.returncode, 0)
            self.assertIn('visible navigation sections', result.stderr)
            self.assertEqual(shell.read_text(encoding='utf-8'), corrupted)

    def test_generators_succeed_and_preserve_sidebar_twice(self) -> None:
        # Test in isolation to avoid changing source files during CI.
        with TemporaryDirectory(prefix='lexa-navigation-codegen-') as tmp:
            temp_frontend = Path(tmp) / 'lexa-frontend'
            copytree(FRONTEND, temp_frontend, ignore=ignore_patterns(
                'node_modules', 'dist', 'coverage', '__pycache__', '.vite', '.git'
            ))
            tracked = [
                temp_frontend / SHELL,
                temp_frontend / 'src/styles/lexa-brand.css',
                temp_frontend / 'src/modules/operations/OperationsWorkspacePage.tsx',
            ]
            before = [sha256(item.read_bytes()).hexdigest() for item in tracked]
            for iteration in range(2):
                for generator in ('complete_modules.py', 'apply_lexa_palette.py'):
                    result = run(['python3', f'scripts/{generator}'], cwd=temp_frontend,
                                 capture_output=True, text=True, check=False)
                    self.assertEqual(result.returncode, 0,
                        f'{generator} iteration {iteration+1} failed: {result.stdout}\n{result.stderr}')
                after = [sha256(item.read_bytes()).hexdigest() for item in tracked]
                self.assertEqual(after, before,
                    'Source generators changed an already-built modern navigation or brand screen')


if __name__ == '__main__':
    unittest.main(verbosity=2)
