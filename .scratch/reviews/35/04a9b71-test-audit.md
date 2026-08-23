# Test audit — issue #35 (atomic employee save) — HEAD f10ee2d

Base: `842f6ea`. Three parallel reviewers (edge-case hunter, coverage analyst,
test-quality reviewer) ran on `employee-edit-save.test.tsx`,
`employee-save-reconcile.test.ts`, and their sources. All findings below were
resolved in commit `f10ee2d` unless marked accepted.

## Edge-case hunter

- 🟠 `employeesGet` `success:false` branch untested → **fixed** (new RTL test:
  `success:false` → `partialUnverified` banner, placement still restored, no nav).
- 🟠 Non-ACTIVE worker placement silently dropped → **pinned as #20 contract**
  (new test: saves profile only, navigates, workplace mutation never called, no
  banner — expected behavior, not an error).
- 🟠 Double-save race (both `handleSubmit` fire before `isPending` disables the
  button; second save captures stale pre-save snapshots, late `employeesGet`
  `setState` can overwrite) → **fixed** (in-flight `useRef` guard in
  `handleSubmit`; new double-click test asserts one mutation call, one nav).
- 🟠 User typing during the reconcile fetch gets clobbered by the late
  `setState` → **accepted, documented** (submit guard blocks a second save; an
  input-level lock is a broader UX change; window is one RPC round-trip; banner
  explains the reset).
- 🟡 Salary normalization coercion (`1e5`, `0x10`, `1_000` accepted) —
  pre-existing `parseSalaryAmount` behavior, dispatch is blocked by validation
  when NaN; out of #35 scope → accepted, not addressed.
- 🟡 `updateRole` leaves `workerWarehouseId` set on worker→PM switch → harmless
  today (section hidden, dispatch gated on `isWorker`); accepted, not addressed.
- 🟡 No warehouse-manager integration test; also the warehouse pure-test title
  claimed a "later step failed" that cannot exist (warehouses is the last step)
  → **fixed** (RTL warehouse-manager failure test; title renamed).
- Residual (not a bug): if the client ever resolves-with-result on business
  errors instead of rejecting, `catch` would not fire; contract not planned →
  documented in design doc.

## Coverage analyst

- All five acceptance criteria covered with distinct assertions; two roles
  exercised; two failure depths; both banner kinds asserted via literal i18n
  text. Pure module covers all per-step truth branches incl. "never ran".
- Duplicate coverage between RTL and pure tests is layering, not waste.
- Missing: warehouse-manager RTL (→ fixed), `employeesGet` `success:false`
  (→ fixed), banner-clear-on-next-submit (→ fixed: `setSaveError(null)` moved
  to the top of `handleSaveAll`, new test), success test banner-absence
  assertion (accepted: navigation assertion suffices).

## Test-quality reviewer — Grade B (raised by the fixes)

- Convention adherence strong (real i18n, mocked router/navigation/mutations,
  `fireEvent` + `waitFor`); `vi.hoisted` is the correct Vitest-4 pattern; no
  jest-dom matchers; explicit `HTMLSelectElement.value`/`checked` checks;
  isolation via `afterEach(cleanup)` + `beforeEach(mockReset)`.
- ☑ Fix applied: profile-reconcile assertion was weak (typed value == fetched
  value, so `getByDisplayValue` could not distinguish kept-vs-reconciled). Now
  the fetch returns an occupation the user never typed and the test asserts it
  renders — proving the rebuild from server truth.
- ☑ Fix applied: pure-test title honesty for the final-step case.
- `toBeTruthy()` on `getBy*` is repo convention (getBy* throws when absent).
- No blockers.

## Verdict

All "fix it" items fixed in `f10ee2d`. Remaining items are documented accepted
risks (out of the atomicity contract or pre-existing behavior). Full web suite:
**617/617 passed**, typecheck + lint green at this SHA.
## Post-evidence note

Evidence pinned at code HEAD `04a9b71` (the `f10ee2d` names were superseded by the EOF-newline commit `04a9b71`; that commit changes no behavior). Review runs happened against the `f10ee2d` tree, which is identical except for a trailing newline; the full gate battery (617 web tests, typecheck, lint) is re-run at `04a9b71` before push.
