# Issue #200 — Ports & adapters data-layer polish

**Tier:** Standard (code/config changes; no authz, crypto, or financial-calculation logic)

**Base SHA:** `d41e3e8d3d6a5d88614a1edf3e6afbfb30bda64f` (origin/develop)

## Scope

Follow-up polish on PR #189 (ports-and-adapters data layer). Three non-blocking
quality items flagged by Greptile. No production SQLite path behavior changes.

## Changes

### 1. Type the InMemoryStore Maps (`inmemory-store.ts` + `company.types.ts`)

Replace `Map<string, any>` on all 17 tables with the record types from
`company.types.ts`:

| Store map | Record type |
|---|---|
| roles | `RoleRecord` |
| employees | `EmployeeRecord` |
| projects | `ProjectRecord` |
| warehouses | `WarehouseRecord` |
| managerAssignments | `EmployeeManagerAssignmentRecord` |
| projectAssignments | `EmployeeProjectAssignmentRecord` |
| warehouseAssignments | `EmployeeWarehouseAssignmentRecord` |
| employeeStateHistory | `EmployeeStateHistoryRecord` |
| projectManagerOwnershipHistory | `ProjectManagerOwnershipHistoryRecord` |
| warehouseManagerOwnershipHistory | `WarehouseManagerOwnershipHistoryRecord` |
| salaryPayments | `EmployeeSalaryPaymentRecord` |
| externalCounterparties | `ExternalCounterpartyRecord` |
| debtAccounts | `DebtAccountRecord` |
| debtEntries | `DebtEntryRecord` |
| userProfileHistory | `UserProfileHistoryRecord` |
| users | `AuthUserRecord` (new) |
| bootstrapState | `BootstrapStateRecord` (new) |

Two record types do not exist yet in `company.types.ts` and are added there
(next to the existing `AuthUserDisplayRecord`), mirroring the auth `user` table
and `app_bootstrap_state` table shapes:

- `AuthUserRecord { id, name, image, phoneNumber, phoneNumberVerified, createdAt, updatedAt }`
- `BootstrapStateRecord { singleton, createdAt, userId }`

Then remove `any` in the four in-memory repositories:

- **inmemory-workforce**: `projectAssignments: any[]` → `EmployeeProjectAssignmentRecord[]`;
  `upsertEmployee` id/createdAt/updatedAt casts `(data as any)` → typed casts matching the
  SQLite sibling adapter; cross-domain helpers (`getActiveProjectAssignmentByEmployeeId`,
  `getActiveWarehouseAssignmentByEmployeeId`, `createProjectAssignment`, `endProjectAssignment`,
  `createWarehouseAssignment`, `endWarehouseAssignment`) → typed with
  `EmployeeProjectAssignmentRecord` / `EmployeeWarehouseAssignmentRecord` and the
  `ProjectAssignmentCreateData` / `ProjectAssignmentEndData` / `WarehouseAssignmentCreateData` /
  `WarehouseAssignmentEndData` input types; private helpers (`insertStateHistory`,
  `insertProjectManagerOwnershipHistory`, `insertWarehouseManagerOwnershipHistory`) → typed
  `Omit<Record, "id" | "endDate" | "createdAt" | "updatedAt">`; audit params `a: any` →
  `AuditSnapshot` (exported from inmemory-store).
- **inmemory-operations**: private ownership-history helpers typed the same way.
- **inmemory-company**: delegation `any` params → `Parameters<CompanyRepository["method"]>[0]` /
  `[1]` (the pattern already used in the file for other methods).
- **inmemory-audit**: no `any` present; the store Map typing is enough.

### 2. Config injection point (`dependencies.ts`)

`createAppDependencies` gains an optional 4th parameter
`config: AppConfig = createAppConfig()` (appended so all existing callers are
unchanged). The body uses the injected config for `createCompanyRepository`
instead of instantiating `createAppConfig()` itself.

### 3. betterAuthUrl Zod validation (`config/index.ts`)

Move validation into the schema (issue option a): `betterAuthUrl` becomes
`z.string().transform(...)` that runs `normalizeBaseUrl` and reports failures via
`ctx.addIssue` (message from `normalizeBaseUrl`'s plain Error). The factory passes
the raw value (`BETTER_AUTH_URL ?? http://host:port`) and the schema both validates
and normalizes (trailing-slash trim). Error messages are preserved verbatim, so
existing `.toThrow("...")` assertions still match (ZodError messages embed the issue
messages). `appConfigSchema` alone now rejects invalid auth URLs.

## Dependencies

None new. Touches only `apps/api` (company adapters, config, app wiring) and adds
types to `packages/contracts`? No — record types stay in `apps/api`'s
`company.types.ts`. No contract package changes.

## Tests

- **Unit (config)**: extend `apps/api/src/config/config.test.ts` with assertions
  that `appConfigSchema.parse` alone rejects an insecure/invalid BETTER_AUTH_URL and
  normalizes trailing slashes (schema-level, not factory-level).
- **Unit (wiring)**: new `apps/api/src/app/dependencies.test.ts` — construct
  `createAppDependencies` with an in-memory SQLite handle, a stub auth instance, and
  an injected `inmemory` config; assert `companyService` operates on the in-memory
  store (createRole → listRoles round-trip). Without injection this would hit SQLite
  and fail, proving the config flows into repository selection.
- **Existing suite**: 550 API tests must pass unchanged.
- **E2E (Playwright)**: not applicable — no user-facing flow changes (internal
  adapter/config typing only; behavior preserved). Covered by the API test suite.

## Risks

- Typing the Maps may surface latent type mismatches in the in-memory adapters
  (e.g. literal `"ENDED"` status assignments). `assignmentStatusSchema` includes
  `"ENDED" | "ARCHIVED"` so literals are assignable.
- `users` / `bootstrapState` maps are read but never written by adapters today;
  record shapes mirror the auth `user` and `app_bootstrap_state` schemas.
- betterAuthUrl error type changes from plain `Error` to `ZodError`; `.toThrow(string)`
  substring matching keeps existing tests green.
- `createAppDependencies` 4th param is optional — no caller changes needed.
