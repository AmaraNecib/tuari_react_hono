# Phase 1 Core Company Structure Plan

## Goal

Deliver the first usable slice of the construction company management app through a shared foundation baseline, then a strict split between frontend and backend work, followed by integration, full testing, security review, and final merge.

This phase includes only:

- Roles
- Employees
- Projects
- Warehouses
- Login and main app layout needed to access them

This phase does not include:

- inventory
- consumables
- assets
- debts
- transactions
- attachments
- permissions

## Product Scope Extracted From Request

### Core Modules

1. Role
2. Employee
3. Project
4. Warehouse

### Authentication And Entry Flow

- Start with a minimal login screen.
- Login uses `phone` and `password`.
- Authentication uses `better-auth` for the browser flow.
- Session handling must be defined once and reused consistently across web, API, and later desktop integration.
- Validation errors must be visible directly in the UI.

### Dashboard And Navigation

- The app starts in RTL from day one.
- Arabic is the default language for now.
- The sidebar sits on the right side.
- The sidebar must be fixed while the page content scrolls independently.
- The sidebar can be collapsed to icons-only or expanded with labels.
- Theme toggle lives in the sidebar.
- Settings and sign out stay at the bottom of the sidebar.
- Workspace content appears on the left side of the screen.

### Workspace Expectations

- Main workspace focuses on table-based management views.
- The first visible management areas are workers/employees, projects, and warehouses.
- Roles are in scope as a managed entity even if they are not the first visible workspace tab.
- The layout must avoid fake scroll, bottom whitespace, and viewport overflow bugs.
- The web UI should be built with `shadcn/ui` components adapted for RTL and Arabic-first usage.
- The app should feel premium and modern rather than bare minimum or utilitarian.
- Success and error feedback should use a single consistent toast system, with `sonner` preferred for this phase.
- Destructive or sensitive actions should use a consistent confirmation primitive, with `shadcn/ui` `AlertDialog` preferred for this phase.
- List and detail views should feel live, with changes appearing immediately through proper invalidation/refetch or safe optimistic updates that remain consistent with backend truth.

### Technical Expectations

- Frontend uses TanStack Query hooks explicitly, with `useQuery` and `useMutation` as the standard server-state pattern.
- Frontend uses the shared oRPC contracts from the web app rather than ad hoc `fetch` calls.
- Frontend uses `shadcn/ui` as the UI component foundation.
- Backend uses database-first design.
- Backend uses the existing oRPC patterns already present in the repo.
- Backend authentication uses `better-auth`.
- Code must stay modular and ready for later expansion.
- Browser flow is validated before desktop integration.
- Playwright, unit tests, and security review are required before final merge.

## Shared Contracts To Freeze Before Parallel Work

The frontend and backend branches can work in parallel only after a shared baseline branch freezes these contracts:

- Login request shape: `phone`, `password`
- Auth/session behavior exposed by `better-auth`
- Shared oRPC contract surface and error shapes the UI will render
- Canonical web-side oRPC client and TanStack Query integration approach so the web and API branches do not drift
- Core entity field requirements
- Status values for each entity and assignment table
- Active assignment rules for worker-manager and worker-project relationships
- Environment and runtime naming used across web, API, and contracts
- Package scripts and test command conventions
- Playwright command, folder, and env naming conventions at a baseline level only
- Query and mutation response conventions for list, create, update, and archive flows
- Toast and confirmation conventions used for user feedback and destructive actions

## Delivery Model

Work moves through one shared foundation branch, two parallel implementation branches, one integration branch, one release-validation branch, and one final PR to `main`.

### Branch 1 - Shared Foundation Baseline

- Branch name: `foundation/phase1-shared-baseline`
- Scope: shared contracts, naming, and conventions only
- Ownership: frozen `better-auth` phone/password session contract, shared oRPC contract and error shapes, canonical oRPC + TanStack Query integration conventions, toast and confirmation conventions, Phase 1 entity field/status schemas, env/runtime naming, package scripts and test conventions, and Playwright baseline command/folder/env conventions only

### Branch 2 - Frontend Only

- Branch name: `agent/phase1-web-rtl-shell`
- Base branch: `foundation/phase1-shared-baseline`
- Scope: web UI only
- Ownership: login page, main app layout, sidebar, RTL layout, theme toggle, responsive tables, client-side validation presentation, `shadcn/ui` composition, TanStack Query hook structure with mocked or stubbed data during isolated UI work, premium/modern polish, toast feedback, and confirmation flows

### Branch 3 - Backend Only

- Branch name: `agent/phase1-api-core-company-structure`
- Base branch: `foundation/phase1-shared-baseline`
- Scope: API, schema, data model, `better-auth` plumbing, validation, tests
- Ownership: database schema, migrations, seeds, oRPC procedures, auth implementation that conforms to the frozen contract, role/employee/project/warehouse services, backend tests, security foundations, and stable mutation/error responses that support live web UX cleanly

### Branch 4 - Integration

- Branch name: `integration/phase1-core-company-structure`
- Scope: merge, connect, and stabilize frontend and backend work
- Ownership: merge/connect/fix work across the two implementation branches, live query wiring, authenticated flows, protected navigation, server validation display, integrated tests, end-to-end checks, and bug fixes discovered during integration

### Branch 5 - Final Validation

- Branch name: `integration/phase1-release-validation`
- Scope: release candidate verification only
- Ownership: regression pass, security pass, browser-first signoff, merge readiness notes

### Branch 6 - Final PR To Main

- Source: `integration/phase1-release-validation`
- Target: `main`
- Scope: final reviewed Phase 1 merge only after validation signoff

## PR / Merge Flow

- Create and land `foundation/phase1-shared-baseline` first.
- Branch `agent/phase1-web-rtl-shell` and `agent/phase1-api-core-company-structure` from `foundation/phase1-shared-baseline`.
- Merge both implementation branches into `integration/phase1-core-company-structure` for live connect/fix work.
- Merge the stabilized integration branch into `integration/phase1-release-validation` for regression and security validation.
- Open the final PR from `integration/phase1-release-validation` to `main` only after release validation passes.

## Phase Plan

## Phase 1 - Scope Lock And UX Contract

- Freeze the first release to roles, employees, projects, and warehouses only.
- Freeze Arabic-first RTL behavior and right-side fixed sidebar rules.
- Freeze `better-auth` for authentication and `shadcn/ui` for the web component system.
- Freeze TanStack Query `useQuery` / `useMutation` as the explicit frontend server-state hooks.
- Freeze shared-contract oRPC usage from the web app and prohibit ad hoc fetch patterns for server state.
- Define login-first entry flow and main app information architecture.
- Record layout constraints to prevent white-space scroll and double-scroll bugs.
- Record premium/modern interaction expectations, toast feedback conventions, and confirmation-dialog conventions.
- Record which backend fields are required so frontend forms and API validation stay aligned.
- Record intended active-assignment business rules so frontend and backend implementation do not drift.
- Record the shared branch flow and baseline ownership before parallel work begins.

Exit criteria:

- Navigation map is agreed.
- Screen list is agreed.
- Shared auth and validation contracts are agreed.
- Required versus optional fields are explicitly documented.
- Active assignment rules are explicitly documented.
- Out-of-scope items are explicitly excluded.

## Phase 2 - Shared Foundation Baseline

- Create and land `foundation/phase1-shared-baseline` before frontend or backend implementation starts.
- Freeze the shared `better-auth` phone/password login and session contract used by both branches.
- Freeze shared oRPC contract and error shape conventions in a baseline form.
- Freeze the canonical oRPC client + TanStack Query integration approach used by the web app.
- Freeze `sonner` as the preferred toast solution for consistent success/error feedback.
- Freeze `shadcn/ui` `AlertDialog` as the preferred destructive/sensitive confirmation primitive for this phase.
- Freeze Phase 1 field/status schemas for roles, employees, projects, warehouses, and assignment tables.
- Freeze env/runtime naming and package script/test naming used by both branches.
- Reserve Playwright command, folder, and env conventions only; do not treat this phase as full E2E implementation.
- Keep `EmployeeProjectAssignment.employeeId` generic for now.
- Keep `Project.managerId` optional and `Warehouse.managerId` optional.
- Preserve the agreed worker/manager/project business rules for later API enforcement and integration use.

Deliverables:

- Shared baseline kickoff brief
- Frozen auth/session contract
- Frozen oRPC contract and error-shape baseline
- Frozen canonical oRPC + TanStack Query integration notes
- Frozen toast and confirmation convention notes
- Frozen entity field and status schema baseline
- Shared env/runtime naming notes
- Shared package scripts and test convention notes
- Reserved Playwright baseline convention notes

Exit criteria:

- `foundation/phase1-shared-baseline` is ready to merge and becomes the source of truth for parallel work.
- Web and API branches can start without redefining auth, contracts, or naming.
- No full Playwright E2E implementation is required yet.

## Phase 3 - Frontend Branch

- Build a minimal Arabic RTL login screen with phone and password fields.
- Build the web UI with `shadcn/ui` components and repo-consistent styling.
- Add inline validation, loading state, and failure state.
- Add consistent toast feedback for success and error states using the preferred shared solution.
- Add confirmation flows for destructive or sensitive actions using the preferred shared primitive.
- Build a fixed right-side collapsible sidebar.
- Place theme toggle in the sidebar.
- Pin settings and sign out to the bottom.
- Build workspace tables for employees, projects, and warehouses.
- Keep roles accessible in the shell design.
- Use TanStack Query `useQuery` / `useMutation` hooks for all remote-state access patterns.
- Use shared-contract oRPC client calls rather than ad hoc fetch wrappers.
- Make list/detail views feel live through invalidation/refetch and safe optimistic updates where appropriate.
- Fix viewport sizing and overflow behavior so the page does not show false scroll space.

Deliverables:

- Login screen
- RTL main app layout
- Collapsible fixed sidebar
- Theme toggle
- Table-based workspace views
- `shadcn/ui`-based UI foundation for this phase
- Frontend unit tests
- Frontend Playwright smoke coverage with mocked data if needed, following the reserved baseline conventions

Exit criteria:

- UI works cleanly in browser.
- Sidebar behavior is stable in RTL.
- No unwanted overflow or bottom whitespace appears.
- Forms and tables are ready to consume the frozen backend contracts.

## Phase 4 - Backend Branch

- Design the schema for Role, Employee, EmployeeManagerAssignment, EmployeeProjectAssignment, Project, and Warehouse.
- Store roles in the database rather than enums.
- Prevent deletion of system roles.
- Add status fields and historical assignment support.
- Add indexes and foreign keys where appropriate.
- Implement CRUD endpoints through oRPC.
- Implement against the frozen `better-auth` phone/password auth/session contract.
- Implement the frozen validation and error responses that map cleanly to the UI.
- Add security baselines and seed data for built-in roles.
- Return stable mutation payloads and error shapes that support live invalidation, optimistic reconciliation, toast feedback, and inline validation cleanly.

Deliverables:

- Schema and migrations
- Seed data
- oRPC procedures
- `better-auth` foundations
- Backend unit and integration tests
- Security review notes for auth and input handling

Exit criteria:

- API is testable and typed.
- Core schema rules are enforced.
- Login and CRUD flows are available for integration.
- Auth responses and validation responses remain aligned with the shared baseline and are stable enough for the frontend branch to consume.

## Phase 5 - Integration Branch

- Merge the web and API branches on top of the shared baseline.
- Connect query hooks to live backend procedures.
- Replace mock data with real responses.
- Connect the login UI to `better-auth` browser flow.
- Add protected app boot flow.
- Show server-side validation in the UI.
- Ensure live list/detail refresh behavior stays responsive and backend-consistent after mutations.
- Verify entity tables, create/edit flows, assignment rules, and sign out flow.
- Add Playwright end-to-end coverage for the browser.
- Fix integration defects across auth, layout, and data loading.

Deliverables:

- Connected browser application
- Live login flow
- Integrated query and mutation patterns
- Validation handling across frontend and backend
- Playwright E2E suite

Exit criteria:

- Browser flow works end to end.
- Main entity management screens use live data.
- Auth, validation, and navigation are stable.

## Phase 6 - Final Validation And Merge

- Run frontend, backend, and integration test suites.
- Perform security review for auth, validation, and authorization boundaries.
- Run manual browser verification.
- Defer desktop-specific validation until browser behavior is confirmed stable.
- Prepare merge notes and known follow-ups.
- Open the final PR from `integration/phase1-release-validation` to `main`.

Exit criteria:

- Automated tests pass.
- Manual testing passes.
- No critical security issues remain.
- Phase remains within approved scope.

## Backend Data Scope

### Role

Fields:

- `id`
- `key` unique
- `name`
- `description` optional
- `isSystem`
- `createdAt`
- `updatedAt`

Initial system roles:

- `worker`
- `project_manager`
- `warehouse_manager`

Rules:

- Roles live in the database.
- System roles cannot be deleted.
- The worker role name stays `worker` in this phase.

### Employee

Fields:

- `id`
- `firstName`
- `lastName`
- `phone`
- `roleId`
- `status`
- `notes` optional
- `createdAt`
- `updatedAt`

Status values:

- `ACTIVE`
- `INACTIVE`
- `LEFT`

Rules:

- Each employee belongs to one role.
- Employee identity fields listed above are required for this phase.
- Workers are assigned under a manager through `EmployeeManagerAssignment` records.
- Workers can be assigned to projects through `EmployeeProjectAssignment` records.

### EmployeeManagerAssignment

Fields:

- `id`
- `workerId`
- `managerId`
- `status`
- `startDate`
- `endDate` optional
- `notes` optional
- `createdAt`
- `updatedAt`

Rules:

- Workers are assigned under a manager through this table.
- A worker can have only one active manager assignment at a time.
- A manager may supervise multiple workers.
- Historical records must be preserved.

### EmployeeProjectAssignment

Fields:

- `id`
- `employeeId`
- `projectId`
- `status`
- `startDate`
- `endDate` optional
- `notes` optional
- `createdAt`
- `updatedAt`

Rules:

- Workers may belong to multiple projects historically.
- Workers may belong to multiple projects in general, but can have only one active project assignment at a time.
- A worker's intended active project must be one of the projects that belongs to the worker's active manager.
- This manager-project consistency rule may be enforced in application logic during this phase if not fully enforced at the database level.

### Project

Fields:

- `id`
- `name`
- `location` optional
- `managerId` optional
- `status`
- `notes` optional
- `createdAt`
- `updatedAt`

Status values:

- `ACTIVE`
- `STOPPED`
- `COMPLETED`
- `ARCHIVED`

Rules:

- A project may exist without a manager in this phase.
- One manager may manage multiple projects.

### Warehouse

Fields:

- `id`
- `name`
- `address` optional
- `managerId` optional
- `status`
- `notes` optional
- `createdAt`
- `updatedAt`

Status values:

- `ACTIVE`
- `INACTIVE`
- `ARCHIVED`

Rules:

- A warehouse may exist without a manager in this phase.
- One warehouse manager may manage multiple warehouses.

## Notes And Open Questions

- Decide how to enforce worker active-project and active-manager consistency: database constraint where possible, service-layer validation, or both.
- Decide whether project assignment creation should require an active manager assignment first, or whether it can be created before that relationship is established.
- Decide the exact status values and uniqueness strategy used to represent a single active manager assignment and a single active project assignment.

## Acceptance Checklist

- Login exists with phone and password.
- Browser authentication uses `better-auth`.
- UI is RTL and Arabic-first.
- Web UI uses `shadcn/ui` as the base component system.
- Right sidebar is fixed and collapsible.
- Theme toggle exists in the sidebar.
- Settings and sign out are anchored at the bottom.
- Workspace shows management tables for employees, projects, and warehouses.
- Role management is included in system scope.
- Layout has no false page scroll or bottom whitespace issue.
- Frontend uses query-driven data access patterns.
- Frontend uses shared-contract oRPC plus TanStack Query `useQuery` / `useMutation` hooks for server state.
- Web UX includes consistent `sonner` toasts and `shadcn/ui` `AlertDialog` confirmation flows.
- List/detail screens feel live through invalidation/refetch or safe optimistic updates.
- Backend uses database-first modeling and oRPC procedures.
- Unit tests, Playwright checks, and security review are completed before merge.

## Deferred Until Later Phases

- Inventory and consumables
- Assets and equipment tracking
- Debts and financial transactions
- Attachments and document uploads
- Advanced permissions matrix
- Desktop-specific validation after browser signoff
