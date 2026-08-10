# Testing Wisdom

## Windows orphaned dev servers: kill the tsx-watch PARENT tree, and check the cmdline's worktree (🟠 Major)

On #183, port 4318 kept being "already used" even after `taskkill /F /T` on the listener: a stale `node tsx watch src/index.ts` from ANOTHER worktree (issue-230) respawned its API child seconds after each kill. Playwright's `reuseExistingServer:false` does NOT pre-check the port — it proceeds if `/health` answers, so the suite ran against the wrong worktree's server and stale DB ("Invalid phone number or password" on a supposedly-fresh DB). Tell: the listener's cmdline referenced `worktrees/issue-230-whitespace-pw/...tsx...` — NOT this worktree.

Fix pattern: before local playwright runs, list listeners on the config ports AND their process cmdlines (`Get-CimInstance Win32_Process | ? {$_.CommandLine -match 'tsx|vite'}`); if the cmdline names a DIFFERENT worktree, walk the parent chain (listener → `tsx watch` node → `cmd /c tsx watch`) and `taskkill /F /T` the TOP of that tree (the cmd launcher), not the listener — the watcher respawns children. Also verify `apps/api/data/` (the E2E DB dir — APP_DB_PATH resolves against the API package cwd, NOT the repo root) is empty before a run.

**Always**: match port listeners to their owning worktree via cmdline before trusting a "free" port; kill the whole watcher tree.

## In-memory test doubles must mirror sqlite's per-column semantics (🟠 Major)

The in-memory employee repo concatenated `firstName lastName phone` into one haystack; sqlite matched each column with `OR`. A full-name term like `أحمد بلخير` matched in-memory (module tests green) but returned NOTHING on production sqlite — the test-audit edge-case hunter caught it. Fix: sqlite added `(first_name || ' ' || last_name) LIKE …` to mirror the concatenated haystack. **Always**: when a filter/query behaves differently in the in-memory double vs the sqlite adapter, add a discriminating test that would fail on the divergent side; assert the same term in BOTH adapters.

## `ESCAPE '\'` inside a JS template literal collapses to `ESCAPE ''` (🟠 Major)

In a `sql`\`…` template, the source text `'\'` is processed by JS as an escape sequence → the SQL sees `''` (empty escape char) and SQLite throws `ESCAPE expression must be a single character`. The source must contain TWO backslashes (`'\\'` in the file) so the template emits one. **Always**: after adding an `ESCAPE` clause via a tagged template, run the query — an empty escape throws immediately.

## Playwright: `getAllByRole` throws on zero matches — use `queryAllByRole` for zero-count assertions (🟡 Minor)

A `waitFor(() => expect(getAllByRole(...).length).toBe(0))` fails with "Unable to find" instead of "expected 0" — `getAllBy*` throws when nothing matches. For asserting an EMPTY result, use `queryAllByRole(...).length === 0`. **Always**: count assertions that may legitimately reach zero use the `queryAll*` variants.

## Playwright retries share the API DB — seed data must be unique per ATTEMPT (🟠 Major)

CI sets `retries: 2`; a retried test re-runs against the SAME API server and DB (webServer runs once per process). Seeding fixed phone numbers (sqlite UNIQUE constraint) throws on the second attempt. Fix: derive seed values (phones, names) from the per-call `uniqueSuffix()`, not constants. **Always**: any E2E row inserted directly into the shared DB must be unique per test ATTEMPT, not just per run.

## Playwright toast assertions must gate on the save response (🟠 Major)

On #254, a `~50%` E2E flake: after a password change, the follow-up sign-out
sometimes left the app signed in despite a 200 `/api/auth/sign-out`. Root
cause: the success-toast assertion used `.first()` to tolerate stacked toasts,
which could match an EARLIER save's still-visible toast — so the test moved on
(sign-out) while the CURRENT save's change-password was still in flight. When
that save completed, its session re-establishment (better-auth's
`revokeOtherSessions` deletes ALL sessions including the current one and
creates a new one) re-signed the app in *after* the sign-out. The tell in the
network log: a change-password POST arrives AFTER the sign-out POST.

Fix pattern (`saveAccountAndExpectSuccess`):
`page.waitForResponse(r => r.url().includes('/api/auth/change-password'))`
set up BEFORE the save click, assert the response is 200, then assert the
toast. The save is provably settled before the next step runs.

**Always**: when an E2E asserts a toast as proof a mutation succeeded, gate the
assertion on the mutation's HTTP response first. A `.first()`/substring toast
match can silently pass on stale toasts.

## Windows orphaned dev servers contaminate Playwright runs (🟠 Major)

On #254, manual debugging APIs (`tsx watch src/index.ts` + a separate web
dev server) left process TREES alive on Windows that Playwright's webServer
teardown never killed. On the next `playwright test` run, the leftover
listener answered the `/health` URL while Playwright's own API failed to bind
(`EADDRINUSE` in the run log) — tests silently ran against the STALE server
with its STALE DB (e.g. a bootstrapped manual DB made the fresh-DB bootstrap
test see the sign-in screen). `kill <pnpm-parent>` alone doesn't work: `tsx
watch` respawns its child. Also `reuseExistingServer: false` does NOT
pre-check the port — if anything answers the URL, Playwright proceeds.

Fix pattern: before every local playwright run, `taskkill /F /T` every PID
listening on the config ports AND every `tsx watch`/`vite` process for the
worktree, then verify the ports stay free (no respawn) and delete
`apps/api/data/*.sqlite*`.

**Always**: after any manual dev-server debugging, kill the full process tree
(`taskkill /F /T`, `pkill -f tsx`), not just the PIDs you started.

## Read-only better-sqlite3 hides WAL-mode data (🟡 Minor)

Opening a live better-sqlite3 DB file `readonly: true` while the writer holds
it can report 0 rows because the data lives in the un-checkpointed `-wal`.
On #254 a passing bootstrap test left a "0 users" DB that the API served
with `hasUsers: true` — the row was in the WAL. Checkpoint (or read with the
writer stopped) before trusting a read.

**Always**: when inspecting a live sqlite DB for evidence, close the writer
first or `PRAGMA wal_checkpoint` before the read.

## ORPC wire validation rejects with ORPCError code BAD_REQUEST (🟡 Minor)

Probed on #206: calling an ORPC procedure (via `createRouterClient`) with input that fails the contract schema rejects with an `ORPCError` — `code: "BAD_REQUEST"`, message `"Input validation failed"` (the server maps the internal `ValidationError` to this). A handler-side `throw new Error(...)` surfaces differently (plain Error), so `rejects.toMatchObject({ code: "BAD_REQUEST" })` is the precise way to assert the *wire gate* fired, not a handler crash.

**Always**: in ORPC router tests, assert invalid-input rejections with `toMatchObject({ code: "BAD_REQUEST" })` rather than `toBeInstanceOf(Error)`.

## Object-spread widens status literals; trailing spread preserves them (🟠 Major)

In TypeScript, `{ ...cur, status: "ENDED" }` where `cur` is a typed record with
`status: "ACTIVE" | "ENDED" | "ARCHIVED"` infers `status: string` and fails
assignment. But `{ ...h, endDate, status: "ENDED", ...a, updatedAt: endDate }`
(trailing spread after the literal) preserves `"ENDED"`. Fix: `status: "ENDED" as const`.

This only surfaced after typing the in-memory `Map<string, any>` store — the `any`
was hiding it. When removing `any` from a store/adapters, expect literal-widening
errors at every `{ ...record, status: "X" }` mutation; grep for `status: "` overrides
and add `as const` proactively.

**Always**: after typing Maps, run typecheck immediately; fix literals with `as const`.

## Service-layer methods may be stubbed business rules (🟠 Major)

`WorkforceService.createRole` throws `CompanyError("BUSINESS_RULE", ...)` — the
custom-role-management feature is deliberately unimplemented. Tests that assume a
CRUD round-trip through the service will fail for the wrong reason. When proving
adapter wiring, prefer behavior that discriminates the adapters without touching
unimplemented rules: e.g. `listRoles()` returns `{ items: [] }` via the in-memory
store but throws `/no such table/` via sqlite against a schema-less `:memory:` db.

**Always**: check the service method for an early `throw` before writing a round-trip test.

## Heavy dependency-wiring tests cold-start flake (🟡 Minor)

`createAppDependencies` tests dynamically import better-auth + every module
(~2.3s warm, more on cold transform). At the vitest default 5s timeout a cold run
can flake. Set an explicit `describe(..., { timeout: 20000 }, ...)`.

**Always**: give integration-style wiring tests a generous describe-level timeout.

## Flaky findBy* / waitFor under full-suite load: raise the file's asyncUtilTimeout (🟠 Major)

`home-view.test.tsx` flaked ~50% under full-suite parallel load (passed standalone
always) with `Unable to find role="heading" ...` — testing-library's default 1s
async wait was exceeded by slow renders. Per-call `{ timeout: 5000 }` on each
finder is noisy and easy to miss; the canonical fix is one line at the top of the
file: `configure({ asyncUtilTimeout: 5000 })` (import `configure` from
`@testing-library/react`). It sets the default for BOTH `findBy*` (built on
`waitFor`) and bare `waitFor` calls, is module-scoped under vitest's per-file
isolation, and future calls inherit it. Note: an existing explicit `{ timeout:
5000 }` becomes redundant but harmless — leave it to keep the diff minimal.

**Always**: for a whole-file async-wait timeout problem, use `configure({ asyncUtilTimeout })`
rather than scattering per-call timeouts; validate with 2-3 consecutive full-suite
runs (the flake may not reproduce standalone).

## Pin ambient env in default-path tests (🟡 Minor)

A test asserting the *default* config path (`createAppConfig()` with no source)
reads the real `process.env` — `DB_ADAPTER`, `TUARI_CONFIG_FILE`, `NODE_ENV`
pollution from the shell can flip the result. Use `vi.stubEnv(...)` + `afterEach(vi.unstubAllEnvs)`.

## TS4058 "cannot be named" when typing `rawDb` params in dts-built packages (🟠 Major)

Typing `sqlite?: any` → `sqlite?: BetterSqliteDatabase` on an exported
function whose INFERRED return carries the type (e.g. `rawDatabase`
field) breaks the tsup `dts` build: the emitter resolves the alias
`Database.Database` to the UMD-global `BetterSqlite3.Database`, which it
cannot name in a module bundle. Annotated positions (params, explicit
return annotations that name a LOCAL exported alias) are fine — the
failure is specific to *inferred* return types that inline the external
type. The app's `index.ts` is a server entry (empty d.ts) yet the dts
step still type-checks exported functions in the entry graph.

Fix pattern: give the exported function an explicit return type named
via an exported local alias — but NOT `Awaited<ReturnType<typeof f>>`
(that is circular once you annotate `f` with it). Declare the shape
explicitly. Verified on #204: `createAppDependencies` got an explicit
17-field `AppDependencies` type.

**Always**: after typing a previously-`any` rawDb param, run
`pnpm --filter @tuari/api build` (or the package's tsup build) locally —
typecheck alone does NOT catch TS4058.

## Deterministic concurrency tests for single-connection ports (🟡 Minor)

Concurrency tests over better-sqlite3 are deterministic, not flaky, because
the driver is one synchronous connection: the FIFO-locked port serializes
flows, so the *outcome* is invariant under any microtask interleaving (only
*which* caller wins varies). Pattern used for RecoveryKeyPort (#195):
`Promise.all([consume, consume])` then assert `results.filter(Boolean)` length
=== 1; `Promise.allSettled([0,1,2].map(() => generateKeys()))` then assert the
pool is exactly the cap. These tests fail against an unguarded port, so they
pin the invariant, not an implementation detail.

Also: when a test-audit hunter needs to prove a rollback/leak, inject failure
with a wrapper port or a throwing `withTransaction` callback (gated test) —
don't rely on timing. And `allSettled` + exact-assertion beats `≤ bound`:
it catches both overshoot *and* under-production.

**Always**: assert the invariant (exactly one winner, exact cap), not a bound;
use `Promise.allSettled` so a rejected branch is visible as a failed assertion
instead of an unhandled rejection.

## Pre-push hook load surfaces marginal timeout flakes (🟡 Minor)

The pre-push hook runs contracts build + typecheck + lint + test:api before
test:web in one chain. Under that load, vitest cold transforms run slower and
marginal timeouts tip over:

- `dependencies.test.ts` had a 20000ms describe timeout that passed standalone
  but hit ~20186ms under the hook (cold-start flake, per the entry above).
  Raised to 60000ms in #196.
- `apps/web/src/features/app-shell/home-view.test.tsx` ("renders project
  details as a dedicated page") flakes under load — `findByRole`'s default 1s
  timeout trips; passed 3/4 standalone runs. Untouched by API-only PRs.

**Always**: when a pre-push run fails on a *different* test than the previous
attempt, it's the loaded-machine cold-start class, not a regression. Verify the
failing file standalone, then retry the push. Do NOT "fix" web test files in an
API-only PR.

## Playwright E2E on Windows: orphaned `tsx watch`/vite servers poison runs (🟠 Major)

`pnpm dev:api` runs `tsx watch` and `pnpm dev:web` runs vite; Playwright's webServer
teardown on Windows often orphans them. The orphans keep their OLD DB (so bootstrap
looks "already set up"), serve STALE vite modules (raw i18n keys, missing tabs), and
rebind 4318/3000 after `tsx watch` restarts — producing EADDRINUSE and transient
"already used" failures. Netstat right before a run can be clean and the orphan still
appears mid-run (delayed tsx-watch restart).

**Always**: before/after local e2e runs, kill ALL node processes whose cmdline contains
the worktree path (`Get-CimInstance Win32_Process | Where-Object {$_.CommandLine -match
"worktree-name"}`), verify ports are free, and prefer a no-watch server
(`npx tsx src/index.ts`, not `pnpm dev:api`) for the manual API. Deleting the sqlite
file while a server holds it fails with "Device or resource busy" — kill first, then rm.

## The e2e suite was fully red on develop — don't assume "existing" specs pass (🟠 Major)

Before #227, no Playwright spec could get past login: the helper's
`getByLabel("كلمة المرور")` strict-violated (the PasswordInput show/hide button made
the field's accessible name "كلمة المرور إظهار كلمة المرور", and the button's
aria-label "إظهار كلمة المرور" also matched), and the post-login marker "مساحة العمل"
is never rendered (shell.workspace exists in i18n but no component uses it). The
onboarding tour (autoStart, storageKey home-tour) also blocks as a modal on first
visit. Fix: `getByRole("textbox", { name: /^كلمة المرور/ })`, wait for the dashboard
heading "لوحة التحكم", dismiss the tour via its "تخطي" button (try/catch — it may not
show). There was no test-e2e CI job, so nothing caught this.

**Always**: when adding or touching e2e specs, run the FULL suite locally (workers:1,
fresh DB per run) — the target spec passing alone doesn't mean CI e2e is green.

## Employee creation via UI is impossible on develop (🟠 Major)

`employeesBatchCreate` validates roles with `requireAssignableEmployeeRole`, which only
accepts role keys worker/project_manager/warehouse_manager — but the RBAC consolidation
(Slice 3) removed those roles; only admin/manager/viewer are seeded and the create form
offers only those. Every role is rejected with "يمكن اختيار الأدوار النظامية فقط في هذه
المرحلة." The form also blocks submit on required salary-period + salary-amount fields
(native validation, invisible to Playwright). employees.spec.ts is skipped (#227) until
the workforce role rule is fixed.

**Always**: before writing an employee-create e2e, probe the batch-create RPC with each
seeded role; check for required fields that block the native form submit.

## ORPC wire envelope is { json: input } / { json: output } (🟡 Minor)

The ORPC "standard" protocol wraps procedure input/output: POST {api}/rpc/{procedure}
with body `{"json": <input>}` (input null for no-input procedures); responses come back
as `{"json": <output>}`. Raw input bodies fail with "Input validation failed". Verified
empirically and against @orpc/standard-server-fetch's toFetchBody.

**Always**: when driving ORPC procedures from tests/scripts, send the envelope and
unwrap `.json`.

## E2E `page.goto` is a full reload — it wipes the React Query cache and cannot pin an invalidation seam (🟡 Minor)

On #236, an E2E asserted a created warehouse appears in the inventory transfer
selector after `page.goto("/outbound-transfers/create")` — but a full document
reload discards the in-memory cache, so the page refetches from the server and
the assertion passes even if the mutation's invalidation is completely broken.
The test still proves shared key/endpoint coupling (one source of truth), but
not the invalidation. The invalidation seam is only pinned by unit integration
tests that mount hooks over a real QueryClient (seed session → mutate →
assert the mounted query refetches).

**Always**: to pin cache-invalidation behavior, use client-side navigation in
E2E (SPA link click) or, better, a unit integration test with a real
QueryClient. A `page.goto`-based assertion should be worded as a
shared-key/single-source-of-truth check, not an invalidation check.

## A too-broad invalidation fallback masks a broken key — the E2E suite caught it (🟠 Major)

On #236 the null-userId prefix-wide fallback in the invalidation helper masked
`getCachedSessionUserId` always returning null (see architecture.md). The
workspace flows kept working (over-invalidation); the inventory item-definitions
create flow went stale (narrow direct invalidation, no fallback) and only the
Playwright E2E suite caught it — the unit tests were green because the mock
harness set the session cache at the same (wrong) key the helper read.

**Always**: after changing cache keys or invalidation wiring, run the full E2E
suite even when all unit tests pass — a self-consistent unit mock cannot detect
a key that never matches the real mounted query. And when a helper has a
fallback path, add a direct unit test for the primary path (the #236 fix has
one: "does not resolve from bare orpc.session.key()").
## sqlcipher native binding may be unbuilt in a worktree — pin the databaseKey WIRING, not real encryption (🟠 Major)

`createDatabaseConnection(path, key)` requires the `better-sqlite3-sqlcipher`
native binding (`require("better-sqlite3-sqlcipher")` → `build/better_sqlite3.node`).
On a Windows worktree the package files exist but the `.node` binary is often NOT
compiled → passing any `databaseKey` throws "Database encryption requires
better-sqlite3-sqlcipher". So a test that passes `databaseKey` and expects a real
encrypted connection fails in such environments. Fix pattern (issue #198): mock
the factory module (`vi.mock("../infrastructure/database/factory", importOriginal)`)
to capture the key argument and strip it (delegate with `undefined`), asserting
`createDatabaseConnection` received the injected key — deterministic everywhere.
Reserve real-encryption assertions for environments where the binding is built.

## Migrations inside the composition root kill the schema-less-db trick (🟡 Minor)

Once `createAppDependencies` runs `ensureDatabaseSchema` itself (issue #198), a
`:memory:` db is ALWAYS fully migrated + role-seeded — the old adapter-discrimination
test (`expect(() => deps.companyService.listRoles()).toThrow(/no such table/)`,
which relied on a schema-less injected handle) can no longer work. Replace it with
the seeded-role assertion: sqlite adapter returns `{ items: [admin, manager,
viewer] }`, in-memory adapter returns `{ items: [] }`. Each test gets its own
`:memory:` connection, so a fresh migration per call is fast and isolated.

## Port result types should mirror the wire output shape (💡 Design Principle)

When extracting a port that backs a wire handler (issue #198: `DatabaseKeyManager`
for `changeDbEncryptionKey`), model the port's result on the wire output schema —
`{ success: true } | { success: false; error: string }` — not a bare boolean. A
boolean forces the handler to fabricate ONE failure message, which is wrong for at
least one failure mode (rekey I/O failure vs wrong current key) and lets rekey
exceptions escape as 500s. The discriminated result maps 1:1 onto the handler
return, keeps messages honest, and never throws.

## Negative contract-surface tests: use `in`, not `as Record<string, unknown>` (🟡 Minor)

On #239 the test-audit quality reviewer caught a false-positive trap in the
"procedures are NOT advertised" regression test: `(appContract as Record<string,
unknown>).recurringPatternsList` — the cast disables key-name checking, so a
misspelled key (e.g. `recurringPatternsGetAll`) silently returns `undefined` and
the test passes on the very invariant it exists to guard. The cast-free form is
`expect("recurringPatternsList" in appContract).toBe(false)` — key checked as a
literal string, zero type escape.

**Always**: for "this key must not exist on an object" assertions, prefer the
`in` operator over a `Record<string, unknown>` cast; a broad cast turns the
negative test into a false-positive machine on typos.

## Coverage chase exposes latent divergence bugs; unify before covering (🟠 Major)

Pushing `company/**` to 100% branches forced both halves of `buildCompanySystemLog`'s
filtering into view: the group gate compared dates with raw string operators
(`event.createdAt < filters.fromDate`) while the within-group matching set used
`compareTimestampsDesc` (real `Date` math). For non-ISO filter strings
(e.g. date-only `"2026-01-01"`) the two could DISAGREE, so a group could pass the
gate while every event failed the timestamp filter — and the old
`sortedEvents.find(...)` fallback chain then promoted an event that did NOT match
the filters to `primaryEvent` (leaking wrong rows past date filters). Fix: one
shared `matchesFilters` predicate drives both, making `matchingEvents` provably
non-empty and the fallback chain provably dead. **Always**: when a branch looks
unreachable in a filter/sort path, check whether two parallel implementations
have divergent semantics before writing test hacks.

## Adapt to the coverage include's adapter exclusion when the adapter sits at the module root (🟡 Minor)

The `**/adapters/**` coverage exclusion only applies if the adapter FILE actually
lives under `adapters/`. The company module's 844-line `sqlite-company.repository.ts`
sat at the module root (every sibling was under `adapters/`), forcing 84 lines of
sqlite-driver coverage work. `git mv` + relative-import rewrites (careful: `../../`
depth changes) aligned it with the repo convention (#209) and the parent policy.
**Always**: before adding a module to the coverage include, check every storage
adapter's location — root-level adapters either need coverage or a layout move.

## v8 one-sided branches: fake timers make equal-timestamp branches deterministic (🟡 Minor)

`listDebtsSummary` orders accounts `updatedAt DESC`, so the
`current.latestActivityAt > account.updatedAt ?` branch's false side only fires on
EQUAL timestamps — a timing-dependent case. `vi.useFakeTimers()` +
`vi.setSystemTime(...)` freezes `new Date()`, so two back-to-back account creates
share an `updatedAt` and the branch fires deterministically. Restore in `finally`.
**Always**: for time-comparison branches that depend on millisecond equality, use
fake timers, not sleeps.

## Rebase onto develop after sibling frontier PRs merge; rebuild contracts dist (🟠 Major)

While #251 was in flight, sibling coverage PRs #249/#250 merged into develop
(adding account/payment/rbac to the SAME vitest include). After rebasing, the
worktree's `@tuari/contracts/dist` was built from the OLD source — auth bootstrap
tests failed with `Cannot read properties of undefined (reading 'status')` until
`pnpm --filter @tuari/contracts build` regenerated it (d.ts size told the story:
337 KB stale vs 334 KB fresh). **Always**: after rebasing a worktree onto a newer
develop, rebuild contracts before trusting test results; a failing test in a module
you didn't touch is the first sign of a stale dist.


## Converting static imports to lazy() breaks sync render/query tests (🟠 Major)

After #286 made all eight workspace sections `lazy()` behind Suspense, existing
`render` + `getBy*` tests failed: sections now render asynchronously, so the DOM
isn't populated on the first synchronous tick. Fix pattern: switch to
`findBy*`/`waitFor` for anything behind a lazy boundary and raise
load-sensitive timeouts; fixture mocks must cover the de-barreled module hooks
(the `mock-dashboard` barrel became direct imports, so the test-utils fixture
mocks had to change too). `test:web` 375/375 after the fix.

**Always**: when a component tree starts lazy-loading, grep its tests for sync
`getBy*` queries against lazy content and convert them to `findBy*`; assert on
stable vendor filenames across TWO clean builds before claiming long-term
caching in a PR.


## Consolidating N queries into one snapshot RPC: every invalidation site must invalidate the snapshot too (🟠 Major)

#276 replaced the shell's ~12 individual `useQuery`s with a single
`workspaceSnapshot()` RPC. Most mutation invalidations route through
`invalidateWorkspaceDomains`, which was extended to also invalidate the
snapshot key — but `useResetWorkspaceMutation` (workspace-mutations.ts)
invalidated only `workspaceDomainQueryPrefix`, NOT the snapshot prefix, so
the dashboard stayed stale after a workspace reset. Greptile round 2 caught
it as a real P1 regression introduced by the consolidation. Fix: reset also
invalidates the snapshot prefix + a unit test pinning it.

**Always**: when replacing N parallel queries with an aggregate snapshot
RPC, audit EVERY site that invalidates any of the N keys (reset, sign-out,
sign-in, mutations) — not just the obvious refetch path. The E2E "zero
individual RPCs" assertion catches over-fetching but NOT stale-cache
under-invalidation; add a reset/sign-out flow test that asserts fresh data.
