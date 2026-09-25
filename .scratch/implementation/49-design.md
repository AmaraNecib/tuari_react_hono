# Issue #49 — atomic employee save RPC

- mode: remote (the requested branch push is allowed by the issue brief; no Greptile)
- ticket: #49, brief supplied in the task
- base: `origin/develop` / `0165b7e208cb8054f2cdf23f2801aa1fd774fd57`
- review tier: Standard (contracts, API transaction behavior, web mutation, and unit tests)

## Decision

Add `employeesSave` to the workforce contract. Its input carries the existing employee profile fields plus a nullable worker placement and the two managed-ID arrays; its output is the existing entity-result envelope containing the updated employee. Existing four RPCs remain available for callers.

`WorkforceService.saveEmployee` runs the profile update and applicable relationship writes inside one `WorkspaceMutationContext.withTransaction` call. The existing repository methods are reused inside that outer transaction, so SQLite's transaction/savepoint implementation covers employee, assignment, and ownership tables together. For non-active employees, placement is omitted/ignored (the #20 rule); managed scopes are also only applied for an active employee in the matching manager role, mirroring the edit flow. The in-memory adapter transaction gains snapshot rollback so its test/runtime behavior matches SQLite's all-or-nothing guarantee.

The web edit page sends one `employeesSave` mutation containing all profile and relationship data. The existing reconciliation helper remains in the page as defense-in-depth: any rejected batch restores relationship controls to the pre-save snapshot and refetches the authoritative employee profile.

## Tests and validation

- Contracts build and typecheck the new schema and router surface.
- API service tests prove successful profile + placement/managed writes, rollback after a relationship failure, and server-side ignored non-active placement.
- RTL employee-edit tests prove one RPC receives the complete batch, the non-active placement is omitted, and a rejection still invokes the reconcile/refetch path.
- No Playwright/e2e or dev servers are run. Required local gates are contracts build, API/web Vitest, typecheck, and lint.

## Risks

- The existing service methods use synchronous repository operations and nested savepoints; the outer transaction must remain synchronous and must not be changed to an async callback.
- The updated web test mocks must expose the new mutation hook without removing the existing mocks used by other edit-page tests.
- Greptile was disabled during the first implementation pass; the hosted PR review covers this lane now.

## Follow-up: stale-page overwrite (PR #51 review finding)

The hosted PR review (4/5) flagged that the page submitted its load-time placement and managed-ID snapshots on every save. A profile-only edit from a stale page could therefore revert newer concurrent relationship changes.

Fix: relationship fields in `employeesSave` are now optional. The web page tracks whether the user actually edited the placement or managed-scope controls and includes only the edited fields in the payload; untouched fields are omitted entirely. The service skips the corresponding sync when a field is absent, so server-side relationships survive a profile-only save. Explicitly edited fields keep the original behavior, including the #20 inactive-placement ignore rule and transactional atomicity.

Regression coverage: API tests prove a profile-only save after a newer concurrent `assignEmployeeWorkplace`/`syncManagedProjects` keeps the newer state; RTL tests prove an untouched form sends no relationship keys while an edited form still submits them in the same batch.

## Follow-up: unplaced active worker (CI E2E regression)

The hosted E2E suite caught that the dirty-field fix let a profile-only save slip an ACTIVE worker with no placement through (the #20 requirement is: an active worker must have a project-or-warehouse placement). Fixed on both ends:

- Client (`employee-edit-page.tsx`): when the worker has no existing placement, the placement requirement and validation apply even if the controls were never touched (`workerNeedsPlacement`). Workers who already hold a placement keep the omit-when-untouched behavior.
- Server (`workforce.service.ts`): `employeesSave` rejects with `BUSINESS_RULE` when the resulting employee is an ACTIVE worker, no placement was submitted, and the database holds no active project or warehouse assignment. The transaction rolls back the profile write, so nothing partial persists.

Regression coverage: API tests prove the unplaced-active rejection leaves the profile untouched, that INACTIVE unplaced workers still save, and that a placed worker's omitted placement skips the rewrite; a web unit test proves the inline banner appears and the mutation is never sent.

## Follow-up: rejection handling (Greptile CLI finding on the fix commit)

A Greptile CLI review of the follow-up flagged that the catch path still reported `profilePersisted: true`, reloaded the old record over the user's typed edits, and showed a misleading partial-save banner — wrong now that the batch is atomic.

Fix: a rejected batch is treated as what it is under atomicity, nothing persisted. The page keeps every typed value and shows the nothing-saved banner; no refetch. The client-side per-step rollback helper (`employee-save-reconcile` runtime functions) became dead code and was removed along with its unit tests; all-or-nothing behavior is covered by the API transaction rollback tests instead. The module keeps only the save-plan types.
