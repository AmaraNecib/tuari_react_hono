# Issue #234 — Test Audit Evidence

**Head**: `44d6be5f2bb696952a360552fdb2eee0e37fe511`
**Base**: `bb144f3a3a22fe5f72904aaafa511b16a9e4dec2`
**Tier**: High-assurance

Three parallel sub-agents (reviewer): EDGE CASE HUNTER, COVERAGE ANALYST,
TEST QUALITY REVIEWER. Findings applied in commit `44d6be5`; the full
contracts suite (128/128) and API suite (1055/1055) pass after the fixes.

## Edge Case Hunter

No 🔴 (would-break) findings in the implementation. Coverage gaps found and
fixed:

| # | Sev | Gap | Action |
|---|-----|-----|--------|
| 1 | 🟠 | Astral-plane Cf / surrogate-pair length: 4×U+1BCA0 or tag chars U+E0020-E007F are length 8 (2 UTF-16 units each) — must still reach the Cf refine; a refactor to codepoint-length guards would silently change behavior. | FIXED: tests for `"\u{1BCA0}".repeat(4)` and 4 tag chars → rejected. |
| 2 | 🟠 | Mid-string U+FEFF: comment claims it's caught by Cf; only edge-BOM was tested. | FIXED: `key: "a\uFEFFb"` → rejected. |
| 3 | 🟠 | Cf as the SOLE extra char at the min boundary: 7 visible + 1 ZWSP = length 8 must hit the refine; 6 + 1 = 7 must defer. | FIXED: `"abcde12\u200B"` → rejected; `"abcde1\u200B"` added to the single-issue test. |
| 4 | 🟡 | `" \u200B "` (ZWSP-only wrapped in whitespace) promised in the design doc, absent from tests. | FIXED. |
| 5 | 🟡 | Leading/trailing Cf on a visible key (`"\u200Ba1b2-c3d4"`, `"a1b2-c3d4\u200B"`). | FIXED. |
| 6 | 🟡 | Message/label + issue code never asserted (acceptance criterion: "user-facing message"). | FIXED: safeParse asserts `code: "custom"` + `/invisible format characters/`. |
| 7 | 🟡 | Wire lacks ZWSP `currentKey` case. | FIXED: `changeDbEncryptionKey({ currentKey: "\u200B", ... })` → BAD_REQUEST. |
| 8 | 🟡 | #334 residual-class acceptance not pinned (U+2800/Mn/mid-string NBSP pass by design). | FIXED: boundary-pinning test asserts U+2800×8 and `"a\u2800b"` are ACCEPTED, locking the #334 boundary. |

## Coverage Analyst

- Acceptance criteria covered at all three seams: ZWSP-only on all four
  fields (incl. the exact issue case `newKey: "\u200B".repeat(8)`), embedded
  Cf, category spread (U+200B/E/F/C/D), trim-then-Cf ordering, regressions.
- Test diversity good (all-ZWSP, repeated, embedded, astral, whitespace-mixed,
  single-issue). Contract↔wire redundancy is deliberate layering.
- No blockers. Notes addressed: message content pinning (fix #6), wire
  currentKey gap (fix #7). E2E deliberately scoped to the consume path
  (design doc seam 3).

## Test Quality Reviewer

**Grade: A.** Descriptive, issue-referenced test names; all async assertions
awaited; no setup duplication; hermetic harnesses; clean isolation.
Minor note addressed: E2E fetch-status blocks deduplicated via a
`fetchRpcStatus(page, procedure, input)` helper.

## Final state

- `packages/contracts/src/index.test.ts` — 76 tests (3 test files, 128 total)
- `apps/api/src/rpc/router.test.ts` — 27 tests in the router file (63 files,
  1055 total)
- `tests/e2e/recovery-keys.spec.ts` — lifecycle spec incl. ZWSP wire-gate
  check (1 passed; full suite run separately)
