# Kickoff Brief: `agent/phase1-web-rtl-shell`

## Goal

Build the Phase 1 web-only shell for the construction company app: an Arabic-first, RTL browser experience with a minimal `better-auth` login entry, a fixed right-side collapsible sidebar, and table-based workspace screens for Roles, Employees, Projects, and Warehouses, using `shadcn/ui`, shared-contract oRPC calls, and TanStack Query hook-based data access patterns from day one.

Base branch: `foundation/phase1-shared-baseline`

## In Scope

- Minimal login screen with `phone` and `password`
- Arabic default copy and RTL layout from the first commit
- Fixed right-side sidebar with collapse/expand behavior
- Theme toggle, `Settings`, and `Sign out` pinned correctly in the sidebar
- Main authenticated shell layout with independently scrolling content area
- Workspace views for `Employees`, `Projects`, `Warehouses`, and `Roles`
- Table-based management UI shells using `shadcn/ui`
- Visible client-side validation, loading states, and failure states
- Premium and modern UI polish rather than a bare minimum admin shell
- Query-first frontend structure for all server state access, even with mocks/stubs
- Explicit TanStack Query `useQuery` / `useMutation` usage for server state
- Web-side server access through shared-contract oRPC clients rather than ad hoc `fetch` calls
- Consistent toast feedback for success and error states using `sonner`
- Consistent confirmation flows for destructive or sensitive actions using `shadcn/ui` `AlertDialog`
- Live-feeling list/detail views through invalidation/refetch and safe optimistic updates where appropriate
- Unit tests for UI behavior and query/view-model logic
- Playwright smoke coverage for the browser flow
- Layout hardening to avoid false scroll, bottom whitespace, and viewport overflow bugs

## Out Of Scope

- Database schema, migrations, seeds, oRPC procedures, or API business logic
- Desktop-specific behavior
- Inventory, consumables, assets, debts, transactions, attachments, permissions
- Final authorization matrix
- Full live persistence if backend contracts are not ready yet
- Full Playwright setup ownership beyond the reserved baseline conventions

## Required UX Decisions

- `better-auth` remains the browser auth solution
- `shadcn/ui` remains the UI foundation
- Arabic is the default language
- RTL is enabled from the start
- Sidebar is fixed on the right and collapsible
- Workspace content renders on the left
- Validation must be visible inline or near the triggering action
- TanStack Query `useQuery` / `useMutation` hooks are the required server-state pattern
- Web-side server state goes through the shared oRPC contracts, not ad hoc `fetch` usage
- `sonner` is the preferred toast solution for this phase
- `shadcn/ui` `AlertDialog` is the preferred confirmation primitive for destructive or sensitive actions
- List/detail screens should feel live through invalidation/refetch or safe optimistic updates while staying consistent with backend truth
- The app should feel premium and modern in layout, feedback, and motion polish
- `EmployeeProjectAssignment.employeeId` stays generic for now

## Data Contract Assumptions

The shared baseline branch is the source of truth for the assumptions below.

### Auth

- Login request shape is `phone` and `password`
- Auth/session behavior is provided through `better-auth`
- Protected shell boot depends on a reusable session check contract
- Shared validation and error shapes come from the baseline contract and should not be redefined here
- Shared oRPC client/query conventions come from the baseline contract and should not be redefined here

### Core Entities

- `Role`: `id`, `key`, `name`, `description?`, `isSystem`, `createdAt`, `updatedAt`
- `Employee`: `id`, `firstName`, `lastName`, `phone`, `roleId`, `status`, `notes?`, `createdAt`, `updatedAt`
- `Project`: `id`, `name`, `location?`, `managerId?`, `status`, `notes?`, `createdAt`, `updatedAt`
- `Warehouse`: `id`, `name`, `address?`, `managerId?`, `status`, `notes?`, `createdAt`, `updatedAt`
- `EmployeeManagerAssignment`: `id`, `workerId`, `managerId`, `status`, `startDate`, `endDate?`, `notes?`, `createdAt`, `updatedAt`
- `EmployeeProjectAssignment`: `id`, `employeeId`, `projectId`, `status`, `startDate`, `endDate?`, `notes?`, `createdAt`, `updatedAt`

## Required Tests

### Unit

- Login form validation and submission-state behavior
- Visible rendering of field and form errors
- RTL shell rendering and sidebar state transitions
- Theme toggle behavior
- Table/workspace rendering for Employees, Projects, Warehouses, and Roles
- Query hook/view-model tests for loading, empty, success, and error states
- Toast feedback behavior for success and error outcomes
- Confirmation flow behavior for destructive or sensitive actions
- Live list/detail update behavior after mutations

### Playwright / E2E

Playwright is not yet configured in-repo. This branch should follow the reserved baseline command, folder, and env conventions, and only add browser smoke coverage if setup is introduced without conflicting with that baseline.

- Login page renders in Arabic and RTL
- Invalid login shows visible validation
- Successful mocked or live login enters the app shell
- Sidebar is on the right, fixed, and collapsible
- Settings and sign-out stay pinned to the bottom of the sidebar
- Main content scrolls independently without double-scroll or bottom whitespace regression
- Navigation reaches Employees, Projects, Warehouses, and Roles entry points
- Toast feedback appears for representative success and error flows
- Destructive confirmations use the agreed confirmation primitive

## Validation Checklist

- Login uses only `phone` and `password`
- Arabic is the default visible language
- Page direction is RTL in login and the app shell
- Sidebar is fixed to the right in expanded and collapsed states
- Workspace scroll does not move the sidebar
- No fake page scroll or extra bottom gap appears
- Validation errors are visible without relying on console output
- TanStack Query `useQuery` / `useMutation` hooks are used for all remote-state screens
- Shared-contract oRPC usage is used for web-side server access
- Toast feedback and confirmation flows follow the shared conventions
- List/detail screens feel live after create/update/archive actions
- Unit tests pass
- Playwright smoke coverage passes

## Allowed File Areas

- `apps/web/src/**`
- `apps/web/public/**`
- `apps/web/index.html`
- `apps/web/package.json` only if web-only deps/scripts are required
- `apps/web/vite.config.ts` only if needed for web runtime or test setup
- `apps/web/components.json` only if needed for `shadcn/ui`

## Blocked File Areas

- `apps/api/**`
- `apps/desktop/**`
- Database/schema/migration/seed files anywhere in the repo
- Backend auth implementation files
- oRPC server procedures and backend validation logic

## Dependencies On The API Branch

- `foundation/phase1-shared-baseline` is the baseline source of truth for auth/session, oRPC, field/status, env/runtime, script, and Playwright conventions
- No contract ownership lives on `agent/phase1-api-core-company-structure`
- The API branch provides implementation of the frozen contracts plus CRUD endpoints for Roles, Employees, Projects, and Warehouses
- The later integration branch owns merge/connect/fix work for live auth boot, server validation display, and real data wiring
- The API branch must return mutation and error shapes stable enough to support invalidation, optimistic reconciliation, toast feedback, and inline validation cleanly

## Start / Run / Test Commands

```bash
pnpm dev:web
pnpm test:web
```

If Playwright is added/configured on this branch, add a repo-consistent command and run it before handoff.

## Acceptance Criteria

- Browser user can open a minimal Arabic RTL login screen with `phone` and `password`
- After a mocked or live authenticated entry, the user lands in a stable RTL app shell
- Shell has a fixed right collapsible sidebar with theme toggle, settings, and sign out anchored correctly
- Employees, Projects, Warehouses, and Roles are represented in the navigation/workspace structure
- Frontend uses shared-contract oRPC plus TanStack Query `useQuery` / `useMutation` hooks throughout
- UI includes consistent `sonner` toast feedback and `shadcn/ui` `AlertDialog` confirmation flows
- UI feels premium and modern rather than placeholder-grade
- List/detail screens feel live while remaining consistent with backend truth
- Branch stays aligned with `foundation/phase1-shared-baseline` and does not redefine shared contracts locally
- No viewport overflow, false scroll, or bottom whitespace regressions remain
- Unit tests and Playwright smoke tests cover the critical browser flow and pass locally
