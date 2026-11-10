# Issue 524 exact debt implementation design

## Status and authority

Blocked before implementation by machine-wide disk exhaustion. This is a design
handoff, not an implemented interface, conversion, executed test or review verdict.

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
The exact posting/correction/allocation interface is not yet finalized.

## Agreed inert integration boundary

Keep the complete legacy production graph on its existing schema and contracts.
Implement exact interfaces as opt-in capability, using the same ledger table
identities only in fresh isolated fixtures or authorized fresh copies. Do not
create a second production ledger, shadow mutable balance or Number bridge.
Do not introduce selective account activation or freeze unrelated legacy accounts.

Proposed shared file:
`apps/api/src/infrastructure/database/money-schema-gate.ts`.

Proposed exact-adapter check:
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
REAL schemas must remain unchanged. This gate has not been implemented or tested.

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

Agreed names, still unimplemented:

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

No shared code is available for cherry-pick yet. No package addition is approved.

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

Resume after owner-controlled disk recovery. Recheck capacity, source/base and
shared-file coordination, then finish exact lifecycle/interface design before
starting focused failing-first implementation. No source conversion is underway.
