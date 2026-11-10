# Issue 528 exact expenses

## State and authority

Source-owning tree: `D:/worktrees/tuari_react_hono/feat-issue-528-independ-34a61677081e9232`.
Base and last fetched develop: `b2d37386aa3aa7bca1d98a4f7171f7a459859201`.
Live acceptance: https://github.com/AmaraNecib/tuari_react_hono/issues/528.

Status: partial local expense implementation over an unpublished shared
prerequisite. No PR, push, merge, production activation or expense UI conversion.
The complete issue remains open. Current owner authorization permits a declared
dependent stack after agreement on the exact publishable shared parent layer.

Local shared dependency `2c55189b706c95db67d01c6440bba434a9236766` from issue 524
was cherry-picked as `ac3e2e0034ae8ae88c687647aeb698e18b7917d6` before the owner
prohibited unpublished implementation bases. Its new 524 design note was retained
when resolving a modify/delete conflict. No shared source conflict occurred.
The owner's later V1 stack authorization explicitly permits this preserved local
integration as a starting point. Agree the exact parent branch/SHA before a child
PR. Show only expense-owned changes; do not modify or delete the 524 design note.
Preserve commits and earlier failures. Parent changes require affected proof and
review refresh. Merge in dependency order, then inspect the actual remaining diff
when retargeting to develop. Ancestor merge does not refresh evidence by itself.
No UI or expensive effect may merge without explicit owner approval.

High-assurance mode is `focused-local / CI-final-enforced`. At initial inspection,
effective ruleset 26837184 had strict CI acceptance app 15368, resolved threads,
deletion/non-fast-forward restrictions, empty bypass actors and
`current_user_can_bypass: never`. Protection is separate from current-head CI.
No hosted acceptance or implementation review verdict has been obtained here.

## Financial contract and domain invariants

Use `docs/adr/0001-exact-money-contract.md` and all three frozen appendices. Git
blob SHA256 values match the supplied hashes; Windows CRLF checkout hashes differ.

Expenses are positive finalized DZD amounts with at most two entered places,
checked reversal-safe int64 minor units and decimal-string wire values. Reject
malformed input, overprecision and overflow without rounding. They are not rates.
Optional worker, seller, project and stock references remain soft. Creation does
not synthesize a revision. A correction records old/new values and audit context
in the same transaction. Previous revision amount can be NULL. Void changes status
and audit metadata, keeps the row visible and excludes it from totals. Omitted
updates preserve values; explicit NULL clears only optional fields.

## Actual local implementation

Expense types, repository ports, in-memory and SQLite storage and the lifecycle
are parameterized by amount type. Existing numeric factories and production
composition remain the defaults. The opt-in exact factory parses strings through
shared Money and uses shared sumMoney; there is no exact-to-Number adapter.
Aggregates can exceed int64. Shared sumMoney permits at most 10,000 source records
per sum. This is an operation bound, not an invented financial ceiling.

The SQLite adapter shares lifecycle/storage behavior through a codec rather than
copying create/correct/void. Exact storage binds typed Money as native BigInt and
reads validated INTEGER columns using exact SQLite TEXT projections. Unrelated
integer reads remain numeric. Record readers validate storage class and currency.
No global safe-integer mode, alternate balance or parallel authoritative table.

`expenses.exact-schema.ts` contains inert DDL for isolated fixtures only, not a
migration or startup call. Same table identities, with `expense.amount_minor`
INTEGER and currency TEXT constrained to DZD. Revision has nullable
previous_amount_minor and required new_amount_minor INTEGER. Revision currency
inherits through expense_id. Exact factory requires the shared versioned marker
`exact_money_schema(slice TEXT PRIMARY KEY, version INTEGER NOT NULL)` with
`('expenses',1)` and validates actual columns independently. Legacy startup rejects
exact markers or converted columns before mutations. No production exact wiring.

Expense-only exact schemas/contract are exported separately. appContract remains
numeric. An isolated exact router reuses actual permissions, audit middleware and
expense handlers, backed by real exact repositories in proof. The default router
and app dependencies never import that isolated composition.

## Reader inventory and project-cost seam

`docs/money/523-caller-matrix.md` remains an inventory, not conversion proof.
The live project-cost repository still selects expense.amount_dzd through Number,
and its service combines numeric workforce, inventory and expenses. It must not
read converted expense records. Exact fixtures lack amount_dzd; the shared legacy
startup gate rejects their marker before composing traffic.

`listExactExpenseCostInputs(repo, projectId)` in expenses/expense-cost-inputs.ts
returns only live expense source records. Fields are id, expenseDate, whatFor,
amountDzd as canonical decimal string, currency DZD, projectId, responsibleWorkerId
and sellerId. No combined total or display-name resolution. It is not wired to the
numeric project-cost service. Issue 529 can resolve soft-reference names and
combine values only after its remaining source dependencies are exact.

Initial searches found no expense money in workspace snapshots or company
system-audit output. Correction history currently has an expense RPC consumer;
actual baseline expense page has no separate detail/history UI. The earlier
inventory assumption that history was already displayed was not borne out by the
actual browser capture. Complete UI/history conversion remains acceptance work.

## Shared ownership and remaining UI

Issue 524 owns the shared gate, exact input/rendering and their local proofs.
After its local integration, issue 528 added only its two expense index exports.
The shared CurrencyAmountInput exact branch preserves draft strings. MoneyValue
exact accepts strings and aggregate display. parseLocalizedMoneyInput owns
localized normalization. Grouping and optional decimals remain shared preferences.

Those shared APIs are implemented only in the local unpublished dependency, not
merged prerequisites. The shared commit contains UI/UX input and renderer changes.
It is not a no-UI preparation commit eligible for unattended self-merge. Do not
strip its UI or relabel effects to evade owner approval. Startup/schema effects
also retain their existing approval boundaries.

No expense frontend files changed yet. The attempted isolated UI worker returned
without edits because its older base lacked the shared APIs. After the owner's
stack authorization, expense-only UI work can resume from the actual committed
shared implementation. Remaining work
includes exact form/list/detail/history integration, #483 month/KPI preservation,
#425 failed-submit field retention, keyboard/touch/RTL, grouping and actual after
rendering. Cropped actual baseline images and one selected passing Chromium case
are local at `.scratch/reviews/528/before-expense/`. That capture used unchanged
committed frontend with then-dirty numeric backend source, not a clean backend
baseline. It is not exact UI proof or owner approval.

## Local proof boundary

All implementation results so far are LOCAL COMBINED-TREE proof. The initial
28 memory/native and 16 contract cases were run with uncommitted expense source
on local shared dependency ac3e2e00 or its earlier foundation. They are not
standalone issue 528 proof or committed-head acceptance. Exact fixture tests use
selected plain and keyed factory drivers on fresh files only. They preserve
large neighboring values, positive int64 endpoint, NULL previous amount, soft
links, audit old/new/actor/transaction values, correction rollback, reopen and
void. Memory tests also cover malformed/overprecision rejection, wide sums,
deterministic groups and equivalent input/no-op updates.

Bounded final local rerun: 14 RPC/native/handler cases passed; API typecheck,
contract typecheck and expense lint passed. Earlier failed RPC and compiler logs
remain local, including the rejected keyed in-memory fixture and client typing
errors. The corrected RPC fixture uses fresh files. An earlier aggregate literal
was hand-calculated incorrectly by ten DZD; the expected literal was corrected,
not production arithmetic. Raw commands, native exits, counts and durations are
under `.scratch/reviews/528/`, with a local handoff report. No full suite/build,
release proof, fresh review sessions or hosted verdict was claimed. Only contracts
dist prerequisite builds ran through the heavy queue, plus selected baseline UI.

## Resource recovery and next gate

Two initial frozen installs failed ENOSPC, including the hardlink retry. After
owner-controlled disk recovery, the frozen install passed. No dependency or lock
change occurred. No existing development database or key was touched. Fresh
synthetic browser backup files were moved, not deleted, into the ignored evidence
directory so generated outputs stay local.

Continue under the owner's later explicit stack authorization. Finish original
acceptance, affected proof and three distinct initial reviews on complete
committed expense scope. Publication requires a declared parent layer and only
the intended child delta. Hosted current-head 5/5, current-head CI, protection,
dependency-order merge and explicit UI/expensive-effect approval remain separate
gates. No parent approval or full issue acceptance is inferred from local progress.
