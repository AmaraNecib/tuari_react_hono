# Data Model: Debt Management MVP

## 1. External Counterparty

Represents an outside person or company contact reused across debt records.

Fields:
- `id`
- `fullName`
- `phoneNumber`
- `note`
- `createdAt`
- `updatedAt`

Rules:
- full name is required
- phone number follows existing Algerian phone validation rules

## 2. Debt Case

Represents one specific money obligation for one party.

Fields:
- `id`
- `partyType` = `INTERNAL_WORKER | EXTERNAL_COUNTERPARTY`
- `workerId?`
- `externalCounterpartyId?`
- `status` = `OPEN | SETTLED`
- `currentBalanceDzd`
- `note?`
- `settledAt?`
- `createdAt`
- `updatedAt`

Rules:
- exactly one linked party is allowed
- many debt cases may exist for the same worker/counterparty
- positive balance means they owe us
- negative balance means we owe them

## 3. Debt Entry

Append-only ledger entry affecting the current balance.

Fields:
- `id`
- `debtAccountId`
- `entryType` = `OPENING | PAYMENT | ADJUSTMENT | SETTLEMENT`
- `signedAmountDzd`
- `entryDate`
- `note?`
- `balanceAfterDzd`
- `actorUserId`
- `actorLabel`
- `transactionId`
- `createdAt`
- `updatedAt`

Rules:
- append-only in MVP
- `SETTLEMENT` always brings balance to zero
- `balanceAfterDzd` is stored for easy UI and audit review

## 4. Debt Closure Link

Represents the act of closing one debt case against another debt case.

Fields:
- `id`
- `sourceDebtAccountId`
- `targetDebtAccountId`
- `closedAmountDzd`
- `entryDate`
- `note?`
- `actorUserId`
- `actorLabel`
- `transactionId`
- `createdAt`
- `updatedAt`

Rules:
- closure history is append-only in MVP
- closure can leave a residual balance on one side when the two debts do not cancel exactly

## Relationships

- one `ExternalCounterparty` can have many debt cases
- one `Employee` can have many debt cases
- one `DebtCase` has many `DebtEntry`
- one `DebtCase` can participate in many `DebtClosureLink` rows

## Derived values

- debt-case net balance = latest `currentBalanceDzd` or sum of signed entries
- person total balance = sum of all linked debt-case balances
- positive display label = `لنا عنده`
- negative display label = `علينا له`
- zero display label = `مغلق`
