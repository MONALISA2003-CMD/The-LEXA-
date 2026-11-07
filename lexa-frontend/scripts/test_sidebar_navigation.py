#!/usr/bin/env python3
"""Frontend-only, dependency-free regression gate for LEXA navigation.

Runs in Vercel's frontend-root checkout as well as in the monorepo.
Keep business routes stable; only presentation and customer-facing copy change.
"""
import re
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SHELL = (ROOT / 'src/app/layouts/AppShell.tsx').read_text()
STYLE = (ROOT / 'src/styles/lexa-sidebar-unified.css').read_text()
ENTRY = (ROOT / 'src/main.tsx').read_text()

class NavigationTests(unittest.TestCase):
    def test_stylesheet_loaded_after_department_colors(self):
        self.assertIn("import './styles/lexa-sidebar-unified.css'", ENTRY)
        self.assertLess(ENTRY.index('module-group-system.css'), ENTRY.index('lexa-sidebar-unified.css'))
        self.assertIn('background: #0b1f3a !important', STYLE)
        self.assertIn('background: #1d4ed8 !important', STYLE)

    def test_same_sidebar_color_in_both_themes(self):
        self.assertIn(':root[data-theme="dark"] .app-frame .sidebar.lexa-unified-sidebar', STYLE)
        self.assertIn(':root:not([data-theme="dark"]) .app-frame .sidebar.lexa-unified-sidebar', STYLE)
        nav = SHELL.split('<nav className="nav-groups"', 1)[1].split('</nav>', 1)[0]
        self.assertNotIn('data-module-accent', nav)
        self.assertIn('BUSINESS_AREA_NAMES', nav)
        self.assertIn('Business pages', SHELL)
        self.assertIn('Find a page', nav)
        self.assertNotIn('Find a module', nav)

    def test_mobile_access_and_focus(self):
        for fragment in ('(max-width: 860px)', '(max-width: 360px)', '100dvh',
                         'env(safe-area-inset-bottom)', 'prefers-reduced-motion',
                         'overscroll-behavior: contain'):
            with self.subTest(fragment=fragment): self.assertIn(fragment, STYLE)
        for fragment in ('onKeyDown', "event.key === 'Escape'", "event.key !== 'Tab'",
                         'document.documentElement.style.overflow', 'inert={mobileNavOpen}',
                         'aria-modal={mobileNavOpen', 'aria-expanded={mobileNavOpen}'):
            with self.subTest(fragment=fragment): self.assertIn(fragment, SHELL)

    def test_search_uses_permission_filtered_routes(self):
        self.assertIn('const quickPages =', SHELL)
        self.assertIn("const filteredNav = moduleSearch.trim()", SHELL)
        self.assertIn('visibleNavSections.map(', SHELL)
        self.assertIn('section.items.filter(item => moduleSearch || !quickPages', SHELL)
        self.assertIn('No pages match', SHELL)
        self.assertIn('Add to favourites:', SHELL)

    def test_departments_and_business_routes_still_present(self):
        groups = re.findall(r"\{ title: '([^']+)', items: \[", SHELL)
        self.assertEqual(len(groups), 11)
        groups_display = re.findall(r"'([A-Z &]+)': '([^']+)'", SHELL.split('const BUSINESS_AREA_NAMES',1)[1].split('function routeTitle(',1)[0])
        self.assertEqual(len(groups_display), 11)
        self.assertEqual(set(groups), {group for group,_ in groups_display})
        self.assertEqual(len(re.findall(r"\{ to: '/?[^']*', label:", SHELL.split('const navSections = [',1)[1].split('function routeTitle(',1)[0])),65)

if __name__ == '__main__':
    unittest.main()
