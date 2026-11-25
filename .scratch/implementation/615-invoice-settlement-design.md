# Issue 615: invoice settlement design and authority gate

Status: unapproved design only. No invoice financial writer is enabled by this phase. Base: `baaca20ef708cdf5dfa31538e609f153254a3fba`, PR #637 merge. Canonical worktree: `D:/worktrees/tuari_react_hono/t3-4f67d7fc-5763425d28a679a6`. Tier: high assurance because invoice balances, payment allocations, cancellation and published status contracts change. Verification mode: focused-local / CI-final-enforced; parent reported effective ruleset `26837184`, strict CI acceptance from GitHub Actions app `15368`. Activation documentation remains historically pending; this note does not amend it.

## Authority

Live issue #615 asks for invoice participation and explicitly requires owner design approval for invoice labels/status before enabling this source kind. Live parent #612 states that final schema/contract and permission decisions require owner design approval before financial writers are enabled. Its approval of a proposed test seam and three-slice delivery order is planning approval, not invoice contract approval.

Existing approval evidence is limited: `.scratch/implementation/637-source-privacy-contract-proposal.md` records owner approval for restricted debt-only source representations and UI behavior. This approves neither invoice cash/non-cash/status semantics nor settlement labels. `.scratch/implementation/613-design.md` and `.scratch/implementation/614-inventory-sale-settlement-design.md` explicitly exclude #615. No exact source found in these records approves the required invoice contract. **Owner decision required before implementation:** approve or revise the proposed contract below, especially status vocabulary and source/history labels. Keep writers disabled until that decision is recorded against this design or a superseding owner-approved artifact.

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

## Proposed owner decision: truthful invoice fields and labels

Keep invoice `paidAmount` as actual cash paid/received through live payment allocations only. Add `settledAmount` for the live non-cash settlement total, and derive `remainingAmount` from the current invoice original balance after live payments and settlements. Enforce `paidAmount + settledAmount + remainingAmount = totalAmount` for non-voided invoices; reversal decreases `settledAmount` and restores remaining, never paid. An unallocated payment remains cash on its payment record and is not invoice settlement or an allocation.

Use statuses `DRAFT | RECEIVED | SETTLED | PAID | VOIDED`: received with positive remaining is `RECEIVED`; zero remaining with `settledAmount > 0` and no unpaid remainder is `SETTLED` unless actual paid also equals total; zero remaining with `paidAmount === totalAmount` is `PAID`. Mixed cash/non-cash discharge at zero should be `SETTLED`, not `PAID`, to avoid claiming full cash payment. Partial discharge remains `RECEIVED`. **This vocabulary and precedence require owner approval.**

Settlement history must label the actual source as `Purchase invoice <invoiceNumber>` or `Sale invoice <invoiceNumber>` when present; otherwise use stable `Purchase invoice <invoiceId>` / `Sale invoice <invoiceId>`. Keep invoice ID as stable identity and link to the invoice detail route. Do not label non-cash settlement “paid”. Any debt-only restricted representation follows the already-approved #637 `RESTRICTED` union and must not leak invoice ID, number, label or URL. **Owner approval is still required for the invoice-facing labels and status/wire fields; #637's privacy approval alone does not cover them.**

## Schema and rollout decision still required

Parent source inspection confirms that this cannot be implemented as a label-only change. `apps/api/src/modules/invoice/adapters/exact-invoice-schema.ts` marks the invoice slice version 1, restricts persisted status to `DRAFT`, `RECEIVED`, `PAID`, `VOIDED`, and requires `total_amount_minor = paid_amount_minor + remaining_amount_minor` except when voided. Non-cash settlement would violate that current check if actual paid remains truthful.

Proposed storage decision, not authorization: add a checked nonnegative signed-int64 `settled_amount_minor` column and update the check to include that portion. Permit `SETTLED`, update physical-schema attestation and the slice marker together, and use only a newly initialized disposable graph. Retain the linked settlement records as allocation/history authority, with this invoice field a source-owned projection updated in the same root transaction. Do not migrate or silently reinterpret existing version-1 graphs. Exact marker/initializer changes need review against the current composition before implementation. Owner approval must cover this storage and refusal boundary as well as labels and wire fields.

Proposed Arabic wording is `مدفوع / مقبوض فعليًا` for recorded payment allocations, `مسوّى دون دفع` for the non-cash portion, and `المتبقي` for remaining. `PAID` is `مدفوعة بالكامل` only for full actual payment, while `SETTLED` is `مسوّاة بالكامل` for full discharge containing non-cash settlement. Bank transfers and checks remain actual payments, not literal physical cash. History uses `فاتورة شراء` or `فاتورة بيع` plus the number, with stable invoice ID fallback where no number exists. These labels are proposed, not approved.

A concrete decision example is an invoice for 100.00 with 20.00 actually paid and 80.00 settled. It displays paid 20.00, non-cash 80.00, remaining 0.00, `SETTLED`. Reversal restores 20.00, 0.00, 80.00, `RECEIVED`. Voiding the actual payment while a settlement remains changes paid and remaining only and rederives status. A subsequent payment that finishes a partly non-cash invoice must still yield `SETTLED`, not `PAID`.

No new role grants or startup activation are proposed. Existing #637 privacy approval establishes a refusal requirement, not permission to invent invoice-specific source access. The invoice source adapter must trace current invoice-read authority and reuse the restricted representation when absent. If that cannot be expressed with current grants, return the exact unresolved choice to the owner rather than adding one.

## Invariants and implementation boundaries

- Actual paid totals and payment allocation history change only through existing payment workflows. Settlement/reversal never creates, reallocates or duplicates a payment.
- Invoice total and line items, inventory quantity/location/price, project contribution/cost and source identity remain unchanged by settlement/reversal.
- Source owner guards cancellation while any linked settlement is live; error directs operator to reverse first. Reversal restores balances atomically on both sides; then existing cancellation rules apply.
- Validate source ownership, current remaining values, authorization and idempotency inside the existing root transaction. Preserve opt-in defaults and source privacy. No schema, contract, writer, flag or dependency changes in this design phase.
- Treat all data as disposable. No migration or live data repair.

## Likely code and proof scope after approval

Production seams: `apps/api/src/modules/invoice/invoice-exact.service.ts`, `invoice-exact.repository.ts`, `adapters/sqlite-exact-invoice.repository.ts`, `apps/api/src/modules/company/manual-settlement.service.ts`, exact-finance producer/transaction composition, `apps/api/src/rpc/invoice-exact-router.ts`, and the shared contract in `packages/contracts/src/invoice-exact.ts` plus manual-settlement contracts. UI callers: `apps/web/src/features/invoices/invoices-exact-page.tsx` and shared settlement history/selection components under `apps/web/src/features/debts/` and `apps/web/src/features/externals/`.

Focused proof should start with failing service/repository tests for cash-vs-settled totals, every status transition, partial/full settlement and reversal, void guard, changed-intent retry, stale concurrent payment, atomic rollback and restart persistence. Then exercise authenticated public RPC commands against a fresh native database with received PURCHASE and SALE invoices paired invoice↔invoice, invoice↔inventory and invoice↔manual. Independently read invoice values, allocation records, both ledger balances/history, source documents, stock/project-cost snapshots, and cancellation refusals. Add actual-route UI/browser proof for source labels/links, reload and reversal on desktop/tablet plus mobile fallback and Arabic accessibility. Focused local checks only; no full suites/build/browser run until justified and routed via `heavy_run`. All three parent-coordinated initial review lenses and CI-final acceptance remain required later.

## Evidence and wisdom

The first child committed this note without completing required skills and wisdom reading. That attempt is not an implementation-ready design or independent review. Parent subsequently read the wisdom index, `unslop`, `writing-for-agents`, `domain-modeling`, `codebase-design` and `guard`, and inspected the current contract, exact invoice DDL, invoice service, source selectors and repository guards. The parent found the unaddressed storage check above and added it to the owner decision. No behavioral proof or review verdict is claimed.

Applicable lessons are `architecture/every-new-transaction-bearing-method-must-acquire-the-write-reservation-up-front-plain-db-transaction-re-opens.md` and `architecture/runsynctransaction-composes-nested-wraps-are-savepoint-joins-and-wrapping-every-sync-writer-makes-the-tripwire.md`. Current `ExactInvoiceService.command` uses `finance.runAggregate` and invoice allocations update producer-owned entries synchronously. Preserve that immediate/shared-transaction composition for invoice and paired settlement projections. The async recovery-key lesson was read but its async-port redesign is excluded because no async port conversion is proposed.

Implementation must still complete all applicable phase reading, trace source access and physical-schema composition, and receive explicit owner approval. No production code, tests, flags, schema or dependencies have changed. The design-only checkpoint is not reviewed, published or merge-ready.
