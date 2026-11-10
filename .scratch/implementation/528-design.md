# Issue 528 exact expenses

## State and authority

Source-owning tree: `D:/worktrees/tuari_react_hono/feat-issue-528-independ-34a61677081e9232`.
Base and fetched `origin/develop`: `b2d37386aa3aa7bca1d98a4f7171f7a459859201`.
Live acceptance: https://github.com/AmaraNecib/tuari_react_hono/issues/528.

Status: inspected and proposed, not implemented. No source, schema, contract,
production composition or application database has changed. No PR exists.

High-assurance scope covers exact expense persistence, correction history,
atomic writes and downstream project-cost inputs. Verification mode is
`focused-local / CI-final-enforced`. At inspection, effective ruleset 26837184
was active with strict `CI acceptance`, GitHub Actions app 15368, resolved
threads, deletion/non-fast-forward restrictions, empty bypass actors and
`current_user_can_bypass: never`. This is protection evidence, not current-head
CI or implementation acceptance. Recheck before merge.

## Approved financial contract

Use `docs/adr/0001-exact-money-contract.md` and its three frozen appendices.
Their Git blob SHA256 values match the supplied hashes. Windows checkout
CRLF bytes differ; the committed blobs are unchanged.

Expenses are positive finalized DZD amounts with at most two entered places,
checked symmetric int64 minor units and exact decimal-string wire values.
They are not unit prices or quantities. Reject overprecision, malformed inputs
and overflow instead of rounding. Preserve optional references as soft links,
nullable previous revision amounts, update omission/null behavior, audit actor
and transaction context, visible voided rows and exclusion from totals.

## Consumer inspection

`docs/money/523-caller-matrix.md` is the starting inventory, not conversion proof.
Current expense module and repository interfaces use numbers. The SQLite
adapter writes `expense.amount_dzd` and revision old/new REAL values. The
in-memory adapter implements the same interface. Module updates and revisions
share a locked transaction. Create currently does not synthesize a revision;
void changes status and audit metadata without creating a correction revision.

`project-cost/adapters/sqlite-project-cost.repository.ts` directly reads live
expense rows and converts `amount_dzd` with Number. `project-cost.service.ts`
adds them to numeric salary, stock and material values. It must never read
converted expense records until coordinated activation. No expense conversion
may enter that combined numeric total. The narrow exact expense input must
return exact source strings and live-row filtering without building #529 totals.

Searches of workspace, company audit/system-log, RPC and web audit consumers
found no expense monetary values in workspace snapshots or system-audit output.
Expense correction history is exposed through expense get/RPC and its UI.
Recheck the inventory against the final diff.

## Proposed inert implementation

Retain legacy numeric production composition unchanged. Parameterize the
existing expense lifecycle and repository types with an amount/aggregate
policy rather than copy creation/correction/void business rules. The numeric
policy remains the default. An opt-in exact factory parses strings with the
shared Money type and uses shared exact sums. No exact-to-Number adapter is
permitted. Wide read-only totals are distinct from persisted per-value bounds.

Reuse the same table identities only on fresh isolated exact fixtures. An
exact SQLite adapter must reject REAL values and require the shared gate before
any eventual production composition. It must use narrow exact projections and
bindMoney, never global safe-integer reads. An exact in-memory implementation
must preserve observable ordering, filters, audit, void and rollback behavior.
No parallel authoritative expense table or balance is proposed.

Exact wire schemas and proof RPC wiring remain opt-in. Do not switch the live
app-contract or default initializer. The pinned shared gate is
`requireExactMoneySchema(db, "expenses")` in
`infrastructure/database/money-schema-gate.ts`. It requires metadata table
`exact_money_schema(slice TEXT PRIMARY KEY, version INTEGER NOT NULL)` with
row `('expenses', 1)`. Exact owned columns are `expense.amount_minor` INTEGER
and `expense.currency` TEXT constrained to DZD. Revision columns are nullable
`previous_amount_minor` and required `new_amount_minor`, both INTEGER; currency
inherits through expense_id. Validate actual storage types as well as the marker.
The shared legacy initializer will reject an exact marker or converted columns
before mutation, without an environment override. The old project reader also
cannot select the absent amount_dzd column. No production exact composition is
planned. Activation and transition execution require separate authority and
coordinated reader/writer coverage. A dependent integration stays unmerged if
needed.

## Shared ownership agreement

Issue 524 leads shared money input/rendering, package exports and initializer/
gate design. Issue 528 has made no shared edits. Agreed props:

- `CurrencyAmountInput exact={true}` keeps draft string value/onChange and uses
  an exact decimal-string maxAmount. Legacy numeric behavior stays unchanged.
- `MoneyValue exact={true}` accepts a string and optional `aggregate` for bounded
  wider report totals. Existing styling, grouping and optional decimals remain.
- `parseLocalizedMoneyInput(value: string): Money` lives at
  `apps/web/src/features/shared/exact-money-input.ts`. Preserve drafts while
  editing; submit its `.toWire()` without Number.

The exact project-cost expense input is a coordination seam for #529, not an
expense-owned combined report. Its final exported name is pending. The physical
column names and shared gate agreement were sent to #524; the coordinator was
notified about the numeric combined-reader constraint.

## Planned proof and UI approval

Test the existing public expense module/repository and actual RPC wiring with
independent literal expected amounts. Use selected factory plain and keyed
drivers on fresh fixtures. Cover 0.10 plus 0.20, int64 endpoints, neighboring
large values, malformed/exponent/overprecision rejection, old/new audit amounts,
nullable previous values, no-op edits, failure rollback, filters, void and reopen.
Preserve earlier failures and exact-SHA command/count/duration records locally.

Expense form currently uses useFormAmount/Number. Expense page has local numeric
formatting and a monetary division for tagged percentage. Integrate shared
exact props only after the reviewed shared commit. Preserve #483 current-month
filters and KPI states, #425 rejected-mutation field retention, keyboard/touch,
LTR numbers within RTL and visible voided rows. Select affected browser cases
with the repository selector; inspect actual before/after rendering with cropped
element evidence. No shadcn skill was found by the read-only UI inspector; no
package or skill was installed. Actual UI approval is required before merge.

Initial local review requires distinct debate, test-audit and code-review
sessions on committed complete scope. OpenCode remains disabled by policy.
Record the standing same-family separate-session exception if applicable.
Hosted current-head 5/5, resolved findings, CI and owner approval remain unmet.

## Applied lessons

The money-bound lesson requires separate aggregate and persisted bounds. The
inclusive-day lesson preserves existing range helpers. The dashboard lesson
preserves loading/error/retained-data states and shared grouping. The expense
void lesson requires literal visibility assertions. Saved PowerShell files
avoid Bash interpolation of variables in verification commands.

## Resource blocker

`pnpm install --frozen-lockfile` failed with ENOSPC while copying the locked
agent-browser Linux ARM64 binary. A second attempt with
`--package-import-method=hardlink` failed at the same file. D: reported 22 MB
free and C: 628 MB free. A later read reported 19 MB free on D:. No dependency
was added or lockfile changed. The
worktree has a partial ignored node_modules and no usable node_modules/.bin.
No implementation tests, typecheck, lint or browser run occurred.

Do not delete other owners' files, databases, keys or preserved work to recover
space. Resource recovery is owner-controlled. After space is available, resume
the frozen install, finish contract reading/consumer inspection, integrate the
reviewed shared gate from #524 and run the first focused failing test before
implementation. The coordinator and #524 were notified of this resource blocker.
