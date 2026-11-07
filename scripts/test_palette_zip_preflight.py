#!/usr/bin/env python3
"""Verify source-import ZIP preflight rejects a stale palette generator."""
from pathlib import Path
from tempfile import TemporaryDirectory
from zipfile import ZipFile
from preflight_import_zip import problems

ROOT = Path(__file__).resolve().parents[1]
PALETTE = "lexa-frontend/src/domain/shared/moduleAccents.ts"
GENERATOR = "lexa-frontend/scripts/apply_lexa_palette.py"
PACKAGE = "lexa-frontend/package.json"

with TemporaryDirectory(prefix="lexa-palette-gate-") as temp:
    generated = (ROOT / GENERATOR).read_text()
    assert "...forPaths('gold', ['/intelligence'])" in generated
    stale_generator = generated.replace("...forPaths('gold', ['/intelligence'])",
                                        "...forPaths('blue', ['/intelligence'])", 1)
    with ZipFile(Path(temp) / "stale-source.zip", "w") as archive:
        archive.writestr(GENERATOR, stale_generator)
        archive.writestr(PALETTE, (ROOT / PALETTE).read_bytes())
        archive.writestr(PACKAGE, (ROOT / PACKAGE).read_bytes())
    issues, _ = problems(Path(temp) / "stale-source.zip")
    assert any("would rewrite approved module colors" in issue for issue in issues), issues
print("Palette ZIP preflight regression passed: stale generator rejected before upload.")
