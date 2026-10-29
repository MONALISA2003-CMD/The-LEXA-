#!/usr/bin/env python3
"""Idempotent guard for known LEXA build-origin regressions.

- Keep Vitest unit-test discovery separate from Playwright E2E specs.
- Count CRM contacts as master data, not period-limited transactions.
- Remove five unused TypeScript declarations reported by strict `tsc -b`.

This runs at npm's pretest lifecycle, after both source-generating prebuild scripts.
It fails safely if the source shape changes unexpectedly and never weakens TypeScript checks.
"""
from __future__ import annotations
from pathlib import Path
import re
import sys

ROOT = Path(__file__).resolve().parents[1]
VITE_CONFIG = ROOT / "vite.config.ts"
REPORTS = ROOT / "src/data/mock/previewReports.ts"
APP_SHELL = ROOT / "src/app/layouts/AppShell.tsx"
DASHBOARD = ROOT / "src/modules/dashboard/DashboardPage.tsx"
OPERATIONS = ROOT / "src/modules/operations/OperationsWorkspacePage.tsx"


def fail(message: str) -> "NoReturn":
    print(f"ERROR: LEXA build-origin repair: {message}", file=sys.stderr)
    raise SystemExit(1)


def repair_config(text: str) -> str:
    include = "    include: ['src/**/*.test.{ts,tsx}'],"
    if include in text:
        return text
    # Never overwrite an unexpected config. Patch only the known existing test block.
    marker = "  test: {\n"
    if text.count(marker) != 1:
        fail("could not safely find exactly one Vitest test configuration block in vite.config.ts")
    return text.replace(marker, marker +
        "    // Playwright E2E specs are run separately through npm run test:e2e.\n" +
        include + "\n", 1)


def repair_reports(text: str) -> str:
    old = "  const contacts = rows('contacts');"
    new = ("  // Master-data coverage is independent of the selected activity period.\n"
           "  const contacts = source['contacts'] ?? [];")
    if new in text:
        return text
    if text.count(old) != 1:
        fail("could not safely find the contact-count source line in previewReports.ts")
    return text.replace(old, new, 1)



def remove_named_import(text: str, module: str, symbol: str) -> str:
    """Remove one named import without touching unrelated imports or usage."""
    pattern = re.compile(r"import\s*\{([^}]*)\}\s*from\s*(['\"])([^'\"]+)\2;", re.S)
    matches = list(pattern.finditer(text))
    for match in matches:
        if match.group(3) != module:
            continue
        names = [name.strip() for name in match.group(1).split(',') if name.strip()]
        if symbol not in names:
            continue
        names.remove(symbol)
        if not names:
            replacement = ''
        else:
            quote = match.group(2)
            replacement = "import { " + ", ".join(names) + " } from " + quote + module + quote + ";"
        return text[:match.start()] + replacement + text[match.end():]
    return text


def repair_unused_typescript(app_shell: str, dashboard: str, operations: str) -> tuple[str, str, str, list[str]]:
    """Make the five known TS6133/TS6198 declarations idempotently absent."""
    fixes: list[str] = []

    dead_nav = "  const navigate = useNavigate();\n"
    if dead_nav in app_shell:
        if app_shell.count(dead_nav) != 1:
            fail("AppShell.tsx: expected one navigate declaration")
        # If a later code change starts using navigate, leave the declaration intact.
        if len(re.findall(r"\bnavigate\b", app_shell)) == 1:
            app_shell = app_shell.replace(dead_nav, "", 1)
            app_shell = remove_named_import(app_shell, "react-router", "useNavigate")
            fixes.append("AppShell: removed unused navigate declaration/import")
    elif len(re.findall(r"\buseNavigate\b", app_shell)) == 1:
        app_shell = remove_named_import(app_shell, "react-router", "useNavigate")

    # Activity was imported solely for a dashboard icon that the page does not render.
    activity_count = len(re.findall(r"\bActivity\b", dashboard))
    activity_line = "  Activity, ArrowDownRight"
    if activity_count == 1 and activity_line in dashboard:
        dashboard = dashboard.replace(activity_line, "  ArrowDownRight", 1)
        fixes.append("Dashboard: removed unused Activity icon import")
    elif activity_count == 1:
        dashboard = remove_named_import(dashboard, "lucide-react", "Activity")
        fixes.append("Dashboard: removed unused Activity icon import")

    # MODULE_CATALOG was imported but never used in OperationsWorkspacePage itself.
    if len(re.findall(r"\bMODULE_CATALOG\b", operations)) == 1 and "EXISTING_MODULE_LINKS, MODULE_CATALOG, PHASE_TWO_LINKS," in operations:
        operations = operations.replace("EXISTING_MODULE_LINKS, MODULE_CATALOG, PHASE_TWO_LINKS,", "EXISTING_MODULE_LINKS, PHASE_TWO_LINKS,", 1)
        fixes.append("Operations: removed unused MODULE_CATALOG import")

    # Only operate inside ModuleDirectoryPage; queryClient/useWorkspace are used in other page components.
    start_marker = "function ModuleDirectoryPage() {"
    start = operations.find(start_marker)
    if start < 0:
        fail("OperationsWorkspacePage.tsx: ModuleDirectoryPage was not found")
    next_function = re.search(r"\nfunction [A-Za-z_$][\w$]*\s*\(", operations[start + len(start_marker):])
    end = start + len(start_marker) + next_function.start() if next_function else len(operations)
    directory = operations[start:end]
    old_workspace = "  const { workspace, branch } = useWorkspace();\n"
    old_query_client = "  const queryClient = useQueryClient();\n"
    if old_workspace in directory:
        directory = directory.replace(old_workspace, "", 1)
        fixes.append("Module directory: removed unused workspace/branch destructuring")
    if old_query_client in directory:
        directory = directory.replace(old_query_client, "", 1)
        fixes.append("Module directory: removed unused queryClient declaration")
    operations = operations[:start] + directory + operations[end:]

    # Assertions intentionally match the exact diagnostics from the supplied Vercel run.
    if "const navigate = useNavigate();" in app_shell and len(re.findall(r"\bnavigate\b", app_shell)) == 1:
        fail("AppShell.tsx: unused navigate declaration remains")
    dash_import = re.search(r"import\s*\{([^}]*)\}\s*from\s*['\"]lucide-react['\"]", dashboard, re.S)
    if dash_import and re.search(r"\bActivity\b", dash_import.group(1)) and len(re.findall(r"\bActivity\b", dashboard)) == 1:
        fail("DashboardPage.tsx: unused Activity import remains")
    if (re.search(r"EXISTING_MODULE_LINKS,\s*MODULE_CATALOG,\s*PHASE_TWO_LINKS", operations)
            and len(re.findall(r"\bMODULE_CATALOG\b", operations)) == 1):
        fail("OperationsWorkspacePage.tsx: unused MODULE_CATALOG import remains")
    start = operations.find(start_marker)
    next_function = re.search(r"\nfunction [A-Za-z_$][\w$]*\s*\(", operations[start + len(start_marker):])
    end = start + len(start_marker) + next_function.start() if next_function else len(operations)
    directory = operations[start:end]
    if old_workspace in directory and len(re.findall(r"\bworkspace\b", directory)) == 1 and len(re.findall(r"\bbranch\b", directory)) == 1:
        fail("OperationsWorkspacePage.tsx: unused workspace/branch declarations remain")
    if old_query_client in directory and len(re.findall(r"\bqueryClient\b", directory)) == 1:
        fail("OperationsWorkspacePage.tsx: unused queryClient declaration remains")
    return app_shell, dashboard, operations, fixes

def main() -> None:
    if not VITE_CONFIG.is_file():
        fail(f"missing file: {VITE_CONFIG.relative_to(ROOT)}")
    if not REPORTS.is_file():
        fail(f"missing file: {REPORTS.relative_to(ROOT)}")

    required = (APP_SHELL, DASHBOARD, OPERATIONS)
    for path in required:
        if not path.is_file():
            fail(f"missing file: {path.relative_to(ROOT)}")

    # Validate every transform before writing any source file.
    config_before = VITE_CONFIG.read_text(encoding="utf-8")
    reports_before = REPORTS.read_text(encoding="utf-8")
    app_before = APP_SHELL.read_text(encoding="utf-8")
    dash_before = DASHBOARD.read_text(encoding="utf-8")
    ops_before = OPERATIONS.read_text(encoding="utf-8")
    config_after = repair_config(config_before)
    reports_after = repair_reports(reports_before)
    app_after, dash_after, ops_after, ts_fixes = repair_unused_typescript(app_before, dash_before, ops_before)
    if "src/**/*.test.{ts,tsx}" not in config_after:
        fail("Vitest include guard was not established")
    if "const contacts = source['contacts'] ?? [];" not in reports_after:
        fail("master-data contact count guard was not established")

    changes = ((VITE_CONFIG, config_before, config_after), (REPORTS, reports_before, reports_after),
               (APP_SHELL, app_before, app_after), (DASHBOARD, dash_before, dash_after),
               (OPERATIONS, ops_before, ops_after))
    for path, before, after in changes:
        if after != before:
            path.write_text(after, encoding="utf-8")

    print("Fixed Vitest discovery: unit tests only; Playwright remains a separate runner." if config_after != config_before else "Vitest discovery fix already applied.")
    print("Fixed preview reporting: CRM contacts-on-file counts all saved contacts." if reports_after != reports_before else "CRM master-data count fix already applied.")
    for fix in ts_fixes:
        print("Fixed strict TypeScript build: " + fix + ".")
    if not ts_fixes:
        print("Strict TypeScript unused-declaration guard already satisfied.")


if __name__ == "__main__":
    main()
