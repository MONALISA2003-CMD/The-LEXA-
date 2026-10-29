#!/usr/bin/env python3
"""Idempotent repair for the two source-level failures identified in the Vercel build.

- Scope Vitest to src unit tests so Playwright's e2e/*.spec.ts files are run only by
  `npm run test:e2e`.
- Count CRM contacts as master data, not as transactions constrained by the selected
  reporting period.

Run automatically by npm's pretest lifecycle, including the test step inside prebuild.
"""
from __future__ import annotations
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
VITE_CONFIG = ROOT / "vite.config.ts"
REPORTS = ROOT / "src/data/mock/previewReports.ts"


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


def main() -> None:
    if not VITE_CONFIG.is_file():
        fail(f"missing file: {VITE_CONFIG.relative_to(ROOT)}")
    if not REPORTS.is_file():
        fail(f"missing file: {REPORTS.relative_to(ROOT)}")

    # Validate both transforms before writing either file.
    config_before = VITE_CONFIG.read_text(encoding="utf-8")
    reports_before = REPORTS.read_text(encoding="utf-8")
    config_after = repair_config(config_before)
    reports_after = repair_reports(reports_before)
    if "src/**/*.test.{ts,tsx}" not in config_after:
        fail("Vitest include guard was not established")
    if "const contacts = source['contacts'] ?? [];" not in reports_after:
        fail("master-data contact count guard was not established")

    if config_after != config_before:
        VITE_CONFIG.write_text(config_after, encoding="utf-8")
        print("Fixed Vitest discovery: unit tests only; Playwright remains a separate runner.")
    else:
        print("Vitest discovery fix already applied.")
    if reports_after != reports_before:
        REPORTS.write_text(reports_after, encoding="utf-8")
        print("Fixed preview reporting: CRM contacts-on-file counts all saved contacts.")
    else:
        print("CRM master-data count fix already applied.")


if __name__ == "__main__":
    main()
