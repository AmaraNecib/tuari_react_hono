# Testing Wisdom

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
