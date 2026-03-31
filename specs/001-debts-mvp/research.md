# Research: Debt Management MVP

## Scope decisions

### 1. One shared debt system, two party types
Decision: model debts with one shared debt-case/ledger system and distinguish parties by type:
- `INTERNAL_WORKER`
- `EXTERNAL_COUNTERPARTY`

Why:
- internal workers already exist in the employee table
- external parties need their own reusable directory
- one ledger model keeps calculations, UI, and reporting consistent

### 2. Money-only MVP
Decision: support only money debts in this version.

Included now:
- opening debt
- payment toward balance
- adjustments
- settlement to zero

Explicitly deferred:
- inventory / goods / consumables
- invoice-line debt
- warehouse/project stock-linked debt
- attachments / receipts

### 3. Signed balance convention
Decision:
- positive balance = they owe us = green
- negative balance = we owe them = red
- zero = settled / neutral

Why:
- matches the user's mental model
- balances remain easy to net and settle

### 4. Internal debts live on the worker record
Decision: do not create a second internal person table.

Internal worker debt is reached from:
- existing worker detail flow

Why:
- avoids duplicate identities
- matches user request that worker names do not need to be re-entered

### 5. External parties get dedicated create/detail flows
Decision: create external counterparties on dedicated pages, not inline inside debt forms.

Why:
- matches user expectation that counterparties are reused many times
- aligns with existing project/warehouse dedicated create/detail flow style

### 6. Multiple debt cases per person in MVP
Decision: allow many debt cases for the same worker or external counterparty.

Why:
- the user needs to track separate obligations independently
- one person may have several debts opened at different times
- person totals can still be derived by summing debt-case balances

### 7. Immutable ledger for MVP
Decision: debt movements are append-only.

Why:
- safer audit trail
- easier balance correctness
- easier settlement via compensating entry

Edits/deletes to ledger rows are deferred.

### 8. Settlement closes by net difference
Decision: settlement inserts a compensating ledger entry equal to `-currentBalance` and marks the debt case settled.

Why:
- keeps history intact
- gives a clear final ledger row

### 9. Closing one debt against another needs a small link model
Decision: add a minimal closure-link record between two debt cases.

Why:
- the user wants to know exactly which debt was closed by which other debt
- pure balance math is not enough; closure intent/history matters
- a link row is smaller and safer than introducing a full accounting subsystem now

## Architecture fit

This repo already favors:
- business logic in `apps/api/src/modules/company/company.service.ts`
- repository persistence in `company.repository.ts`
- contracts in `packages/contracts`
- detail pages and tabbed record shells in `apps/web/src/features/shared`

Debt MVP should follow those patterns instead of inventing a new subsystem.

## Risks deferred post-MVP

- integer minor-unit money storage instead of REAL
- multi-currency
- due dates and reminders
- statement export / print
- goods-based or invoice-based debt
- deleting or editing ledger rows
