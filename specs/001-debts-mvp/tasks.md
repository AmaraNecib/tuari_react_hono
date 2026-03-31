# Tasks: Debt Management MVP

**Input**: Design documents from `/specs/001-debts-mvp/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md

## Phase 1: Foundation

- [ ] T001 Add debt and external counterparty schemas to `packages/contracts/src/index.ts`
- [ ] T002 Add SQLite + Prisma schema support for debt tables in `apps/api/prisma/schema.prisma` and `apps/api/src/infrastructure/database/schema-definitions.ts`
- [ ] T003 Add repository persistence for external counterparties, debt accounts, debt entries, and debt closure links in `apps/api/src/modules/company/company.repository.ts`
- [ ] T004 Add service methods for create/list/get/entry/settlement/close-against-another-debt flows in `apps/api/src/modules/company/company.service.ts`
- [ ] T005 Add debt-related RPC procedures in `apps/api/src/rpc/router.ts`

## Phase 2: User Story 1 - Internal worker debts (P1)

- [ ] T006 [US1] Expose worker total debt data plus separate debt-case lists in workspace snapshot / detail APIs
- [ ] T007 [US1] Add worker debt tab UI in `apps/web/src/features/employees/employee-details-page.tsx`
- [ ] T008 [US1] Add per-debt ledger, create-entry, settlement, and debt-against-debt closing interactions for workers
- [ ] T009 [US1] Add API and web tests for internal debt creation, ledger, and settlement

## Phase 3: User Story 2 - External counterparties and debts (P2)

- [ ] T010 [US2] Add external counterparty create/detail/list data flow in API and contracts
- [ ] T011 [US2] Add external counterparty list/create page and detail page in web routes/features
- [ ] T012 [US2] Add external per-debt ledger interactions on the external detail page
- [ ] T013 [US2] Add API and web tests for external counterparty creation and external debt ledger flows

## Phase 4: User Story 3 - Debts hub (P3)

- [ ] T014 [US3] Add debts summary/query output to the API/workspace layer, including both person totals and individual debt cases
- [ ] T015 [US3] Add `/debts` page and sidebar navigation entry
- [ ] T016 [US3] Render internal/external balances with correct sign/color semantics and links
- [ ] T017 [US3] Add web tests for hub rendering and navigation

## Phase 5: Verification

- [ ] T018 Run API tests/typecheck
- [ ] T019 Run web tests/typecheck/lint
- [ ] T020 Run desktop cargo tests
- [ ] T021 Run security and code review agents on final MVP implementation
