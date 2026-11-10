# Issue 528 exact expenses

## State and authority

Source-owning tree: `D:/worktrees/tuari_react_hono/feat-issue-528-independ-34a61677081e9232`.
Base and last fetched develop: `b2d37386aa3aa7bca1d98a4f7171f7a459859201`.
Live acceptance: https://github.com/AmaraNecib/tuari_react_hono/issues/528.

Status: reviewable opt-in expense implementation over published parent PR532.
Parent branch `feat/issue-524-shared-money-preparation` at
`0a7d94ac7010b995b2082e626e052170255e8322`, based on develop b2d37386.
Both published parent commits were integrated by non-destructive merges. Shared
524 design note remains identical. No child PR, production activation or approval
yet. UI, service/RPC, native storage and narrow project-cost source are implemented
opt-in; the full issue remains open until acceptance gates and later cutover.

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

The exact form and page now share their generic view with numeric defaults.
Exact hooks use a distinct client-scoped and session-scoped cache, never the
numeric expense cache. Forms preserve localized string drafts and validate through
the shared parser. Exact rows/history use shared MoneyValue; aggregates use wide
shared formatting. The percentage converts only the final bounded integer ratio.
Exact grouped view keeps voided-only groups visible without charging their values.
Detail/history shows nullable previous as unavailable, audit and soft references;
correction and void remain accessible. Mutations preserve fields/reasons on error.
Actual browser proof found an offscreen edit Save button; bounded dialog scrolling
now makes it reachable. This shared view fix also applies to numeric mode. Cropped actual baseline images and one selected passing Chromium case
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

## Integrated proof and review boundary

Precommit affected web proof: 50 cases passed across six expense files; API/web/
contract typecheck and API/web expense lint passed. Contracts workspace has no
lint script or eslint dependency; the attempted command failed, not a passed check.
Affected parity proof: 56 cases across memory/plain/keyed and legacy lifecycle.
Physical schema proof: 14 native/schema cases. Explicit INTEGER/TEXT/nullability
checks now reject hybrid legacy columns. Parity tests found an in-memory correction
race; its transaction and writes now use the existing FIFO lock, with concurrent
old/new chains passing against all three repositories. A test attempted a NULL
project filter outside the actual contract and was removed rather than broadening
financial semantics. Earlier failure logs remain intact.

Selected Chromium proof uses actual exact page/form/hooks and native SQLite over
a real isolated RPC server with actual auth/audit/permission middleware. A fixed
synthetic current-user resolver and cached session/inventory lookup avoid any
production startup or database. Trial license is set explicitly for the fixture.
One complete create/correct/history/group/preference/month/void case passed in
13.6 seconds. Screenshots are cropped native elements, not owner approval.
Initial failures include missing fixture license, genuine offscreen Save, duplicate
Close locator and an overly exact grouped-label locator. These remain local.
The screenshots are current successful-run images; successive development attempts
replaced same-named images, so earlier logs—not those images—prove earlier failures.
No current-head acceptance is inferred from this dirty combined-tree browser proof.

Parent inventory update was rerun on integrated tree and caught four intentional
expense consumers; child allowlist now names only those four additional files.
The two inventory cases pass. No production interface changed in parent refresh.
Initial reviews must now read complete committed expense source, not worker partial
scope. Parent architecture pass reduced duplicate screens to one typed view and
kept all amount policy, parser/renderer and cache/activation seams explicit.

## Hosted API coverage correction

PR533 CI at 42bb1c94 passed 1,900 API tests with one skipped, but the strict
100% coverage gate rejected unexercised expense currency/source validation and
equal-width aggregate comparison branches. Raw failed job log remains ignored
at `.scratch/reviews/528/49-ci-api-job.log`. Three focused tests now pin explicit
non-DZD create rejection, exact group ordering/ties and wrong-currency source
rejection with independent expected results. No production code or thresholds
changed. The selected four-file run passes 55 cases with coverage restricted to
the three affected modules: 119/119 statements, 99/99 branches, 38/38 functions
and 88/88 lines. This is targeted local proof, not the full CI suite or new-head
hosted acceptance. API typecheck and test lint also pass. One fresh combined-delta
review must carry forward unaffected earlier conclusions before publishing the fix.

## Owner currency presentation correction and manual merge boundary

The owner superseded stacked publication. Existing533 remains a historical
dependent layer until532 is actually merged by the owner. Do not retarget early,
publish a new stacked source update, merge automatically, rebase or discard work.
Preserve ordinary integration019582cbc9e49035e5b3e4b5cec6cedf251bdee1 of26427361.
That parent update isolates negative digits only; it does not meet the later
physical-left currency requirement. Its42 focused renderer/page tests and web
types/lint proof remain scoped77, not published-child acceptance.

524 is sole writer for MoneyValue, CurrencyRun, CurrencyInput/form-controls,
CurrencyAmountInput and their tests. Expense-only bypass correction routes
legacy numeric cards/totals/group headings and table/group item amounts through
MoneyValue instead of literal suffix strings or bare formatAmount. Exact detail
and history already use that component. No local flex/bdi currency layout added,
no exact arithmetic or production contract change. Expense form already delegates
both numeric/exact inputs to the shared components. Chips interpolate bare
numbers without currency, not a remaining suffix layout.

78 red reproduced legacy rows bypassing currency display.79 dirty-tree page
proof24 tests, web types and scoped lint passed after rerouting. This proves
shared-component routing, NOT physical browser geometry. Source is committed
locally while waiting524 actual reviewed physical-left parent correction and
its real merge. Then integrate non-destructively, inspect expense-only remaining
diff and run proportionate final-head geometry/captures/review. Current published
e0cdba77 AFTER images are publicly marked rejected historical currency placement,
not approval-ready. No browser/review round spent on the superseded layout.

## Hosted history and audit corrections

The hosted review found a real boundary error despite the earlier local lenses:
unbounded saved history reached the document helper's 10,000-operation limit.
The 10,001-row red case preserved at57-history-limit-red reproduces it. The owner
of524 explicitly assigned exact-money.ts and shared tests to528 without concurrent
writes; parent532 is unchanged. New shared sumMoneyHistory(Iterable<Money>) reuses
the same private BigInt accumulation/currency checks/render function. sumMoney
still enforces its original operation count. Source Money bounds do not change.
Empty, signed cancellation, wide and >10,000 histories have literal proof.

Expense totals now use the historical helper. Expense aggregate wire schema drops
the21-digit operation-count assumption and matches the existing shared display's
256-character transport-length guard, not an economic limit. No display helper
or parser was duplicated or modified. Existing index export-star exposes the new
helper; no additional export line is needed.

Accepted UI findings now show readable changedFields (including project/note-only
corrections), label mutable actor as latest modifier, use shared Algeria date/time
for audit instants while preserving expense business-day formatting, and resolve
known project/worker/seller names with raw-ID fallback for absent soft references.
New tests distinguish same-day audit times and amount-preserving corrections.
Earlier findings/failures remain local54/55/57/58/60; all hosted duplicates remain
open until the reviewed fix is pushed and disposition is recorded.

Affected precommit proof: shared/contracts49, API56 with100% targeted coverage,
page22 passed; API/web/contracts types and affected API/web lint passed.
These are dirty combined-tree results, not current published-head acceptance.
Refresh actual history UI evidence, commit complete delta, obtain one fresh
combined-delta review carrying prior unchanged conclusions, then publish and
request hosted review once for the new head. Parent merge and owner UI approval
remain separate gates.

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
