# LEXA canonical palette + module accents patch

**Patch date:** 29 October 2026  
**Target repository:** `MONALISA2003-CMD/The-LEXA-`  
**Target frontend:** `lexa-frontend/`

## What the patch changes

- Updates the frontend `prebuild` command so the existing module-completion step is followed by `scripts/apply_lexa_palette.py` and then the current test suite.
- Defines semantic LEXA light/dark tokens for primary/secondary actions, text, surfaces, borders, focus, success, warning, danger, informational feedback, disabled states and elevation. Existing navy identity and logo assets are retained.
- Consolidates the former `lexa-brand-authority.css` rules into the existing `lexa-brand.css` stylesheet during prebuild, and removes the authority import/file from that build workspace so it is not a second permanently loaded stylesheet.
- Adds explicit typed `moduleAccents.ts` metadata and a coverage test. The script wires it to sidebar groups and links, the module directory/cards, operational module headings, dashboard metrics and shortcuts, plus Products, Inventory, Checkout, Sales and Business Tools pages. The standalone `/business-tools` route receives an explicit cyan accent, and the build-time coverage gate validates it after the module-completion step adds the route.
- Adds automated tests for route/module accent coverage and light/dark contrast pairs. Tests include WCAG AA text-pair checks at 4.5:1 and focus/control-edge checks at 3:1.
- Preserves all existing page roots, route definitions and business workflows; no module data or records are deleted by this patch.

## Apply

Upload this ZIP to the **repository root** of `MONALISA2003-CMD/The-LEXA-` on `main` using the existing repository ZIP extraction workflow. The archive entries are repository-relative: `lexa-frontend/package.json` and `lexa-frontend/scripts/apply_lexa_palette.py`, plus this note. The existing `scripts/complete_modules.py` and `scripts/fix_build_origin.py` remain in the repository and are not replaced.

After the extracted-file commit, Vercel should start a new build. The prebuild step applies the styling changes to the build workspace before running `npm test`; a successful production build must then complete `tsc -b` and `vite build` as usual.

## Build-failure follow-up

The next Vercel build exposed one missing route in this patch: the earlier module-completion prebuild injects `/business-tools` into the sidebar, but the original accent manifest did not include it. The corrected patch now maps that route to `cyan`, accents the Business Tools page root, and adds a direct regression assertion. Keep the route coverage gate enabled; do not bypass it.

## Latest build failure and correction

The Vercel log for commit `7022c63` passed the palette's module-accent gate and reported 65 passing tests, but the generated stylesheet test failed before running because it tried to read a CSS file through `new URL(..., import.meta.url)`. Vite/Vitest can rewrite `import.meta.url` to a non-file URL. The helper in this archive now reads the stylesheet from the frontend working directory with `readFileSync(resolvePath(process.cwd(), 'src/styles/lexa-brand.css'), 'utf8')`; the Node path helper is aliased as `resolvePath` to avoid colliding with the test's CSS-token `resolve()` function.

## Validation status and limitation

The helper passes Python syntax validation and a repeat-run fixture test. The generated stylesheet/token test was executed in a lightweight local harness and all 5 checks passed. The archive integrity check also passes. This session could not clone the full repo because network DNS access to GitHub was unavailable, and the full dependency tree is not present locally. Thus the actual complete Vitest run, `tsc -b`, `vite build`, and real browser/mobile inspection could not be rerun end-to-end here. Do not consider production green until the next Vercel build completes tests, TypeScript compilation, and Vite production build successfully. Direct GitHub write/deployment access was also unavailable during this session, so the patch is packaged but not committed or deployed by this session.
