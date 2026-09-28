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
