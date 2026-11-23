## A bare `yyyy-MM-dd` is a point, not a range bound: the picked end day excludes itself (🟠 Major)

After #428 made `DatePicker` emit canonical `yyyy-MM-dd`, the audit log's date
filter compared `new Date(log.timestamp) <= new Date(endDate)`. `new Date("2026-10-15")`
is UTC midnight, so every log written after 00:00 on the picked end date fell
outside the range — the picked day silently excluded itself. The report builder
had a sibling failure: it sent the bare day straight to `reportsGenerate`, whose
contract is `z.string().datetime({ offset: true })`, so the wire gate rejected
the input outright.

The rule: a range's END day includes the whole day. Expand a picked day pair to
inclusive instants in the app's timezone (Africa/Algiers) at the boundary where
the range is built — start = `00:00` local (`…T23:00:00.000Z` the previous UTC
day), end = `23:59:59.999` local (`…T22:59:59.999Z`). Do it in the range builder,
NOT in the picker: the picker's job is one canonical day, and every consumer of
a day pair needs the same expansion. One helper owns it
(`apps/web/src/lib/date-range.ts` → `resolveDayRangeBounds` /
`isInstantWithinDayRange`); consumers keep passing canonical days and the helper
expands them.

The audit that made it concrete (#428 round 2):

- audit log (`audit-log-page.tsx`): `new Date(endDate)` — dropped the whole picked day.
- report builder (`hooks/use-report-queries.ts`): bare day → rejected by the datetime contract.
- system log (`workspace-queries.ts` `useSystemLogQuery`) and expenses
  (`expenses-filters.ts`): already end-of-day; unified onto the shared helper.
- API: `resolveReportWindow` (`entryMs <= endMs`) and `compareTimestampsDesc`
  both verified inclusive, so end-of-day client bounds include the whole day.

Keep the distinction: a SINGLE-day consumer (`occurredAt`, `entryDate`,
`paymentDate`, `expenseDate`, `openingEntryDate`) is a point event and stays
start-of-day. Only a RANGE gets the inclusive end.

**Always**: when a range is built from day strings, the end bound is that day's
END instant, not the bare day. Pin it with a record at 23:59 on the picked end
date (must be IN) and one at 00:00 the next day (must be OUT); a mid-day seed
cannot tell the two boundaries apart.

