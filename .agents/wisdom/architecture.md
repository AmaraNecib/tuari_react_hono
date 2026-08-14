# Architecture Wisdom

## Drizzle better-sqlite3 `db.transaction(async …)` silently breaks every async call (🟠 Major)

Issue #249's honest-coverage tests exposed a latent production bug: `DrizzleAccountRepository.withTransaction` called `this.db.transaction(async (tx) => …)`. Drizzle's better-sqlite3 driver wraps the **synchronous** better-sqlite3 transaction API, so an async callback makes it throw `Transaction function cannot return a promise` at runtime — every account profile update / password-change record was crashing in production, while all unit tests passed because they mocked the repository. The code *looked* correct and type-checked fine.

Fix pattern (3rd instance of the #195 lesson — now in bootstrap, recovery-key, and account): own the transaction on the raw connection (`this.db.$client` for Drizzle repos): `if (!raw.inTransaction) raw.exec("BEGIN IMMEDIATE")`, run the async callback, `COMMIT`/`ROLLBACK` on success/failure, wrap ROLLBACK in try/catch so a failing COMMIT surfaces the original error, and serialize through a FIFO promise-chain lock so no other repo call joins the open transaction. `raw.inTransaction` join keeps an externally-opened transaction working (outer owns COMMIT/ROLLBACK).

**Always**: when a Drizzle better-sqlite3 repository is first wired to a service with async transaction callbacks, exercise it against a real `:memory:` DB before shipping — the sync-only transaction contract is invisible to typecheck and mocked tests. Also: each new hand-rolled FIFO lock is drift risk (three copies now, with the guarded-ROLLBACK fix applied to only one) — tracked #288.

## Barrel re-exports: "export the const" is incomplete without the index re-export (🟠 Major)

Issue #206 said "export `reportFilterInputSchema` from `reports-contract.ts`" — but that module was imported only by `app-contract.ts` and NEVER re-exported from the package index, so the exported const was still unreachable from `@tuari/contracts` (the only import path the API uses). The fix needed BOTH the `export const` AND `export * from "./reports-contract"` in the index (consistent with `invoice-contract`/`payment-contract`/`update-contract`/`rbac-contract`). The test failure (`reportFilterInputSchema` undefined) caught it immediately.

**Always**: when an issue says "export X from module Y", verify module Y is actually reachable from the package entry (`src/index.ts`) before implementing — grep the index for `export * from` covering Y.

## In-memory adapters duplicate ownership-history helpers across domains (🟡 Minor)

`InMemoryWorkforceRepository` and `InMemoryOperationsRepository` both carry
byte-identical private helpers (`insertProjectManagerOwnershipHistory`,
`endActiveProjectManagerOwnershipHistory`, `insertWarehouseManagerOwnershipHistory`,
`endActiveWarehouseManagerOwnershipHistory`, plus state-history variants) because
both operate on the shared `InMemoryStore`. When retyping them (any → typed
`Omit<Record, "id"|"endDate"|"createdAt"|"updatedAt">` + `AuditSnapshot`), both
copies must be edited in lockstep — a real maintenance hazard. Tracked as #202;
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

`createAppDependencies(sqlite, drizzleDb, auth, config = createAppConfig())` — the
optional trailing config param keeps every existing caller unchanged while letting
tests inject `DB_ADAPTER=inmemory`. The `createCompanyRepository(rawDb, config)`
factory switches adapters; other modules (inventory/invoice/payment) still use the
sqlite handle until their in-memory adapters exist. Keep the param appended, never
inserted mid-signature.

## Async ports over a synchronous driver lose implicit atomicity (🟠 Major)

`RecoveryKeyService` was fully synchronous (better-sqlite3). Its invariants —
one-time-use (read + guarded update) and max pool 5 (count + inserts) — were
enforced *by the event loop*: two calls could never interleave. Porting it to
an async `RecoveryKeyPort` (per the issue's Promise signatures) split those
flows across `await` points, so two concurrent consumers could both read
AVAILABLE and both "succeed", and two concurrent generate calls could insert 6
keys. The debate (critic) caught the first; the test audit (edge-case hunter)
empirically caught a nastier variant: a `consumeKey` write could join an open
`generateKeys` transaction on the shared connection and be *silently rolled
back* by its failure — the consumed key became AVAILABLE again.

Fix pattern (issue #195): (1) guarded check-and-set — `updateKeyStatus`
returns `Promise<boolean>` with `WHERE id = ? AND status = 'AVAILABLE'`, so a
stale writer is a 0-row no-op; (2) serialize **every** port method through a
promise-chaining FIFO lock, and give `withTransaction`'s callback an unlocked
tx-scoped view (the `AccountRepositoryTransaction` pattern) so its internal
calls don't deadlock; (3) `withTransaction` owns BEGIN IMMEDIATE/COMMIT/ROLLBACK
(better-sqlite3 transactions are sync-only — the bootstrap.service pattern),
and the lock guarantees no other port call runs inside the open transaction.

**Always**: when converting a sync service to an async port, audit every
read-modify-write and multi-statement flow for interleaving. "Same logic,
await it" is not behavior-preserving — add the atomic primitive at the port
level (guarded CAS / serialized transaction), and pin each invariant with a
deterministic concurrency test.

## Output schemas validate, they don't transform (🟡 Minor)

On #221, `changeDbKeyOutputSchema`'s failure member used `error: z.string().trim().min(1)` to reject blank-looking errors. Greptile (4/5 → 5/5 after the fix) flagged `.trim()` as a *transform* on an output schema: it silently rewrites server-emitted values rather than rejecting them. The pure-validator form is `z.object({...}).refine(({ error }) => error.trim().length > 0, ...)` — same rejection behavior, zero mutation. On INPUT schemas transforms are fine (normalize what the client sent); on OUTPUT schemas prefer `refine`/`regex` so the server's emitted value crosses the wire byte-identical.

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
by construction — the strongest form of "validate at the boundary". This
extends the `AccountService` precedent (reuses `algerianPhoneSchema.safeParse`)
into the pattern for service-boundary input checks: never duplicate the
validity definition in the service.

**Always**: when an issue says "harden input at the service boundary", reuse
the existing contract schema via `safeParse` rather than hand-rolling checks;
consume `parsed.data` (already normalized by schema `.trim()`s) downstream.

## Zod issue taxonomy: missing key is `invalid_type`, not `too_small` (🟠 Major)

The test-audit edge-case hunter caught a real message bug: a mis-wired caller
passing `{ phone, password }` (missing `name`) gets an `invalid_type` zod issue,
NOT `too_small` — so a map branching only on `too_small` emitted
"الاسم يجب ألا يتجاوز 120 حرفًا." (too-long) for an *absent* name. Fix: treat
`too_small` OR `invalid_type` as the "required" branch. Also: a schema without
`.min()` (e.g. `algerianPhoneSchema` = trim + regex only) never produces
`too_small` — blank phone is `invalid_string`, so put the phone in the
"invalid/format" map and the regex-prose message must cover blank too.

**Always**: when mapping zod issues to user-facing messages, branch
`too_small || invalid_type` → required; everything else → invalid/format; and
check each field's schema for whether `.min()` even exists before relying on
`too_small`.

## Zod v4 exposes string schema bounds at runtime (🟡 Minor)

`z.string().min(8).max(128)` → the schema instance has public `.minLength`
(`number | null`) and `.maxLength` — accessible via `schema.shape.field` on
objects. #226 derives the Arabic message copy from these
(`كلمة المرور يجب أن تكون ${schema.shape.password.minLength} أحرف على الأقل.`)
so message copy cannot drift from the contract. Caveats: `.optional()` wraps the
field in `ZodOptional` (unwrap first), a schema without `.min()`/`.max()` yields
`null` (renders "null" in a template — accepted residual), and Arabic plural
grammar ("أحرف" vs "حرفًا") depends on the numeric value (8 vs 120), so a
future limit change may need grammar review.

**Always**: when validation copy must match schema limits, introspect
`minLength`/`maxLength` instead of hardcoding the numbers.

## `orpc.session.key()` never matches the mounted session query — use `queryOptions().queryKey` (🟠 Major)

On #236, `getCachedSessionUserId` read the session from `orpc.session.key()`, but
that generates `[["session"], {}]` while the session query mounts under
`[["session"], { type: "query" }]` (`queryOptions().queryKey` omits nothing;
bare `key()` omits the `type` field). Result: the helper ALWAYS returned null.
The workspace mutations survived because `invalidateWorkspaceDomains`'s
`userId === null` branch over-invalidated the whole `["phase1","workspace-domain"]`
prefix — the null fallback masked the broken key. The typed inventory
invalidations (no fallback) exposed it: the item-definitions list went stale
after create. The same no-op invalidations existed in sign-out, account-settings
and phone sign-in (`invalidateQueries({ queryKey: orpc.session.key() })`).

Fix: `export const sessionQueryKey = orpc.session.queryOptions().queryKey` in
`workspace-keys.ts` — the same expression the session hook mounts with, so the
two cannot drift — and use it for every session cache read/invalidation.

**Always**: when matching the session query cache (or any ORPC procedure's
cache), derive the key from `queryOptions().queryKey`, never from bare
`key()`. If a helper has a "fall back to something broader" branch, verify the
primary path actually matches — a too-broad fallback can mask a broken key for
a long time.
## "Align storage adapters" includes the in-memory double, not just the sqlite file (💡 Design Principle)

Issue #209 said "align the remaining rbac storage adapters with `adapters/`" and
named only `sqlite-role.repository.ts`. The debate (critic, severity 5) forced the
full read: the module's **in-memory test double** (`InMemoryRoleRepository`) was
still embedded in `role.module.ts` while every other module keeps doubles in
`adapters/` (`workforce/adapters/in-memory-role.repository.ts`, `company/adapters/inmemory-*`).
The finished change extracted BOTH implementations to `adapters/`, keeping only the
deep module + its `RoleRepository` seam at the root — the same shape as
`company.repository.ts` at root with sqlite/inmemory implementations in `adapters/`.

**Always**: when an issue says "align adapters", enumerate every implementation of
the module's ports (sqlite + in-memory + any others), not just the file the issue
names. The interface/seam stays with the deep module at the root; implementations
live in `adapters/`.

## Advertised-but-unimplemented contract surface: drop the procedures, don't stub handlers (💡 Design Principle)

On #239, the `recurringPatternsList/Get` procedures were spread into `appContract`
(so `AppClient` exposed them) with no server handlers; an `as any` at the router
boundary hid the gap. Resolution: **drop the procedures until the feature lands**,
not a stub implementation — with no DB table/module behind them, the only possible
handler returns a hard-coded empty list (fake behavior that renders an empty page
and claims the feature works), and a read-only list/get contract without
create/update is not a feature anyway. Deleting the procedures makes
`os.router(allHandlers)` typecheck natively, so contract/server drift becomes a
build error. Also delete the orphaned consumers (the hook/page that called the
procedures were unrouted — deleting is behavior-preserving), and pin the deletion
with a negative contract test (`"key" in appContract` is false) so a re-added
spread without handlers fails at the contract level. Keep the domain *schemas*
(`recurring.ts`) exported — they're vocabulary for the future feature, not RPC
procedures.

**Always**: when a contract advertises procedures with no handlers, prefer
deletion over a stub; the compiler + a negative contract test are the drift
sentinels, and the `as any` cast must never be the thing that makes the router
typecheck.

## Zod refine() fires even on empty strings — guard with `value.length === 0 ||` (🟡 Minor)

On #250, adding `.refine((v) => /[^\p{Cf}]/u.test(v))` after `.min(1)` on the
bootstrap `name` schema made an EMPTY name produce TWO zod issues (`too_small`
from min + `custom` from the refine), doubling the service's fieldErrors and
breaking four existing tests. Zod chains run refinements on every value that
reaches them, including ones a sibling check already rejects. Fix pattern:
`.refine((v) => v.length === 0 || /[^\p{Cf}]/u.test(v), ...)` — the empty guard
defers to `.min(1)` so an empty name still yields a single "required" issue.

Also: a `custom` (refine) issue code is neither `too_small`/`invalid_type`
(required) nor the format codes — the service message map needs its own branch
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
are not — the design doc is the contract that makes this safe.


## Aggregate-RPC read paths: keep the individual hooks, route invalidation through one seam (💡 Design Principle)

#276's snapshot consolidation kept `useRolesQuery`/`useEmployeesQuery`/etc.
exported (global search, sections, debts/inventory features still use them)
and made `invalidateWorkspaceDomains` the single seam that auto-invalidates
the snapshot whenever a snapshot-backed domain changes. New domains are
covered by updating one set + a unit test pinning membership, instead of
hunting every call site.

**Always**: when introducing an aggregate read, don't delete the granular
hooks other features depend on — keep them as the query vocabulary and add
the aggregate as a new key. Route snapshot invalidation through ONE
documented seam with a pinned-domain set so future domains can't be
forgotten.

## Verify a flagged validation path is even reachable before "fixing" it — dead code may be the real answer (💡 Design Principle)

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
failed"`) worked against the wire gate by luck — and the fix was to remove
the string dependence entirely (issues-first), not align it to a dead path's
message.

**Always**: when an issue/audit points at a "wrong" error path, first prove
it's reachable (`git log -S <symbol>`, repo-wide rg, wire probes). If it's
dead code, delete it (single source of truth) rather than making it "correct"
— keeping a correct-but-unused path preserves the trap for the next audit.

## Every new transaction-bearing method must acquire the write reservation up front — plain db.transaction() re-opens the stale-read TOCTOU (🟠 Major)

On #289, `deleteIfUnallocated` (the new atomic guarded delete) was written with
`this.db.transaction(fn)` — better-sqlite3's DEFAULT is a DEFERRED BEGIN. The
debate critic (sev 6) caught that cross-process, a deferred BEGIN lets the
guard's existence/COUNT reads run against a pre-create snapshot; when the
concurrent create commits, the write-upgrade can succeed against the FRESH
snapshot while the COUNT was computed on the STALE one, and the subsequent
DELETE cascade-removes the fresh allocations — exactly the gap-4 corruption the
guard exists to prevent. `runInTransaction` had the fix all along
(`BEGIN IMMEDIATE`); the new method silently regressed to the vulnerable
pattern because it was modeled on the OLD `deletePayment`, not on the repo's
own transaction discipline. Fix: `transaction.immediate()`.

**Always**: when adding ANY new method that opens a transaction in this
codebase, grep the sibling transaction code first and match its write
reservation (`transaction.immediate()` / explicit `BEGIN IMMEDIATE`), never
plain `db.transaction()`. A guard's reads are only trustworthy if they run
under the reservation they protect.
