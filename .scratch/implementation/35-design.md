# Issue #35 — Employee edit save is non-atomic (partial state on later mutation failure)

- **mode:** remote (parent sanctioned push to `origin/fix/issue-35-atomic-employee-save`)
- **ticket:** GitHub #35 [enhancement]; ticket given by parent brief (not in local snapshot)
- **target ref:** `origin/fix/issue-35-atomic-employee-save`
- **base SHA:** `842f6ea` (`origin/develop`, `git merge-base develop HEAD` — worktree started on it, HEAD is clean)
- **review tier:** Standard (code + tests + UI surface)

## Problem

`EmployeeEditPage.handleSaveAll` (`apps/web/src/features/employees/employee-edit-page.tsx`)
issues up to **four sequential mutation RPCs** in one save:

1. `employeesUpdate` — profile fields (always)
2. `employeesAssignWorkplace` — active-worker placement (when `isWorker && status === "ACTIVE" && workplaceChanged`)
3. `employeesSyncManagedProjects` — project-manager scope (when `isProjectManager && status === "ACTIVE" && managedProjectsChanged`)
4. `employeesSyncManagedWarehouses` — warehouse-manager scope (when `isWarehouseManager && status === "ACTIVE" && managedWarehousesChanged`)

If a later mutation fails, earlier ones already persisted. The `onError` toasts of the
individual mutations show the failure, but the page stays on the form with a mix of
saved/unsaved values and the DB holds partial state.

Sibling edit flows checked:
- `project-edit-page.tsx` — single `projectsUpdate` mutation → atomic ✓
- `warehouse-edit-page.tsx` — single `warehousesUpdate` mutation → atomic ✓
- `employee-edit-page-v2.tsx` — same 4-step pattern, but exported with **zero importers**
  (dead code). Not part of any routed flow; per repo wisdom (dead code should be deleted or
  left alone, not "fixed"), left untouched. Deleting it is a separate cleanup, not the
  acceptance for #35.

## Decision: client-side compensating rollback (option b)

The issue allows either (a) batch into one API call, or (b) compensating rollback when the
API genuinely requires separate calls. We implement (b).

Why not (a): the four procedures are genuinely separate calls today. They are three
different domains (employee row; workplace placement with manager/project/warehouse
ownership history; managed-project/warehouse ownership sync), each with its own contract
procedure, handler, and audit event. A single atomic RPC requires new contract surface
(`packages/contracts` is shared with in-flight sibling lanes), a new handler, and service
orchestration that must also replicate the #20 placement gating (active-worker placement
persists, non-active silently ignored) inside one transaction. That is a server round with
API tests, disproportionate to this web unit round. (a) is recorded as an optional future
follow-up, not silently deferred — the parent chose (b) as the sanctioned path per the
issue text.

Option (b) keeps all the #20 semantics byte-identical (the page still only dispatches the
workplace step for active workers; non-active placement remains silently ignored — nothing
about placement dispatch or the server policy changes).

## Design

New pure module `apps/web/src/features/employees/employee-save-reconcile.ts`:

- `WorkplaceSubmission` / `ManagedScopeSubmission` / `EmployeeSavePlan` — the inputs the
  save dispatches per step (kept so rollback knows what persisted).
- `placementStateFromEmployee(employee)` — pure derivation of the placement controls
  (`workplaceType`, `workerManagerId`, `workerProjectId`, `workerWarehouseId`) from an
  `EmployeeTableRow`, mirroring the page's existing init/resync logic exactly.
- `computeSaveFailureRollback({ plan, succeededSteps, preSavePlacement,
  preSaveManagedProjectIds, preSaveManagedWarehouseIds })` — returns the page state that
  matches what **actually persisted**:
  - a step that succeeded: its submitted values ARE the server truth (each RPC is a
    full-state write);
  - a step that failed or never ran: the truth is the pre-save value (the write never
    happened).

`EmployeeEditPage` changes:

- Track `saveError: "nothingSaved" | "partialRolledBack" | "partialUnverified" | null`.
- At submit start: capture `preSavePlacement` (from the `employee` prop) and the current
  managed ids **before any await**, build the `EmployeeSavePlan`, clear `saveError`.
- Dispatch steps in order, recording `succeededSteps` **after** each `await` settles.
- On catch:
  - **step 1 failed (nothing persisted)**: keep the whole form as typed (user can fix and
    retry), show `saveNothingSaved` banner. No fetch, no rollback.
  - **later step failed (partial state)**: apply `computeSaveFailureRollback` to the
    placement/managed-scope controls + `setErrors({})` synchronously; then re-fetch the
    authoritative record via `rpcClient.employeesGet({ id })` (contract procedure already
    exists, returns `employeeSchema` incl. the profile fields) and `setState(createFormState(item))`
    to reconcile the profile fields to server truth. Banner:
    - fetch succeeded → `savePartialRolledBack` (fields reset to last saved state)
    - fetch failed → `savePartialUnverified` (some changes may not be saved; reload to
      verify) — the required "rollback cannot fully restore" state.
  - Never navigate after a failure.
- Banner renders as a `Surface role="alert"` inside the form surface (same visual language
  as `detailPages.invoice.loadError`), above the field sections.
- `isSaving` still disables the submit button; untouched.

Why `employeesGet` for the profile: the server is the only authority on what actually
persisted (it may normalize/apply its own rules); the fetched row covers
firstName/lastName/phone/roleId/status/salary/notes/occupation. Placement and managed
scope are NOT in `employeeSchema`, so those are reconciled from the per-step truth above —
each placement/sync RPC is a full-state write, so "submitted for succeeded, pre-save for
failed" is exact. Residual risk (documented): a concurrent edit by another session between
page load and save could make the pre-save placement stale; in that case a failed step's
"restore to pre-save" may not equal DB truth — the `savePartialUnverified` banner copy is
only shown when the re-fetch fails, and the `partialRolledBack` copy says "review fields and
re-save". This is the strongest guarantee the UI contract can give without a server-side
batch. The narrowest honest simplification: no placements leak into the profile fetch, so
the reconcile is deterministic per step.

## i18n

New keys under `detailPages.employee.editPage.*` (existing-style flat keys, reuse of the
`editPage` block):

- `saveNothingSaved` — "تعذر حفظ التغييرات — لم يُحفظ أي تعديل. تحقق من البيانات ثم أعد المحاولة."
- `savePartialRolledBack` — "لم تُحفظ كل التغييرات. عُدِّلت الحقول لتعكس آخر حالة محفوظة — راجعها ثم أعد الحفظ."
- `savePartialUnverified` — "حدث خطأ أثناء الحفظ وقد لا تكون بعض التغييرات محفوظة. أعد تحميل الصفحة للتحقق من الحالة الحالية."

All three are referenced by the banner renderer in the same change (i18n-keys gate).

## Tests

1. `apps/web/src/features/employees/employee-save-reconcile.test.ts` — pure module:
   - rollback keeps submitted placement when the workplace step succeeded;
   - rollback restores pre-save placement when the workplace step failed (and when it never ran);
   - managed projects/warehouses order-independent per-step truth;
   - `placementStateFromEmployee` matches the page's existing init derivation.
2. `apps/web/src/features/employees/employee-edit-save.test.tsx` — RTL, real i18n resources,
   mutation hooks + `@/lib/orpc-client` mocked (same pattern as `edit-page-resync.test.tsx`):
   - all steps succeed → navigates to details;
   - workplace fails after profile → no navigation, profile fields reset to fetched truth,
     placement controls restored to pre-save, `partialRolledBack` banner;
   - managed-projects fails after profile+workplace → placement keeps SUBMITTED values
     (persisted), managed checkboxes restored to pre-save, banner;
   - profile fails first → nothing persisted, user input kept, no `employeesGet` call,
     `saveNothingSaved` banner;
   - partial failure + `employeesGet` rejects → `partialUnverified` banner (cannot fully
     restore), placement still restored to pre-save.

These prove no silent partial-persist path: every failure after a persisted step visibly
reconciles the form to persisted truth and surfaces banner text.

## Post-review hardening (test-audit + code-review findings)

Applied from the five-review synthesis:

- **In-flight submit guard** — `saveInFlightRef` in `handleSubmit` rejects a second
  submit while a save or its rollback/reconcile is running (Enter-key doubles before
  `isPending` disables the button). Two sequential saves could otherwise interleave
  and compound partial state; pinned by a double-click test.
- **Banner cleared on the next submit** — `setSaveError(null)` moved to the top of
  `handleSaveAll` so a validation-failing retry does not keep the stale error banner;
  pinned by a test.
- **`employeesGet` `success:false` branch** now covered (→ `partialUnverified`,
  placement still restored) — previously only the rejected-promise path was tested.
- **Warehouse-manager step** integration coverage added (step-failure restores the
  managed-warehouse scope); the misleading pure-test title ("later step failed" for
  the final step) renamed.
- **Reconcile assertion strengthened** — the workplace-failure test now types one
  value and has the fetch return a *different* field (occupation the user never
  typed) so the test proves the form was rebuilt from fetched truth, not merely that
  the typed value survived.
- **#20 silent-drop contract pinned** — a non-active worker selecting a placement
  saves the profile only, navigates, never calls the workplace mutation, and shows
  no banner (expected behavior, not an error).
- Typing nits: `PlacementState` type used instead of `ReturnType<…>`; EOF newline on
  the three new files.

Residual risks (accepted, documented): (1) inputs stay editable during the short
`employeesGet` reconcile round-trip, so keystrokes typed in that window are
overwritten by the reconcile `setState` — the submit guard prevents a second save,
and the banner explains that the fields were reset; input-level locking is a broader
UX change, out of scope. (2) The rollback relies on each RPC being a full-state write
plus the pre-save props; a concurrent edit by a second session between page load and
save can make the pre-save placement stale — the `partialRolledBack` copy tells the
user to review and re-save. (3) If the client ever changed to resolve-with-result on
business errors (instead of rejecting), the `catch` would not fire and partial state
would navigate; that contract is not planned.

## Runtime checks

- `pnpm --filter @tuari/web test` (targeted + full web suite)
- `pnpm typecheck && pnpm lint` (i18n-keys + unslop gates)
- No `packages/contracts` change → no contracts rebuild. No `apps/api` change → no `test:api`.
  No Playwright (unit-only round).

## Risks / notes

- The `useEffect` resync stays keyed on `employee.id` (dirty state preserved on prop
  refresh) — the rollback uses explicit `setState` calls, not the effect.
- The placement/managed-scope controls reset synchronously; profile reset lands after the
  `employeesGet` round-trip. Both happen before any further interaction in the normal case.
- Dead `employee-edit-page-v2.tsx` (same 4-step bug, zero importers) is out of scope;
  deletion proposed as a follow-up, not silently deferred.