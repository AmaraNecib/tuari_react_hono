# #460 — Dead `dashboard-overview.tsx`, and entry dialogs that infer direction

- **Issue:** https://github.com/AmaraNecib/tuari_react_hono/issues/460
- **Branch:** `fix/460-debt-entry-direction`
- **Worktree:** `D:/projects/tuari_react_hono/worktrees/fix-debt-entry-direction`
- **Mode:** remote
- **Base:** `origin/develop` @ `79acb359` (branch fast-forwarded to it at run start)
- **Review tier:** Standard (UI + tests)
- **Change kind:** dead-code deletion + regression test. No user-visible behaviour change.

## Findings from the base (state before this diff)

### 1. `dashboard-overview.tsx` is dead

`grep -rn 'dashboard-overview\|DashboardOverview' apps packages tests scripts`
matches only the file's own `export function DashboardOverview()`. Nothing imports it.
The live dashboard path is the app-shell home view (`home-view-copy.ts`) plus
`features/reports/report-builder.tsx`. Decision: **delete the file**.

### 2. The explicit direction is already shipped

The issue was filed against the #447 verification review, before #458/#471 landed.
At the base (`79acb359`), commit `0da0a275` (#458/#471, "direction is never optional")
already did the work:

- `record-entry-payment-dialog.tsx:38` — `accountDirection: DebtAccount["direction"]` (required, was `?`).
- `void-entry-dialog.tsx:34` — `accountDirection: DebtAccount["direction"]` (required, was `?`).
- `debt-ledger-panel.tsx:259,265` — the only production call sites pass `debtAccount.direction`
  explicitly.
- `getDebtAccountBalanceDisplay` takes a required `DebtBalanceAccount`, so a
  direction phrase can no longer be rendered from a bare sign.

Re-doing that would duplicate a shipped change. The one thing the issue asked for
that is **not** present is the test it names in its verification: "a test that each
dialog renders the direction phrase from the passed prop (not from the account's sign)".
`VoidEntryDialog` has no such test (only the signed-delta test) and
`RecordEntryPaymentDialog` has no test at all.

## Scope of this diff

1. Delete `apps/web/src/features/dashboard/dashboard-overview.tsx`.
2. Add a regression test per dialog: same positive movement, two different
   `accountDirection` props, assert the phrase follows the prop and the opposite
   phrase is absent. Positive amounts are used on purpose — a sign-based
   implementation cannot produce two different phrases for one sign, so the test
   only passes if the prop drives the phrase.

## Interfaces / contracts

No production interface changes. The tests pin the existing required-prop contract:
`accountDirection: DebtAccount["direction"]`.

## Tests

- `apps/web/src/features/debts/debts-mvp-web.test.tsx` — new describe
  "entry dialogs take the direction from the prop, not the amount's sign":
  - `VoidEntryDialog` OPENING `+5000` with `PAYABLE` → `مستحق علينا`, with
    `RECEIVABLE` → `مستحق لنا`; the opposite phrase is absent each time.
  - `RecordEntryPaymentDialog` entry `+5000`, `accountCurrentBalance 5000`:
    same two-direction assertion over the entry phrase and the max-payment phrase.

No E2E: the diff removes an unrendered file and adds unit tests; there is no
user-visible flow to exercise, so no Playwright spec or visual evidence applies.

## Risks / migration

- Deleting the file cannot break a caller (no importer). It does leave some
  `dashboardPage.*` i18n keys unused (`home-view-copy.ts:347` still uses
  `dashboardPage.outstandingDebts`). Removing unused keys is a separate cleanup
  and is deliberately **not** done here — it would sprawl into `ar.ts` and is not
  part of the issue. Noted, not deferred silently.
- The direction tests assert existing behaviour; they cannot fail on a pre-this-diff
  checkout of this branch because the required prop already exists at the base.
  Their value is locking the contract so a future optional-direction shape regresses
  the build.

## Non-goals

- Re-implementing the explicit-direction prop (already shipped by #458/#471).
- Wiring `DashboardOverview` anywhere.
- i18n key pruning.
