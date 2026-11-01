# LEXA strict TypeScript/indexed-access repair — 29 October 2026

This patch targets the current `main` source behind the newest failed Vercel deployment (`ad12d0214582a3aa3d78cbdd4d833168848a4e98`). The project has `strict: true` and `noUncheckedIndexedAccess: true`.

## Source fixes

- Guard the payment-line `current[0]` access before spreading it into a typed `PaymentLineDraft`.
- Guard the Simple navigation `navSections[0]` access using optional chaining and an empty-array fallback.
- Guard CSV header-row indexing before using the header and before passing it to `headerMap`.
- Centralize safe optional CSV cell reads so array accesses may return `undefined` without producing strict TypeScript errors or runtime `.trim()` failures.
- Guard the first imported product/movement before using its ID for the audit entry; malformed/empty input now fails transactionally with a clear error.
- Guard backup table lookup before reading `.length` or restoring rows.

## Validation

- `complete_modules.py` passes Python syntax compilation.
- The TypeScript strict-index fixtures pass with the same `strict`, `noUncheckedIndexedAccess`, and `exactOptionalPropertyTypes` settings.
- ZIP integrity and patch path validation pass.
- The complete Vercel TypeScript build has not been run from this container; after extracting the ZIP, verify `npm test`, `npm run typecheck`, and `npm run build` on the new commit.
