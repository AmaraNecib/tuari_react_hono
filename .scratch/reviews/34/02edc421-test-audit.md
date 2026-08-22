# Test Audit — Issue #34 (head `02edc42`)

Three-agent test-audit (edge case hunter, coverage analyst, quality reviewer)
run at head `0e656ab`; findings applied in `02edc42`.

## Acceptance-criteria coverage

| Criterion | Test |
| --- | --- |
| `isError` → error surface + retry | "renders the load-error surface … when the invoice-group query errors" (alert role, message, retry button, no loader, no invoice content) |
| has-id-but-no-data → same surface | "settled, no error" `noDataQuery()` (alert, message, retry, no loader, **no invoice content** — added in review) |
| `isPending` → loader | "keeps the loader while … pending" (loader text, no alert, no retry button) |
| success unchanged | "renders the invoice details unchanged on success" (heading, totals, CONSUMABLE+ASSET entries, movement, attachment, back button) |
| no Playwright this round | diff touches only page/test/`ar.ts`/design record — no e2e files |

Retry → `refetch` asserted (`toHaveBeenCalledTimes(1)` after clicking
إعادة المحاولة on the `isError` path; both paths share the same
`InvoiceLoadError` + `onRetry` wiring).

## Edge cases

**Fixed this round**
- **Retained stale data on settled error** 🟠: a failed background refetch
  leaves `isError: true` with previous `data` held; the error surface must win
  over the stale invoice. Test added ("prefers the error surface over a
  retained invoice when a settled refetch fails") — asserts alert + retry and
  absence of the invoice heading.

**Rated, deliberately not in scope**
- **Empty/blank invoiceId** 🔴: the hook sets `enabled: Boolean(invoiceId)`, so
  `""` would pin the query to pending (infinite loader) — but the shell seam
  only mounts this page when a truthy id is present
  (`HomeViewPageDetailContent`: `selectedInvoiceId ? <…DetailsPage> :
  <MissingRecordState>`), and the issue scope is the id-present paths. Not
  reachable through the app; documented as a fixture-level limitation.
- Retry → recovery transition (refetch mock doesn't mutate state): the wiring
  is shared with the DebtsLoadError pattern (`void query.refetch()`); an
  escaping refetch would reject — same accepted pattern as the rest of app.
- Stale-data state `isPending` with previous `data` held: not modeled; the
  guard checks `isPending` first, which matches TanStack semantics.

**Minor (not blocking)**
- Null `invoiceNumber`/`supplierName`/`invoiceDate` fallbacks, fully-paid
  `remainingDebtDzd === 0` (payment button hidden), empty collections,
  decimal formatting — untested; these render paths are pre-existing page
  behavior, unchanged by this diff.
- `noDataQuery` is unreachable from the real hook
  (`requireEntitySuccess` throws → `isError`); kept as a defensive
  belt-and-braces test per the issue's explicit "has-id-but-no-data" ask.

## Quality (reviewer grade: A)

Conforms to repo conventions (`// @vitest-environment jsdom`, `vi.hoisted`
mocks, `vi.mock("./inventory-hooks")` + dialog mock as in the create-page
test, `QueryClient({ retry: false })`, Arabic assertions, issue-tagged
describes). Behavior-driven names distinguish the tri-state surface;
role-based queries with paired positive/negative assertions; `beforeEach`
`vi.clearAllMocks` + `afterEach` cleanup keep isolation; synchronous
`mockReturnValue` states avoid `waitFor` races. Only nit left: the three
error-surface tests repeat the same assertion block (a tiny helper could
dedupe) — readability is fine as-is.