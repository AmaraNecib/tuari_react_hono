# Test Audit — issue #271 (i18n raw keys + ar.ts drift + CI gate)

- Head SHA: `bcaf3ef` (final; test-fix delta on top of `37304f8`)
- Base: `origin/develop` (merge-base `03ec349`)
- Reviewer sub-agent: test-audit workflow `c1eb75f1`

## Findings

**No blockers.** Verified:
- `node scripts/check-i18n-keys.mjs` → `missing: 0`, exit 0 (1420 t() calls,
  1035 distinct keys; 8 redundant-fallback + 7 dynamic-key warnings only).
- `node --test ./tests/i18n-keys.test.mjs` → 2/2 pass. Drift mechanism
  confirmed: `execFileAsync` rejects on non-zero exit (missing key → exit 1
  fails the test); stdout regex pins the count; package.json wiring asserted
  in both `lint` and `test`.
- Unit files pass 4/4 (system-log-section, roles-section, update-section,
  license-settings).

1. **important** — 404 NotFoundPage (`detailPages.notFound.*` rename) covered
   by no test. **Fixed**: E2E sweep now navigates to an unknown route and
   asserts the translated "الصفحة غير موجودة" heading + no raw keys
   (`tests/e2e/i18n-raw-keys.spec.ts`).
2. **minor** — system-log empty state (`entries: []`) untested. **Fixed**:
   added unit test asserting the translated empty row
   (`system-log-section.test.tsx`).
3. **minor** — RAW_KEY_PATTERN had no trailing boundary (glued-key false
   negatives). **Fixed**: pattern now matches the full dotted chain
   `ns\.[a-zA-Z]+(?:\.[a-zA-Z]+)*(?![\w.])`.

**Post-evidence delta (test-only, after 37304f8 review):** the two fixes above
plus the regex tightening; no production code changed since the code-review
evidence SHA.

## Summary

- 0 blockers, 3 findings (1 important + 2 minor) — all fixed and re-verified
  (unit 4/4, E2E 3/3).
