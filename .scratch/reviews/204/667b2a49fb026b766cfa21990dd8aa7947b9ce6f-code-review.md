# Code Review â€” issue #204 (ESLint for apps/api + explicit-`any` sweep)

**Base:** `develop` @ `59ea5725c0ffe8c794dad4071adc029fe109bf66`
**Head:** `3ade294d44d10bebc6de0ff75adecad77e36c868`
**Diff:** `git diff 59ea572...HEAD` (2 commits: sweep + review fixes)

## Standards axis

**Verified correct (evidence):**
- `eslint.config.mjs` mirrors `apps/web` (`@eslint/js` + `typescript-eslint`
  recommended, no react-hooks), swaps `globals.browser` â†’ `globals.node`,
  documents the `_`-prefix unused-var convention, and carves out
  `no-unused-vars` for `**/*.test.ts` (Vitest fixture pattern, commented).
- Repository handles typed `BetterSqliteDatabase` per spec: `dependencies.ts`
  (`sqlite?: BetterSqliteDatabase`), `sqlite-company.repository.ts`
  (constructor overloads + `createCompanyRepository`), invoice/inventory
  repos. `transaction-manager.ts` decorator `(this: any, ...args: any[])`
  â†’ `(this: { repository?: CompanyRepository }, ...args: unknown[])`.
- `schema.ts` `runInvoiceDirectionMigration` removal verified dead: defined
  at base:1312, never referenced in the startup list (base:1645-1652) nor
  anywhere else; the `direction` column lives in the base schema
  (`schema/invoice.ts:21`); the migration key stays exported and asserted
  in `schema-definitions.test.ts`.
- `Object.assign` â†’ spread in `router.ts` is runtime-equivalent.
- `eslint-disable` count: 5 in src (2 new `no-explicit-any` at the router /
  RPCHandler framework boundaries with rationale comments, 1 pre-existing
  `no-require-imports` in `factory.ts`) + 2 `ban-ts-comment` for the two
  legacy `@ts-nocheck` test files. Five pre-existing `no-explicit-any`
  disables were removed by actually typing the code (the sweep's goal).

**Judgement calls (minor, accepted):**
- **Duplicated Code / drift risk:** `handler-inputs.ts` hand-mirrors 4
  non-exported contract shapes (`ConsumeRecoveryKeyInput`,
  `RevokeRecoveryKeyInput`, `ChangeDbKeyInput`, `ReportFilterInput`) with
  comments pointing at the contract schemas (which live in modules not
  re-exported from `@tuari/contracts`). Mirrors the architecture-wisdom
  "record types mirror external table shapes" risk. Fix (export the
  schemas from contracts) is a follow-up, not required here.
- **Duplicated Code (structural-identity casts):** list handlers cast to
  `company.types.ts` filter types asserted structurally identical to the
  optional contract list schemas â€” two independently maintained definitions.
  Runtime identical to the old `input ?? undefined`; silent-drift risk only.
- **`no-unused-vars: off` for `**/*.test.ts`** is broader than web's
  config; commented rationale (Vitest side-effect fixtures).

**Hard violations:** none.

## Spec axis (issue #204)

**Implemented correctly:**
- Config + `lint` script + devDeps + lockfile â€” mirrors web minus
  react-hooks, `globals.node`. `pnpm turbo lint` picks up the new script.
- `rawDb: any` â†’ `BetterSqliteDatabase` across repository constructors and
  factories (spec's explicit example).
- `zodError as any` â†’ typed; `stmt.get()`/`stmt.all()` row-typed;
  decorator `this: any` typed; ~96 handler `any`s removed via typed casts
  from a new `handler-inputs.ts` module (see deviations).
- CI green locally: `pnpm typecheck`, `pnpm lint`, `pnpm test:api`
  (601/601), `pnpm test:web` (341/341).

**Deviations (documented, behavior-neutral):**
1. `input-validator.ts` types the error as a structural
   `ZodValidationError` (`Error & { errors?: [...] }`) rather than the
   concrete zod `ZodError` â€” the `ValidatorSchema` is duck-typed (any
   validator throwing an `Error` named `ZodError` with `.errors` is
   accepted, including the test double) and zod v4's `ZodError` uses
   `issues` not `errors`. Commented in the file. Spec's letter not
   followed; behavior identical.
2. Handler sweep uses use-site casts (`input as IdInput` etc.) rather than
   the spec's hypothesized "callback inference" â€” the middleware `TInput`
   generic has no inference site, so unannotated callbacks infer `unknown`.
   Design doc (`204-design.md`) documents the mechanism; goal achieved.
3. The two `as any` at `router.ts:93` (missing `recurringPatterns`
   handlers â€” contract has them, API doesn't) and `create-app.ts:107`
   (RPCHandler `Router<any, T>` param) are new documented disables, not the
   6 pre-existing ones (5 of which were removed by typing). Matches the
   design doc's "keep a disable with reason where unavoidable" provision.
4. Scope additions beyond `any` removal: dead `runInvoiceDirectionMigration`
   + unused-import/`sortByName`/`normalizeAudit` dead-code removals and
   `no-useless-escape` fixes (`schema.ts:45`, `database-env.ts:22`) â€” all
   required for `pnpm lint` to pass (the sweep must land with CI green),
   all behavior-neutral. Also 3 service `note`/`notes` params widened to
   accept `string | null` to match the contract inputs (repos already
   handle null).

**Disputed findings dismissed with citations:**
- "`UpdateHistoryRow` misstates the row shape" â€” **wrong**: the SELECTs
  explicitly alias `"applied_at" AS "appliedAt"` and
  `"error_message" AS "errorMessage"` (update-history.service.ts:55,72),
  so the camelCase row type is accurate.
- "`normalizeAudit` purity unverified" â€” verified: it returns a plain
  object (`{ actorUserId, actorLabel, transactionId }`, line 101), no side
  effects; the removed `const a = normalizeAudit(audit)` locals were pure
  dead code.

**Blocker:** none.

## Summary

Standards: 0 hard violations, 2 minor drift-risk judgement calls
(contract-shape mirrors). Spec: all requirements met; 4 documented
behavior-neutral deviations, none blocking. Both axes clean.

---

## Post-evidence delta (ac16bc7)

After the original review, CI's Build job surfaced TS4058: typing
`sqlite?: BetterSqliteDatabase` made `createAppDependencies`'s inferred
return resolve `rawDatabase` to the unnameable UMD-global
`BetterSqlite3.Database`, failing the tsup dts build. Fixed by declaring
an explicit exported `AppDependencies` type (17 named fields, all matching
the return object's producers — verified by an independent delta review)
and annotating the function return `Promise<AppDependencies>`; the old
`Awaited<ReturnType<...>>` alias was removed (no consumers derived from it).
`pnpm build` (tsup incl. dts), `pnpm typecheck`, `pnpm lint`, test:api
(601) and test:web (341) all re-verified green.

---

## Post-evidence delta (76f57aa - Greptile round)

Greptile (4/5 -> 5/5) flagged safeValidate's ZodValidationError.errors access:
zod v4 exposes `issues`, not `errors`, so with a real Zod schema the
`errors?.map(...) || []` fallback silently returned `fieldErrors: []`
(pre-existing behavior; safeValidate has no production callers). Fixed in
76f57aa: the type now declares both `errors` (test double / zod v3) and
`issues` (zod v4), and the reader is `(zodError.issues ?? zodError.errors ?? []).map(...)`.
Test double still resolves via `errors`; validator tests (8) pass. Greptile
re-review: 5/5, no files needing attention.


## Post-evidence delta (667b2a4 - wisdom capture)

Final commit captures the TS4058 lesson in .agents/wisdom/testing.md (docs-only; no code change).
