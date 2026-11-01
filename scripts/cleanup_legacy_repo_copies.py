#!/usr/bin/env python3
"""Consolidate LEXA to one repository root and archive non-active historical material."""
from __future__ import annotations

from hashlib import sha256
from pathlib import Path
import shutil

ROOT = Path(__file__).resolve().parents[1]


def digest(path: Path) -> str:
    h = sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def preserve(src_rel: str, dst_rel: str) -> None:
    """Preserve a useful file once; archive a conflicting historical version."""
    src = ROOT / src_rel
    if not src.is_file():
        return
    dst = ROOT / dst_rel
    dst.parent.mkdir(parents=True, exist_ok=True)
    if not dst.exists():
        shutil.copy2(src, dst)
        print(f"Archived: {src_rel} -> {dst_rel}")
    elif digest(src) == digest(dst):
        print(f"Duplicate historical copy omitted: {src_rel}")
    else:
        fallback = ROOT / "docs" / "archive" / "legacy-versions" / Path(src_rel).name
        fallback.parent.mkdir(parents=True, exist_ok=True)
        if not fallback.exists():
            shutil.copy2(src, fallback)
            print(f"Preserved differing legacy version: {src_rel} -> {fallback.relative_to(ROOT)}")


# Unique material from older patch bundles. SQL remains in an archive location,
# never in backend/prisma/migrations where it could be run accidentally.
PRESERVE = {
    "LEXA_WS8_updated/WORKSTREAM8_RENDER_BLUEPRINT_CORRECTION_20261101.md": "docs/archive/deployment/WORKSTREAM8_RENDER_BLUEPRINT_CORRECTION_20261101.md",
    "LEXA_WS8_updated/docs/workstream8/RENDER_BLUEPRINT_AND_AI_ACTIVATION.md": "docs/archive/deployment/RENDER_BLUEPRINT_AND_AI_ACTIVATION.md",
    "LEXA_WS8_updated/scripts/validate_workstream8_render.py": "docs/archive/tools/validate_workstream8_render.py",
    "LEXA_Workstream4_Reviewed_Patch/backend/prisma/migrations/20261030330000_crm_first_class_entities_and_quote_acceptance/migration.sql": "docs/archive/deferred-migrations/20261030330000_crm_first_class_entities_and_quote_acceptance/migration.sql",
    "LEXA_Workstream4_Reviewed_Patch/validation/LEDGER_AUDIT.md": "docs/archive/validation/LEDGER_AUDIT.md",
    "LEXA_Workstream4_Reviewed_Patch/validation/NEON_BRANCH_TEST.md": "docs/archive/validation/NEON_BRANCH_TEST.md",
    "increment-5/backend/prisma/migrations/20261030220000_general_ledger/migration.sql": "docs/archive/deferred-migrations/20261030220000_general_ledger/migration.sql",
    "increment-5/README_INCREMENT_5.md": "docs/archive/historical-patches/README_INCREMENT_5.md",
    "increment-5/IMPLEMENTATION_STATUS.md": "docs/archive/historical-patches/INCREMENT_5_IMPLEMENTATION_STATUS.md",
    "increment-5/FILE_MANIFEST.txt": "docs/archive/historical-patches/INCREMENT_5_FILE_MANIFEST.txt",
    "increment-5/lexa-frontend/src/modules/operations/GeneralLedgerPage.tsx": "docs/archive/ui-reference/GeneralLedgerPage.tsx",
    "LEXA_Render_Vercel_Build_Repairs_20261031/BUILD_REPAIR_NOTES_20261031.md": "docs/archive/deployment/BUILD_REPAIR_NOTES_20261031.md",
    "LEXA_Render_Vercel_Build_Repairs_20261031/PATCH_MANIFEST.txt": "docs/archive/deployment/BUILD_REPAIR_PATCH_MANIFEST.txt",
}

# Older top-level notes are filed by subject. The active README and current
# deployment/architecture guides remain at their canonical locations.
ROOT_FILE_ARCHIVE = {
    "ACCOUNTS_RECEIVABLE_INCREMENT_3.md": "docs/history/ACCOUNTS_RECEIVABLE_INCREMENT_3.md",
    "APPLY_AND_VERIFY.txt": "docs/archive/legacy-instructions/APPLY_AND_VERIFY.txt",
    "APPLY_LEXA_LATEST_BUILDFIXES.py": "docs/archive/legacy-tools/APPLY_LEXA_LATEST_BUILDFIXES.py",
    "AUTH_SETUP_GUIDE.md": "docs/deployment/AUTH_SETUP_GUIDE.md",
    "BACKEND.md": "docs/architecture/BACKEND.md",
    "BACKEND_HANDOFF.md": "docs/architecture/BACKEND_HANDOFF.md",
    "BUILD_FIX_NOTES.md": "docs/deployment/BUILD_FIX_NOTES.md",
    "DEPLOYMENT_AUDIT_AND_GREEN_BUILD_FIX_20261101.md": "docs/deployment/DEPLOYMENT_AUDIT_AND_GREEN_BUILD_FIX_20261101.md",
    "DEPLOYMENT_BUILD_REPAIRS_20261031.md": "docs/deployment/DEPLOYMENT_BUILD_REPAIRS_20261031.md",
    "DEPLOYMENT_BUILD_REPAIRS_20261101.md": "docs/deployment/BUILD_REPAIRS_20261101.md",
    "DEPLOYMENT_HEALTHCHECK.md": "docs/deployment/DEPLOYMENT_HEALTHCHECK.md",
    "GREEN_BUILD_PACKAGE_MANIFEST.json": "docs/release/GREEN_BUILD_PACKAGE_MANIFEST.json",
    "GREEN_BUILD_PATCH_APPLY_INSTRUCTIONS.md": "docs/release/GREEN_BUILD_PATCH_APPLY_INSTRUCTIONS.md",
    "HANDOFF_20261101.md": "docs/handoffs/HANDOFF_20261101.md",
    "HANDOFF_WORKSTREAM8_20261101.md": "docs/handoffs/HANDOFF_WORKSTREAM8_20261101.md",
    "INCREMENT_1_IMPLEMENTATION_REPORT.md": "docs/history/INCREMENT_1_IMPLEMENTATION_REPORT.md",
    "INCREMENT_2_IMPLEMENTATION_REPORT.md": "docs/history/INCREMENT_2_IMPLEMENTATION_REPORT.md",
    "INCREMENT_3_4_5_IMPLEMENTATION_REPORT.md": "docs/history/INCREMENT_3_4_5_IMPLEMENTATION_REPORT.md",
    "INCREMENT_4_INSTALLATION.md": "docs/history/INCREMENT_4_INSTALLATION.md",
    "INFRA_SETUP_STATUS.md": "docs/deployment/INFRA_SETUP_STATUS.md",
    "INSTALLATION.md": "docs/deployment/INSTALLATION.md",
    "LEXA_BRAND_AUTHORITY_APPLY.md": "docs/archive/design-system/LEXA_BRAND_AUTHORITY_APPLY.md",
    "LEXA_BRAND_UI_SYSTEM.md": "docs/archive/design-system/LEXA_BRAND_UI_SYSTEM.md",
    "LEXA_CANONICAL_PALETTE_APPLY.md": "docs/archive/design-system/LEXA_CANONICAL_PALETTE_APPLY.md",
    "LEXA_CANONICAL_PALETTE_TEST_PATH_FIX_20261029.md": "docs/archive/design-system/LEXA_CANONICAL_PALETTE_TEST_PATH_FIX_20261029.md",
    "LEXA_CONFIRMED_BUILD_REPAIRS.md": "docs/archive/deployment/LEXA_CONFIRMED_BUILD_REPAIRS.md",
    "LEXA_LATEST_TYPESCRIPT_REPAIR_NOTES.md": "docs/archive/deployment/LEXA_LATEST_TYPESCRIPT_REPAIR_NOTES.md",
    "LEXA_MODULE_COMPLETION_README.md": "docs/history/LEXA_MODULE_COMPLETION_README.md",
    "LEXA_STRICT_TYPESCRIPT_FIX_NOTES.md": "docs/archive/deployment/LEXA_STRICT_TYPESCRIPT_FIX_NOTES.md",
    "LEXA_VERCEL_LATEST_DIAGNOSIS_20261029.md": "docs/archive/deployment/LEXA_VERCEL_LATEST_DIAGNOSIS_20261029.md",
    "MODULE_INTEGRATION_INCREMENT_1.md": "docs/history/MODULE_INTEGRATION_INCREMENT_1.md",
    "OPERATIONAL_WORKFLOWS_INCREMENT_2.md": "docs/history/OPERATIONAL_WORKFLOWS_INCREMENT_2.md",
    "PATCH_GUIDE.md": "docs/archive/legacy-instructions/PATCH_GUIDE.md",
    "PATCH_VERSION.txt": "docs/archive/legacy-instructions/PATCH_VERSION.txt",
    "README.txt": "docs/archive/legacy-instructions/README.txt",
    "README_PATCH_CONTENTS.txt": "docs/archive/legacy-instructions/README_PATCH_CONTENTS.txt",
    "RENDER_MIGRATION_RECOVERY_20261031.md": "docs/deployment/RENDER_MIGRATION_RECOVERY_20261031.md",
    "SINGLE_SERVICE_AI_REDESIGN_20261101.md": "docs/architecture/SINGLE_SERVICE_AI_REDESIGN_20261101.md",
    "VALIDATION_RESULTS_20261101.txt": "docs/validation/VALIDATION_RESULTS_20261101.txt",
    "VALIDATION_RESULTS_GREEN_FIX_20261101.txt": "docs/validation/VALIDATION_RESULTS_GREEN_FIX_20261101.txt",
    "VALIDATION_RESULTS_SINGLE_SERVICE_20261101.txt": "docs/validation/VALIDATION_RESULTS_SINGLE_SERVICE_20261101.txt",
    "VALIDATION_RESULTS_WORKSTREAM8_20261101.txt": "docs/validation/VALIDATION_RESULTS_WORKSTREAM8_20261101.txt",
    "VERCEL_READONLY_BUILD_FIX.md": "docs/deployment/VERCEL_READONLY_BUILD_FIX.md",
    "WORKSTREAM5_IMPLEMENTATION.md": "docs/history/WORKSTREAM5_IMPLEMENTATION.md",
    "WORKSTREAM6_BUILD_REPAIR_20261031.md": "docs/deployment/WORKSTREAM6_BUILD_REPAIR_20261031.md",
    "WORKSTREAM6_IMPLEMENTATION.md": "docs/history/WORKSTREAM6_IMPLEMENTATION.md",
    "WORKSTREAM7_COMPLETION_AND_BLOCKERS.md": "docs/history/WORKSTREAM7_COMPLETION_AND_BLOCKERS.md",
    "WORKSTREAM7_IMPLEMENTATION.md": "docs/history/WORKSTREAM7_IMPLEMENTATION.md",
    "WORKSTREAM8_IMPLEMENTATION_20261101.md": "docs/history/WORKSTREAM8_IMPLEMENTATION_20261101.md",
    "WORKSTREAM8_RENDER_KEYS_20261101.md": "docs/deployment/AI_PROVIDER_SETUP_20261101.md",
    "WORKSTREAMS_0_3_AUDIT_MATRIX.md": "docs/history/WORKSTREAMS_0_3_AUDIT_MATRIX.md",
    "WORKSTREAMS_0_3_IMPLEMENTATION_NOTES.md": "docs/history/WORKSTREAMS_0_3_IMPLEMENTATION_NOTES.md",
    "WORKSTREAMS_0_3_PATCH_MANIFEST.txt": "docs/archive/legacy-instructions/WORKSTREAMS_0_3_PATCH_MANIFEST.txt",
}

for src, dst in PRESERVE.items():
    preserve(src, dst)

for src_rel, dst_rel in ROOT_FILE_ARCHIVE.items():
    src = ROOT / src_rel
    if src.is_file():
        preserve(src_rel, dst_rel)
        src.unlink()
        print(f"Removed historical root-level copy: {src_rel}")

REMOVE_DIRS = [
    "The-LEXA",
    "The-LEXA--main",
    "LEXA_WS8_updated",
    "LEXA_Render_Current_Fix",
    "LEXA_Render_TS2339_Fix",
    "LEXA_Render_Vercel_Build_Repairs_20261031",
    "LEXA_Workstream4_Reviewed_Patch",
    "LEXA_Workstreams_0_3_Patch",
    "increment-5",
]
for rel in REMOVE_DIRS:
    path = ROOT / rel
    if path.exists():
        shutil.rmtree(path)
        print(f"Removed duplicate/obsolete directory: {rel}/")

# Downloaded archives must never remain in source control. The active import
# workflow removes its input ZIP before calling this script; this also cleans
# up any older archives left by previous imports.
for path in sorted(ROOT.rglob("*.zip")):
    if ".git" not in path.parts:
        path.unlink()
        print(f"Removed downloaded archive: {path.relative_to(ROOT)}")

# Remove generated local dependency/cache directories, never source or migrations.
for directory in ("node_modules", "dist", "coverage", ".vercel", "__pycache__", ".pytest_cache", ".mypy_cache"):
    for path in sorted(ROOT.rglob(directory), reverse=True):
        if ".git" not in path.parts and path.is_dir():
            shutil.rmtree(path, ignore_errors=True)

for path in ROOT.rglob("*.pyc"):
    if ".git" not in path.parts:
        path.unlink(missing_ok=True)

print("LEXA source consolidated: one frontend, one backend, historical records archived, no nested repository snapshots.")
