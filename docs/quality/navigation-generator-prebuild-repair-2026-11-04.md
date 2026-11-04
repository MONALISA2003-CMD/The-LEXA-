# LEXA frontend source generation — GitHub Actions prebuild repair

Date: 4 November 2026

## Failing run and exact symptom

GitHub Actions run 41797223970, job 126464049649, reached the frontend build step after other checks. The frontend's `prebuild` script runs:

```sh
node scripts/apply_auth_security_ui.mjs && python3 scripts/complete_modules.py && python3 scripts/apply_lexa_palette.py && npm test
```

`complete_modules.py` stopped with:

```
ERROR: visible navigation sections: expected exactly one source match, found 0; no source changes written
```

This is **not** missing business data and is **not** a broken user permission. The navigation was refactored to use `visibleNavSections` for permission filtering, then `filteredNav` for sidebar search and display. The prebuild generator continued to recognize only the old `{navSections.map((section) => (` and `{visibleNavSections.map((section) => (` anchors. Both are absent in the modern sidebar, which legitimately renders `{filteredNav.map((section) => (`.

## Primary fix

`lexa-frontend/scripts/complete_modules.py` now recognizes the modern trio: `const visibleNavSections = navSections.map(section`, `const filteredNav =`, and `{filteredNav.map((section) => (`. Legacy shells remain supported. Unknown or damaged navigation remains a build-stopping error; no unsafe replacement or disabled validation is used.

The final validation guard also accepts the approved new sidebar rather than assuming the old simple/advanced markup.

## Secondary prebuild failure found before CI

With the first defect repaired, `apply_lexa_palette.py` exposed a second stale assumption: its sidebar accent code expected a `return <NavLink key={item.to} ...` form. The modern pinned, searchable sidebar uses `<NavLink to={item.to} ...` within `lexa-nav-module-link` and already carries `data-module-accent={moduleAccentForPath(item.to)}`.

The palette generator now accepts that modern structure only when the active link, accent attribute and `filteredNav` renderer are all present. It still applies the old transformation when processing a genuinely legacy sidebar and fails safely if neither structure exists.

## Validation performed

- Reproduced the original error against the supplied public-release ZIP.
- Successfully executed `node scripts/apply_auth_security_ui.mjs`, `python3 scripts/complete_modules.py`, `python3 scripts/apply_lexa_palette.py`, and `python3 scripts/fix_build_origin.py` locally.
- Ran the two Python source generators repeatedly and verified **stable SHA-256 checksums** for AppShell, OperationsWorkspacePage and brand CSS.
- Added `lexa-frontend/scripts/test_navigation_codegen.py`: 3 regression tests passed, covering preservation of sidebar search, permissions, pinned actions, module accents, idempotency and safe failure on unknown JSX.
- Parsed 248 TypeScript/TSX files and checked relative source imports: 0 syntax errors, 0 unresolved source imports.
- Backend `npm test`: **182 passed**, 0 failed.
- Backend `npm run contract:check`: **375 operations across 303 routes**, and 17 domain adapters.
- Backend backup inventory check: **passed**.
- `scripts/check_repository_layout.py`: passed after removal of Python-generated `__pycache__` files.

## Limits and follow-up

The full frontend `npm test`/TypeScript/Vite build could **not** be run in this environment: `vitest` is not installed and the npm registry returned `EAI_AGAIN`. GitHub CI must still validate the dependency-backed frontend test and build steps. There were no changes to database records, Cloudflare settings, payment workflows or production deployments in this fix.

The archive is for LEXA's **root-level GitHub ZIP import** and intentionally excludes `package-lock.json` and `.github/` according to the repository's import manifest. Lockfiles are generated during import. Source-import layout validation differs from the full post-import `validate_repository.py` check, which requires the generated lockfiles and must be run in GitHub after the import workflow creates them.
