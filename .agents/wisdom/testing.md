# Testing Wisdom

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
