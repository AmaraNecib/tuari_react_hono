# Findings report — PR "inline create from a form"

- **Branch:** `feat/manager-inline`
- **Fix SHA:** `310c325f8a5b745a1b72a5895e12cd80d58b4f14`
- **Reviewed range:** `fdb5dda66b21aa3ca09b5e6a04b4899dcc75fd36...310c325f` (three commits)
- **Parent owns push/PR. This lane never merges.**

## Findings

| # | Severity | Finding | Verdict |
| --- | --- | --- | --- |
| F1 | High (7) | Cancel / Escape / backdrop during an in-flight create still ran the late `onChange(result.id)`, so a cancelled dialog silently created and selected a manager. Pre-existing shared-component defect that this PR's contract depends on. | **Fixed** `createable-select.tsx` — close blocked while `isCreating`, Cancel disabled, `handleCreate` re-entry guard. Fails pre-fix (proved). |
| F2 | High (6) | Switching the project manager field to `CreateableSelect` dropped the base form's `<option value="">`, so a project could no longer be unassigned. | **Fixed** — optional `clearable` row; project + warehouse manager fields use it. Fails pre-fix (proved, 3 tests). |
| F3 | Medium (4) | A batch `AppMutationError` shows the generic top-level message; the actionable reason (taken phone) is in `fieldErrors` and was dropped. | **Fixed** — hook prefers `fieldErrors[0].message`. Fails pre-fix (proved). |
| F4 | Low (3) | Empty `roleId` hides the create option with no hint. | **Dismissed (intended)** — documented graceful degradation; API only accepts seeded system roles. |
| F5 | Low (3) | Debt external create has no empty-id guard. | **Dismissed** — pre-existing; ORPC output schema guarantees a non-empty id. |
| F6 | Low (3) | Missing-row path could orphan a committed employee. | **Dismissed** — `employeeBatchCreateResultSchema` + `entityIdSchema` make a row without an id unreachable on a successful parse. |
| F7 | Low (2) | `displayValue` goes stale vs the option label. | **Dismissed (intentional, pinned test).** |
| F8 | Low (2) | Duplicated 3-field array in the two wrapper modules. | **Dismissed (intended seam)** — `fields` is caller-owned by design. |
| F9 | Low (2) | Manager wrappers read `detailPages.debt.employeeFields.*`. | **Deferred** — see decision request. |
| F10 | Low (1) | Warehouse create label "إضافة موظف" is generic. | **Dismissed (pre-existing on develop).** |
| F11 | Low (1) | Web-local `EmployeeBatchCreateResult` duplicates the contract shape. | **Dismissed (pre-existing, design-acknowledged).** |
| F12 | Test gaps | No warehouse missing-row/`AppMutationError` tests; no role-derivation pin; redundant re-wrap. | **Fixed** — added tests + removed the dead re-wrap. |

## Verification (exit codes)

| Command | Result |
| --- | --- |
| `pnpm typecheck` | **0** (4 successful tasks) |
| `pnpm lint` (runs `check:unslop`) | **0** — `[check:unslop] PASS`, eslint 2/2 |
| `pnpm check:unslop` (via lint) | **0** |
| `vitest run --maxWorkers=2` (6 touched suites) | **0** — 6 files / 49 passed |
| `vitest run --maxWorkers=2 home-view.test.tsx` | **0** — 55 passed |
| `vitest run --maxWorkers=2 --coverage <touched files>` | **0** — 4 files / 29 passed; 85.26% stmts / 83.16% branch over touched files |
| `vitest run --maxWorkers=2` (full web) | **0** — 86 files / 743 passed |
| `playwright test tests/e2e/projects.spec.ts tests/e2e/warehouses.spec.ts` | **0** — 6 passed (1.5m) |

### Pre-fix failure proof

Stashed the four source files only (`createable-select.tsx`,
`use-employee-inline-create.ts`, `project-form.tsx`, `warehouse-form.tsx`) while
keeping the new tests, then ran the suites:

```
× offers a row that clears the value back to empty when clearable
× cannot be dismissed while a create is in flight, so a late result still selects
× clears the project manager back to none and submits null
× clears the warehouse manager back to none and submits null
× prefers the server field error over the generic batch message
Tests  5 failed | 19 passed (24)
```

Stash popped afterwards; re-ran green.

## Could not verify

- The real `warehouses.spec.ts` manager row in the list after save: the E2E
  asserts the name is visible on the details page, which is the strongest
  available signal without a direct-SQLite assertion.
- `displayValue` staleness beyond the current selected person (cosmetic,
  intentionally downgraded).
- The full E2E suite (only the two named specs were run; ports 3000/4318/1420
  were free).

## Deferred work (needs parent decision)

- **i18n namespace move (F9).** The manager-create field labels read
  `detailPages.debt.employeeFields.*`. Moving them to `common.employeeFields.*`
  would touch three forms plus `ar.ts`. Not required for correctness.
  Proposed follow-up: `refactor(web): move shared employee field labels to a
  common i18n namespace`.
- **`createable-select.tsx` is outside the original diff.** F1 is a
  pre-existing shared-component defect; it was fixed here because the PR's
  inline-create contract depends on it. Parent may prefer to call it out
  separately in the PR body.
