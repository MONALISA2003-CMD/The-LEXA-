#!/usr/bin/env python3
"""Archive unique files from legacy patch bundles and remove duplicated repository snapshots."""
from pathlib import Path
import shutil

ROOT = Path(__file__).resolve().parents[1]

def preserve(src_rel: str, dst_rel: str) -> None:
    src = ROOT / src_rel
    dst = ROOT / dst_rel
    if not src.is_file():
        return
    dst.parent.mkdir(parents=True, exist_ok=True)
    if not dst.exists():
        shutil.copy2(src, dst)

# Preserve only unique historical materials. Deferred SQL files are deliberately
# kept outside backend/prisma/migrations so they cannot run during a production release.
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
for src, dst in PRESERVE.items():
    preserve(src, dst)

REMOVE = [
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
for rel in REMOVE:
    p = ROOT / rel
    if p.exists():
        shutil.rmtree(p)
        print(f"Removed duplicate/obsolete directory: {rel}/")
print("Legacy repository copies removed. Unique review material, including deferred SQL, is retained under docs/archive/.")
