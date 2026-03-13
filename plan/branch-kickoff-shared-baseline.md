# Kickoff Brief: `foundation/phase1-shared-baseline`

## Goal

Land the minimum shared baseline required for Phase 1 web and API work to start safely in parallel. This branch exists to freeze cross-branch contracts, naming, and conventions before either implementation branch begins building independently.

## In Scope

- Freeze the `better-auth` browser auth/session contract for `phone` and `password`
- Freeze shared oRPC contract structure and error shapes used across web and API
- Freeze the canonical web-side oRPC client + TanStack Query integration approach so the web and API branches do not drift
- Freeze the preferred toast and confirmation conventions for consistent frontend feedback flows
- Freeze Phase 1 entity field and status schemas for `Role`, `Employee`, `EmployeeManagerAssignment`, `EmployeeProjectAssignment`, `Project`, and `Warehouse`
- Freeze agreed worker/manager/project relationship rules already documented in the main plan
- Freeze env/runtime naming conventions shared by web, API, and contracts
- Freeze package scripts and test naming conventions used across the Phase 1 branches
- Reserve Playwright command, folder, and env naming conventions at a baseline level only
- Document branch flow so `agent/phase1-web-rtl-shell` and `agent/phase1-api-core-company-structure` both branch from this baseline

## Out Of Scope

- Full web UI implementation
- Full API implementation, database schema build-out, migrations, or seeds beyond what is strictly needed to freeze shared contracts
- Full Playwright setup or end-to-end implementation
- Integration wiring between web and API
- Desktop-specific behavior
- Inventory, consumables, assets, debts, transactions, attachments, permissions

## Shared Baseline Rules

- `better-auth` remains the required auth solution
- Login contract uses `phone` and `password`
- Session contract must be reusable by web, API, and later integration work without redefining the shape
- Shared oRPC conventions must define typed success/error expectations at a baseline level
- Error shapes must cover validation, unauthorized, not-found, and business-rule failures in a consistent UI-renderable form
- Frontend server state is standardized on TanStack Query hooks, explicitly `useQuery` and `useMutation`
- Web-side server calls must go through the shared oRPC contracts rather than ad hoc `fetch` usage
- The baseline must freeze the canonical oRPC client construction, query key strategy, and mutation/invalidation conventions used by the web app
- `sonner` is the preferred toast solution for Phase 1 success/error feedback
- `shadcn/ui` `AlertDialog` is the preferred confirmation primitive for destructive or sensitive actions
- Query and mutation conventions must support list/detail screens that feel live through invalidation/refetch or safe optimistic updates while staying consistent with backend truth
- `EmployeeProjectAssignment.employeeId` stays generic for now
- `Project.managerId` stays optional
- `Warehouse.managerId` stays optional
- Worker/manager/project rules from the main Phase 1 plan remain the source of truth
- Playwright is not yet configured in-repo, so this branch only reserves consistent setup conventions and does not deliver full E2E coverage

## Baseline Guardrails

- Playwright setup must move from "not yet configured" to a minimally working baseline before the later branches rely on browser-first validation.
- Web-side oRPC client usage must be wired in the shared baseline so the web branch starts from real shared-contract patterns rather than placeholder fetch flows.
- The `better-auth` phone-first contract must be frozen in this branch before either implementation branch extends auth flows.
- Keep this branch small and focused; if it grows into feature work, it will slow the parallel web and API branches.

## Allowed File Areas

- `plan/**`
- `packages/contracts/src/**` only for shared baseline contract shapes if needed
- `packages/contracts/package.json` only if baseline script conventions must be recorded there
- Root `package.json` only if shared script naming must be reserved there
- Shared env example or config naming files only if needed to freeze naming conventions without implementing full feature behavior

## Blocked File Areas

- `apps/web/src/**` implementation work beyond baseline references
- `apps/api/src/**` implementation work beyond baseline references
- `apps/desktop/**`
- Database schema, migration, and seed implementation files unless a minimal shared contract placeholder is strictly required
- Full Playwright test implementation files
- Unrelated feature areas outside Phase 1 scope

## Required Tests

### Documentation / Contract Validation

- Shared auth/session contract is explicit and internally consistent
- Shared oRPC contract and error-shape baseline is explicit and internally consistent
- Shared oRPC + TanStack Query integration baseline is explicit and internally consistent
- Shared toast and confirmation conventions are explicit and internally consistent
- Field and status schema definitions match the main Phase 1 plan
- Script, env, runtime, and Playwright naming conventions are documented without drift

### Code-Level Checks If Files Change

- Contract package tests pass if `packages/contracts` changes
- Repo script validation passes if shared package scripts are introduced or renamed

## Acceptance Criteria

- `foundation/phase1-shared-baseline` lands before the web and API kickoff branches start
- `agent/phase1-web-rtl-shell` and `agent/phase1-api-core-company-structure` both use this branch as their base branch
- Shared auth/session, oRPC, oRPC + TanStack Query integration, toast/confirmation, error-shape, field/status, env/runtime, and package command conventions are frozen enough to prevent branch drift
- Playwright conventions are reserved consistently, but no one treats this branch as full E2E delivery
- The integration branch remains responsible for merge/connect/fix work after the parallel branches complete
