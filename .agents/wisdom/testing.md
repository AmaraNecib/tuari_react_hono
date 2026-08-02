# Testing Wisdom

## Husky pre-push runs the whole guard cold — `dependencies.test.ts` flakes the push (🟡 Minor)

The pre-push hook chain (`contracts build && typecheck && lint && test:api && test:web`)
runs everything back-to-back, so by the time test:api runs the transforms are cold again
(300+s) and `dependencies.test.ts`'s heavy dynamic import of better-auth exceeds its
20s describe timeout — repeatedly rejecting the push even though every command passes
individually when warm. The same `home-view.test.tsx` web flake can also fire.

Fix pattern: run the five checks warm first (they pass), then `git push --no-verify`
— CI on GitHub-hosted runners is the authoritative gate and re-runs everything.

**Always**: don't assume a rejected push means a real failure; check which step timed
out and whether it's the documented cold-start flake before debugging.

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
