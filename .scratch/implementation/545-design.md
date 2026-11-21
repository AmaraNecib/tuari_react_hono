# #545 opening balances: accepted foundation and audited corrections

## Approved continuation

The owner confirmed #558 merge and approved extending financial schema and payroll contracts in this lane. Accepted develop ede97c99 is integrated non-destructively at be43dc6b; prior preservation commits remain. Earlier inventory below describes the old base, not current implementation authority.

The owner explicitly approved immutable corrections, including decreases from 2,000 to 1,900 or 200. Each correction retains original source identity, previous/new exact amount, authenticated actor, time and reason. Confirmation must disclose the actual delta. No historical event is overwritten or deleted. Corrections below already settled cash require explicit reconciliation, not a silent new advance or negative remaining balance. Ordinary downward corrections above the settled amount are allowed.

Implement persisted review metadata and source links behind PayrollOpeningReviewProvider, using existing ExactFinanceService aggregate receipts and producer-owned originals/corrections. Read history from immutable ledger entries, not a second balance store. Add authenticated opening review and correction procedures to existing payroll composition. Extend existing cash and repayment selection for reviewed opening sources; never introduce another payment writer. Opening values do not become employee earnings or labor cost. No automatic advance netting.

Agreed proof seam: current authenticated application procedures and actual employee/payroll UI, backed by plain/keyed persisted SQLite. Work vertically with focused failures before implementation. First core scenario: review wages 2,000 and advances 300, correct wages to 1,900 then 200, retain original and both audited corrections. Separate direction and zero-review coverage follow. Integration must prove 5,000 + 35,000 - 30,000 = 10,000 with cost 35,000.

Mode remains focused-local / CI-final-pending; High-assurance money/schema/contract scope. Prior clean reviews at 54dafc0f do not establish readiness of this continuation. Obtain three initial lenses on complete new committed scope. Shared interfaces now belong to this lane after merged #558; preserved #427 remains read-only.

---

## Revision and authority

- Spec: live GitHub #545, with #427, #544 and #558 read before implementation.
- Worktree: `D:/worktrees/tuari_react_hono/t3-b5f3c07c-cd6aac91ae99e283`.
- Branch: `chore/issue-545`. Initial HEAD was `17911dc1`; the clean tree was fast-forwarded to fresh `origin/develop`, `afe193e40ef3e9644dcfde6a68d71aa476563fb4`.
- Mode: remote issue data, `focused-local / CI-final-pending`. The current protection read returned HTTP 404, Branch not protected. No protection change is authorized.
- Tier: High-assurance. Historical cash must not become invented wages, receivables or project labor cost. Future opening corrections must not duplicate or net obligations.
- This portion adds preservation regression proof and an implementation inventory only. It does not deliver opening entry, review persistence, reminders, corrections or settlement integration. No publication or merge is part of this portion.

## Existing-code inventory

### Accepted develop

`packages/contracts/src/workforce.ts` and `workforce-contract.ts` expose exact salary references and explicit employee earning approvals. `apps/api/src/rpc/handlers/workforce.ts` authenticates their normal-app paths. `WorkforceService.approveEmployeeEarning` persists explicit approvals through `employee-earnings.repository.ts`; it does not create a payroll obligation. `createSalaryPayment` rejects new legacy numeric writes. The existing `salaryPaymentsList` still reads historical payments.

`SqliteProjectCostRepository.listProjectSalarySplits` reads approved earning segments. Historical cash and reference salary are not an earning source. Preserve this separation.

The exact debt module already supports distinct worker PAYABLE and RECEIVABLE accounts, original-entry attribution, corrections and payments, and producer ownership including `PAYROLL_OPENING`. Those primitives are not an accepted employee opening-review contract. The normal application root/router still uses the existing finance service and has no payroll opening-review, payroll cash, advance-recovery or opening-correction procedure. Do not expose the opt-in finance module as a second payroll writer.

### Preserved #427 work, inspected read-only

Tree: `D:/worktrees/tuari_react_hono/feat-issue-427-independ-2565729f7d01eaa8`, branch `feat/issue-427-independent`, inspected HEAD `bb4aa26e`.

Read `.scratch/implementation/527-payroll-backend-design.md`, `packages/contracts/src/workforce-exact.ts`, and `apps/api/src/modules/company/payroll-cash.service.ts`. The tree has unrelated and relevant uncommitted edits, including payroll service, tests, repository and SQLite adapter. Nothing was copied, cherry-picked, reset or edited there.

Its `PayrollCashService` has `reviewOpening`, `openingStatus`, `recordCash`, `repayAdvance`, lifecycle reads and earning corrections. The design describes shared exact-finance aggregate transactions and separate opening wage/advance source links. It distinguishes UNREVIEWED from reviewed zero and retains a reminder after cash. These are reuse candidates, not accepted interfaces or verified delivery here.

Important gap: `correctEarning` corrects an earning original, not an opening original. `reviewOpening` refuses an already REVIEWED opening. Opening-balance corrections therefore still need an accepted operation and supported post-settlement policy. Do not pretend earning corrections satisfy #545 opening corrections.

No opening-balance form or correction UI was found in the preserved employee UI inventory. Existing approval UI and later local refinements are not prerequisites.

## Terminology and state transitions

Opening wages owed are company PAYABLE obligations to the worker. Opening recoverable advances are company RECEIVABLE obligations from the worker. Both may exist at once; neither is a net balance. An opening amount is never approved current-period earnings or project labor cost.

UNREVIEWED means historical obligations are unknown, not zero. Skipping the optional previous-balance step leaves that status intact. Recording cash does not review the opening balance. The reminder remains visible before subsequent payments until explicit review, even if a first payment already occurred.

An explicit review records separate nonnegative bounded DZD wage and advance amounts. Reviewed zero in both directions means confirmed settled opening status. This is an opening-review fact, not a claim that later earnings are fully paid. Later corrections preserve the original obligation identity, previous and new values, actor, timestamp and reason. Settlement history stays linked to the authoritative originals.

These are issue requirements, not a new wire enum or storage decision. The accepted #558 contract must determine concrete representations.

## Independent scope now

Add an authenticated normal-root regression with a disposable persisted legacy fixture. Seed historical payments below and above a reference salary, with a project split, through fixture SQL because the retired writer correctly rejects new writes. Read through real authenticated application procedures. Change the reference salary, explicitly approve new earnings, close and reopen, and verify:

1. Historical rows, split and audit remain unchanged.
2. Historical cash and reference changes create no approved earnings or legacy debt accounts.
3. Only the explicit new approval contributes the independently expected 35,000 DZD project labor cost.
4. Reopen preserves both old records and the explicit approval, without reconstructing history.

The issue already names authenticated application paths as the proof seam. No new test seam, schema, API or production writer is introduced. This is characterization/regression proof of accepted behavior, not a claimed red-to-green feature implementation. Plain SQLite proof alone does not establish encrypted acceptance.

## Dependency-bound scope and ownership

#558 is OPEN and no accepted payment foundation is present in the pinned base. The following require its accepted interfaces:

- Reading and atomically recording opening review with two authoritative obligation links and audited retry identity.
- Reading payment-time review status independently of payment count, and committing payment without implicitly reviewing opening balances.
- Applying explicit settlements to opening wages or opening advances with correct direction and unchanged labor cost.
- Correcting reviewed opening amounts through original obligation identities, with attributable before/new values and a defined policy when the proposed amount is below already-settled cash.

The independent test and this design are this lane's only changed files. #558 owns payment composition, financial schema, authoritative settlement and its contracts. After it lands, coordinate before changing `workforce.ts`, `workforce-contract.ts`, workforce handlers/root, the employee details page or payment UI. #545 then owns opening-entry/review/correction UI and tests on accepted interfaces. #559 and #560 do not otherwise block this issue.

Do not add an employee flag, side ledger, mock payment callback, numeric opening writer or disconnected form to simulate integration. A form without a durable review contract cannot safely distinguish a saved zero from unknown history. No production implementation is independently safe on the current accepted model.

## Connected proof after #558

Use failing-first tests at accepted authenticated procedures and affected Playwright flows, with exact decimal strings and independent expected values:

| Case | Required result |
| --- | --- |
| Opening wage 5,000; approved earnings 35,000; actual wage payments 30,000 | 10,000 wages owed; project labor cost 35,000 |
| Opening wages plus opening advance | Separate payable and receivable originals; wage payment never reduces advance |
| Skip previous balance, pay once, pay again, reopen | Payment succeeds; UNREVIEWED and reminder remain; no implied zero |
| Explicit reviewed zero | Confirmed settled opening; no reminder or invented obligation |
| Correct either opening direction | Stable original identity; previous/new values, real actor, time and reason; no duplicate obligation/cost |
| Wrong employee/direction, invalid amount, missing reason, unauthorized mutation | Rejected before financial effects |
| Source/ledger/receipt write failure and uncertain retry | Atomic rollback; one successful retry; no duplicate history |
| Reopen plain and keyed storage | Identical obligation, correction, settlement and review facts |

Run selected browser proof only after a real reachable UI path exists. Do not mark an acceptance checkbox complete from the independent preservation test. Keep the same worktree and commits, integrate merged #558 non-destructively, then obtain the required three local review lenses, current-head CI and hosted verdict before claiming delivery.

## Architecture and lessons

Architecture: no seam moved. The regression uses the accepted application router and existing persistence factory. Deleting a speculative opening abstraction now would remove unused code rather than eliminate duplicated caller complexity, so none is introduced.

Applied wisdom: omitted opening values must not be defaulted to zero (`testing/a-client-side-default-survives-a-server-default-removal.md`); actual authenticated persistence is stronger than mocked invocation assertions; Vitest fixtures still need typecheck. No recurring new lesson is claimed.
