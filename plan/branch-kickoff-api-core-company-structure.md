# Kickoff Brief: `agent/phase1-api-core-company-structure`

## Goal

Implement the Phase 1 backend slice for core company structure so the integration branch can plug a stable, typed API into the web shell. This branch owns database-first modeling, `better-auth`-based phone/password authentication, oRPC contracts, validation, seeds, and backend test coverage for roles, employees, projects, warehouses, and worker assignment relationships.

Base branch: `foundation/phase1-shared-baseline`

## In Scope

- Database schema, migrations, and seeds for `Role`, `Employee`, `EmployeeManagerAssignment`, `EmployeeProjectAssignment`, `Project`, and `Warehouse`
- Auth-related tables and setup required by `better-auth`
- API implementation of the frozen shared oRPC contract definitions in `packages/contracts`
- API implementation in `apps/api` for auth/session plus CRUD and assignment flows
- Validation and error response conventions that the web branch can render directly
- Stable mutation responses and error shapes that support live web UX, toast feedback, and inline validation cleanly
- Seed data for built-in system roles
- Unit and integration tests
- Security baseline notes for auth and input handling

## Out Of Scope

- Any web UI work in `apps/web`
- Any desktop work in `apps/desktop`
- Inventory, consumables, assets, debts, transactions, attachments, advanced permissions
- Final Playwright E2E implementation on this branch
- Redefining shared auth/session, error-shape, env/runtime, or package command conventions outside the foundation baseline

## Schema And Domain Rules

### Core Entities

- `Role`: `id`, `key`, `name`, `description?`, `isSystem`, `createdAt`, `updatedAt`
- Initial system roles: `worker`, `project_manager`, `warehouse_manager`
- `Role.key` must be unique
- System roles cannot be deleted
- Roles stay database-backed, not enum-backed

- `Employee`: `id`, `firstName`, `lastName`, `phone`, `roleId`, `status`, `notes?`, `createdAt`, `updatedAt`
- Employee status: `ACTIVE`, `INACTIVE`, `LEFT`
- Each employee belongs to exactly one role
- `phone` is required for Phase 1

- `EmployeeManagerAssignment`: `id`, `workerId`, `managerId`, `status`, `startDate`, `endDate?`, `notes?`, `createdAt`, `updatedAt`
- One active manager per worker at a time
- Managers may supervise multiple workers
- Preserve history

- `EmployeeProjectAssignment`: `id`, `employeeId`, `projectId`, `status`, `startDate`, `endDate?`, `notes?`, `createdAt`, `updatedAt`
- Keep `employeeId` generic for now
- One active project per worker at a time
- Preserve history
- Intended rule: active project should belong to the active manager's projects

- `Project`: `id`, `name`, `location?`, `managerId?`, `status`, `notes?`, `createdAt`, `updatedAt`
- Project status: `ACTIVE`, `STOPPED`, `COMPLETED`, `ARCHIVED`
- `managerId` stays optional

- `Warehouse`: `id`, `name`, `address?`, `managerId?`, `status`, `notes?`, `createdAt`, `updatedAt`
- Warehouse status: `ACTIVE`, `INACTIVE`, `ARCHIVED`
- `managerId` stays optional

## Auth Rules With `better-auth`

- `better-auth` is mandatory
- Browser auth/session flow must work with `phone` and `password`
- Replace or adapt any email-first assumptions as needed
- Protected oRPC procedures must require an authenticated session
- Auth errors must be stable and safe for UI rendering
- The baseline branch remains the source of truth for the auth/session contract shape
- Auth and mutation responses must be stable enough for TanStack Query invalidation/refetch and safe optimistic reconciliation on the web side

## API / oRPC Expectations

- Request/response schemas live in `packages/contracts`
- `apps/api` implements those contracts without drift
- Include session/auth status plus list/create/update/archive flows for roles, employees, projects, warehouses, manager assignments, and project assignments
- Validation failures, unauthorized failures, not-found failures, and business-rule failures should be typed and UI-renderable
- Shared error-shape conventions come from `foundation/phase1-shared-baseline` and are implemented here rather than redesigned here
- Response and mutation shapes should support the canonical oRPC + TanStack Query integration frozen in the shared baseline
- Mutation payloads should be stable enough to help the web app refresh list/detail screens immediately through invalidation/refetch or safe optimistic updates
- Error shapes should separate toast-suitable summary feedback from field-level validation details where applicable

## Required Tests

### Unit

- Role system-protection rules
- Employee required fields and status handling
- One active manager per worker
- One active project per worker
- Active project belongs to active manager's projects rule
- Optional `Project.managerId`
- Optional `Warehouse.managerId`
- Auth/session helper behavior

### Integration

- Unauthenticated vs authenticated access
- Login/session happy path
- Invalid phone/password failure path
- CRUD for roles, employees, projects, warehouses
- Assignment lifecycle flows with history preservation
- Rejection of conflicting active assignments
- Rejection of invalid manager/project consistency
- Seed expectations for system roles
- Stable mutation response coverage for create/update/archive flows consumed by the web app
- Error-shape coverage for toast-friendly messages and inline validation details

## Validation Checklist

- `better-auth` works with `phone` and `password`
- Session contract is stable and reusable
- Roles are stored in DB and seeded
- System roles cannot be deleted
- `EmployeeProjectAssignment.employeeId` remains generic
- `Project.managerId` is optional
- `Warehouse.managerId` is optional
- Only one active manager exists per worker
- Only one active project exists per worker
- Active project/manager consistency is enforced or clearly documented as service-layer enforcement
- Contracts live in `packages/contracts`
- API implementation matches contracts
- Mutation responses stay stable enough for live-query UX on the web branch
- Error responses remain consistent for toast rendering and inline validation
- Unit and integration tests pass

## Allowed File Areas

- `apps/api/prisma/schema.prisma`
- `apps/api/src/**`
- `apps/api/package.json` if backend deps/scripts need updates
- `apps/api/.env.example` only if env requirements change
- `packages/contracts/src/**`
- `packages/contracts/package.json` if contract scripts/deps need updates

## Blocked File Areas

- `apps/web/**`
- `apps/desktop/**`
- `packages/ui/**`
- Unrelated feature modules outside Phase 1 scope

## Dependencies On The Web Branch

- `foundation/phase1-shared-baseline` is the baseline source of truth for auth/session, oRPC, field/status, env/runtime, script, and Playwright conventions
- No direct code dependency on `agent/phase1-web-rtl-shell`
- The later integration branch owns merge/connect/fix work with the web shell after both branches complete
- The web branch expects response stability that supports shared-contract oRPC usage, TanStack Query invalidation/refetch, safe optimistic updates, toast feedback, and inline validation

## Start / Run / Test Commands

```bash
pnpm dev:api
pnpm test:api
pnpm test:contracts
```

If migrations, seeds, or auth generation scripts are needed, add package-level scripts and run them before handoff.

## Acceptance Criteria

- Branch delivers a typed, testable backend for Phase 1 company structure
- `better-auth` supports browser login/session with `phone` and `password`
- Schema, migrations, and seeds exist for roles, employees, projects, warehouses, and assignment tables
- oRPC contracts are defined in `packages/contracts` and implemented in `apps/api`
- Core CRUD and assignment lifecycle flows are available for integration
- Branch stays aligned with `foundation/phase1-shared-baseline` and does not redefine shared contracts locally
- Domain rules are enforced for system roles, active manager uniqueness, active project uniqueness, and active project vs manager consistency
- Validation and auth errors are stable enough for direct UI consumption, toast rendering, and inline validation
- Mutation responses are stable enough to support live list/detail UX on the web branch
- Unit and integration tests pass locally
