# Architecture Wisdom

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
