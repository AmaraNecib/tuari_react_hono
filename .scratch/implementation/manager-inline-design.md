# Inline create from a form (project / warehouse managers; debt worker removed)

- **Ticket:** owner item 1 of the `feat-manager-inline` lane (no GitHub number issued),
  expanded by parent decision to cover every caller of the shared inline-create pattern.
- **Mode:** remote (repo works against `AmaraNecib/tuari_react_hono`); this lane does
  not push or open a PR — the parent owns that.
- **Branch/worktree:** `feat/manager-inline` at `worktrees/feat-manager-inline`
- **Base:** `develop`
- **Base SHA (fixed):** `22495413b7d792e20afcce24a94d6c84c61dd523`
- **Review tier:** Standard

## Problem

The project form's manager selector was a plain select of employees who already
hold the `project_manager` role, so creating a manager meant leaving the form and
losing its state. The warehouse and debt forms already used `CreateableSelect`,
but their inline creates were broken:

- both sent `roleId: ""`, which the wire schema (`entityIdSchema` = `z.string().min(1)`)
  rejects before the handler runs, so the create **always failed** with a raw
  English "Input validation failed";
- both then selected a fabricated `{ id: "new" }` / `{ id: "" }`, an id that does
  not exist on the server.

## Decision

One shared inline-employee-create implementation, used by every form that creates
a person, with the real role id and the real returned employee id. The parent
decided to fix all callers in this PR rather than leave two broken copies next to
a working one.

`useEmployeeInlineCreate` (`apps/web/src/features/employees/use-employee-inline-create.ts`)
owns the mutation, the row shape, and the failure contract. Callers own only the
labels and the role id. `useEmployeeInlineCreateSelection` adds the
"remember the created person and show their name until the snapshot refetches"
bookkeeping.

## Roles per caller (seeded system roles)

| Form | Role | Why |
| --- | --- | --- |
| Project create/edit manager | `project_manager` | No required relations; shown in manager options by design. |
| Warehouse create/edit manager | `warehouse_manager` | No required relations; shown in warehouse-manager options by design. |
| Debt party (internal worker) | — | **Removed.** See below. |

**Why the debt internal-worker create was removed, not wired to `worker`.**
`WorkforceService.createEmployeesBatch` rejects an ACTIVE `worker` that has no
`projectId` and no `managerId`
(`"اختيار المدير المباشر مطلوب للعامل النشط."` /
`"اختيار المشروع مطلوب للعامل النشط."`). The debt dialog collects name + phone
only, and `CreateableSelect` fields are text inputs, so it cannot supply the two
required relations. Assigning `project_manager`/`warehouse_manager` instead would
mislabel the person and inject them into the manager dropdowns. So the correct
fix is to stop offering an internal-worker create there; creating a worker stays
in the employees form, which collects the workplace. The external-counterparty
inline create is untouched.

## Public interfaces / changed contracts

`apps/web/src/features/employees/use-employee-inline-create.ts` (new):

```ts
export type EmployeeInlineCreateField = { key: string; label: string; placeholder?: string; required?: boolean }
export type EmployeeInlineCreateConfig = {
  createLabel: string
  fields: EmployeeInlineCreateField[]
  onCreate: (data: Record<string, string>) => Promise<{ id: string; name: string }>
}

export function useEmployeeInlineCreate(args: {
  roleId: string
  createLabel: string
  fields: EmployeeInlineCreateField[]
  errorMessage: string
}): EmployeeInlineCreateConfig | undefined

export function useEmployeeInlineCreateSelection(args: {
  roleId: string
  createLabel: string
  fields: EmployeeInlineCreateField[]
  errorMessage: string
  selectedEmployeeId: string
}): { createConfig: EmployeeInlineCreateConfig | undefined; selectedDisplayValue: string | undefined }
```

- Returns `undefined` when `roleId` is empty, hiding the create option.
- Throws the localized `errorMessage` when the API returns no row or no id — no
  fabricated id, and a missing id fails loudly.
- Wraps every non-`AppMutationError` failure (wire validation, network) in the
  localized `errorMessage`, so no English text reaches the dialog.

`apps/web/src/features/app-shell/workspace-mutations.ts`:

```ts
export type EmployeeBatchCreateResult = {
  createdCount: number
  employees: Employee[]   // new — the created rows, with real ids
}
```

`ProjectFormFields` and `WarehouseFormFields` both take
`managerCreate?: EmployeeInlineCreateConfig` and `managerDisplayValue?: string`,
and render the manager field with `CreateableSelect`. The warehouse form's old
`onCreateManager` / `translations` props (with hard-coded Arabic fallbacks) are
gone.

Feature wrappers keep the per-form labels in one place:
`projects/project-manager-inline.ts`, `warehouses/warehouse-manager-inline.ts`.

`ProjectCreatePage` / `ProjectEditPage` take `projectManagerRoleId`;
`WarehouseCreatePage` / `WarehouseEditPage` take `warehouseManagerRoleId`.
`HomeViewPageDetailContent` derives both from `derived.roles`
(`project_manager` / `warehouse_manager`).

## Tests

Unit:

- `projects/project-create-page.test.tsx` — create ends with the real id
  selected, `project_manager` role sent, other fields survive, localized
  fallback + server message + missing-row failures, create hidden without a role.
- `warehouses/warehouse-create-page.test.tsx` — same for `warehouse_manager`,
  asserting the real returned id drives the selection.
- `features/debts/debt-create-page.test.tsx` — pins that the internal-worker
  branch offers **no** create option and the external branch still does.
- `app-shell/workspace-mutations.test.ts` — pins that the hook returns
  `employees[]` with real ids, so a regression to `{ id: "new" }` is visible.

E2E (Playwright):

- `projects.spec.ts` — inline-create a manager and save the project.
- `warehouses.spec.ts` — inline-create a warehouse manager and save the warehouse.

## Risks / migration

- `EmployeeBatchCreateResult` is a web-local type shadowing the identically named
  contract type; the added field mirrors the contract output. No API/contract change.
- The `project_manager` / `warehouse_manager` roles must be seeded; they are
  (`DEFAULT_ROLE_PERMISSIONS`). When absent the create option is simply hidden.
- The debt form loses its internal-worker inline create. That is intentional and
  documented above; restoring it needs either relation pickers in the dialog or a
  relaxed worker invariant — both out of scope.

## Base SHA

`22495413b7d792e20afcce24a94d6c84c61dd523` (`git merge-base develop HEAD`).

## Suggested PR subject/body (parent owns the PR)

Subject: `feat(web): inline create from a form — project + warehouse managers (real ids, real roles)`.
Body: state that it is the shared "inline create from a form" pattern across the
forms that use it, that warehouse/debt previously always failed at the wire gate
with a fabricated id, that the debt internal-worker create was removed because
the API requires an active worker to have a project + direct manager, and list
the verification evidence.
