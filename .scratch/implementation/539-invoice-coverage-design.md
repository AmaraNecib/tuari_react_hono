# PR539 invoice exact guards

Base: `e8c97a817f2b7c31cc1dbf4c663e73e75e3ab89a`
Worktree: `/d/worktrees/tuari_react_hono/t3-6b3e6542-282b7d4529ca5391`
Verification mode: focused-local / CI-final-enforced
Review tier: high-assurance. The tests exercise invoice receipts, payment allocation and reversals, which move money and linked debt.

## Scope and seam

Add `apps/api/src/modules/invoice/invoice-exact.guards.test.ts` only. Keep production code and coverage policy unchanged. Exercise `ExactInvoiceService` through public methods with the shared in-memory finance and invoice repositories. Do not mock service internals. Override repository reads only where persisted ledger drift or the resource-limit population cannot be created through valid business commands.

The added cases cover draft update semantics and rejection after receipt; explicit identity conflicts and missing targets; draft and unallocated-payment deletion/replay; worker party direction and zero-value receipt; split identity and minor-unit omission; allocation overflow, mismatch, unavailable target, overpay and ledger drift; rollback across an allocation batch; repeated voids; list filters, null date ordering, timestamp-equivalent cursor traversal, invalid cursors and read limits.

## Design notes

The service interface is already the right seam for these rules. The in-memory adapters share one transaction identity, so a failed aggregate can be observed through subsequent public reads without a database fixture. Resource-limit and persisted-drift cases use the repository seam deliberately: those are states users cannot request through validated service inputs. No module interface or production seam moved. No active numeric invoice path, schema, contract, dependency or CI policy is changed.

## Wisdom applied

- `architecture/money-split-shares-must-reconcile-allocate-across-lines-never-per-line.md`: assert exact minor-unit distribution, including omitted zero-minor shares.
- `architecture/runsynctransaction-composes-nested-wraps-are-savepoint-joins-and-wrapping-every-sync-writer-makes-the-tripwire-structural.md`: verify failed multi-write allocation through the public transaction and subsequent ledger reads.
- `testing/coverage-chase-exposes-latent-divergence-bugs-unify-before-covering.md`: compare actual public filtering, sort and cursor behavior rather than manufacturing branch-only data.
- `testing/adding-a-new-module-to-the-coverage-include-forces-100-branch-work-pin-comparator-null-arms-explicitly.md`: pin null sort positions and both cursor directions.

Excluded: adapter SQL failures and native locking, already covered by existing native service tests; production fix or architecture change, outside this correction's authority.

Lesson: no new repeated lesson candidate from this bounded test-only pass.
