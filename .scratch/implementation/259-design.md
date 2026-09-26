# Design — Config-module deferred coverage branches (#259)

**Issue:** [#259](https://github.com/AmaraNecib/tuari_react_hono/issues/259) —
"Config-module deferred coverage branches (auth plugin callbacks, narrow DB adapter factories)"
**Brief scope (from parent):** Inspect `apps/api/src/infrastructure/auth/auth.ts`
(better-auth `phoneNumber` plugin callbacks) and `apps/api/src/config/database.ts`
(adapter factories) and their tests; add honest coverage for the deferred branches
without weakening assertions. Do not invent requirements from the title — read the code.
**Mode:** `local-only` (GitHub unavailable; `origin/develop` is a cached ref).
**Base SHA:** `6be34976954dee8b6ef33a34ce923d348270cdb0` (`origin/develop`, cached).
**Branch/worktree:** `refactor/issue-259-config-coverage` @ `D:/projects/tuari_react_hono/worktrees/issue-259`
**Tier:** Standard (tests only — no production code changes). Test-only per the
feature-implement lifecycle → no debate (not High-assurance), test-audit + code-review required.
**Ticket source:** `docs/local-issue-status.md` row #259 ("No issue-specific local
evidence. Inspect config coverage before starting.") + `docs/local-issue-snapshot.json`
title. No full issue body available locally; scope is taken from the brief and the code.

## Context

#212 (config unification) shipped a coverage round (commit `f2b4eeb`) that closed the
in-scope config branches; its review evidence explicitly deferred two groups to #259:
"auth plugin callbacks" and "narrow DB adapter factories". Confirmed via a scoped
v8 coverage run over `auth.ts` + `database.ts` (see evidence below).

## Uncovered branches (measured, not guessed)

Ran `vitest run --coverage` (temp config including the two production files) against the
**existing** `auth.test.ts` + `database.test.ts` (20 tests). Results:

- **`config/database.ts`** — branches `78.26%`; the **only** uncovered branches are the
  five `default:` cases that `throw new Error(\`Unsupported db adapter: ${_exhaustive}\`)`
  in `createCompanyRepository` (line 75), `createWorkforceRepository` (99),
  `createOperationsRepository` (121), `createFinanceRepository` (143),
  `createAuditRepository` (165). Every sqlite/inmemory case and the `store ?? ...`
  coalescing branches are already hit.
- **`infrastructure/auth/auth.ts`** — the two `phoneNumber` plugin callbacks are:
  `phoneNumberValidator` (Algerian-format regex) and `sendOTP` (hard failure, throws).
  `sendOTP`'s throw is already exercised ("never delivers OTP codes"); the
  `phoneNumberValidator` **return-false path** (rejecting a non-Algerian number) is
  **not** exercised anywhere. The validator's *true* path is only exercised with the
  `05` prefix (via `send-otp` and the #321 sign-in test); the `06`/`07` regex arms are
  never driven.

These are the honest deferred branches: existing defensive behavior (a loud throw, a
validator rejection) that was written but never pinned by a test. The change adds
behavioral pins; it does not alter any production code or weaken any existing assertion.

## Changes (tests only)

### `apps/api/src/infrastructure/auth/auth.test.ts` — phoneNumber plugin callbacks

Three new `it` blocks in the existing `describe("createAuth")`:

1. **Validator false at the send-otp seam.** `sendPhoneNumberOTP` with a non-Algerian
   number (`0999123456`) is rejected by `phoneNumberValidator` with
   `"Invalid phone number"` — the BETTER_AUTH BAD_REQUEST that fires *before* `sendOTP`.
   Distinguishes the validator-false branch from the already-covered `sendOTP` hard fail
   (its message is "OTP delivery is not configured"). Uses `createAuth({} as never, …)`
   like the existing smoke test: the validator rejects before any DB access (verified
   empirically — no adapter is touched on the reject path).
2. **Validator false at the sign-in seam.** `signInPhoneNumber` with a non-Algerian
   number (`0999123456`, any password) is rejected with `"Invalid phone number"` —
   again the validator-false branch, before the user row is even looked up.
3. **Validator true for all three prefix arms.** Over a **real** dependency graph
   (`createAppDependencies`) and real in-memory DB, `sendPhoneNumberOTP` for `05…`,
   `06…`, `07…` numbers each *passes* the validator and then hits the `sendOTP` hard
   failure (`"OTP delivery is not configured"`). Pins that `06`/`07` are accepted (not
   spuriously rejected) and that the send-otp seam terminates at the deliberate blocker.

### `apps/api/src/config/database.test.ts` — adapter factory default branches

One new `it` block in the existing `describe("database adapter factories")`:

4. **All five factories fail loudly on an unsupported adapter.** A config with
   `dbAdapter` outside `"sqlite" | "inmemory"` (built from the validated config via a
   documented `as unknown as AppConfig` cast — these branches are unreachable through
   the Zod schema by construction, which is exactly the defense-in-depth contract they
   pin) makes every factory throw `/Unsupported db adapter: postgres/`, including the
   narrow factories (`createWorkforceRepository`, `createOperationsRepository`,
   `createFinanceRepository`, `createAuditRepository`) and the composition root
   (`createCompanyRepository`).

**Why a cast is honest here:** the factories' JSDoc states future adapters "will be
selected here without callers changing" — i.e. `dbAdapterSchema` is expected to grow
(e.g. Postgres). The `default` throw + compile-time `never` assignment are the guard
that a new adapter value is never silently mis-wired. The test pins that runtime
contract (any unrecognized value fails loudly) the only way it is reachable — through
a deliberately type-unsafe config. The cast is scoped to the test and clearly commented.

## Dependencies / ownership

- No production code changes. Only two test files in `apps/api` are touched.
- No public API, contract, or schema changes. No E2E/Playwright impact (no user-facing
  behavior changes; these are all server-side defensive branches).

## Risks

- **`counts`-proving remove-then-add**: each new test targets a branch that is
  currently uncovered; a coverage re-run after the change must show `database.ts` at
  100% branches and the auth validator-false path exercised.
- **Real-deps test cost**: test 3 builds the dependency graph (~2s warm) — matches the
  existing "never delivers OTP codes" pattern; a generous describe timeout is used.
- **Cast fragility**: the unsupported-adapter test relies on the current
  `AppConfig.dbAdapter` union; if `dbAdapterSchema` is later extended to include
  `"postgres"`, the test's cast value must change. Comment in the test documents this.

## Validation

```bash
pnpm --filter @tuari/contracts build
pnpm typecheck
pnpm lint
pnpm test:api
pnpm test:web
```

Plus a scoped coverage re-run proving `database.ts` = 100% branch and the auth
validator-false branch is exercised.

## Evidence / lifecycle

- `docs/local-issue-status.md` row #259 ("No issue-specific local evidence") — creating
  fresh local evidence under `.scratch/reviews/259/`.
- Standard tier: test-audit + code-review evidence committed under
  `.scratch/reviews/259/<HEAD>-*`; Greptile CLI scoped to #259; guard Phases 1–3.
