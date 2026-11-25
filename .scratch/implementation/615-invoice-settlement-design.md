# Issue 615: invoice settlement design and authority gate

Status: owner-approved experimental design and implementation on new disposable databases only. No customer release, normal-startup change, live migration or broader activation is authorized. Base: `baaca20ef708cdf5dfa31538e609f153254a3fba`, PR #637 merge. Canonical worktree: `D:/worktrees/tuari_react_hono/t3-4f67d7fc-5763425d28a679a6`. Tier: high assurance because invoice balances, payment allocations, cancellation and published status contracts change. Verification mode: focused-local / CI-final-enforced; parent reported effective ruleset `26837184`, strict CI acceptance from GitHub Actions app `15368`. Activation documentation remains historically pending; this note does not amend it.

## Authority

Live issue #615 asks for invoice participation and explicitly requires owner design approval for invoice labels/status before enabling this source kind. Live parent #612 states that final schema/contract and permission decisions require owner design approval before financial writers are enabled. Its approval of a proposed test seam and three-slice delivery order is planning approval, not invoice contract approval.

The supervisor in T3 thread `5b204fb7-d188-429b-890b-c64d3193f6a2` relayed the owner's explicit approval after design head `d439dab3f1d65047a55a4bc00da14b1f91ca0bee`: `موافق على هاذ التقسيم للتجربة`. This authorizes the invoice split below for experimentation, implementation and tests on new disposable databases. The relayed decision explicitly approves actual payment allocations including bank/check, live non-cash settled amount, outstanding remaining, the checked total equation, and PAID versus SETTLED precedence. It calls for truthful Arabic labels and existing authorized visibility with RESTRICTED fallback. It is not approval to ship a breaking schema, deploy, release to customers or change normal startup compatibility.

Existing databases must remain untouched and usable by their existing supported mode. Select the new graph only behind explicit experimental opt-in. Unsupported experimental mode must fail closed without mutating an older graph. Keep existing manual/inventory opt-in and normal exact/numeric modes unchanged. Do not add grants or automatic activation. Earlier #613/#614 exclusions remain their historical authority boundaries; this later approval authorizes only the bounded #615 experiment.

The earlier #637 approval remains authority for restricted debt-only source representations, not a new invoice grant. Experimental proof does not establish #615 closure, M4/M10 readiness or #176 completion. Any publication must identify this experimental scope without claiming those gates.

## Existing behavior and source matrix

The exact invoice path is opt-in and distinct from the legacy invoice module. `apps/api/src/modules/invoice/invoice-exact.service.ts` creates a producer-owned obligation on receive; PURCHASE maps to PAYABLE, SALE to RECEIVABLE. `applyAllocations` records actual payments as ledger `PAYMENT` entries, increments `paidAmount`, decreases `remainingAmount`, and sets status to `PAID` only at zero. `voidPayment` reverses live allocations and restores invoice values. `voidInvoice` voids its original, then its payment allocations, and marks it `VOIDED`; this needs a live-settlement guard before invoice writers participate.

| Original | Current source | Settlement eligibility proposal |
|---|---|---|
| Received ordinary PURCHASE invoice | `INVOICE` producer; PAYABLE original entry | Eligible when live, positive remaining and exact source/ledger values agree |
| Received ordinary SALE invoice | `INVOICE` producer; RECEIVABLE original entry | Eligible under the same checks |
| Draft/voided/zero-total invoice | No eligible live positive original | Reject |
| Existing manual and inventory purchase/outbound SALE originals | Existing producer-owned sources, covered by #613/#614 | Reuse existing eligibility; no duplicate document or obligation |
| Payment, settlement/reversal, correction, unsupported source | Not an eligible original | Reject; never reinterpret as an invoice |

All pairings must remain same external-counterparty identity and DZD, opposite directions, live positive originals, and amount within both current balances. Ordinary invoice receiving remains separate from inventory purchase creation. No second stock movement or obligation is created.

## Approved experimental split and truthful labels

Keep invoice `paidAmount` as actual cash paid/received through live payment allocations only. Add `settledAmount` for the live non-cash settlement total, and derive `remainingAmount` from the current invoice original balance after live payments and settlements. Enforce `paidAmount + settledAmount + remainingAmount = totalAmount` for non-voided invoices; reversal decreases `settledAmount` and restores remaining, never paid. An unallocated payment remains cash on its payment record and is not invoice settlement or an allocation.

Use statuses `DRAFT | RECEIVED | SETTLED | PAID | VOIDED`: received with positive remaining is `RECEIVED`; zero remaining with `settledAmount > 0` and no unpaid remainder is `SETTLED` unless actual paid also equals total; zero remaining with `paidAmount === totalAmount` is `PAID`. Mixed cash/non-cash discharge at zero should be `SETTLED`, not `PAID`, to avoid claiming full cash payment. Partial discharge remains `RECEIVED`. This vocabulary and precedence are approved for the experiment only.

Settlement history must label the actual source as `Purchase invoice <invoiceNumber>` or `Sale invoice <invoiceNumber>` when present; otherwise use stable `Purchase invoice <invoiceId>` / `Sale invoice <invoiceId>`. Keep invoice ID as stable identity and link to the invoice detail route. Do not label non-cash settlement “paid”. Any debt-only restricted representation follows the already-approved #637 `RESTRICTED` union and must not leak invoice ID, number, label or URL. The later experimental approval covers truthful invoice-facing labels and the split fields without expanding source authority.

## Experimental schema and compatibility boundary

Parent source inspection confirms that this cannot be implemented as a label-only change. `apps/api/src/modules/invoice/adapters/exact-invoice-schema.ts` marks the invoice slice version 1, restricts persisted status to `DRAFT`, `RECEIVED`, `PAID`, `VOIDED`, and requires `total_amount_minor = paid_amount_minor + remaining_amount_minor` except when voided. Non-cash settlement would violate that current check if actual paid remains truthful.

Experimental storage design under the owner's bounded approval: add a checked nonnegative signed-int64 `settled_amount_minor` column and update the check to include that portion. Permit `SETTLED`, update physical-schema attestation and the slice marker together, and use only a newly initialized disposable graph. Retain the linked settlement records as allocation/history authority, with this invoice field a source-owned projection updated in the same root transaction. Do not migrate or silently reinterpret existing version-1 graphs. Keep their schema definitions, existing initializer and supported startup behavior intact. Add a separate experimentally selected fresh graph and attestation path. Existing modes must still open existing supported graphs. The experimental initializer must refuse unsupported old graphs without writes. Exact marker/initializer changes require financial/schema review, and no experimental default activation is authorized.

Proposed Arabic wording is `مدفوع / مقبوض فعليًا` for recorded payment allocations, `مسوّى دون دفع` for the non-cash portion, and `المتبقي` for remaining. `PAID` is `مدفوعة بالكامل` only for full actual payment, while `SETTLED` is `مسوّاة بالكامل` for full discharge containing non-cash settlement. Bank transfers and checks remain actual payments, not literal physical cash. History uses `فاتورة شراء` or `فاتورة بيع` plus the number, with stable invoice ID fallback where no number exists. Use these truthful labels within the approved experiment; do not relabel existing normal-mode behavior as experimental support.

A concrete decision example is an invoice for 100.00 with 20.00 actually paid and 80.00 settled. It displays paid 20.00, non-cash 80.00, remaining 0.00, `SETTLED`. Reversal restores 20.00, 0.00, 80.00, `RECEIVED`. Voiding the actual payment while a settlement remains changes paid and remaining only and rederives status. A subsequent payment that finishes a partly non-cash invoice must still yield `SETTLED`, not `PAID`.

No new role grants or startup activation are proposed. Existing #637 privacy approval establishes a refusal requirement, not permission to invent invoice-specific source access. The invoice source adapter must trace current invoice-read authority and reuse the restricted representation when absent. If that cannot be expressed with current grants, return the exact unresolved choice to the owner rather than adding one.

## Invariants and implementation boundaries

- Actual paid totals and payment allocation history change only through existing payment workflows. Settlement/reversal never creates, reallocates or duplicates a payment.
- Invoice total and line items, inventory quantity/location/price, project contribution/cost and source identity remain unchanged by settlement/reversal.
- Source owner guards cancellation while any linked settlement is live; error directs operator to reverse first. Reversal restores balances atomically on both sides; then existing cancellation rules apply.
- Validate source ownership, current remaining values, authorization and idempotency inside the existing root transaction. Preserve existing opt-in defaults and source privacy. Experimental schema, contract and writer changes must be isolated behind the new explicit experimental composition. No dependencies, grants or normal-mode breaking changes are authorized.
- Treat all data as disposable. No migration or live data repair.

## Experimental implementation and proof scope

Production seams: `apps/api/src/modules/invoice/invoice-exact.service.ts`, `invoice-exact.repository.ts`, `adapters/sqlite-exact-invoice.repository.ts`, `apps/api/src/modules/company/manual-settlement.service.ts`, exact-finance producer/transaction composition, `apps/api/src/rpc/invoice-exact-router.ts`, and the shared contract in `packages/contracts/src/invoice-exact.ts` plus manual-settlement contracts. UI callers: `apps/web/src/features/invoices/invoices-exact-page.tsx` and shared settlement history/selection components under `apps/web/src/features/debts/` and `apps/web/src/features/externals/`.

Focused proof should start with failing service/repository tests for cash-vs-settled totals, every status transition, partial/full settlement and reversal, void guard, changed-intent retry, stale concurrent payment, atomic rollback and restart persistence. Then exercise authenticated public RPC commands against a fresh native database with received PURCHASE and SALE invoices paired invoice↔invoice, invoice↔inventory and invoice↔manual. Independently read invoice values, allocation records, both ledger balances/history, source documents, stock/project-cost snapshots, and cancellation refusals. Add actual-route UI/browser proof for source labels/links, reload and reversal on desktop/tablet plus mobile fallback and Arabic accessibility. Focused local checks only; no full suites/build/browser run until justified and routed via `heavy_run`. All three parent-coordinated initial review lenses and CI-final acceptance remain required later.

## Evidence and wisdom

The first child committed this note without completing required skills and wisdom reading. That attempt is not an implementation-ready design or independent review. Parent subsequently read the wisdom index, `unslop`, `writing-for-agents`, `domain-modeling`, `codebase-design` and `guard`, and inspected the current contract, exact invoice DDL, invoice service, source selectors and repository guards. The parent found the unaddressed storage check above and added it to the owner decision. No behavioral proof or review verdict is claimed.

Applicable lessons are `architecture/every-new-transaction-bearing-method-must-acquire-the-write-reservation-up-front-plain-db-transaction-re-opens.md` and `architecture/runsynctransaction-composes-nested-wraps-are-savepoint-joins-and-wrapping-every-sync-writer-makes-the-tripwire.md`. Current `ExactInvoiceService.command` uses `finance.runAggregate` and invoice allocations update producer-owned entries synchronously. Preserve that immediate/shared-transaction composition for invoice and paired settlement projections. The async recovery-key lesson was read but its async-port redesign is excluded because no async port conversion is proposed.

Implementation must complete all applicable phase reading and trace source access and physical-schema composition. The owner's later approval removes the experimental split decision blocker, not the financial/schema review and proof gates.

### DDL checkpoint

At `bcca6987f5e83bd3d1d85dce8d9c0aa1993567fb`, the owner authorized one inert experimental schema checkpoint. `apps/api/src/modules/invoice/adapters/experimental-invoice-settlement-schema.ts` derives only from the existing invoice DDL with exact marker and table anchors, failing fast if the source structure drifts. It changes the marker to `invoice_experimental_settlement` version 2, permits `SETTLED`, adds checked `settled_amount_minor`, and enforces total = paid + settled + remaining for non-voided rows. Only the separate experimental initializer uses it. No application composition selects that initializer; `exact-invoice-schema.ts` and the normal marker remain untouched.

`experimental-invoice-settlement-schema.test.ts` uses native `:memory:` SQLite. It checks the ordinary v1 marker/schema remains unchanged, accepts the approved 10000/2000/8000/0 settled row and 10000/2000/0/8000 reversal row, and rejects inconsistent totals, negative/fractional/overflow settlement values and unsupported status. This proves physical DDL constraints only. It does not prove service transitions, initializer isolation, invoice settlement, rollback, actual routes, privacy, or customer compatibility.

The first focused execution failed because the new experimental DDL had no settled column; the second exposed a missing local money-column formatter. Both were corrected. Green focused run: `pnpm --filter @tuari/api exec vitest run src/modules/invoice/adapters/experimental-invoice-settlement-schema.test.ts`, 2 tests passed. `pnpm install --frozen-lockfile` was needed because Vitest was initially unavailable; it completed without downloads. Focused ESLint and `git diff --check` passed. This is only the first small checkpoint, not complete #615 proof or review.

The owner approved the experiment generally. The manager selected this bounded initializer checkpoint; that scope selection does not expand the owner's authority. The DDL remains inert and normal-mode schema is unchanged. Do not claim issue closure, M4/M10 readiness, independent review, customer release or merge readiness. Use three distinct initial sessions for the complete future experimental scope.

### Initializer negative proof checkpoint

The experimental initializer now derives from the current fresh exact plan and substitutes the invoice table and marker only when each source anchor appears exactly once. It reuses the plan's attachment DDL rather than appending duplicates. Native tests reject a missing invoice immutability trigger, mismatched invoice marker, missing experimental app marker, and persisted foreign-key violation, comparing snapshots taken after tampering. The first exact/manual refusal tests used empty in-memory graphs. Parent added a file-backed preservation test for each existing mode after this child stopped. Each creates an ordinary received 100.00 purchase invoice and a 20.00 BANK_TRANSFER payment through the existing commerce services, closes the database, and records its SHA-256. Experimental initialization refuses without schema/marker/write-count changes. The original invoice, payment allocation, ledger account and counterparty are unchanged after refusal and after reopening through the existing initializer, with the closed file's SHA-256 unchanged at both boundaries. These tests cover the two current supported graph shapes, not arbitrary historical databases or deployment.

This was new regression coverage against existing initializer behavior, not an expected-red implementation cycle. The changed initializer test file passed 9 tests, followed by focused ESLint, API typecheck and diff check. Saved runner, original UTF-8 raw outputs and native metadata are under `.scratch/reviews/615/initializer/parent-sentinel/`. No runtime change was needed. Earlier logs and their provenance limits remain intact.

The feature-implement, domain-modeling, codebase-design, unslop and wisdom index were loaded for this checkpoint. The immediate transaction reservation lesson was loaded. The referenced runSyncTransaction wisdom path could not be opened through the read tool despite appearing in the index and scoped file list, so it is not claimed as read. Workflow, TDD and Guard were read earlier. No service or route readiness is claimed.

At the initial authorization checkpoint, no production code, tests, flags, schema or dependencies had changed. The design is not independently reviewed, published or merge-ready. Use three distinct initial sessions at the complete committed experimental HEAD, then bounded corrections and current-head verification. Broader issue closure and release remain unauthorized.

### Experimental contract checkpoint

A separate `experimentalExactInvoiceSchema` now requires `settledAmount`, permits `SETTLED`, checks exact paid + settled + remaining equality with `Money`, and refuses `PAID` unless actual paid equals total. The existing v1 `exactInvoiceSchema` remains unchanged. Focused contract tests cover the 100/20/80/0 example, incorrect totals and PAID distinction. This does not implement or prove experimental repository/service lifecycle, allocation or reversal behavior.
