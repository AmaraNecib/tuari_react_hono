# Issue 425 design

## Scope and authority

Remove the redundant expense mutation error wrapper. The live issue has no comments and requires the existing async NOT_FOUND router test before and after. Base is fresh origin/develop at eb4c16d05fd9ed187b825bdd94b057bfe8073396. Worktree is D:/worktrees/tuari_react_hono/fix-issue-425-independe-93dc24b0ea07703e.

Writable scope is expenses.ts, focused expense regression tests and this design. Shared middleware, contracts, inventory, CI and UI are excluded. This is non-UI behavior-preserving cleanup, cheap to reverse with an ordinary revert. There is no durable data change, compatibility change or new external side effect. High-assurance review applies because a regression could alter expense mutation error responses, not because reversal is costly.

## Domain and module design

An expense mutation creates, updates or voids an expense. Domain errors remain ExpenseNotFoundError, ExpenseAlreadyVoidedError and ExpenseInvalidAmountError. Their existing wire codes remain NOT_FOUND, CONFLICT and BAD_REQUEST. No domain term or rule changes, so no glossary or ADR is needed.

The real seam is createExpensesHandlers composed with RpcMiddleware.withAudit. The shared wrapper awaits rejected promises and throws resolved ORPCError values. mapExpenseError remains the expense-specific resolver. Deleting withMappedExpenseErrors removes a pass-through module and duplicate mapping ownership without moving the public seam. Successful values, input forwarding, audit identity and unknown-error resolver behavior remain unchanged.

The matching #421 wisdom requires both awaiting inside the shared try and throwing mapped ORPCError values. Current source does both. Router-level checks retain output-schema validation; focused direct handler checks pin forwarding and middleware behavior.

## Proof and gates

Mode is focused-local / CI-final-enforced. Live ruleset 26837184 is active, strict, requires CI acceptance from app 15368, has no bypass actors and requires resolved threads. Recheck effective protection before merge. Historical pending documentation is stale under the owner's explicit rollout instruction.

The existing async ExpenseNotFoundError router regression passed before changes, 1 passed and 50 skipped at base, exit 0. Add focused async mapping cases for create and void plus direct mutation checks. Preserve failures and negative proof under ignored .scratch/reviews/425. The contracts build is a test prerequisite because the workspace package exports dist, not an expanded verification scope.

Run affected router tests, direct expense handler tests, relevant ESLint and API typecheck. Full suites/builds remain CI-final. Commit complete source before three separate initial review sessions in order: debate, test-audit, code-review. Ordinary reviewers use explicit Luna. Same-family separate-session review uses standing owner approval because no non-author-family route is enabled for this scope. No OpenCode probing.

Publish only after local readiness. Request Greptile once per published head and require current-head 5/5, current-head CI acceptance, resolved findings and effective protection before merge. Stop after #425 and notify the coordinator on actual merge or a genuine blocker.
