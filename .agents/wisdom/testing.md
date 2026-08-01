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
