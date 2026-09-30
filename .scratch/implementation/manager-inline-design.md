# Create a project manager inline from the project form

- **Ticket:** owner item 1 of the `feat-manager-inline` lane (no GitHub number issued)
- **Mode:** remote (repo works against `AmaraNecib/tuari_react_hono`); this lane
  does not push or open a PR — the parent owns that.
- **Branch/worktree:** `feat/manager-inline` at `worktrees/feat-manager-inline`
- **Base:** `develop`
- **Base SHA (fixed):** `22495413b7d792e20afcce24a94d6c84c61dd523`
- **Review tier:** Standard

## Problem

The project form's manager selector is a `NativeSelect` whose options are
`derived.projectManagerOptions` — active employees who already hold the
`project_manager` role. An admin who wants a brand-new manager must leave the
form, go to the employees page, create the person with the `project_manager`
role, then come back and lose the rest of the form. The warehouse form already
shows a `CreateableSelect` next to a "create" dialog; this lane reuses that
pattern for the project manager instead of inventing a second one.

## What the reused pattern lacked (and why it was extended)

The `CreateableSelect` component itself needed **no** change: its `onCreate`
contract already returns `{ id, name }` and it already renders
`error.message` in the dialog. Two gaps lived outside it:

1. **The batch-create mutation discarded the new row's id.**
   `useCreateEmployeesBatchMutation` collapsed the API's
   `employeeBatchCreateResult` (which contains the created `employees[]`) into
   `{ createdCount }`. Both the warehouse and debt inline-create callers work
   around this with a hard-coded `{ id: "new" }`, so their "selection" is a
   non-existent id. The hook is extended to return `employees: Employee[]`
   (keeping `createdCount`, so existing callers do not change).
2. **The create row had no role.** `employeeCreateInputSchema.roleId` is
   `z.string().min(1)` and `requireAssignableEmployeeRole` rejects an empty /
   non-system role. The inline manager create therefore has to send the real
   `project_manager` role id; the pages already have it in
   `derived.roles` (the `project_manager` system role is seeded by
   `roleSeeds`), so it is passed down as a `projectManagerRoleId` prop.

The `CreateableSelect` dialog also needs a stable accepted phone because
`algerianPhoneSchema` is `^(05|06|07)\d{8}$`; the phone field is marked
required so the dialog's own localized validation fires before the wire.

## Public interfaces / changed contracts

New module `apps/web/src/features/projects/manager-inline-create.ts`:

```ts
export type ManagerInlineCreateConfig = {
  createLabel: string
  fields: Array<{ key: string; label: string; placeholder?: string; required?: boolean }>
  onCreate: (data: Record<string, string>) => Promise<{ id: string; name: string }>
}

export function useProjectManagerInlineCreate(
  projectManagerRoleId: string,
): ManagerInlineCreateConfig | undefined
```

- Returns `undefined` when no `project_manager` role id is available, so the
  form hides the create option instead of offering a create that cannot work.
- `onCreate` maps a thrown `AppMutationError` straight through (server messages
  are already Arabic) and wraps anything else (wire-validation / network) in a
  localized `detailPages.project.validation.managerCreateError` message, so the
  dialog always shows localized text.

`apps/web/src/features/app-shell/workspace-mutations.ts`:

```ts
export type EmployeeBatchCreateResult = {
  createdCount: number
  employees: Employee[]   // new — the created rows, with real ids
}
```

`apps/web/src/features/projects/project-form.tsx`:

```ts
ProjectFormFields({
  ...
  managerCreate?: ManagerInlineCreateConfig
  managerDisplayValue?: string
})
```

- The manager `NativeSelect` becomes `CreateableSelect`.
- `managerCreate` supplies `createLabel` / `createFields` / `onCreate`.
- `managerDisplayValue` is the "not yet in options" label for a freshly created
  manager, so the trigger never flashes the raw UUID while the workspace
  snapshot refetches.

`ProjectCreatePage` / `ProjectEditPage` gain `projectManagerRoleId: string`.
`HomeViewPageDetailContent` derives it once from `derived.roles`
(`key === "project_manager"`) and passes it to both pages.

## Why the selection survives without a reload

- The form state lives in the page (`useState`); the create dialog is a sibling
  rendered inside `CreateableSelect`, so creating a manager only calls the
  manager field's `onChange(newId)` — every other field is untouched.
- `useCreateEmployeesBatchMutation` invalidates the `employees` (and snapshot)
  domains, so `derived.projectManagerOptions` refetches and now contains the
  new `project_manager`, giving the trigger the real name rather than the raw id.
- The page also remembers the created `{ id, name }` and passes
  `managerDisplayValue` while that id is selected, covering the refetch window.

## Planned tests

Unit (`apps/web/src/features/projects/project-create-page.test.tsx`, jsdom):

1. Inline create ends with the new manager selected: open the create option,
   fill the fields, submit, assert `onCreate` was called with the real
   `project_manager` role id and the trigger shows the created name.
2. The form's other fields survive the create (name / location / notes stay).
3. A rejected create shows a visible localized error in the dialog and the
   dialog stays open.

Unit (`apps/web/src/features/app-shell/workspace-mutations.test.ts` or a focused
test) — pin that the batch-create hook surfaces the created employee ids, so a
regression to `{ id: "new" }` cannot silently return.

Playwright (`tests/e2e/projects.spec.ts`): create a project, inline-create the
manager from the form, assert the manager is selected and the saved project
shows that manager. Added because the flow is user-facing; run only when the
local e2e infra (ports/DB fixtures) is free.

## Risks / migration

- The `project_manager` role must be seeded; it is (`DEFAULT_ROLE_PERMISSIONS`).
  When it is absent the create option simply does not render.
- `EmployeeBatchCreateResult` is a web-local type that shadows the identically
  named contract type; the added field mirrors the contract output, no wire
  change. No API or contract change in this lane.
- Out of scope but observed: the warehouse and debt inline-create callers still
  send `roleId: ""` and return the hard-coded `{ id: "new" }`, so they remain
  broken. Reported to the parent as a deferred finding, not silently fixed.

## Base SHA

`22495413b7d792e20afcce24a94d6c84c61dd523` (`git merge-base develop HEAD`).
