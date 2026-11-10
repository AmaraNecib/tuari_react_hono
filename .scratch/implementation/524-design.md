# Issue 524 exact debt implementation design

## Resumed full debt scope

The owner explicitly directed completing the original full524 scope after the
shared preparation merged. This work continues in the original tree and branch.
Seven preserved untracked exact debt files were inspected, not discarded or
replaced by another lane. The branch fast-forwarded safely from a90a86f4 to
actual merged develop d09ff583095254f600d4340e00d5a7dd8baa8e5d. Shared532,
expense533, currency536 and date537 are predecessors already merged, not a
publication stack. Full524 gets an independent develop PR only when complete.
Actual UI approval and owner manual merge apply to that new PR. No earlier
hosted-verdict exception transfers. Verification is focused-local/CI-final-enforced;
current effective develop protection was saved in resumed-protection.json.

The opt-in exact module retains debt_account and debt_entry as the sole ledger.
Production initialization, contracts, router and connected numeric writers remain
numeric and reject a converted database before legacy initialization. Exact
construction requires a version1 debt marker and physical INTEGER money fields.
The inert DDL is for fresh fixtures or authorized fresh-copy preparation only.
No migration, live schema activation or automatic attribution of legacy data.

An original obligation is a signed OPENING, ADVANCE or independent ADJUSTMENT.
A payment or settlement records its original targetEntryId. A correction records
a signed ADJUSTMENT delta with correctionOfEntryId pointing at that same original
obligation. The original record is immutable. Payments retain their original links;
corrections do not redistribute them. A positive obligation correction supplies
the explicitly agreed new amount and reason, never an automatic write-off.
Reject a correction or correction-void that would invalidate recorded settlements.
Signed independent adjustments remain available under the existing ledger model.
Voiding an original marks only its own payments/corrections void, not unrelated
account payments. Voiding a payment reverses only that recorded allocation.
Whole-account settlement emits a linked entry for every outstanding original,
including signed credit adjustments, inside one transaction. It never nets across
PAYABLE and RECEIVABLE accounts. Summary gross exposure keeps both directions.

PostingSequence fixes persisted order when equal dates/random UUIDs would sort
otherwise. Every posting and replay receipt commits atomically with current and
running balances. Memory snapshots and SQLite immediate transactions implement
the same synchronous repository interface. SQLite operations use the existing
connection-wide FifoLock and statement-local exact money reads. No global integer
mode, floating SQL SUM, Number money keys, or separate mutable balance is added.
Read-only history aggregates use the now-merged sumMoneyHistory; per-value and
operation bounds remain independent. Account/entry lists have explicit100000
resource limits. Exact DTOs, opt-in RPC and injected exact debt UI cannot satisfy
numeric cache/read paths. The default production graph is unchanged.

Local proof must cover memory/plain/keyed parity, attributed correction/void,
int64 and recomputation overflow rollback, canonical replay/conflict, immutable
identity and amount/links, numeric ordering beyond Number range, shared-connection
foreign-lock refusal and competing-connection reservation before decision reads.
RPC proof must use actual validation, authenticated audit, native persistence and
replay. UI proof must use actual components for create/post/pay/correct/void/settle,
localized exact draft entry, signed/grouped display, errors and keyboard/mobile.
All three initial lenses apply to this new debt diff. Prior532 reviews do not
review the new lifecycle. Logs/reviews remain private and ignored.

## Status and authority

Implementation resumed after owner-controlled disk recovery. The first bounded
change implements the common opt-in input/renderer and startup isolation gate.
The debt lifecycle conversion remains unfinished. PR532 is the published shared
preparation layer. Its actual isolated RTL capture exposed a trailing negative
sign in exact table display. A bounded correction isolates only the exact
formatted digits with `bdi dir="ltr"`, separately from the Arabic currency label.
Numeric legacy markup and amounts stay unchanged. Tests cover table and detail
isolation; refreshed same-fixture browser evidence must compare against the
failing0a7d94ac baseline. This adds no monetary interface or domain policy.
No production activation,
rendered UI approval or final issue verdict is claimed.

Issue: https://github.com/AmaraNecib/tuari_react_hono/issues/524

Assigned source-owning worktree:
`D:/worktrees/tuari_react_hono/feat-issue-524-independ-1170943eba917fa4`.
Branch: `feat/issue-524-independent`.
Initial HEAD and fetched `origin/develop` both equal
`b2d37386aa3aa7bca1d98a4f7171f7a459859201`. The initial tree was clean.
Every shell command starts by changing to this worktree.

Tier is High-assurance. Reachable risks include lossy money persistence,
unattributed payment reversal, unrelated-obligation loss, stale balance reads,
duplicate posting and exposure of exact records to connected numeric writers.
Verification mode is `focused-local / CI-final-enforced`.

Effective develop ruleset 26837184 was read during this session. It is active,
requires strict `CI acceptance` from app 15368 and resolved review threads, and
prevents deletion/non-fast-forward updates. Its bypass actor list is empty and
`current_user_can_bypass` is `never`. This is launch-time enforcement evidence,
not current-head CI acceptance or a future merge protection check.

## Windows CI test-isolation correction

After owner acceptance of the actual input UI and conditional merge authority
for PR532, Windows CI at c0be902c failed one unchanged Rust clock test.
The test helper named cleanup roots using only wall-clock nanoseconds.
Native Windows measurement found repeated directory names in134 of1000
parallel16-caller rounds. A deterministic fixed-tick probe using extracted
production write_atomic code reproduced the exact missing nested parent and
Windows OS error3 after five rename attempts when a second test cleaned its
colliding root. Process ID plus a test-local atomic sequence prevents that
collision without changing production clock, retry, license or crypto code.

This bounded correction changes only the cfg(test) directory helper and adds
a fixed-tick parallel uniqueness regression. Tests must retain isolated cleanup
roots even when the OS repeats a clock tick. Focused std-only native extraction
is local diagnostic proof, not a claim that the full Tauri crate ran locally.
CI still runs the actual crate on Windows and Linux at the new head. Prior
failure logs remain local. No production seam moved; no dependency added.
The earlier visual source is unchanged and its valid browser proof is carried
forward rather than rerun. A fresh bounded review must inspect this correction
and carry prior conclusions forward before publication. Owner authority covers
merge only after all current-head checks, hosted5/5 and protection gates pass.

## Acceptance criteria

The live issue requires:

- Convert debt_account and debt_entry with approved currency ownership and exact current/signed/running balances. Cover services, mappers, RPC, forms and affected displays.
- Preserve both obligation directions, gross exposure and existing account identities. No silent netting, blanket mixed-account freeze or duplicate salary balance.
- Prove partial/multiple settlement, unrelated-obligation preservation, correction/void attribution, bounds, currency mismatch and sorting/serialization.
- Prove same-connection immediate reservation, atomic rollback, duplicate-submit replay/conflict and competing-connection behavior for changed writers.
- Keep nonconverted connected writers unreachable from converted production accounts until coordinated activation, not silently coerced to Number.

None is claimed complete by this design record. Salary #527/#427 remains
downstream. No successor issue, live migration, installer or release work is owned.

## Approved financial sources

Read the live bodies of #524, #519, #520, #523 and #522. The authoritative ADR
is `docs/adr/0001-exact-money-contract.md`. All three linked artifacts were read:

- `.scratch/implementation/522-exact-money-contract.md`, frozen SHA256
  `c568f9c6fc214494c0f7cd96d96a6d11ceb08060bc39e989bfd43e0096a33927`.
- `.scratch/implementation/522-money-field-classification.md`, frozen SHA256
  `9e0525638000e8c111891803b538cfd1d2619237c3b919e784d5fbef2bb8039a`.
- `.scratch/implementation/522-money-decisions.md`, frozen SHA256
  `190a7a712f49db64eaab273a4d84f614d56ab7e0415f844ae7860be3855866ed`.

The ADR supersedes frozen pending-review prose. Do not reopen the accepted
financial decisions. Finalized amounts use private BigInt and the symmetric
int64 minor-unit domain. DZD is the only enabled currency. Each account owns
immutable currency; identity is party plus direction plus currency. Entries
inherit currency and reject mismatches. Gross PAYABLE and RECEIVABLE exposures
remain separate. No reference salary creates an obligation.

## Existing modules and direct callers

`docs/money/523-caller-matrix.md` was read as an inventory, not conversion proof.
The shipped `exact-money.ts` and narrow `exact-money-storage.ts` were read with
the native storage tests. Default production integer reads remain unchanged.

FinanceService and its repositories currently use numeric debt contracts.
SqliteFinanceRepository delegates to SqliteCompanyRepository. InvoiceDebtPort
also writes that ledger directly. Generic invoice/payment, inventory invoice
and workforce paths remain numeric. They share records and the connection-wide
transaction lock; replacing only the finance service cannot isolate them.
Audit/workspace snapshots, system logs, reports and debt UI are direct consumers.

A separate read-only Luna investigation checked connected source at the exact
baseline. Its ignored report is
`.scratch/reviews/524/activation-investigation.md`. It ran no tests, accessed no
databases and wrote no source. It is investigation, not one of the final lenses.

Two concrete lifecycle hazards need implementation design before contracts move:
`recordDebtPayment` currently checks account capacity rather than a recorded
obligation allocation, and `voidDebtEntry` can void every live account payment
when an OPENING is voided. Exact arithmetic alone does not fix attribution.
The conversion must preserve unrelated obligations and recorded links. It must
not invent historical payment attribution or a new salary excess policy.
The exact posting/correction/allocation interface is not yet finalized. Common
capability work does not resolve these lifecycle hazards or satisfy their proof.

## Agreed inert integration boundary

Keep the complete legacy production graph on its existing schema and contracts.
Implement exact interfaces as opt-in capability, using the same ledger table
identities only in fresh isolated fixtures or authorized fresh copies. Do not
create a second production ledger, shadow mutable balance or Number bridge.
Do not introduce selective account activation or freeze unrelated legacy accounts.

Implemented shared file:
`apps/api/src/infrastructure/database/money-schema-gate.ts`.

Implemented exact-adapter prerequisite:
`requireExactMoneySchema(db: BetterSqliteDatabase, slice: "debt" | "expenses")`.
The fixture/copy schema carries metadata table `exact_money_schema` with
`slice TEXT PRIMARY KEY` and `version INTEGER NOT NULL`, requiring version 1
for the selected slice. This marker is metadata, not financial authority.
Each adapter must additionally verify its physical INTEGER columns and currency
ownership and reject REAL storage. A marker alone is not proof of correct schema.

The legacy startup initializer will check for exact markers or converted monetary
columns before its first mutation. It must reject them before constructing
financial services, traffic or background work. No environment flag will enable
an incomplete exact production graph. The current legacy behavior on ordinary
REAL schemas must remain unchanged. Native tests cover plain/keyed rejection before
mutation, markerless converted debt/expense detection and legacy startup/reopen.
The gate checks only these two slices and is not a complete app-wide cutover.

Coordinated activation still requires all connected writers/readers, transport,
schema, driver/recovery proof and owner authority. This issue must not claim
that isolated fixture proof establishes production cutover or safe rollback
after new writes. Originals and keys remain untouched.

## Shared ownership agreed with issue 528

The independent expense owner works in
`D:/worktrees/tuari_react_hono/feat-issue-528-independ-34a61677081e9232`.
This issue owns shared input/renderer work, exports, initializer and gate design.
Issue 528 proceeds only on disjoint expense files and will integrate reviewed
shared changes after this issue. Neither tree edits the other's files.

Agreed common names, implemented opt-in without switching existing consumers:

- `CurrencyAmountInput exact={true}` retains draft string `value` and `onChange`;
  `maxAmount` is an exact decimal string. Its default numeric branch is preserved.
- `parseLocalizedMoneyInput(value: string): Money` lives at
  `apps/web/src/features/shared/exact-money-input.ts`. It explicitly normalizes
  supported localized input at submit without Number; drafts stay strings.
- `MoneyValue exact={true}` takes string `value`; `aggregate={true}` supports
  bounded exact report totals wider than persisted int64. Existing display props,
  grouping preference and optional decimals remain.

Issue 528's proposed exact columns are `expense.amount_minor`, immutable
`expense.currency`, nullable `expense_revision.previous_amount_minor`, and
required `expense_revision.new_amount_minor`. Revisions inherit currency through
`expense_id`. Marker is `('expenses',1)`. These use the existing expense table
identities on fresh fixtures. Numeric project-cost consumers must not receive
these records; exact expense inputs cannot enter active numeric combined totals.

No shared commit is approved for integration until its local reviews finish.
No package addition is approved. Money.compare uses private coefficients and
returns only -1/0/1, avoiding subtraction overflow and Number keys. MoneyValue's
aggregate mode validates bounded canonical report strings and never returns a
persistable Money. No expense-only exports are added for absent files. After
integrating the reviewed common commit, #528 owns adding its two export lines.

## Physical-left currency correction and tracked caller follow-up

Owner rejected the26427361 currency placement and requires Arabic DZD physically
left of the numeric run beside its leading digit. This supersedes the earlier
capture acceptance interpretation, not exact digit/negative-sign isolation.
Only the shared source files are changed in this layer:
`features/shared/money-value.tsx`, `components/ui/form-controls.tsx`, and
`components/ui/currency-amount-input.tsx`, plus their tests under apps/web/src.
CurrencyRun accepts already-formatted text and renders an explicit LTR inline-flex
currency label followed by isolated LTR digits. MoneyValue delegates both numeric
and exact paths to it; both Pay Full branches retain their current formatting.
CurrencyInput uses LTR physical layout and left-aligned editable text. No amount
parsing, arithmetic, grouping or optional-decimal policy is changed.

This shared change reaches salary employee tables/details, salary payment tables,
employee batch/edit inputs and all CurrencyInput/CurrencyAmountInput consumers.
Issue528 owns expenses-page.tsx literal bypasses and must integrate the shared
fix without a second layout. Current scope does not claim app-wide completion.

Tracked follow-up for the coordinator's separate develop-based presentation PR
after prerequisite merge, not a successor implementation branch:

- Debt bypasses: apps/web/src/features/debts/consolidation-dialog.tsx,
  debt-cases-panel.tsx, void-entry-dialog.tsx, record-entry-payment-dialog.tsx,
  debts-hub-page.tsx and debt-ledger-panel.tsx. Includes HubStatCard preformatted
  string amounts and interpolated adjustment/cascade descriptions.
- External bypass: apps/web/src/features/externals/externals-page.tsx.
- Inventory bypasses: apps/web/src/features/inventory/inventory-invoice-details-page.tsx,
  location-transfer-history.tsx, transfer-history-page.tsx and
  record-invoice-payment-dialog.tsx. Includes summary-card preformatted strings.
- Translation bypass: apps/web/src/i18n/ar.ts cascadeDescription and translated
  monetary interpolation identified by the coordinator audit. Preserve prose and
  introduce actual shared presentation rather than string/DOM ordering assumptions.

These are explicit remaining owner requirements, not approved exceptions. The
owner will merge manually. PR533 waits for actual PR532 merge before safe
non-destructive standalone retarget; no new stacked publication, reset, rebase,
force push, production activation or premature merge is authorized.

## Approved input refinement

Owner approved the inline prototype after7477362c and authorized implementation.
Static numeric/exact MoneyValue placement remains unchanged. Editable CurrencyInput
aligns the intact LTR digit run to the right for Arabic and to the left for LTR
locales. The fixed Arabic unit stays inside the same outer field on its physical
left, separated by a subtle vertical border. It is not a button or second input.
Existing optional onPayFull remains the only action authority. The button now says
كامل المبلغ and uses the installed Button and Tooltip components. A full amount
description remains accessible, visually hidden for hover+fine-pointer devices,
visible for non-hover/touch devices. Existing Tooltip supplies hover/focus/Escape
behavior; device capability, not viewport width, chooses the touch description.
No instructional prototype copy is shipped. Legacy numeric amount formatting and
exact string limits remain intact. Legacy label is now explicitly associated with
its native input; both buttons remain non-submit and disabled with the field.
This prototype approval is not final-source merge/activation approval.

## Planned proof and remaining gates

Use the preapproved service/RPC and real repository seams, independent literal
expected amounts and actual selected plain/keyed drivers. Cover partial and
multiple payment, unrelated obligations, attribution/correction/void, signed and
resulting-balance bounds, currency mismatch, numeric money ordering and exact
wire/cursors. Exercise same-connection reservation before guard reads, atomic
rollback, replay/conflict and competing connections. The in-memory adapter must
share domain invariants but cannot establish native-driver behavior.

Startup integration must prove converted schemas fail before mutation while
legacy numeric invoice/payment/inventory/workforce workflows still work. Forms
and displays require focused tests and selector-chosen browser cases. Preserve
Algerian/formal terminology and accessible small question-mark help. Actual
rendered UI needs owner approval before merge; no rendering is approved here.

Record exact-SHA commands, counts, native exit codes, durations and raw log paths
under ignored `.scratch/reviews/524/`. Run relevant lint/typecheck. Full local
suites/build/browser jobs need a named gap and the heavy queue. Three distinct
read-only initial lenses remain required after the complete source commit.
No implementation review, hosted verdict, CI run, PR or merge has occurred.

Applied lessons so far concern synchronous transaction reservation and shared
connection ownership. They agree with current FIFO/runSyncTransaction source.
Historical numeric commercial bounds in older lessons do not supersede the
approved symmetric int64 money domain. Broader architecture review remains
scoped to changed seams after clean local review.

## Resource blocker and recovery handoff

Local read-only `df -h D:/ C:/` reports D: 19 MB free and C: 632 MB free.
This worktree has no installed root/API/web node_modules or contracts dist.
The shared-UI child failed before execution because T3 could not provision its
worktree. Issue 528 separately reported ENOSPC for frozen installation and a
hardlink retry. No install or retry was attempted here after that warning.

The owner explicitly prohibited installs, heavy execution, bulk copies and
cleanup of shared/other-owner files while storage is exhausted. Preserve all
worktrees, development databases and keys. No resource workaround, deletion,
review waiver or production activation is authorized.

Historical blocker resolved when the owner reported disk recovery. Recheck found
D: 5.2 GB free; C: remains nearly full. Frozen installation passed from the lock,
784 packages in 50.1 seconds. All new temporary files/logs stay in this worktree
on D:. The fetched develop base remains unchanged. No new dependency was added.
The earlier failed logs are retained, including one malformed proof-runner
argument attempt and one keyed in-memory fixture error. Keyed proof now uses
fresh files rather than unsupported keyed in-memory connections.

Contracts dist generation is a named test prerequisite, not a production build:
this isolated tree initially had no package exports available for API/web tests.
The queued contracts build passed. Adding Money.compare required refreshing that
artifact before web component proof. No whole-app build or full suite was run.

Focused red/green proof now covers startup isolation, malformed markers, exact
comparison, localized finalized input and opt-in components. Earlier failure logs
remain ignored under `.scratch/reviews/524/`. This first commit is common
capability only, not completion of #524. Complete debt source, RPC, forms,
attribution, native concurrency and production-inert integration proof remain.

The installed impeccable skill has no reference/product.md despite requiring
that path, and no shadcn SKILL.md was found in the scoped installed skill/package
locations. No skill installation was attempted. Existing DESIGN.md, components,
accessibility and interaction-design reference govern this bounded UI change.
Actual browser rendering, keyboard/touch inspection and owner approval remain
unfulfilled merge gates. Default existing numeric markup/formatting is retained.
