# #459 / PR #481 — test audit at `f1e00278`

- mode: remote
- base SHA: `d6164c65`
- reviewed HEAD: `f1e00278`
- agents: edge-case hunter, coverage analyst, test-quality reviewer.
- tier: Standard

## Acceptance criteria → tests

| Criterion (design §Behaviour / Round 2) | Test |
| --- | --- |
| Existing account → `PAYMENT`, `-|amount|`, `entryDate`, note, no create | `debts-mvp-web.test.tsx` existing-account describe |
| Typed minus is a magnitude | "treats a typed minus as a magnitude" |
| No account on the ledger → create, positive opening, derived direction | `submitOpening` + "opens the chosen ledger's account…" |
| Label/title/description track the resolved action | label/description asserts |
| Blocked while either mutation is pending | "stays blocked while the opening save is in flight" + "stays blocked while the payment save is in flight" |
| `role="status"` reason (zero / non-numeric / saving) | "says why a zero payment submit is blocked", "says a non-numeric payment is invalid…", saving assert |
| Description names the selected ledger | "labels a ledger with no account as an account creation…" |
| Resolver seam | `debt-utils.test.ts` (5 cases) |

Every criterion has a test. Gate follow-ups from round 1 are each pinned:
invalid ≠ zero, the `saving` status, the RECEIVABLE movement, and the empty
create amount.

## Edge cases

**Red-on-pre-fix coverage added this round:** the entry-mutation pending half of
the gate (previously only the create half was exercised — deleting
`createDebtEntryMutation.isPending ||` kept the suite green) and the RECEIVABLE
payment path (previously every component payment test used a PAYABLE account).

Remaining (pre-existing, deferred):

- **Rejected mutation.** Every mock resolves, so the failure path is
  unexercised. The failure is not silent in the app: both debt mutations call
  `showErrorToast` in `onError`, and sibling debt forms await `mutateAsync` the
  same way. A dedicated test would need a `mockRejectedValueOnce` plus a toast
  assertion; deferred with the error-surface finding in the debate evidence.
- **Arabic-Indic / grouped / comma-decimal amounts** (`"١٢٠٠"`, `"1,200"`,
  `"12,5"`) parse as `NaN` and show the invalid reason. Pre-existing parse
  approach shared with the other debt forms; deferred.
- `"1e5"` / `"0x10"` pass `Number.isFinite` (silent magnitude). Deferred.
- A true double-click against a deferred `mutateAsync` is not exercised; the two
  pending tests pin the `disabled` guard instead (React skips `onClick` on a
  disabled button — the actual guard).
- Low: post-success reset, whitespace-only note → `null`, create-path typed minus,
  `workerId` → `INTERNAL_WORKER`.

## Test quality

- Names state the rule; async assertions are all awaited via `waitFor`; no
  floating promises.
- Isolation is explicit: `vi.clearAllMocks()` plus `mutationPending` reset in
  `afterEach` (round-1 order dependence removed).
- The round-1 vacuous `fireEvent.click` on a disabled button was removed; the
  pending test now asserts `disabled` and the on-screen saving reason, which is
  what actually guards the submit.
- Grade: **A−** (up from B−). One name ("…so a second click cannot post the
  opening amount as a payment") claims slightly more than the test proves; the
  design doc's wording was flagged as stronger than the assertion. Deferred as a
  naming nit.

## Verdict

No blocker. Coverage is complete for the #459 acceptance lines; the new tests
discriminate (the pending test fails on the pre-fix code). Remaining gaps are
pre-existing and deferred.
