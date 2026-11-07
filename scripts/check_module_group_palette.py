#!/usr/bin/env python3
"""Static release gate for all LEXA department colors and module navigation.

No npm dependencies: can run before the frontend install/build, including in CI.
Do not confuse group accents with semantic success/warning/error indicators.
"""
from __future__ import annotations
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
FRONT = ROOT / 'lexa-frontend' / 'src'
CATEGORIES = {
    'WORKSPACE': 'navy',
    'BUSINESS REPORTS & ADVICE': 'gold',
    'CUSTOMERS & GROWTH': 'emerald',
    'SELLING': 'coral',
    'INVENTORY': 'volt',
    'LOGISTICS': 'violet',
    'PURCHASING': 'bronze',
    'FINANCE': 'sapphire',
    'TEAM & PAYROLL': 'mulberry',
    'PRODUCTION & QUALITY': 'industrial',
    'PROJECTS & SERVICE': 'indigo',
}


def fail(message: str) -> None:
    raise SystemExit(f'LEXA department palette: {message}')


def luminosity(hex_code: str) -> float:
    rgb = [int(hex_code[i:i + 2], 16) / 255 for i in (1, 3, 5)]
    linear = [v / 12.92 if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4 for v in rgb]
    return linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722


def main() -> None:
    ts = (FRONT / 'domain' / 'shared' / 'moduleAccents.ts').read_text()
    shell = (FRONT / 'app' / 'layouts' / 'AppShell.tsx').read_text()
    css = (FRONT / 'styles' / 'module-group-system.css').read_text()
    entry = (FRONT / 'main.tsx').read_text()
    if "import './styles/module-group-system.css';" not in entry:
        fail('the shared palette is not imported by main.tsx')
    by_path: dict[str, str] = {}
    for accent, text in re.findall(r"\.\.\.forPaths\('([\w]+)',\s*\[(.*?)\]\)", ts, flags=re.DOTALL):
        for route in re.findall(r"'([^']+)'", text):
            if route in by_path and by_path[route] != accent:
                fail(f'duplicate/contradictory accent on {route}')
            by_path[route] = accent
    block = shell.split('const navSections = [', 1)[-1].split('function routeTitle(', 1)[0]
    sections = re.findall(r"\{ title: '([^']+)', items: \[(.*?)\]\s*\}", block, flags=re.DOTALL)
    if len(sections) != len(CATEGORIES):
        fail(f'expected {len(CATEGORIES)} navigation groups, found {len(sections)}')
    checked = 0
    for group, items in sections:
        expected = CATEGORIES.get(group)
        if expected is None:
            fail(f'unrecognized navigation department: {group}')
        for route in re.findall(r"to:\s*'([^']+)'", items):
            actual = by_path.get(route)
            if actual != expected:
                fail(f'{group} route {route} should use {expected}, uses {actual}')
            checked += 1
    for finance_route in ('/modules/finance-operations', '/modules/recurring-invoices', '/modules/tax-documents'):
        if by_path.get(finance_route) != 'sapphire':
            fail(f'Finance submodule {finance_route} does not use azure')
    for route, expected in {'/modules/shifts':'mulberry','/modules/support':'indigo', '/business-tools':'navy'}.items():
        if by_path.get(route) != expected:
            fail(f'{route} has an incorrect group color')

    for group, accent in CATEGORIES.items():
        if f"{group!r}:'{accent}'" not in ts and f"'{group}':'{accent}'" not in ts and f"{group}:'{accent}'" not in ts:
            fail(f'group metadata missing {group}: {accent}')
        match = re.search(r':root \[data-module-accent="' + re.escape(accent) + r'"\]\s*\{([^}]+)\}', css)
        if not match:
            fail(f'no {group} palette in CSS')
        palette = dict(re.findall(r'(--module-[a-z-]+)\s*:\s*([^;]+)\s*;', match.group(1)))
        required = ('--module-accent', '--module-accent-strong', '--module-accent-soft', '--module-accent-border', '--module-action-bg', '--module-chart-primary')
        for var in required:
            if var not in palette:
                fail(f'{group} missing {var}')
        action = palette['--module-action-bg'].strip()
        if not re.fullmatch(r'#[0-9a-fA-F]{6}', action):
            fail(f'{group} action button has invalid color')
        contrast = 1.05 / (luminosity(action) + 0.05)
        if contrast < 4.5:
            fail(f'{group} action buttons have insufficient white-text contrast ({contrast:.2f}:1)')
        if not re.search(r':root\[data-theme="dark"\] \[data-module-accent="' + re.escape(accent) + r'"\]', css):
            fail(f'{group} missing dark-mode palette')
    for page, expected in {
        'customer-growth/CustomerGrowthPage.tsx':'emerald',
        'operations/ProductionQualityPage.tsx':'industrial',
        'operations/ProjectsServicePage.tsx':'indigo',
        'operations/FinanceWorkspacePage.tsx':'sapphire',
        'operations/FinanceOverviewPage.tsx':'sapphire',
    }.items():
        content = (FRONT / 'modules' / page).read_text()
        if f'data-module-accent="{expected}"' not in content:
            fail(f'{page} is not using the parent group color')
    for src in FRONT.rglob('*.tsx'):
        if re.search(r"from\s*['\"]lucide-react['\"]", src.read_text()):
            fail(f'Lucide import found in {src.relative_to(FRONT)}')
    print(f'LEXA department palette passed: {len(CATEGORIES)} groups, {checked} navigation routes, accessible action colors, light/dark variants.')


if __name__ == '__main__':
    main()
