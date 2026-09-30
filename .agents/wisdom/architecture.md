# Architecture Wisdom

## Drizzle better-sqlite3 `db.transaction(async …)` silently breaks every async call (🟠 Major)

Issue #249's honest-coverage tests exposed a latent production bug: `DrizzleAccountRepository.withTransaction` called `this.db.transaction(async (tx) => …)`. Drizzle's better-sqlite3 driver wraps the **synchronous** better-sqlite3 transaction API, so an async callback makes it throw `Transaction function cannot return a promise` at runtime. Every account profile update / password-change record was crashing in production, while all unit tests passed because they mocked the repository. The code *looked* correct and type-checked fine.

Fix pattern, the 3rd instance of the #195 lesson, now in bootstrap, recovery-key, and account: own the transaction on the raw connection (`this.db.$client` for Drizzle repos): `if (!raw.inTransaction) raw.exec("BEGIN IMMEDIATE")`, run the async callback, `COMMIT`/`ROLLBACK` on success/failure, wrap ROLLBACK in try/catch so a failing COMMIT surfaces the original error, and serialize through a FIFO promise-chain lock so no other repo call joins the open transaction. `raw.inTransaction` join keeps an externally-opened transaction working (outer owns COMMIT/ROLLBACK).

**Always**: when a Drizzle better-sqlite3 repository is first wired to a service with async transaction callbacks, exercise it against a real `:memory:` DB before shipping. The sync-only transaction contract is invisible to typecheck and mocked tests. Also: each new hand-rolled FIFO lock is drift risk (three copies now, with the guarded-ROLLBACK fix applied to only one), tracked as #288.

## Barrel re-exports: "export the const" is incomplete without the index re-export (🟠 Major)

Issue #206 said "export `reportFilterInputSchema` from `reports-contract.ts`", but that module was imported only by `app-contract.ts` and NEVER re-exported from the package index, so the exported const was still unreachable from `@tuari/contracts` (the only import path the API uses). The fix needed BOTH the `export const` AND `export * from "./reports-contract"` in the index (consistent with `invoice-contract`/`payment-contract`/`update-contract`/`rbac-contract`). The test failure (`reportFilterInputSchema` undefined) caught it immediately.

**Always**: when an issue says "export X from module Y", verify module Y is actually reachable from the package entry (`src/index.ts`) before implementing. Grep the index for `export * from` covering Y.

## In-memory adapters duplicate ownership-history helpers across domains (🟡 Minor)

`InMemoryWorkforceRepository` and `InMemoryOperationsRepository` both carry
byte-identical private helpers (`insertProjectManagerOwnershipHistory`,
`endActiveProjectManagerOwnershipHistory`, `insertWarehouseManagerOwnershipHistory`,
`endActiveWarehouseManagerOwnershipHistory`, plus state-history variants) because
both operate on the shared `InMemoryStore`. When retyping them (any → typed
`Omit<Record, "id"|"endDate"|"createdAt"|"updatedAt">` + `AuditSnapshot`), both
copies must be edited in lockstep, a real maintenance hazard. Tracked as #202;
candidate home: `inmemory-store.ts` alongside `normalizeAudit`/`now`/`newId`.

**Always**: when a change touches these helpers, edit both files; prefer extracting
to the store module.

## Record types mirror external table shapes (🟡 Minor)

`AuthUserRecord` / `BootstrapStateRecord` in `company.types.ts` hand-mirror the
auth `user` and `app_bootstrap_state` schemas. The audit repository reads them
(`u.phoneNumber`, `s.singleton === 1`), but nothing writes them today. Divergence
risk if the schemas evolve; the type comments acknowledge this. Alternative:
derive from `typeof schema.user.$inferSelect` if schema coupling is acceptable.

## Ports & adapters: config flows through the composition root only (💡 Design Principle)

`createAppDependencies(sqlite, drizzleDb, auth, config = createAppConfig())`. The
optional trailing config param keeps every existing caller unchanged while letting
tests inject `DB_ADAPTER=inmemory`. The `createCompanyRepository(rawDb, config)`
factory switches adapters; other modules (inventory/invoice/payment) still use the
sqlite handle until their in-memory adapters exist. Keep the param appended, never
inserted mid-signature.

## Async ports over a synchronous driver lose implicit atomicity (🟠 Major)

`RecoveryKeyService` was fully synchronous (better-sqlite3). Its invariants, one-time-use (read + guarded update) and max pool 5 (count + inserts), were
enforced *by the event loop*: two calls could never interleave. Porting it to
an async `RecoveryKeyPort` (per the issue's Promise signatures) split those
flows across `await` points, so two concurrent consumers could both read
AVAILABLE and both "succeed", and two concurrent generate calls could insert 6
keys. The debate (critic) caught the first; the test audit (edge-case hunter)
empirically caught a nastier variant: a `consumeKey` write could join an open
`generateKeys` transaction on the shared connection and be *silently rolled
back* by its failure. The consumed key became AVAILABLE again.

Fix pattern (issue #195): (1) guarded check-and-set: `updateKeyStatus`
returns `Promise<boolean>` with `WHERE id = ? AND status = 'AVAILABLE'`, so a
stale writer is a 0-row no-op; (2) serialize **every** port method through a
promise-chaining FIFO lock, and give `withTransaction`'s callback an unlocked
tx-scoped view (the `AccountRepositoryTransaction` pattern) so its internal
calls don't deadlock; (3) `withTransaction` owns BEGIN IMMEDIATE/COMMIT/ROLLBACK
(better-sqlite3 transactions are sync-only, the bootstrap.service pattern),
and the lock guarantees no other port call runs inside the open transaction.

**Always**: when converting a sync service to an async port, audit every
read-modify-write and multi-statement flow for interleaving. "Same logic,
await it" is not behavior-preserving. Add the atomic primitive at the port
level (guarded CAS / serialized transaction), and pin each invariant with a
deterministic concurrency test.

## Output schemas validate, they don't transform (🟡 Minor)

On #221, `changeDbKeyOutputSchema`'s failure member used `error: z.string().trim().min(1)` to reject blank-looking errors. Greptile (4/5 → 5/5 after the fix) flagged `.trim()` as a *transform* on an output schema: it silently rewrites server-emitted values rather than rejecting them. The pure-validator form is `z.object({...}).refine(({ error }) => error.trim().length > 0, ...)`. Same rejection behavior, zero mutation. On INPUT schemas transforms are fine (normalize what the client sent); on OUTPUT schemas prefer `refine`/`regex` so the server's emitted value crosses the wire byte-identical.

**Always**: on output schemas, express blank/format rules as validators (`refine`, `regex`, `min`), never as transforms (`trim`, `toLowerCase`).

## Service-boundary defense-in-depth: reuse the wire contract schema, don't hand-roll (💡 Design Principle)

`AuthBootstrapService` (#226) relied entirely on the ORPC wire gate; nothing
validated at the service boundary, so a mis-wired port or future caller could
create a first user with a blank phone (never counted as "configured" by
`hasConfiguredUsers`, enabling a second bootstrap), hash an empty/short
password, or store an untrimmed/over-long name. Fix: run
`authBootstrapInputSchema.safeParse(input)` as the service's first statement and
return a `VALIDATION` failure result before hashing or touching the port. The
wire gate and the service gate reference the SAME schema object imported from
`@tuari/contracts`, so drift between the two enforcement points is impossible
by construction, the strongest form of "validate at the boundary". This
extends the `AccountService` precedent (reuses `algerianPhoneSchema.safeParse`)
into the pattern for service-boundary input checks: never duplicate the
validity definition in the service.

**Always**: when an issue says "harden input at the service boundary", reuse
the existing contract schema via `safeParse` rather than hand-rolling checks;
consume `parsed.data` (already normalized by schema `.trim()`s) downstream.

## Zod issue taxonomy: missing key is `invalid_type`, not `too_small` (🟠 Major)

The test-audit edge-case hunter caught a real message bug: a mis-wired caller
passing `{ phone, password }` (missing `name`) gets an `invalid_type` zod issue,
NOT `too_small`, so a map branching only on `too_small` emitted
"الاسم يجب ألا يتجاوز 120 حرفًا." (too-long) for an *absent* name. Fix: treat
`too_small` OR `invalid_type` as the "required" branch. Also: a schema without
`.min()` (e.g. `algerianPhoneSchema` = trim + regex only) never produces
`too_small`. Blank phone is `invalid_string`, so put the phone in the
"invalid/format" map and the regex-prose message must cover blank too.

**Always**: when mapping zod issues to user-facing messages, branch
`too_small || invalid_type` → required; everything else → invalid/format; and
check each field's schema for whether `.min()` even exists before relying on
`too_small`.

## Zod v4 exposes string schema bounds at runtime (🟡 Minor)

`z.string().min(8).max(128)` → the schema instance has public `.minLength`
(`number | null`) and `.maxLength`, accessible via `schema.shape.field` on
objects. #226 derives the Arabic message copy from these
(`كلمة المرور يجب أن تكون ${schema.shape.password.minLength} أحرف على الأقل.`)
so message copy cannot drift from the contract. Caveats: `.optional()` wraps the
field in `ZodOptional` (unwrap first), a schema without `.min()`/`.max()` yields
`null` (renders "null" in a template, an accepted residual), and Arabic plural
grammar ("أحرف" vs "حرفًا") depends on the numeric value (8 vs 120), so a
future limit change may need grammar review.

**Always**: when validation copy must match schema limits, introspect
`minLength`/`maxLength` instead of hardcoding the numbers.

## `orpc.session.key()` never matches the mounted session query: use `queryOptions().queryKey` (🟠 Major)

On #236, `getCachedSessionUserId` read the session from `orpc.session.key()`, but
that generates `[["session"], {}]` while the session query mounts under
`[["session"], { type: "query" }]` (`queryOptions().queryKey` omits nothing;
bare `key()` omits the `type` field). Result: the helper ALWAYS returned null.
The workspace mutations survived because `invalidateWorkspaceDomains`'s
`userId === null` branch over-invalidated the whole `["phase1","workspace-domain"]`
prefix. The null fallback masked the broken key. The typed inventory
invalidations (no fallback) exposed it: the item-definitions list went stale
after create. The same no-op invalidations existed in sign-out, account-settings
and phone sign-in (`invalidateQueries({ queryKey: orpc.session.key() })`).

Fix: `export const sessionQueryKey = orpc.session.queryOptions().queryKey` in
`workspace-keys.ts`, the same expression the session hook mounts with, so the
two cannot drift, and use it for every session cache read/invalidation.

**Always**: when matching the session query cache (or any ORPC procedure's
cache), derive the key from `queryOptions().queryKey`, never from bare
`key()`. If a helper has a "fall back to something broader" branch, verify the
primary path actually matches. A too-broad fallback can mask a broken key for
a long time.
## "Align storage adapters" includes the in-memory double, not just the sqlite file (💡 Design Principle)

Issue #209 said "align the remaining rbac storage adapters with `adapters/`" and
named only `sqlite-role.repository.ts`. The debate (critic, severity 5) forced the
full read: the module's **in-memory test double** (`InMemoryRoleRepository`) was
still embedded in `role.module.ts` while every other module keeps doubles in
`adapters/` (`workforce/adapters/in-memory-role.repository.ts`, `company/adapters/inmemory-*`).
The finished change extracted BOTH implementations to `adapters/`, keeping only the
deep module + its `RoleRepository` seam at the root, the same shape as
`company.repository.ts` at root with sqlite/inmemory implementations in `adapters/`.

**Always**: when an issue says "align adapters", enumerate every implementation of
the module's ports (sqlite + in-memory + any others), not just the file the issue
names. The interface/seam stays with the deep module at the root; implementations
live in `adapters/`.

## Advertised-but-unimplemented contract surface: drop the procedures, don't stub handlers (💡 Design Principle)

On #239, the `recurringPatternsList/Get` procedures were spread into `appContract`
(so `AppClient` exposed them) with no server handlers; an `as any` at the router
boundary hid the gap. Resolution: **drop the procedures until the feature lands**,
not a stub implementation. With no DB table/module behind them, the only possible
handler returns a hard-coded empty list (fake behavior that renders an empty page
and claims the feature works), and a read-only list/get contract without
create/update is not a feature anyway. Deleting the procedures makes
`os.router(allHandlers)` typecheck natively, so contract/server drift becomes a
build error. Also delete the orphaned consumers (the hook/page that called the
procedures were unrouted, so deleting is behavior-preserving), and pin the deletion
with a negative contract test (`"key" in appContract` is false) so a re-added
spread without handlers fails at the contract level. Keep the domain *schemas*
(`recurring.ts`) exported. They're vocabulary for the future feature, not RPC
procedures.

**Always**: when a contract advertises procedures with no handlers, prefer
deletion over a stub; the compiler + a negative contract test are the drift
sentinels, and the `as any` cast must never be the thing that makes the router
typecheck.

## Zod refine() fires even on empty strings: guard with `value.length === 0 ||` (🟡 Minor)

On #250, adding `.refine((v) => /[^\p{Cf}]/u.test(v))` after `.min(1)` on the
bootstrap `name` schema made an EMPTY name produce TWO zod issues (`too_small`
from min + `custom` from the refine), doubling the service's fieldErrors and
breaking four existing tests. Zod chains run refinements on every value that
reaches them, including ones a sibling check already rejects. Fix pattern:
`.refine((v) => v.length === 0 || /[^\p{Cf}]/u.test(v), ...)`. The empty guard
defers to `.min(1)` so an empty name still yields a single "required" issue.

Also: a `custom` (refine) issue code is neither `too_small`/`invalid_type`
(required) nor the format codes. The service message map needs its own branch
or it falls into the generic format bucket with misleading copy (e.g. the
too-long name message). Prefer a full `Record<BootstrapInputField, string>`
keyed by field so a future refine on another field forces a copy decision
(compile-time) instead of a silent wrong message; property access keeps 100%
branch coverage (an `??`/`&&` fallback branch would be uncoverable today).

**Always**: when adding a `.refine()` to a schema field that also has
`.min()`/`.max()`, guard the refine for the empty case, and add the `custom`
issue code to any user-facing issue→message map.


## Two parallel agents editing the same Rust file: disjoint regions + parent-owned conflict resolution (💡 Design Principle)

#273 (desktop secrets at rest) and #279 (Tauri command gating) both edited
`apps/desktop/src-tauri/src/lib.rs` in parallel worktrees. Both design docs
explicitly declared DISJOINT line regions (#273: secrets section ~1082–1141
+ tests; #279: command handler area) and named the sibling in their design
docs. Each agent pushed its branch without conflicts; the parent resolves
any merge conflict sequentially at integration time, in favor of the owning
issue's design.

**Always**: when worktree designs unavoidably touch the same file, require
BOTH design docs to declare exact disjoint regions AND acknowledge the
sibling issue by number before implementation starts. Two agents editing
disjoint hunks of one file are safe; two agents editing overlapping logic
are not. The design doc is the contract that makes this safe.


## Aggregate-RPC read paths: keep the individual hooks, route invalidation through one seam (💡 Design Principle)

#276's snapshot consolidation kept `useRolesQuery`/`useEmployeesQuery`/etc.
exported (global search, sections, debts/inventory features still use them)
and made `invalidateWorkspaceDomains` the single seam that auto-invalidates
the snapshot whenever a snapshot-backed domain changes. New domains are
covered by updating one set + a unit test pinning membership, instead of
hunting every call site.

**Always**: when introducing an aggregate read, don't delete the granular
hooks other features depend on. Keep them as the query vocabulary and add
the aggregate as a new key. Route snapshot invalidation through ONE
documented seam with a pinned-domain set so future domains can't be
forgotten.

## Verify a flagged validation path is even reachable before "fixing" it. Dead code may be the real answer (💡 Design Principle)

Issue #278's audit quoted `input-validator.ts:41,59` (a `VALIDATION` ORPCError,
"Invalid input: validation failed", no field data) and blamed it for web users
seeing fallback toasts. Investigation showed the middleware `*Validated`
variants calling it were **never invoked in any commit** (`git log -S
queryAuthValidated` → only the introducing commit, no usage ever). The real
production path is the ORPC contract wire gate (every procedure is
`implement(appContract)`), which already attaches `data.issues` with field
paths. So the issue's Option A ("fix the VALIDATION error") would have
"fixed" code nothing calls; Option B (drop the double validation) deleted the
trap instead. The web's magic-string check (`message !== "Input validation
failed"`) worked against the wire gate by luck, and the fix was to remove
the string dependence entirely (issues-first), not align it to a dead path's
message.

**Always**: when an issue/audit points at a "wrong" error path, first prove
it's reachable (`git log -S <symbol>`, repo-wide rg, wire probes). If it's
dead code, delete it (single source of truth) rather than making it "correct". Keeping a correct-but-unused path preserves the trap for the next audit.

## Every new transaction-bearing method must acquire the write reservation up front: plain db.transaction() re-opens the stale-read TOCTOU (🟠 Major)

On #289, `deleteIfUnallocated` (the new atomic guarded delete) was written with
`this.db.transaction(fn)`. Better-sqlite3's DEFAULT is a DEFERRED BEGIN. The
debate critic (sev 6) caught that cross-process, a deferred BEGIN lets the
guard's existence/COUNT reads run against a pre-create snapshot; when the
concurrent create commits, the write-upgrade can succeed against the FRESH
snapshot while the COUNT was computed on the STALE one, and the subsequent
DELETE cascade-removes the fresh allocations, exactly the gap-4 corruption the
guard exists to prevent. `runInTransaction` had the fix all along
(`BEGIN IMMEDIATE`); the new method silently regressed to the vulnerable
pattern because it was modeled on the OLD `deletePayment`, not on the repo's
own transaction discipline. Fix: `transaction.immediate()`.

**Always**: when adding ANY new method that opens a transaction in this
codebase, grep the sibling transaction code first and match its write
reservation (`transaction.immediate()` / explicit `BEGIN IMMEDIATE`), never
plain `db.transaction()`. A guard's reads are only trustworthy if they run
under the reservation they protect.

## "Move the policy into the module" includes the allocation AFTER the validation (🟡 Minor / Greptile P2)

On #214, moving the invoice-attachment limits from the transport route into
`InventoryService` removed the duplicated constants, but the route still
converted every submitted `File` into a `Uint8Array` (`file.arrayBuffer()`) for
ALL files BEFORE calling the service, so over-limit uploads still allocated
byte copies up to the 30 MB multipart cap on the rejected path. The old route
had rejected count/total BEFORE that conversion. Greptile (4/5 → 5/5 after the
fix) flagged it as P2. The fix made `InventoryUploadFile.bytes` a **lazy
loader** that the service invokes only after its count/total/per-file/MIME
validation passes for a file that will be stored; the route hands over
metadata + a `() => file.arrayBuffer().then(...)`. Focused tests pin that the
bytes loader is never invoked on the rejected path.

**Always**: when consolidating a policy into its owning module, check whether
the transport was doing expensive work (buffering/allocation/IO) BEFORE the
module's validation. The module should own the ordering too. Pass lazy
loaders so the module validates first and only then does the expensive part.

## Evidence files must be re-pinned to the final HEAD after any reviewable change (🟡 Minor / process)

After the debate/test-audit/code-review, a Greptile P2 fix committed
`c808da3` which changed `inventory.types.ts` / `inventory.service.ts` /
`create-app.ts` / tests, all reviewable files. The evidence files named
`eaca0d4-*` therefore failed the guard's freshness check (reviewable files
changed since the evidence SHA). Fix: rename every evidence markdown to the
new final HEAD SHA (`c808da3-*`) and append an explicit post-evidence note
documenting what changed after the review and that the delta is pinned by the
new tests + the clean Greptile run on that exact HEAD. The guard rule only
re-validates if non-scratch files changed; `.scratch/` is non-reviewable.

**Always**: after emitting any code/test change post-review (Greptile fix,
debate fix, test audit fix, comment tidy), re-pin all `.scratch/reviews/<id>/`
evidence filenames to the new HEAD SHA and add a freshness note, and re-run the
Greptile gate on that exact HEAD before Guard Phase 3.

## runSyncTransaction composes: nested wraps are SAVEPOINT joins, and wrapping EVERY sync writer makes the tripwire structural (💡 Design Principle)

On #348 (the D1 deferral from #322), the remaining plain sync `.run()` writers
in company/inventory/invoice were wrapped in `runSyncTransaction`. Two
composability facts made the mechanical wrap safe:

1. **Nested wraps inside an already-wrapped context are SAVEPOINTs, not
   deadlocks.** `runSync` does NOT set the AsyncLocalStorage run-context (only
   `run` does), so a nested `runSyncTransaction` inside our own `runSync`
   executes immediately via the `activeCount === 0` fallback; inside our own
   `run` it executes via the ALS match. Either way the inner
   `raw.transaction()` becomes a better-sqlite3 SAVEPOINT inside the outer
   transaction and commits/rolls back with it. This is how the invoice-debt
   port's `runSyncTransaction` calling `repository.createDebtEntry`
   (itself wrapped) keeps working, and how the payment module's
   `lock.run` flow calling `invoiceRepo.updateStatus` still joins.
2. **Wrap the private helpers too.** D1 explicitly enumerated
   `insertStateHistory`, `endActiveStateHistory`, `reassignWorkers`, and the
   ownership-history helpers even though every caller was already inside a
   wrapped public method. Wrapping them makes "every sync write runs under the
   lock" a structural property of the file, not a call-graph accident. A
   future unwrapped caller of a private helper can't silently bypass the
   tripwire.

**Always**: when closing a "route everything through X" finding, wrap every
write site in the module, including private helpers reachable only from
wrapped methods, and pin the tripwire behavior with integration tests
(busy-throw while a foreign flow holds the lock, durable success when free,
join-outer inside our own `lock.run`, and "busy attempt leaves no trace" for
multi-statement writers).

## Collapsing a "primitive family" means choosing ONE owner and moving, not just deleting the duplicate (💡 Design Principle)

Issue #243: two parallel table/pagination/filter primitive families lived in
`features/app-shell/` (AppShellTable* + TablePaginationControls + usePaginatedRows)
and `features/shared/` (record-page-frame + a cursor-based PaginationControls).
Consumers spanned EVERY feature folder (audit, debts, employees, externals,
inventory, reports), so "app-shell" was a historical misnomer, not an owner.
The correct collapse was NOT deleting one family and re-pointing. It was moving
both primitive files into `features/shared/` and making shared the single owner,
resolving the shared→app-shell dependency inversion (record-page-frame imported
the app-shell primitives). Then delete genuinely dead members: zero-consumer
`AppShellSectionSurface`/`AppShellSectionBody` and the orphan cursor
`PaginationControls` (verified zero production imports via repo-wide grep +
`git log -S` before deleting). Keep component identifiers stable (the `AppShell*`
prefix avoided colliding with shadcn `Table*` names imported in the same files);
rename is a cosmetic follow-up, not the collapse.

**Always**: when an issue says "collapse the X/Y primitive families", (1) map every
import of both families + count consumers per member first (find dead code), (2) pick
one physical owner by where the consumers live, not by folder name, (3) move+tests
BEFORE deleting, (4) confirm zero residual refs (grep) after migration, (5) keep a
public-API rename (prefix that collides with the design-system's own names) out of the
collapse so behavior preservation stays provable.

## Deepen a leaky view-model seam by hiding the dependency graph behind one purpose-shaped operation (💡 Design Principle)

Issue #217: `buildHomeViewDerived`/`HomeViewDerived` was the *intended* single
seam for the dashboard's derived data, but a lazy-loaded page section
(`employees-section`) reached into the internal `home-view-derived-*` modules
to re-derive its own context (`lookups` + `relationshipFacts` + `copy` + `t`)
and build paged rows. Two call paths (dashboard full list vs employees page)
built the same rows from the same workspace, so the seam's promise was broken
and drift was possible.

Fix: **don't relocate the reach-in, hide it.** The seam now computes
`lookups` + `relationshipFacts` once and exposes a single purpose-shaped
operation on the derived object, `buildEmployeeTableRow(employee)`, closed over
that context. The section consumes it as a param and imports no
`home-view-derived-*` module. Extra de-dup: the bulk builder
`buildEmployeeRows` gained an optional `relationshipFacts` param so facts are
computed once, not twice. A **composition test** (importing only the public
seam + the copy builder) pins the invariant `derived.buildEmployeeTableRow(e)`
deep-equals the matching `derived.employeeRows` entry for every employee, so
the two render paths cannot drift, and the test is non-vacuous because it also
pins the exact row count plus the fallback paths (orphan role, inactive/LEFT).

**Always**: when an "export seam" is leaky because consumers re-derive pieces
of its output, deepen it with a function property on the derived value that
hides the internal graph, and test it by composing through the seam only. Name
the public single-row builder for its output type (`buildEmployeeRow` vs the
four-arg internal `buildEmployeeRow` was a Mysterious-Name collision; the seam
method became `buildEmployeeTableRow`, matching `EmployeeTableRow`).
## Detail ids whose record is NOT in the composite snapshot must be forwarded explicitly through the home-view seam (💡 Design Principle)

Issue #30: `/invoices/$invoiceId` rendered an empty main after invoice create —
the router passed `invoiceId` to `HomeView`, but `HomeView` never forwarded it
to `HomeViewPageContent` (employees/projects/warehouses/counterparties flow as
`selectedX` lookups resolved from the composite workspace snapshot; invoices
are NOT in that snapshot — the details page owns its fetch via
`useInventoryInvoiceGroupQuery`). The `invoice-details` case rendered `null`
when `selectedInvoiceId` was unset, so the details view never mounted and the
`inventoryInvoiceGroupsGet` RPC never fired (Playwright trace: create RPC
200 → zero further requests).

Two-part rule:
1. For detail pages that fetch their own RPC (not in the composite snapshot),
   thread the route param id through the same home-view seam as the sibling
   lookups — the prop already exists downstream; the caller must pass it.
2. A route `case` that returns `null` when its id is missing silently renders
   an empty main. Use the `MissingRecordState` fallback (back label + target)
   every sibling detail page uses, so a broken/id-less route can never look
   like success.

## An error resolver that RETURNS an ORPCError is not an error — the wrapper must THROW it (🟠 Major)

On #421 the audit wrappers (`mutationAudit`, `mutationAuditRateLimited`,
`withAudit`) ran `return handler(...)` inside a `try/catch` without `await`, so
an `async` handler's rejection escaped the `catch` and the `errorResolver`
never ran. Fixing the escape with `return await handler(...)` was necessary but
not sufficient: the payment/invoice resolvers *return* an `ORPCError`, and the
wrapper returned that object as the procedure OUTPUT. ORPC then validated it
against the output schema (`{ success: boolean }`), failed, and the client saw
`INTERNAL_SERVER_ERROR: Output validation failed` instead of `NOT_FOUND`. A
probe proved all three states (raw `DomainError` → output-validation 500 →
`NOT_FOUND`).

The middleware now distinguishes the two resolver contracts: throw an
`ORPCError`, return anything else (the `toFailureResult` resolvers return a
`{ success: false, error }` envelope their discriminated-union output accepts).
No production procedure pairs a synchronous handler with an ORPCError resolver,
so the change is observably async-only.

**Always**: when a `try/catch` wraps an async handler, `await` it inside the
try. And check what the catch *does* with the resolved error: `return`ing an
`Error`/`ORPCError` as a value makes it procedure output (output validation
will reject it); it must be `throw`n. Test at the router level — a helper-only
unit test cannot see ORPC's output validation turn the mapped error into a 500.

## Composition-root reads must fail soft: a misconfigured path must not throw at startup (🟠 Major)

On #430 the daily-backup service seeded its status by listing the backups root
from `createAppDependencies`. The guard was `existsSync`, so a root that existed
as a *file* (any non-directory) made `readdirSync` throw ENOTDIR during
dependency construction: the API could not start. That is exactly the
"never block startup" property the feature is required to have, and the service's
own failure path already caught everything inside `runDueBackup` — the gap was a
read that runs *before* any try/catch, at composition time.

**Always**: probe a path an operator can misconfigure with a non-throwing
`isDirectory()` (stat inside try/catch, false on error), not `existsSync` +
`readdirSync`. Construction-time reads run before the app can report anything, so
a throw there is a startup outage; let the misconfiguration surface later as a
non-fatal run failure. And when a required field is added to a config schema,
grep the hand-built `appConfigSchema.parse` / `AppConfig` fixtures — the full
suite caught one that the typecheck could not.

## A synchronous startup side-effect must be gated on readiness, not merely moved after `listen()` (🟠 Major)

On #430 the daily backup's `VACUUM INTO` is synchronous and can outlast the
desktop shell's 15s `/health` wait. The first fix moved the call after
`serve()`: but calling an `async` function whose body has no `await` runs it
*in the current tick*, before the event loop can deliver the `listening` event
or read a queued health probe. `setImmediate` is not enough either: if no
probe is pending when the check phase runs, the snapshot blocks the loop and a
later `/health` stalls anyway. A safety feature then causes the exact boot
failure it exists to prevent.

**Always**: for a synchronous, potentially long side-effect on the startup
path, gate the *first run* on proven readiness (the first `/health` response),
defer it a turn, and keep a fallback timer for a deployment nobody probes.
Assert it in a test that serves `/health` against a deliberately blocking fake
and checks the response lands while the fake is still only scheduled. "Run it
after `serve()`" and "never await it" do not make a synchronous call
non-blocking.
## A money bound on a derived default must also bound the field it derives from (🟠 Major)

On #413 the charge default was validated against the contract's
`MAX_MONEY_DZD`, but the invoice asset `purchasePriceDzd` input and its stored
entity shape stayed on `z.number().nonnegative()`. That gave one money field two
ceilings: a purchase price the invoice path accepted blew up later when the
charge default was resolved, so a direct-to-project purchase rolled back while
the identical warehouse purchase succeeded. The same round found the symmetric
leak on the aggregate: each charge was bounded, the project total was not, and
`totalDzd` shared the per-charge bound.

**Always**: when you add or tighten a bound on a derived value, walk the source
field it derives from and give both the same bound. When a response schema
shares a bound with N input values, the aggregate of those values needs its own
explicit check. Prefer the shared contract schema (here
`nonNegativePaymentAmountSchema`) at both the wire gate and the module seam, the
#289 pattern, so the two cannot drift.

## Reset effects must key on every input their defaults depend on, and track edits per field (🟠 Major)

On #412 round 3, `AddSalaryPaymentDialog`'s reset effect guarded on the employee
id alone. A workspace refresh that changed the worker's wage period
(monthly→daily) while the dialog was open re-ran the effect but returned early,
leaving an untouched days field at 30 while the daily proposal used the new
wage; accepting it recorded 30 days of daily pay. The employee-details quick
form had the mirror gap: it re-applied the default but also reset touched fields
and collapsed the form on any wage refresh.

**Always**: an "initialize this form for this record" effect must key on
*everything the default derives from* — the entity id AND the fields that feed
the default — not the entity id alone. Pair it with per-field touched flags so a
same-entity refresh re-applies defaults to untouched fields but never clobbers
an operator edit, and split "different entity" (full reset) from "same entity
refreshed" (partial re-derive). A shared default helper
(`defaultSalaryPaymentDays`) is not enough if the effect that applies it is keyed
wrongly.

**Testing**: re-query the live DOM after the simulated refresh, don't hold the
pre-refresh node. A reset that unmounts/collapses the form leaves the detached
node's old value intact, so a captured-reference assertion passes on the buggy
code; asserting the form is still open (its submit button present) plus a fresh
`getAllByRole` query is what actually catches the clobber.

## A shared calendar day must be attributed once: half-open windows plus per-key de-dup (🟠 Major)

On #412 round 4, `deriveSalaryProjectDays` built each project's day set with an
inclusive loop (`for ms = start; ms <= end`). Moving a worker from project A to
project B ends one assignment and starts the other at the same instant, so that
calendar day was counted for both windows. For a 30-day March payment the scaled
split then summed to 31 days, which the dialog rejected as over-allocated until
someone corrected it by hand. Note the shape of the bug: the per-project sets
were individually correct; the failure was a *coverage total larger than the
period*, which inflated the scale factor applied to every line.

**Always**: when several windows can cover the same key (day, slot, seat),
decide the boundary semantics explicitly AND de-dup the keys. Prefer half-open
`[start, end)`: the exclusive end day is the day after the instant the window
closes, so an assignment ending at the start of day D leaves D to the successor,
while an end during or at the end of day D still covers D. Claim each key at
most once in a deterministic order (project-id here) for any residual overlap.
Then assert the invariant directly — "windows covering the whole period sum to
the paid days, never more" — with a dedicated handoff test and an overlap test;
a full-period test with disjoint windows passes on the inclusive code and cannot
catch it.

## Dialogs snapshot identity, not derived data; reset a mutation's terminal state per draft (🟠 Major)

Two related round-4 #412 findings. (1) `SalariesSection` copied the worker's
wage, period, and assignment windows into state when the dialog opened, so a
workspace refresh after a wage change left the open dialog proposing the old
amount while the server would compute from the new wage. (2) The employee quick
form's create-payment mutation kept `isSuccess` after a successful save, so
reopening the form and then receiving a workspace refresh re-ran the success
effect, wiping the new draft and collapsing the form.

**Always**: a dialog opened from a list stores only the target's identity in
state; read the wage, period, windows, and everything else from the live query
data on each render (the dialog's own prop-change reset handles re-derivation).
And a mutation's terminal flag (`isSuccess`/`isError`) is per-mutation-instance,
not per-draft — call `reset()` when a new draft is opened (or guard the success
effect with a ref), otherwise a later refresh replays an old success. Test both
by mutating the mocked mutation state and re-rendering, and confirm the
assertion fails on the pre-fix component.

## Money split shares must reconcile: allocate across lines, never per line (🟠 Major)

On #412 round 5, `allocateSalaryAmountByDays` prorated each split line on its own
and rounded to two decimals. A 100 DZD payment over three one-day lines produced
33.33 three times — 99.99, visibly short of the amount paid. This is the money
twin of the day-split reconciliation bug: per-line rounding cannot make the lines
sum to the total they were derived from.

**Always**: when a paid total is distributed across lines, compute every line's
exact share, floor it to the smallest money unit, then hand the leftover units to
the lines with the largest fractional part (largest-remainder/Hamilton) — the
same shape `deriveSalaryProjectDays` already uses for whole days. The shares then
sum to the rounded attributed total by construction (the whole amount when the
split covers every paid day), and ties break deterministically by line order.
Floor-then-distribute, not round-each: rounding each line can overshoot the total
as easily as undershoot. Test the divide-evenly case (100 into 3) and a case
where the leftover unit lands on a different line; a 50/50 split never rounds, so
it passes on the buggy code and proves nothing.

## Base UI state attributes are `data-*` presence, not `:focus` and not `="true"` (🟠 Major)

The shared `Select` styled its items with `focus:bg-accent focus:text-accent-foreground`.
Base UI marks the active option with `data-highlighted` (value `""`) and the
chosen option with `data-selected` (value `""`), and it drives the highlight
from pointer/keyboard state rather than per-item focus, so the `:focus` variant
misses real highlight states. Worse, this repo's `shadcn/tailwind.css` defines
`@custom-variant data-selected { &:where([data-selected="true"]) }`, which a
Base UI `data-selected=""` never matches; the bare `data-selected:` variant
silently generates dead CSS. Use the arbitrary form `data-[selected]:` (→
`[data-selected]`) and style `data-[highlighted]:` for hover/keyboard.

**Always**: for Base UI (or any primitive that emits bare boolean `data-*`
attributes), grep the compiled stylesheet for the generated selector before
trusting a `data-*` variant. If it contains `="true"` and the runtime attribute
is `""`, switch to the `data-[attr]:` arbitrary form. Style the state attribute,
not `:focus`, so pointer and keyboard highlight stay in sync.

## Theme CSS must never mix against a hard-coded `white` (🟠 Major)

`::selection { background: color-mix(in oklab, var(--primary) 24%, white) }`
was invisible in dark mode: `white` is light in both themes, so the light
`--foreground` ink sat on a near-white highlight. The same class of bug shows up
whenever a token is mixed with a fixed colour instead of the theme surface.
Mix with `var(--surface)` (white in light, the dark card in dark) so the light
theme is byte-identical and dark follows its own tokens. The native `<select>`
had the sibling bug: `select option { color: var(--foreground); background-color:
var(--background) }` overrides the OS highlight's own text colour, so a hovered
option in dark mode was light-on-light. Leave `<option>` to the platform and
theme the closed control with `color-scheme` per theme.

**Always**: after any `color-mix`/overlay token, check both themes; and never
set `color`/`background-color` on native `<option>` — use `color-scheme`.

## react-day-picker's default chevron is a black-filled polygon (🟡 Minor)

`chevron: ""` in the `classNames` left react-day-picker's default `<svg><polygon>`
with no `fill` attribute, so it rendered black in both themes (invisible on the
dark popup). Give it `fill-current` so it inherits the nav button's ink token
(`text-ink-3`), and add explicit `disabled:*`/`focus-visible:*` classes because
the library ships no default CSS here.

**Always**: when overriding a component library's default class to `""`, check
what the default element actually paints (attribute vs `currentColor`); an empty
class is not "theme-aware", it is "unstyled default".
## ORPC swallows procedure errors before the request interceptor: the real message only exists at the client interceptor (🟠 Major)

On the invoice-observability lane the API had no usable failure log. The only
hook was `interceptors: [onError(...)]` on the `RPCHandler`, but ORPC's
`StandardHandler.handle` wraps the whole match/decode/call in a `try/catch`
that **encodes every procedure error into a response** (`codec.encodeError`)
and returns `{ matched: true, response }`. A request-level `onFinish`/`onError`
therefore sees either a resolved result or, for decode/encode failures, a
thrown error — never the original procedure error. Worse, `toORPCError` maps a
plain `Error` to `{ code: "INTERNAL_SERVER_ERROR", message: "Internal server
error" }`, so the wire body does not carry the real message either.

Two more traps found while wiring the logging:

1. The only layer that still holds the real error is the **procedure client**
   interceptor (`clientInterceptors: [onError(...)]`), whose options include
   `path` (the procedure name) and `context`. A domain failure returned as
   `{ success: false }` never throws at all, so it needs a **client-level
   `onFinish`** inspecting the decoded output.
2. The ORPC standard-protocol response body is wrapped as `{ json: <payload>,
   meta?: [...] }` — for **errors too**. A status/body logger that reads
   `response.message` finds nothing and falls back to `HTTP 500`; it must
   unwrap `body.json` first.

De-duplication between the client interceptor (has the error) and the
transport middleware (has the mapped status) needs an explicit per-request
marker, but **NOT keyed on the ORPC `context` object**: ORPC shallow-copies
the context between layers (`resolveFriendlyStandardHandleOptions` spreads,
`intercept` spreads again), so the client interceptor and the `/rpc/*`
middleware receive different object identities for one request — a
`WeakSet<object>` keyed on `context` silently misses and both layers log
(found empirically with a tag property that appeared on both copies). Use an
`AsyncLocalStorage` store created by the transport middleware and inherited by
every nested interceptor; that is identity-independent. Test the exact
contract: a rejected mutation logs **one** line with the error message, a
thrown procedure error logs one line with its real message, and a successful
mutation logs nothing.

3. Do not guess 400 vs 500 in the interceptor. ORPC already mapped the status
   (`step === "decode_input"` → `BAD_REQUEST`, otherwise
   `INTERNAL_SERVER_ERROR`), but only the transport sees the encoded response.
   Log the status verbatim from a `status >= 400` response in the `/rpc/*`
   middleware: a malformed request must not be reported as a server fault.

**Always**: when adding ORPC server-side logging, put thrown-error logging on
`clientInterceptors.onError`, `{ success: false }` logging on
`clientInterceptors.onFinish`, and decode/encode + 4xx/5xx logging at the
transport using ORPC's mapped status, deduped by an `AsyncLocalStorage` store
(never by the context object). Never assume a request-level `onError` sees
handler errors, and always unwrap `{ json: ... }` before reading a response
body.

## Desktop settings ride the config file the shell already forwards (💡 Design Principle)

The desktop shell clears the sidecar environment and forwards only an allowlist;
`APP_BACKUPS_ROOT` was not on it, so a desktop backup-folder setting had no way
through. Adding each setting to the shell's forward list makes Rust the
bottleneck. The shell already sets `TUARI_CONFIG_FILE=<tuari>/config.json`, and
`createAppConfig` merges that file (env wins) — so a user-editable setting
belongs in `configFileSchema` + `mergeConfigIntoEnv` and reaches the next
sidecar start with **no Rust change**. The forgetting risk is forgetting to
forward a *new* env var; the config-file path side-steps the whole class.

**Always**: before adding a variable to the desktop shell's forward list, check
whether the setting can ride `config.json`. Write it through
`infrastructure/config/config-file-writer.ts` (atomic read-modify-write,
preserves unrelated fields, rejects a merged config the loader would reject) —
never copy that write protocol into a second persister.

## A form opens with the sensible default already filled in (🟠 Major)

The owner's rule, stated flatly: *"there should always be default values. For
example the date is today... Also for example, the default salary is the full
salary — so these things should have the default values directly."*

Applied correctly, this removes typing, not control:

- **A form that creates or records something** defaults every field the app
  already knows: the date to today, the amount to the full/expected figure the
  app can compute, the relation when there is exactly one candidate.
- **A filter stays empty.** Empty means "no filter"; defaulting a filter to today
  silently hides data, which is the opposite of the rule.
- **A default is a starting point, never a constraint.** It stays editable, and
  it must not overwrite what the operator typed — the `#420` behaviour is the
  reference: an untouched amount follows a days change, a typed one wins.
- **A default must never be guessed.** If a field plausibly has an obvious value
  but the rule is not certain, ask the owner; do not invent a business rule.

The audit that produced this entry is worth reading as a cautionary tale about the
measurement, not just the rule. A grep for the helper name found **one** file
defaulting a date to today and sixteen that did not — but the app's canonical
today helper is `getAlgeriaDateInputValue` (39 call sites), and the single file
found was the one that had **reinvented it privately** as `getTodayDateValue`.
So the sixteen "missing" defaults were mostly fine, and the real defect was the
one screen that bypassed the shared helper — it built a UTC day
(`new Date().toISOString().slice(0, 10)`), so between 23:00 and 24:00 UTC the
invoice date was a day behind the Algeria business day (issue #440).

Two lessons worth keeping: **measure against the canonical helper, not the name
you expected** — a private copy is invisible to a name-based search and is the
thing you are actually looking for; and **put a shared default in a shared module
the first time**, because a private helper is exactly how one screen drifts from
the other sixteen while looking correct in isolation.

Sibling rule, same family: when a save is blocked, **say why, on screen, naming
what is missing** — a disabled button with no reason is a silent failure. See the
invoice save-reason pattern: `validateLines` returns the first localized reason
and `saveDisabledReason` renders it in a `role="status"` line beside the
disabled save control
(`apps/web/src/features/inventory/inventory-invoice-create-page.tsx`).
