# Implementation Plan: Debt Management MVP

**Branch**: `001-debts-mvp` | **Date**: 2026-03-27 | **Spec**: `specs/001-debts-mvp/spec.md`
**Input**: Feature specification from `/specs/001-debts-mvp/spec.md`

## Summary

Add a minimal debt management feature that supports internal worker debts and external counterparties using a shared append-only money ledger. Internal debt details will live on the worker detail experience, while external parties will use dedicated list/create/detail pages. Each person may have multiple separate debt cases, each debt case has its own ledger, and the UI shows both per-person totals and individual debt cases.

## Technical Context

**Language/Version**: TypeScript 5.x, Rust (desktop support unchanged)  
**Primary Dependencies**: React, TanStack Router, TanStack Query, Hono, oRPC, Better Auth, Prisma, better-sqlite3  
**Storage**: SQLite via Prisma + schema bootstrap SQL  
**Testing**: Vitest, TypeScript typecheck, ESLint, cargo test  
**Target Platform**: Web app and local Tauri desktop shell  
**Project Type**: Monorepo web + API + desktop app  
**Performance Goals**: Small admin tables and detail pages should remain responsive with current in-memory snapshot sizes  
**Constraints**: MVP only, money-only, no critical/high regressions, reuse existing routing/shell/audit patterns  
**Scale/Scope**: One debts hub, one worker debt tab, one external counterparty list/create/detail flow, multiple debt cases per person, append-only ledger, minimal debt-against-debt closure history

## Constitution Check

No project constitution is currently defined. This feature will follow existing repo quality gates:
- keep tests/typecheck/lint green
- follow existing audit and auth patterns
- keep scope MVP-only

## Project Structure

### Documentation (this feature)

```text
specs/001-debts-mvp/
├── spec.md
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
└── tasks.md
```

### Source Code (repository root)

```text
apps/api/src/
├── infrastructure/
├── modules/company/
├── rpc/
└── app/

apps/web/src/
├── features/app-shell/
├── features/employees/
├── features/shared/
├── lib/
└── i18n/

packages/contracts/src/
```

**Structure Decision**: Extend the existing company service/repository and app-shell/detail page architecture instead of creating a new independent module.

## Implementation approach

### Phase 1 - Foundation
- Add debt and external-counterparty schemas/contracts
- Add SQLite/Prisma schema support
- Add repository and service methods
- Add RPC endpoints and workspace snapshot support

### Phase 2 - MVP user stories
- **US1 / P1**: internal worker debt tab with per-person totals, per-debt list, ledger, and settlement
- **US2 / P2**: external counterparty list/create/detail + debt ledger
- **US3 / P3**: debts hub page summarizing internal and external balances

### Phase 3 - Verification
- API tests for repository/service/router behavior
- Web tests for routes, forms, worker debt tab, external create flow, and balance semantics
- Full web/api typecheck + lint + cargo test

## Complexity Tracking

No planned constitutional violations or justified complexity exceptions.
