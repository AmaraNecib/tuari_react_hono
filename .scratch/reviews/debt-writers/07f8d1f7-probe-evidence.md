# Debt writers — runtime probe (pre-fix evidence)

Lane: `fix-debt-writers`. Base: `develop` @ `fdb5dda6`.
Harness: `better-sqlite3` in-memory DB bootstrapped with `ensureDatabaseSchema`
(the production DDL + migrations), real `SqliteCompanyRepository` /
`SqliteInventoryRepository`, `InventoryService` wired to `CompanyService` as the
`DebtService` port. Probe file: `apps/api/src/modules/inventory/debt-writers-probe.test.ts`
(deleted after capture; the numbers become the committed regression tests).

Command:

```
pnpm --filter @tuari/contracts build
cd apps/api && pnpm exec vitest run src/modules/inventory/debt-writers-probe.test.ts --maxWorkers=2 --reporter=verbose
```

Observed stdout (verbatim):

```
PROBE purchase-after-create {"direction":"PAYABLE","currentBalance":-600,"remainingDebtDzd":600}
PROBE purchase-after-pay600 {"direction":"PAYABLE","currentBalance":-1200,"remainingDebtDzd":0}
PROBE outbound-sale {"accounts":[{"direction":"PAYABLE","balance":300}]}
PROBE direct-advance {"direction":"PAYABLE","balance":-5000}
PROBE worker-second-account-created {"direction":"PAYABLE","balance":-4000}
PROBE worker-second-account {"error":"none","accounts":[{"direction":"PAYABLE","balance":-4000}]}
PROBE employee-payment {"signed":300,"balance":1300,"direction":"PAYABLE"}
PROBE payment-on-adjustment {"result":"يمكن تسديد حركات الفتح فقط."}
```

## What each line proves

### D4 — purchase sign / balance invariant (analysis §4.4) — CONFIRMED

Invoice gross 1000, first payment 400 at creation:
`direction=PAYABLE, currentBalance=-600, remainingDebtDzd=600`.
Then `recordInvoicePayment(600)` → `currentBalance=-1200, remainingDebtDzd=0`.

The two payment paths disagree (`OPENING -1000 + PAYMENT +400` at creation vs
`PAYMENT -600` later), so the balance walks away from `remainingDebtDzd` and the
invoice ends paid with the ledger claiming `-1200`. The required invariant
`currentBalance === remainingDebtDzd` fails at the first payment.

### D8 — outbound sale direction (analysis §4.5/§4.9) — CONFIRMED

`transferType=SALE`, `debtAmountDzd=300` → `direction=PAYABLE, balance=300`.
A sale means the buyer owes us; storing it on the default `PAYABLE` ledger
labels it "we owe them". The page also computes `firstPaymentAmount` and sends
only `debtAmountDzd: remainingDebt` (source: `outbound-transfer-create-page-v2.tsx:134`),
so the first payment is dropped.

### D2/D3 — direct salary advance (analysis §4.1/§4.2) — CONFIRMED

`createDebtAccount({ workerId, openingBalanceDzd:-5000, reasonCategory:"SALARY_ADVANCE" })`
with no `direction` → stored `direction=PAYABLE, balance=-5000`. The direction is
never derived from the category; the intent is lost and the account is a
negative payable.

Second account with `direction:"RECEIVABLE"` for the same worker: no error, and
the call returned `direction=PAYABLE, balance=-4000` — i.e. `getDebtAccountByWorkerId`
ignored the requested direction and wrote the `+1000` as an adjustment into the
existing PAYABLE account. A worker cannot hold a RECEIVABLE ledger.

### D7 — employee payment + payment path — CONFIRMED

`createEmployeeDebtEntry(OPENING 1000)` then `(PAYMENT 300)` → `signed=+300,
balance=1300`: a PAYMENT *increases* the balance.

`recordDebtPayment` on a live `ADJUSTMENT` → rejected
`"يمكن تسديد حركات الفتح فقط."` (only OPENING entries are payable).

## Note on D8's literal signs

D8 says `opening = -(remaining)` and `PAYMENT +first`. On the current `PAYABLE`
ledger that is the pre-D1a "receivable stored as a negative payable": with
gross 500 and first 200, `-500 + 200 = -300` (net `+300` = they owe us).
D1a normalises the receivable to `RECEIVABLE` positive, which flips both signs:
`OPENING +gross`, `PAYMENT -first` → `+300`. The implementation uses the
normalised mirror so `direction` and sign agree; the arithmetic is in the
"what changed" section of the analysis doc.
