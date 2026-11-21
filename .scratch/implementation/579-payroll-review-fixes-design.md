# Payroll hosted review corrections

Worktree: D:/worktrees/tuari_react_hono/t3-38d48ef1-f84252143f1c4b11.
Base: 18b065b1345653166eec74ade50ba9c41b7333fc.
Mode: focused-local / CI-final-pending. High-assurance money and recovery changes.
Parent owns combined-delta review, publication and integration. No children.

## Findings and design

F4: reconcile each selected earning and advance against positive remaining sources. Reset editable draft on employee change, before loading identity-specific pending intent. Never delete another employee's persisted intent. Frozen requests retain their original payload regardless of current dropdown choices.

F5: contrary to the preliminary brief, the base only invalidates legacy workspace-domain keys. Active exact debt hooks use phase1/workspace/debts-exact/clientScope/userId. Invalidate the exact namespace for the submitting user, including all client scopes and summary/detail queries. Keep the legacy refresh for metadata consumers. No accounting changes.

F6: approval invalidates payroll for the same user and employee. Test with a mounted fresh cache, not invalidation spies.

F13: use AppDate for cash, offset and repayment history. Algeria midnight is the previous UTC day. Keep the date preference and bidi rendering from the shared component.

F3: owner approval arrived through the parent after initial investigation. Add optional typed NOT_COMMITTED data for domain refusals only after the aggregate proves its receipt absent, invokes work, and both transaction wrappers unwind. PayrollService classifies only PayrollDomainError and ExactDebtError at that point. Prior aggregate replay conflicts never reach work. Busy, unknown and output errors remain unmarked. No schema or arithmetic changes. The adapter transaction mode is another lane's ownership and remains untouched.

Each UI dispatch now persists a fresh attemptId under the existing exclusive Web Lock, with the exact same financial requestId and payload. Only the corresponding ORPCError refusal enables explicit Cancel. Cancel checks that stored attemptId still matches before clearing, without sending a financial command. A later retry in another tab invalidates the earlier refusal permission. Reload deliberately loses the transient permission and offers immutable retry. Backward-compatible pending records without attemptId load normally and receive a token on dispatch.

Initial investigation found no safe generic wire signal. payroll-router maps PayrollDomainError and ExactDebtError to BAD_REQUEST/NOT_FOUND/CONFLICT without discriminating metadata. ExactFinance.runAggregate checks existing receipt before work and stores receipt after work inside nested synchronous transactions. The sqlite finance repository uses immediate transactions. Replay fingerprint conflict can have a prior committed receipt. Overbalance errors roll back but share generic codes with other paths. Busy and output-parse errors are also ambiguous. Do not clear these errors or infer rollback from their message. This diagnosis led to the approved additive metadata rather than guessing from generic codes.

## Chronology and proof

Draft first: prior lane left two uncommitted source edits only. The two draft edits were inspected. New F4 selection/reset tests failed on the base before importing them. F5/F6/F13 and refusal detection then received independent restored-mutation red probes after implementation. These are detection probes, not a claim that every edit was test-first. Dependencies installed offline, frozen lockfile, ignore-scripts, scoped web/contracts hardlinks. Own contracts build is required because package exports resolve dist. Build syntax/dependency failures are environment failures, never business red.

Use affected panel, pending-intent and query tests, web/API typecheck and scoped lint. Native payroll service, offset and finance aggregate tests cover the changed transaction callback. Real BetterAuth RPC tests cover refusal metadata for cash, repayment and offset and absent metadata on committed-receipt conflict. No browser or full build claim. Existing lost-response/reload and concurrent-view tests retain Web Locks and immutable request identity. Actual browser coordination remains a parent integration boundary. The E2E selector returns full for the critical API path. No local browser run or app build was performed. The parent retains combined integration and CI acceptance.

## Local results

Web panel/query/pending tests pass 33/33. Native aggregate/payroll/offset tests pass 101/101 across plain and keyed sqlite. Real BetterAuth RPC tests pass 2/2. Web, API and contracts typechecks pass. Scoped web and API lint pass. Restored mutations independently fail for approval refresh, all three exact debt writes, Algeria history rendering and server confirmed refusal. The original selection/reset tests failed on the base. Raw logs remain ignored under .scratch/reviews/579-payroll.

The first native run had missing plain sqlite bindings after ignore-scripts installation. A preinstalled parent native binding was copied into this tree's ignored dependencies, without rebuilding or altering the parent. The keyed driver had already run and exposed the new test's wrong receipt-table name, corrected to exact_finance_command. Intermediate web type failures and one encoding-corrupted test edit are preserved separately from business-red logs. Final proof includes neither failure. No generated or dependency file is committed.

## Domain and module assessment

Earning and advance are independent positive-remaining sources. Pending intent is a durable identity-scoped command, not an editable draft. The panel owns selection and rendering; the query module owns post-write refresh. No ledger/arithmetic interface changes. Deleting AppDate would duplicate preference, timezone and bidi policy. Exact debt invalidation must cross client scopes because payroll affects each debt client view for one user.

Applied wisdom: defaults reconcile current inputs; shared Algeria dates; exact query keys must match mounted caches; fresh-cache behavior needs mounted refetch assertions; fixtures must satisfy contract schemas. Parent-only repeated wisdom updates remain excluded.
