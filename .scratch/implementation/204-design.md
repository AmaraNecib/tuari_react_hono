# Design — issue #204: add ESLint to apps/api and sweep explicit `any`

**Tier:** Standard (config + code hygiene; no authz/security/RBAC changes)
**Base:** `develop` @ `59ea5725c0ffe8c794dad4071adc029fe109bf66` (merge-base == HEAD)
**Branch:** `refactor/issue-204-eslint-any-sweep`

## Scope

1. Add `eslint.config.mjs` to `apps/api` (mirror `apps/web`: `@eslint/js` +
   `typescript-eslint` recommended; **no** React hooks) + `lint` script +
   devDependencies (`eslint`, `@eslint/js`, `globals`, `typescript-eslint`).
   API runs on Node → `globals.node` instead of `globals.browser`.
2. Sweep every explicit `any` in `apps/api/src` non-test files so
   `@typescript-eslint/no-explicit-any` (error level via recommended set)
   passes and `pnpm turbo lint` stays green.
3. Behavior identical — typing `rawDb` / casts must not change runtime.

## Handler sweep (~96 `any` in `rpc/handlers/*.ts`)

**Why the `any` existed:** the middleware functions (`m.queryAuth`,
`m.mutationAudit`, …) are generic over `TInput`, but the handler callbacks
are passed unannotated — `TInput` has no inference site at the call site, so
it infers to `unknown`, and every `input` dereference needed a cast.

**Fix pattern (verified empirically on `workforce.ts` — typechecks clean):**
- Drop the `: any` / `: { context: RpcContext; input: unknown; ... }`
  destructured annotations → `input` is `unknown` (contextual type).
- Cast `input` to the procedure's contract input at use sites:
  - `{ id }` get/delete/end procedures → `IdInput` (from
    `rpc/handlers/handler-inputs.ts`, derived from contract
    `idInputSchema`).
  - create/update procedures → the contract's named input types
    (`RoleCreateInput`, `EmployeeCreateInput`, `ProjectCreateInput`, … —
    already exported from `@tuari/contracts`).
  - list procedures → the API filter types (`EmployeeListFilters`, … in
    `modules/company/company.types.ts`; structurally identical to the
    contract list schemas, which are `.optional()`).
  - `employeesListPaged` opts → `EmployeePagedListInput` (derived from
    contract `employeePagedListInputSchema`).
- Factory return types `Record<string, any>` → `Record<string, unknown>`
  (matches already-clean `invoice.ts` / `payment.ts` / `rbac.ts` style).

**New module:** `apps/api/src/rpc/handlers/handler-inputs.ts` — central
home for the repeated wire shapes so handlers never scatter inline
structural types. Derived from contract Zod schemas (single source of
truth; cannot drift from the wire contract).

## Non-handler sweep (~20 `any`)

| File | Fix |
|---|---|
| `rpc/rpc-middleware.ts` | `errorResolver: (error: unknown) => any` → `unknown`; `Promise<any>` returns → `Promise<unknown>` |
| `infrastructure/validation/input-validator.ts` | `zodError as any` → `ZodError` |
| `infrastructure/observability/logger.ts` | typed params (read file) |
| `infrastructure/database/schema.ts` | typed params (read file) |
| repository constructors (`sqlite-company.repository.ts`, `invoice.repository.ts`, `inventory.repository.ts`, `company.repository.ts`) | `rawDb: any` / `raw: any` → `BetterSqliteDatabase` |
| `modules/company/transaction-manager.ts` | decorator `(this: any, ...args: any[])` → typed |
| `modules/update/update-history.service.ts` | `stmt.get() as any` → row type |
| `modules/auth/bootstrap.service.ts`, `modules/auth/recovery-key.service.ts` | typed params (read file) |
| `infrastructure/database/migration-runner.ts`, `schema-definitions.ts`, `factory.ts` | typed params (read file) |
| `app/dependencies.ts` | existing eslint-disable — verify still needed; type instead |
| `app/create-app.ts`, `config/loader.ts`, `rpc/router.ts` (`as any` router), `invoice.module.ts`, `company.entity-resolvers.ts` | typed (read file) |

Where a `any` is unavoidable (e.g. `Router` typing mismatch), keep a
`// eslint-disable-next-line @typescript-eslint/no-explicit-any` with a
reason comment (6 already exist).

## Dependencies

- `apps/api` devDeps: `eslint`, `@eslint/js`, `globals`, `typescript-eslint`
  (same majors as web: eslint 9.39, typescript-eslint 8.57, globals 16).
- No runtime deps added. `zod` already a dependency (needed for
  `z.infer` of contract schemas in the types module — type-only usage).

## Tests

- **Unit:** no new business logic — the sweep is type-level. Existing
  `pnpm test:api` (vitest) must stay green; the RPC handler tests
  (`rpc/router.test.ts`, `rpc/rpc-middleware.test.ts`, `handlers/rbac.test.ts`)
  exercise the changed handler wiring.
- **Type-level gate:** `pnpm typecheck` + `pnpm lint` (turbo picks up the
  new `lint` script) are the real acceptance checks.
- **E2E (Playwright):** not applicable — no user-facing behavior change;
  documented in the PR description.

## Risks

- **Handler inference subtleties:** a few handlers consume `input`
  fields directly (`reportsGenerate` destructures `{ type, startDate,
  endDate }`). These cast to their contract input types explicitly.
- **`BetterSqliteDatabase` typing may surface type errors in existing
  callers** (issue constraint) — `pnpm typecheck` + full `pnpm test:api`
  guard this; `stmt.get()` row shapes may need explicit row types.
- **Turbo lint caching across worktrees** (wisdom): verify the api lint
  actually ran on this worktree (`pnpm --filter @tuari/api lint` directly).
- **Middleware `TInput` inference is `unknown`:** any future handler that
  reads a nested field must cast — the `handler-inputs.ts` module is the
  sanctioned place for those shapes.
