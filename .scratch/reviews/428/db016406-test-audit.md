# #428 / PR #438 — test-audit evidence (`db016406`)

Edge-case, coverage and quality review of the tests in
`git diff edf1e5b3...db016406`.

## Edge cases (hunter)

- `resolveDayRangeBounds`/`toAlgeriaDayBoundaryIso` did not validate the
  calendar day: `2026-02-30` rolled to `2026-03-02` (verified empirically), and
  a `dd/MM/yyyy`/instant bound became an open range. Medium — not UI-reachable
  (the picker rejects these via date-fns `isValid`) but the shared helper is
  trusted by four consumers. Fixed in `db016406` (tests below).
- Double-expansion silently shifted the start bound one day; no idempotency
  guard existed. Fixed (throws).
- No test covered an invalid *range* day (only an unparsable instant). Added.

## Coverage (analyst)

- Submitted-value assertions, not display text: screen tests assert
  `occurredAt`/`entryDate`/`paymentDate`/`openingEntryDate`; inventory asserts
  `payload.invoiceDate` / `assets[].purchaseDate`; report asserts wire
  `startDate`/`endDate`; table-primitives asserts `onFrom`; audit asserts
  filtering.
- Real logic under test (only the RPC seam is mocked).
- **No-op-on-the-15th** weakness: `date-picker-screens.test.tsx` and
  `inventory-invoice-create-page.test.tsx` picked unconditional day 15, which
  equals the form default when the run date is the 15th. `debts-mvp-web.test.tsx`
  already guarded this; the other two now do too.
- `expenses` "already covered" verified: `expense-form-dialog.test.tsx` asserts
  the submitted `2026-09-30T23:00:00.000Z`, `expenses-page.test.tsx` asserts the
  expanded filters. No gap.
- `system-log-section` composition is untested (hook + `DateRangeFilter` are
  tested separately). Out of scope; noted for a follow-up if desired.

## Quality (reviewer)

Grades: `date-range.test.ts` A, `date-picker.test.tsx` A,
`workspace-queries.test.ts` A, `table-primitives.test.tsx` A,
`debts-mvp-web.test.tsx` A-, `audit-log-page.test.tsx` now A,
`report-builder.test.tsx` now A-, `date-picker-screens.test.tsx` now A-,
`inventory-invoice-create-page.test.tsx` now A-.
Async handling, isolation and assertion quality are sound; no missing awaits.
Missing-await / detached-DOM / sleep problems: none found.

## Guard-test effectiveness vs pre-fix `develop` (`edf1e5b3`)

| Test | Fails on pre-fix? |
|---|---|
| `date-picker.test.tsx` (canonical render/emit/normalize/hidden) | yes |
| `table-primitives.test.tsx` (`DateRangeFilter` emits canonical) | yes |
| `date-picker-screens.test.tsx` (7 screens) | yes |
| `inventory-invoice-create-page.test.tsx` (2) | yes |
| `debts-mvp-web.test.tsx` non-default-day payment | yes |
| `report-builder.test.tsx` | yes |
| `audit-log-page.test.tsx` | yes |
| `workspace-queries.test.ts` system-log bounds | no (pins a boundary; pre-fix already end-of-day) |
| `date-range.test.ts` | n/a (new module) |

## Red→green proofs for the `db016406` fixes

1. **Range-seam validation** — added 5 tests first; `vitest run
   src/lib/date-range.test.ts` failed 5/14 (`toThrow` received a value for the
   legacy/invalid/double-expanded cases). After the fix: 16/16 pass.
2. **No-op pick guard** — temporarily broke `DatePicker.handleSelect` (onChange
   commented) and:
   - old-style anchor `PICKED_DAY = TODAY_DAY` → `TransferItemDialog` test
     **passed** (vacuous; pick equalled the default);
   - guarded anchor → the same test **failed** (submitted the default, not
     `PICKED_ISO`).
   Picker restored; working tree has no mutation.
3. **Timezone-fragile anchor** — node probe at `2026-10-31T23:30:00Z` (TZ=UTC):
   Algeria day `2026-11-01` vs system month `2026-10`; the old anchor
   `2026-11-15` cell is not rendered by the empty picker, the new system-month
   anchor is. Tests now use the system month.
4. **Report-builder load timeout** — full suite hit the 5s default at 5.2s
   under `--maxWorkers=2`; isolated runs are 1.6–3.4s. Explicit 15s timeout
   added; assertions unchanged. Final full suite 680/680.

Coverage: `src/lib/date-range.ts` 100% stmts/branch/funcs/lines (scoped v8).
`src/features/audit/audit-log-page.tsx` remains a pre-existing large file at
~57% (only its new range block is covered by this PR's test).
