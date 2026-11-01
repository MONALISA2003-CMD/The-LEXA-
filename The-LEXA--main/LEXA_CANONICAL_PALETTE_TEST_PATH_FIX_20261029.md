# LEXA stylesheet-test path resolution fix

**Date:** 29 October 2026  
**Repository:** `MONALISA2003-CMD/The-LEXA-`  
**Target:** `lexa-frontend/scripts/apply_lexa_palette.py`

## Failure observed

The Vercel build at commit `7022c63` passed the explicit module-accent check and ran the unit suite. The existing 15 test files and 65 tests passed, but the generated `src/styles/lexa-brand.test.ts` suite failed at import time:

`TypeError: The URL must be of scheme file`

The generated test attempted `readFileSync(new URL('./lexa-brand.css', import.meta.url), 'utf8')`. In Vite/Vitest's transformed test environment, `import.meta.url` can be rewritten to a non-file URL; Node's `readFileSync` only accepts file URLs for URL objects.

## Fix in this ZIP

The palette helper now generates the stylesheet test with:

- `import { resolve as resolvePath } from 'node:path';`
- `readFileSync(resolvePath(process.cwd(), 'src/styles/lexa-brand.css'), 'utf8')`

`resolvePath` is deliberately aliased because the stylesheet test also declares its own `resolve()` function to follow CSS custom-property references. Using the unaliased name would create a duplicate identifier.

The explicit `/business-tools` cyan accent and page-root styling correction are retained.

## Checks performed here

- `python3 -m py_compile scripts/apply_lexa_palette.py` — passed.
- Palette-helper fixture run twice — passed; confirms idempotent style merging, explicit route accent metadata and source wiring.
- Generated stylesheet test executed against the resulting fixture CSS in a lightweight local harness — all 5 checks passed (light/dark WCAG AA text/status/disabled contrast, light/dark focus/control contrast, and semantic role presence).
- ZIP integrity — checked when packaging.

## What is not claimed

The full frontend repository could not be cloned into this environment (network DNS access to GitHub was unavailable), and its full dependency tree is not present locally. Therefore I could not rerun the actual 16-file Vitest suite, `tsc -b`, or `vite build` end-to-end here. The Vercel log supplied proves that 65 existing tests passed but does not show TypeScript or Vite finishing. Treat the next Vercel run as the final end-to-end gate; do not mark production green until test, typecheck, and Vite build all finish successfully.
