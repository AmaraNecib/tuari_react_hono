# Issue #26 — Worker "role" field is actually RBAC app permission, not a job title

**Tier:** Standard
**Base SHA:** `389336a` (origin/develop, post #29/#31/#32 merges)
**Branch:** `fix/issue-26-job-title`
**Scope:** `apps/web/src/features/employees`, `apps/api` employee schema/service/repos, `packages/contracts` workforce schemas

## Problem

On the employee create/edit/settings surfaces the "الدور" (role) dropdown shows
RBAC **application** roles (admin / project_manager / warehouse_manager /
worker). After #20 the workforce labels are organizational and the employee
role selector already offers only the three workforce labels — yet a worker's
actual job (e.g. "عامل بناء" / plasterer / driver) is captured nowhere. The
label "الدور" invites users to type/miss the actual job title, so it must be
renamed to the permission concept it actually is, and a separate optional
free-text job-title field must exist.

## Decision — dedicated DB column, not `notes` reuse

The employee record already has a `notes` free-text field, shown as its own
"ملاحظات" card on the detail page. Reusing it would conflate two distinct
concepts: internal notes vs the job title shown to organizers (who needs "عامل
بناء" on the worker file without reading free-form notes). A dedicated nullable
`occupation` column is cheap here: the migration machinery
(`schema-definitions.ts` + `additiveStatements` + drizzle schema) already
supports additive nullable columns idempotently. Chosen option: **dedicated
column** `employee.occupation TEXT` (nullable, ≤120 chars at input).

## Contract changes (`packages/contracts/src/workforce.ts`)

- `employeeSchema` (public `Employee`): add `occupation: nullableTextSchema`
  (required nullable, mirrors `notes`).
- `employeeCreateInputSchema` / `employeeUpdateInputSchema`: add
  `occupation: z.string().trim().max(120).nullable().optional()`.
  `employeeBatchCreateRowInputSchema` extends create → inherits it.
- Back-compat: input fields are optional, so existing test payloads and callers
  are valid; only the output record carries `occupation: string | null`.

## API changes (`apps/api`)

1. `schema-definitions.ts`: `"occupation" TEXT,` in the `employee` CREATE TABLE
   (fresh DBs) + `'ALTER TABLE "employee" ADD COLUMN "occupation" TEXT'` in
   `additiveStatements` (existing DBs, idempotent via duplicate-column catch).
2. `schema/company.ts` (drizzle): `occupation: text("occupation")` on `employee`.
3. `company.types.ts`: `occupation?: string | null` on `EmployeeCreateData` /
   `EmployeeUpdateData` (keep optional like `notes`).
4. `company.repository-mappers.ts`: `mapEmployee` adds
   `occupation: toNullableText(row.occupation)`.
5. `sqlite-company.repository.ts` + `inmemory-workforce.repository.ts`:
   `toEmployee`, `createEmployee`, `createEmployeesBatch`, `updateEmployee`
   (set-map), `upsertEmployee` — plumb the field.
6. `workforce.service.ts`: `createEmployee`, `createEmployeesBatch`
   (normalizedEmployees), `updateEmployee` — `occupation: normalizeText(...)`.
7. `workforce/employee.module.ts` (deep module, tests-only consumer):
   `create` record + `toEmployee` add `occupation`.
8. `workforce/adapters/in-memory-employee.repository.test.ts` `buildEmployee`
   helper gains `occupation: null`.

An occupation change does NOT trigger employee state history (it is not a
role/salary/status change; consistency with `notes`).

## Web changes (`apps/web/src/features/employees`)

- `employee-table.tsx`: `EmployeeTableRow` gains `occupation: string | null`.
- `app-shell/home-view-derived-employees.ts`: `buildEmployeeRow` maps
  `occupation: employee.occupation ?? null`.
- Label renames (ar.ts values only — RBAC semantics untouched):
  - `employeeForm.roleLabel` "الدور" → "صلاحية التطبيق"
  - `employeeForm.rolePlaceholder` → "اختر صلاحية التطبيق"
  - `employeeForm.managerDisabledHint`, `employeeForm.description`,
    `employeeForm.validation.roleId` — reword "الدور" → "صلاحية التطبيق"
  - `detailPages.employee.role` → "صلاحية التطبيق" (detail card + edit field)
  - `columns.role` → "صلاحية التطبيق" (employees list header)
  - `editPage.personalDescription`, `editPage.validation.roleRequired`,
    `editPage.validation.blockedTransition` — same reword
- New keys:
  - `employeeForm.occupationLabel` / `occupationPlaceholder` /
    `validation.occupation` (batch create)
  - `detailPages.employee.occupation` / `noOccupation` (detail card)
  - `detailPages.employee.editPage.occupation` / `occupationPlaceholder` /
    `validation.occupationTooLong` (edit page)
- `employee-batch-schema.ts`: `EmployeeDraft.occupation: string`,
  `createEmptyEmployeeDraft`, `normalizeEmployeeDraft` (trim → undefined),
  `validateEmployeeDraft` (zod `occupation` issue mapping).
- `employee-batch-row-card.tsx`: occupation `Input` (after phone) + copy type.
- `employee-batch-create-page.tsx`: occupation label/placeholder/validation
  copy, `localizeRowErrors`, `mapServerErrors` field regex.
- `employee-edit-page.tsx` (+ `employee-edit-page-v2.tsx` for consistency):
  FormState.occupation, createFormState, max-120 validation, submit payload
  `occupation: state.occupation.trim() || null`, occupation `Field` input.
- `employee-details-page.tsx`: occupation `RecordInfoCard` (fallback
  "غير محدد").
- Tests that referenced the old label string ("الدور") are updated
  (`home-view.test.tsx` batch-create flow).

## Tests

- Unit: contracts (schema accepts occupation; rejects >120 on input), API
  mapper (`mapEmployee` occupation), module create/update round-trip with and
  without occupation, sqlite repo create/update/upsert occupation persistence.
- Unit (web/RTL): batch-schema normalize/validation with occupation,
  `buildEmployeeRow` occupation passthrough, details-page occupation card.
- NO Playwright this round (lane #30 owns the E2E suite) — CI runs full e2e
  after merge.
- Checks: `pnpm --filter @tuari/contracts build`, `pnpm typecheck`,
  `pnpm lint`, `pnpm test:api`, `pnpm test:web`.

## Risks / constraints

- ar.ts is shared with lane #23: only add distinct keys and edit the existing
  employee-label values; do not touch unrelated hunks (GitHub auto-merges).
- Do NOT touch RBAC seed semantics (`role-seeds`, `rbac_three_role_v1`).
- `occupation` must remain nullable everywhere; no CHECK constraint (free text).
- Legacy DBs get the column via the additive path; `engineer_checked` rebuild
  migrations are NOT involved (they only run for rebuild-keyed migrations).