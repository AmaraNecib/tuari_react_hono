# Issue #427 salary domain design

Status: product semantics and reuse of the existing debt ledger approved by the owner. The owner accepted separating approved wages from actual payments, with the employee's reference salary used as a suggested default rather than a third required entry. The owner then confirmed one existing debt source, with salary operations increasing or decreasing it. The owner rejected integer-cent persistence and selected DZD-denominated decimal amounts, retaining fractional dinars when needed. The legacy writer transition remains proposed. No source behavior has changed.

## Scope and authority

- Worktree: `D:/worktrees/tuari_react_hono/feat-issue-427-independ-2565729f7d01eaa8`.
- Branch: `feat/issue-427-independent`.
- Initial inspected base: `55a61c8f665b468b8b7a375dc3fbff0f83ab0347`, including PR #516. Subsequently merged fresh `origin/develop`, including PR #515 at `31430a1bf426bd25c70ef676b606a90ec2bebad6`, into this branch without reset, rebase or discarded changes. Integration HEAD before this decision update: `fb482c6d5bdc7e6121fc878365bd29e03b7cca5e`.
- Specification: live issue #427 body and its one comment, read in full. Live #449 body and its owner comment were also read in full. The owner comment on #449 supersedes the older C-only wording.
- Read local `D:/projects/tuari_react_hono/.scratch/sessions/salary-v1-owner-decisions.md`. Its unresolved-opening-balances and out-of-v1 statements are historical. Current issue and session instructions authorize the expanded scope.
- High-assurance. Reachable risks include duplicated obligations, incorrect debt direction, duplicate labor cost, lost historical records and partial financial writes.
- Verification mode: focused-local / CI-final-enforced. Live ruleset 26837184 is active, has no bypass actors, requires strict `CI acceptance` from app 15368, resolved review threads, deletion protection and non-fast-forward protection. Repository activation documents retain historical pending text. Recheck effective protection and exact-head CI before any merge.
- Publication is authorized for reviewed, complete partial scope. This is an independent issue-owner thread. Financial/schema/public-contract approval and owner merge approval remain separate gates.

## Confirmed product semantics

Reference salary suggests an amount only. It does not establish wages owed, debt, a ceiling or a monthly uniqueness rule. Explicit approval establishes earnings for a stated covered period. Explicit allocation amounts plus explicit unallocated earnings must equal that approved total.

The owner explicitly confirmed these examples in this thread:

- Reference salary 30,000 DZD, final approved wages 25,000 DZD and payment 25,000 DZD leaves no wages owed. The reference difference is not debt. Reducing previously approved wages requires an explicit recorded correction, not merely a smaller payment. This does not authorize automatic penalties or a statutory deductions engine.
- Reference salary 30,000 DZD and cash 35,000 DZD requires explicit classification of the extra 5,000 DZD. A bonus raises approved earnings to 35,000 DZD. A recoverable advance leaves earnings at 30,000 DZD and records 5,000 DZD owed by the worker separately.
- Approved wages 35,000 DZD and payment 25,000 DZD leaves 10,000 DZD owed to the worker automatically. An optional debt checkbox cannot erase unpaid approved wages.

These confirmations approve product semantics. In a subsequent response, the owner approved reuse of the existing debt source, stating: "sure we have one debt and we can add or minus from it because of the salalry as any real case". This selects existing-ledger integration rather than a separate salary obligation store. It does not override the already approved separation of wages payable and advances receivable or authorize silent netting. The owner subsequently rejected integer-cent storage: "no i prefer it be in dz so 100.50 saved as 100.50 and showed 100.50 even most of this will be 100 but sometimes things can need decimals". Persist and expose DZD values rather than cent-denominated amounts. Preserve fractional dinars; do not restrict amounts to whole dinars. The legacy-writer transition remains proposed below.

A project may occur repeatedly. Each segment has stable identity and its own amount, with optional positive whole days. Editing a segment must not change another segment or approved total implicitly. Suggestions remain separate from approval.

Cash payment is distinct from earnings. Additional cash requires an explicit earned bonus or recoverable advance. A bonus increases approved earnings and requires reconciled allocations. An advance increases the worker's receivable obligation, not labor cost. Settlement of wages must not count labor cost again. Recovering advances requires an explicit recorded action, never automatic netting.

Opening balances may be unreviewed, confirmed zero, wages owed, advances owed, or both obligation directions. Unreviewed is not confirmed zero. Its reminder is nonblocking and persists until explicit review, even after payment. Opening balances and corrections never create project labor cost. Corrections retain previous/new values, actor, timestamp and reason.

Keep existing records. Do not reconstruct earnings from legacy cash or reference salary. Monthly presentation belongs to #449. Cross-month attribution and late-payment assignment are not selected here.

## Current implementation findings

1. `workforce.service.ts:createSalaryPayment` requires configured reference salary, derives a proposed amount, accepts an optional cash override, rejects repeated projects and stores day-only allocations. It does not record approved earnings, debt links or a durable idempotency key.
2. `employee_salary_payment` stores reference-derived expected amount and actual cash as REAL. Neither is proof of historical earned wages. Split rows already have a primary identity and no payment/project uniqueness constraint. Raw SQL has `CHECK(days > 0)`; the Drizzle definition omits that check, as the issue comment states.
3. Worker debt accounts are reused by worker and direction. `FinanceService` distinguishes PAYABLE and RECEIVABLE. Generic accounts can contain unrelated obligations. `SALARY_ADVANCE` is RECEIVABLE. Default debt-payment direction can select an outstanding receivable. A salary writer must always select direction explicitly.
4. Existing debt voiding recalculates an entire account. Voiding an OPENING also voids all live PAYMENT rows in that account. Existing consolidation supports OPENING entries only and may consolidate whole cases. These operations cannot be reused blindly for salary-linked earnings or corrections.
5. Shared money schemas allow magnitudes up to `Number.MAX_SAFE_INTEGER` DZD. That does not make multiplication by 100 safe at every allowed magnitude. PR #515 is now merged and integrated locally. Reuse `roundToDecimals` and established wrappers, without changing shared money or quantity behavior. New reconciliation logic must demonstrate bounded deterministic arithmetic rather than assume all DZD values can be converted safely to number-based cents.

## Architecture decisions and remaining proposals

### One obligation source

Owner-approved direction: use existing debt entries as the sole obligation ledger. New salary records hold approval, covered period, allocations, cash classification, correction provenance and links to the relevant debt entries. They must not create a second independently mutable owed balance.

An approval posts a linked PAYABLE increase. A wage payment posts a linked PAYABLE decrease. An advance posts a linked RECEIVABLE increase. Explicit advance-against-wages settlement posts linked decreases to both directions in one transaction, without cash or labor cost. Salary-specific balances derive only from linked salary entries, not unrelated amounts in the same debt account.

A new salary application service is proposed to coordinate the salary repository and existing debt repository under one synchronous immediate transaction. Keep this module separate from salary UI. Generic payment, void, consolidation and account-settlement paths need salary-aware handling where they could bypass salary invariants. Exact restrictions remain proposals, not owner-approved blanket account freezes. Preserve settlement of unrelated obligations in mixed accounts. Any guard must distinguish the affected salary operation and linked entries rather than reject an entire account merely because it contains salary history.

Rejected alternative: make salary records a separate obligation source and project them into debt views. The owner selected the existing debt ledger instead. Do not mix these approaches.

### Additive storage and money

Recommend new approval, segment, cash/classification, opening-review, correction, settlement-link and command-idempotency records. Define exact tables and keys in the first implementation slice after approval. Retain original salary and debt records without rewriting or renaming them.

Owner-selected storage unit: DZD with decimal amounts, not integer minor units. For example, a 100.50 DZD amount remains 100.50 DZD in stored and public financial meaning, not 10050 cents. Whole amounts such as 100 are also valid. Preserve existing DZD REAL records and use DZD-denominated amounts for new salary records. Numeric storage does not itself preserve trailing-zero typography; the UI must retain fractional values without truncation and coordinate display formatting with #454. No UI formatting preference is selected here.

Use the landed shared rounding helper at currency boundaries. Reconciliation and obligation updates must handle decimal arithmetic deterministically, validate finite bounded inputs and aggregates, and preserve exact financial totals at the supported currency precision. This owner decision does not authorize changing the shared DZD magnitude bound or applying a new cent-based ceiling. Present any necessary bound or storage-type change with concrete compatibility consequences before selecting it.

A command key identifies one logical operation. Same key and normalized payload returns the original result. Same key with a different payload rejects without writes. All salary records, debt entries, audit information and command receipt commit or roll back together. UUID segment identities permit A, B, A without treating repeated projects as duplicate submits.

Do not add a payment/project unique constraint. Mirror actual SQL checks in Drizzle for changed definitions. A schema-safety slice may fix the existing days-check mismatch without rebuilding legacy tables, subject to its review.

### Legacy compatibility and opening review

Recommend new earnings-aware commands and unchanged legacy reads. Leave legacy payments visibly legacy/unattributed. They contribute neither inferred new earnings nor inferred new wages owed.

A transition for the existing cash-only writer is an owner decision. Preferred rollout is to ship additive domain support first, then switch the salary workflow in a coordinated follow-up and reject new writes through the legacy cash-only command. Do not silently reinterpret old payloads as approval or advance classification. A backend-only rejection deployed before its UI caller changes would break payment entry and is not an acceptable first partial PR.

Existing debt entries may already represent a worker's opening wages or advances. Opening review must allow explicit adoption/linking of those existing obligations rather than inserting them again. Do not assume a pre-existing entry is salary-related from its amount or category alone. Corrections post audited deltas instead of voiding an entire mixed account.

## Owner approval requested

1. Approved: reuse the existing debt ledger as the sole obligation source. Salary provenance links and guards against generic commands bypassing salary semantics remain implementation obligations to verify, not permission to silently net directions.
2. Decided: the owner rejected integer-cent persistence and selected DZD-denominated decimal storage. Preserve fractional dinars and existing records. Any new magnitude bound or different storage type still requires a concrete proposal and owner approval.
3. Approve the staged compatibility policy: additive support first, then coordinated salary workflow switch and retirement of new cash-only writes. No legacy cash becomes inferred earnings. Existing opening obligations require explicit adoption, never duplicate insertion.

Items marked approved or decided record explicit owner responses. Remaining proposals are not decisions inferred from feature authorization. No irreversible migration or new published contract will be applied before explicit approval. Merge of any UI or expensive-to-reverse change requires separate owner approval even after design approval.

## Proposed reviewable delivery

1. Domain validation and suggestion rules, then additive approval/allocation persistence and API proof. No public financial contract is frozen before approval. Preserve repeated projects and explicit unallocated amounts. Do not enable a partial writer that can create inconsistent wages.
2. Atomic earnings/payment/advance coordination and linked debt guards, command replay/conflict protection, read models and labor-cost consumers. Prove payments do not add labor cost again.
3. Opening review, explicit adoption, correction history and explicit advance settlement, with rollback and history tests.
4. Coordinated salary workflow integration, nonblocking reminder and legacy-writer transition. Contact #454 before any overlapping UI, preferences or localization edits. #449 presentation remains separate.

Each PR says `Part of #427`. Keep the issue open until all acceptance is delivered. Resolve cross-month/late-payment policy with the owner before any implementation that needs it.

## Proposed test seams

Test domain approval/allocation validation through its caller-facing interface. Test real SQLite-backed salary application commands and corresponding RPC contracts for references, atomic rollback, idempotency conflicts, linked obligations and preserved legacy reads. Do not test private calculation steps as a substitute for transaction proof.

Use issue literals as expected results: A 10,000, B 37,500, A 15,000 totals 62,500, with A labor cost 25,000. Earnings 35,000 and cash 25,000 leaves wages owed 10,000. Cash 40,000 must classify the extra 5,000 explicitly. Opening wages 5,000 plus earnings 35,000 less cash 30,000 leaves 10,000 owed without opening labor cost.

Negative cases include NaN/infinity/overflow, invalid references, invalid supplied days, inconsistent allocation totals, same command key with changed payload, injected mid-write failures, unrelated debt entries in the same account, generic void/settlement bypass, unreviewed status after first payment and unchanged legacy payment history. The owner authorized initial no-schema/no-UI domain work, then explicitly required the council before implementation. Council findings will refine the proposed interfaces and proof before the first red-first cycle. This is not blanket approval of future storage or public-contract choices. Full checks remain CI-final.

## Review and architecture obligations

Freeze complete committed source for three distinct initial sessions in order: debate, test-audit, code-review. Use visible Luna delegates at the actual owning tree and SHA. Record the owner-approved same-family exception if no enabled non-author family is available. Bounded fixes receive one fresh combined-delta review with unchanged conclusions carried explicitly.

The salary module should own validation, classification, obligation links and transactional replay. Its callers should not reconstruct debt posting rules. Its deletion would otherwise spread those rules across workforce, finance and RPC callers. Keep rounding in the shared established module. This is the proposed scoped architecture assessment; no whole-tree refactor is authorized.

Applied lessons: money bounds must cover inputs and aggregates; allocation suggestions must reconcile across lines; transaction-bearing methods must obtain an immediate write reservation; synchronous transaction callbacks must not be converted to async implicitly.

## Current handoff boundary

Only this design has been written. No tests, contracts, source behavior, schema or databases have changed. No local or hosted implementation verdict is claimed.

The immediate gate is the owner's requested advisory council BEFORE implementation. The owner explicitly confirmed the roster as Astra, Sol 6.1 medium and Luna. This is the existing requested council, not a second council. Use three fresh read-only visible delegate sessions and at most one curated cross-examination round. The council is advisory and cannot reopen accepted debt-ledger or DZD-unit decisions as unanswered approvals, authorize implementation, waive precision proof or replace required implementation reviews.

After council synthesis, initial no-schema/no-UI domain work remains authorized within the confirmed product decisions. Legacy-writer transition, precise mixed-account command handling, any proposed magnitude-bound change, exact schema and new published financial contracts remain unselected where not explicitly approved. Do not freeze unrelated obligations in mixed accounts. UI and expensive-to-reverse merge approval gates remain intact.
