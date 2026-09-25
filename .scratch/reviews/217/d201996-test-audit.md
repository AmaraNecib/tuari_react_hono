# Test Audit — #217 dashboard view-model seam

- **Mode:** local-only
- **Base:** `6be3497` (cached origin/develop, pinned by issuer)
- **HEAD reviewed:** `d201996` (final; evidence regenerated after the
  `buildEmployeeRow` → `buildEmployeeTableRow` seam-property rename — a
  behaviour-preserving rename, see `d201996-code-review.md`)
- **Tier:** Standard (test-audit required)

## Scope

New `home-view-derived-composition.test.ts` (the one composition test) plus the
seam change it pins (`home-view-derived.ts`, `home-view-derived-employees.ts`,
`employees-section.tsx`, `home-view-page-content-sections.tsx`). Existing
derived tests were checked for regressions (`home-view-derived-builders`,
`-employee-row`, `-helpers`, `home-view.test.tsx`).

Ran three parallel agents (edge-case hunter, coverage analyst, quality
reviewer) against base `6be3497`..HEAD.

## Findings (synthesized)

| # | Finding | Severity | Disposition |
|---|---------|----------|-------------|
| 1 | Drift invariant is somewhat self-referential (both branches call the same internal row logic); it is a regression/consistency guard, not a logic test | 🟡 | Accepted — intent documented in the test; row-logic correctness covered by `-employee-row`/`-helpers` unit tests; `employeeRows` length + edge employees keep it non-vacuous |
| 2 | Orphan-role employee not exercised through the seam | 🟡 | **Fixed** — added `orphan-1` (role-missing) to fixture; assert `role === "shell.noManager"` |
| 3 | Non-ACTIVE (LEFT) employee not exercised through the seam | 🟡 | **Fixed** — added `inactive-worker-1` (LEFT); assert `leaveDisabledReason === leaveReasonInactive` |
| 4 | Hardcoded exact `metrics` literal (brittle snapshot) | 🟡 cosmetic | Accepted — fixed fixture; literal is intentional and small |
| 5 | ~250-line inline fixture duplicates `builders.test` fixture | 🟡 | Deferred follow-up — `__test-utils__/workspace-fixtures.tsx` forces jsdom + hoisted `vi.mock` (wrong for a pure unit test); a dedicated pure fixture module could be extracted later |
| 6 | No automated "employees-section has no internal imports" test | 🟢 | Structural guarantee via prop injection; recurrence improbable |
| 7 | Empty `items` → `[]` path | 🟢 | Behavior unchanged; covered by existing `home-view.test.tsx` cases |
| 8 | `buildEmployeeRows` optional `relationshipFacts` param — both branches exercised | 🟢 | OK |

## Verdict

No 🔴/🟠 fixes required. Quality grade **B+**. The two low-risk edge additions
(orphan-role + inactive employee) recommended by reviewers were applied to the
single composition test, preserving the "one composition test" shape.

## Checks re-run after fix

- `pnpm --filter @tuari/web vitest run src/features/app-shell` — 16 files / 172
  tests pass
- `pnpm --filter @tuari/web typecheck` — pass
