# Exact inventory, issue 526

## Authority and pinned source

Worktree: `D:/worktrees/tuari_react_hono/feat-issue-526-exact-in-da397aaed7b07936`.
Base and fetched develop: `67976664217b8c80d79dca85558aa5c8ee20adbb`, merge of PR538 reviewed head `090f181b8c29ae1e89caf096d68f4df87ae0696c`. Both ancestry and clean source checked before edits. Independent owner may publish an opt-in develop PR; manual owner merge and actual UI approval remain required. No successors.

High-assurance: reachable stock loss, monetary rounding, debt attribution and duplicate project cost. Mode is focused-local / CI-final-enforced. Ruleset26837184 was read live: active develop, strict CI acceptance from app15368, no bypass actors, resolved threads. Recheck effective protection and current-head CI before merge. Repository activation documents describe older pending state, not authority to alter protection.

Issue526 and parent520 were read live. Approved ADR0001 and its full contract/27-field classification, caller matrix523 and merged524 dependency handoff govern representation. Default app contracts, repositories and production startup remain numeric until530. Fixture DDL is not a migration. No invoice/payment/workforce/expense implementation, date/currency UI, production schema or crypto changes.

## Ownership and callers

One inventory writer owns purchase, outbound and charges. No parallel inventory writers. Inventory source comprises the existing1573-line service,1027-line native adapter,450-line charge service,266-line charge adapter, contracts/RPC and direct forms. Keep purchase/outbound/charge changes together until their shared transaction and stock paths are mapped.

| Monetary owner | Exact representation | Direct writers and readers |
| --- | --- | --- |
| inventory_invoice_group | gross_total_minor, paid_amount_minor, remaining_debt_minor INTEGER; immutable DZD | createInvoiceGroup/receiveInventory, recordInvoicePayment; inventory repository; invoice create/detail/list and payment dialog |
| inventory_entry | optional unit_price_units INTEGER4; price_source TEXT with exact mode/operands; no competing rounded total | consumable product or asset-price sum; entry/location/report/movement readers; item editor and transfer picker |
| inventory_asset_unit | purchase_price_minor INTEGER2 | per-asset purchase; default placement charge; asset detail, location and project equipment readers |
| inventory_outbound_transfer_item | optional unit_price_units INTEGER4 and nullable price_source TEXT | outbound creation, persisted transfer/history, multi-source picker and both outbound forms |
| inventory_asset_charge | amount_minor INTEGER2 | purchase-to-project and transfer placements; default/override/update/void, project cost and history |
| inventory_asset_charge_revision | previous_amount_minor INTEGER2, nullable new_amount_minor INTEGER2 for void | correction/void atomic revision, history reader |

Direct nonmoney stock writers remain in scope: consumable balances, asset location and movements. Existing six-place quantity normalization, selected option/source availability, actual stock/request delta checks, item offer rules and per-balance movement attribution from merged450 must survive. Tests in outbound-transfer-availability and item-offer-equivalence are source invariants, not permission to remove their negative cases.

Direct transport: packages/contracts/src/inventory.ts and inventory-contract.ts; API rpc/handlers/inventory.ts and handler-inputs.ts. Opt-in exact contracts/router are additive rather than numeric replacements. Direct UI lives under features/inventory. Project-cost/report readers require exact inventory contributions, with no purchase-plus-placement double count and no numeric money bridge. Later report aggregation ownership must not be silently absorbed.

## Domain and interfaces

A purchase group is the finalized document. An exact line retains entered4 price times independent six-place quantity or authoritative agreed total/quantity. Asset-group mean retains sum/count, never a four-place rounded authority. Sum all exact lines before half-away document finalization. Preserve per-asset identified finalized prices and deterministic recorded remainder order where an agreed amount is allocated. Optional valuation absent, NULL and explicit zero stay distinct.

A placement charge is a finalized project event, not a debt entry or rental rate. Its correction records old/new amounts; void records NULL new amount. Purchase to a project and later transfers create charge events under existing semantics; cost readers count live charges once, not asset purchase again.

Debt originals use immutable producerType INVENTORY_PURCHASE or INVENTORY_OUTBOUND plus producerId, as agreed with525. Purchase is PAYABLE, outbound is RECEIVABLE. Gross and paid remain separate. Targeted payments and attributed corrections/voids must leave unrelated obligations intact. Generic debt commands cannot bypass producer domain invariants.

The public application-service/opt-in RPC seam with real native storage is the approved integration seam from520. Contracts and exact source arithmetic support this interface. Use literal worked expected values and persisted state for stock/debt atomicity; do not substitute mock calls or raw inserts for ledger operations.

## Atomicity and replay

A durable whole-operation receipt fingerprints canonical normalized intent and actor, excluding attempt transactionId. Receipt, aggregate, stock, movements, charges and debt commit together under the same database, same FifoLock and immediate synchronous transaction. Decision reads occur after reservation. No await inside the callback, second connection lock, numeric bridge, or nested debt receipt used as aggregate authority. Savepoint nesting must preserve outer rollback.

525 alone owns debt DTO/service/repository/adapters/schema and money-schema-gate. Requested inventory marker version1 and physical checks use the above column names. Required new producer-scoped ledger and aggregate receipt interfaces are not yet merged. Domain-only work may proceed against merged arithmetic and quantity helpers. Final integration/proof/publication waits for actual develop merge, without stacks, cherry-picks or copied shared implementation.

## Local proof and reviews

Focused failing-first cases: exact product sum0.375+0.375=0.75, price4 times quantity6, agreed10000/300, asset shares and optional zero; gross/paid/debt plus targeted payment; rollback after stock/charge/debt writes, replay/conflict and reopen; competing connections and foreign FIFO holder; selected-source exhaustion and repeated option picks; charge old/new/void and no duplicate cost; JSON and actual opt-in inputs/views.

Relevant contracts/API/web lint and typecheck. Full suites/builds remain CI-final unless a concrete gap is recorded. Build contracts only when required for affected API execution, through heavy_run. Three distinct initial Luna sessions debate/test-audit/code-review at a frozen committed SHA; bounded fixes get a fresh combined-delta review. Shared-family exception must record actual IDs. Parent inspects changed interfaces and direct callers after review.

Public synthetic actual-component cropped native-pixel images, equal-width before/after table per surface, real interaction recording, public SHA/MIME download verification and owner approval are merge gates. No prototype substitutes or private logs published.

## Wisdom

Apply recorded allocation remainder conservation, immediate write reservation, same-FIFO savepoint composition and deterministic concurrency tests. Historical async transaction examples do not override the current synchronous exact contract. No new wisdom lesson is justified yet.

## Current boundaries

Only planning and source inspection are complete. No implementation, execution, review, hosted verdict, publication, activation or issue closure is claimed by this note. Disk was checked before offline frozen install with scripts disabled. No packages added. Native binding availability still requires execution proof.
