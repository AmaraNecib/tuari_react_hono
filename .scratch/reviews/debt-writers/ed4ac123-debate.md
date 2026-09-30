# Debt writers (PR #464) — adversarial review, critic + defender

Lane: `fix-debt-writers`. Range: `git diff bfb87fbd...HEAD` (bfb87fbd = merged
terminology PR #447, already on develop). Reviewed code commit `26ec96eb`
(PR head before this review); fixes landed in `ed4ac123`.

Harness: critic + defender sub-agents on a fresh context, then parent
synthesis. Every finding below was re-verified against the current code before
it was fixed or dismissed.

## Findings and verdicts

| # | Sev | Finding | Verdict |
|---|---|---|---|
| 1 | Blocker (8) | `createEmployeeDebtEntry` honours an explicit `direction` *before* the entry-type or reason-category law. `{entryType:"ADVANCE", direction:"PAYABLE"}` stores the advance on the PAYABLE ledger — the D1a inversion `ed4ac123` exists to prevent. | Fixed |
| 2 | Blocker (7) | `createEmployeeDebtEntry` never forwards `reasonCategory` into `createDebtAccount`, so the D2 category lock is dead on the employee path. `{entryType:"OPENING", reasonCategory:"SALARY_ADVANCE"}` lands PAYABLE. | Fixed |
| 3 | Major (7) | `employeeDebtEntryCreateInputSchema` accepts `direction` + `reasonCategory` with no cross-check, so the contradiction is accepted at the wire. | Fixed |
| 4 | Major (5) | Contract JSDoc for `debtAmountDzd` says "value minus any first payment", while the service treats it as the *full* value and the web page sends `totalAmount`. Two mutually inconsistent docs in one commit. | Fixed (doc) |
| 5 | Major (5) | `apps/web/debt-create-page.tsx` hand-copies `debtReasonCategoryDirectionMap` into `DEBT_CATEGORIES[].impliedDirection`; the D1a flip had to be edited in two files. Breaks the "one derivation" standard. | Fixed (uses `getLockedDirectionForCategory`) |
| 6 | Medium (4) | `getEmployeeDebtAccount` returns `accounts[0]` of a worker who now legitimately has two ledgers; the reader is direction-blind. | Deferred — no live caller; needs a contract decision (see below) |
| 7 | Medium (6) | `createDebtEntry` passes `signedAmountDzd` through unchanged, so `{entryType:"PAYMENT", signedAmountDzd:+100}` would add. The "sign by entry type" law lives only in `createEmployeeDebtEntry`/`recordDebtPayment`. | Dismissed — pre-existing generic signed-amount API, not changed by this PR; the web payment dialog signs by balance sign and is correct under both sign conventions |
| 8 | Low (3) | Raw enum interpolated in user-facing Arabic copy: `اتجاه الحساب محدد حسب سبب الدين (RECEIVABLE).` | Fixed (shared message constant, no enum) |
| 9 | Low | `debt_account_external_counterparty_unique` (single-column) might survive and block a D8 RECEIVABLE for a counterparty with an existing PAYABLE. | Disproved — `applyDebtAccountDirectionMigration` drops it and creates the `(external_counterparty_id, direction)` composite (`schema.ts:1346-1354`) |
| 10 | Low | Composite `(worker_id, direction)` unique does not dedupe if legacy `direction` is NULL. | Disproved — `debt_account.direction` is `NOT NULL DEFAULT 'PAYABLE'` (`schema-definitions.ts:290`); the PR test also proves it with a raw duplicate INSERT |
| 11 | Low | Sign law re-implemented inline in `inventory.service.ts` rather than one shared signer. | Deferred — extracting it would touch the D5 invoice port, which is out of scope |
| 12 | Low | `createEmployeeDebtEntry` has no overpay guard, unlike `recordDebtPayment`. | Dismissed — overpay is a modelled credit state (`creditWithUs` / `creditWithThem`); the wire already rejects non-positive amounts. Not a direction inversion |

## What the defender got right (kept)

- D4 purchase signs close: `OPENING +gross`, `PAYMENT −paid`, 1000/400/600.
- D8 outbound: `OPENING +total`, `PAYMENT −first`, balance = still-on-credit.
- D7: the OPENING-only payment guard is correctly removed; any LIVE entry can
  be paid; `voidDebtEntry` recomputes from LIVE entries.
- The single `getLockedDirectionForCategory` accessor replaces a throwing
  variant that was a footgun for `INVOICE_DRIVEN`.

## Deferred, with a decision for the parent

`getEmployeeDebtAccount` (`finance.service.ts:80`) returns `accounts[0]` over a
list that, under D3, can hold a PAYABLE and a RECEIVABLE ledger. It has **no
live caller**: its only consumer, `EmployeeDebtPanel`, is not rendered anywhere
(grep over `apps/web/src`); the live party view is `DebtCasesPanel`, which takes
the account list. A correct fix changes the `employeeDebtAccountGet` RPC shape
from one account to a list (or a net), which is a contract decision, not a
sign fix. Proposed follow-up: fold it into the existing #458 (direction never
optional) or a new issue that redefines the single-account read.
