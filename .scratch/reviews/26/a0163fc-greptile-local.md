# Issue #26 — Greptile CLI review (local)

**HEAD:** `a0163fc` · **Base:** `origin/develop` @ `389336a` (local `develop`
label realigned to the cached origin ref before re-review — the stale label
was diffing ~20 unrelated commits) · **Run:** `c853c806-51ed-4fa0-a2b9-f08bf6a3c8be`

## Result

- **Confidence: 4/5** (not a clean gate per the standard: 5/5 / no findings).
- **1 finding (no review comments):** `apps/web/src/features/employees/employee-edit-page.tsx` —
  "an employee update can still commit before a later workplace mutation fails,
  leaving persisted and displayed state inconsistent."

## Finding assessment

Verified against the code: the sequential independent mutations
(`updateEmployee` → `updateEmployeeWorkplace` → `syncManagedProjects/Warehouses`)
**pre-exist at base `389336a`** (lines 257/270/280) — proven via
`git show 389336a:apps/web/src/features/employees/employee-edit-page.tsx`.
Issue #26 only added the `occupation` field inside the first mutation and does
not change the sequencing or failure semantics.

**Proposed disposition: defer to a follow-up** (parent decision required per
crew policy — not silently deferred). A proper fix means an atomic
single-RPC save or a reconcile-on-failure flow for the employee edit page,
which touches the #20 assignment-flow design and is out of #26 scope.

Proposed follow-up: "Make the employee edit page save atomic (single RPC or
transactional multi-call with rollback) and resync form state on failure."

Raw JSON: `a0163fc-greptile-local.json` (same dir).