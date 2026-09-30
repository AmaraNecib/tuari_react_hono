# #428 / PR #438 — debate evidence (`db016406`)

Adversarial pass on `git diff edf1e5b3...db016406` (BASE `develop` @ `edf1e5b3`).
Ran as a 7-child review workflow (critic, defender, standards, spec, edge-case,
coverage, quality) with a fresh-context model at high thinking. The critic and
defender disagreed on severity, not on facts; the edge hunter found the
timezone-fragile tests the critic called "latent".

## Critic's money/data/blocking findings

1. `resolveDayRangeBounds` is not idempotent and silently mis-bounds
   non-canonical input (4/10). Verified with node:
   `{fromDate:"2026-09-30T23:00:00.000Z"}` → start shifts back one day;
   `{toDate:"15/10/2026"}` → both bounds `undefined` (silent unfiltered);
   `{toDate:"2026-02-30"}` → `2026-03-02` (silent wrong day).
2. Pre-existing UTC-vs-Algeria seed/conversion on the invoice page (3/10).
3. `DateRangeFilter` "must expand" rule is doc-only (2/10).
4. Browser-local parse/format vs Algeria boundary (1/10) — no day shift.

## Defender's rebuttals (accepted)

- `format`/`parse` both use the local calendar, so `yyyy-MM-dd` round-trips
  exactly in any timezone; no UTC day shift in the picker.
- No dangling bridge exports; grep is empty.
- The `+1` offset is correct for Africa/Algeria (no DST since 1981).
- React Query key (raw days) vs queryFn (resolved instants) is deterministic.

## Defender's 3 unrebutted criticisms (all real, all fixed)

1. Empty DatePickers open on the browser-local month while the audit/report
   tests anchored to the Algeria month → a one-hour-per-month cell-not-found
   flake.
2. `resolveDayRangeBounds` returns `DayRangeSelection`, whose doc says "days",
   while holding instants.
3. The audit page filters a full client-side fetch (pre-existing, out of scope).

## Synthesis / dispositions

| # | Finding | Sev | Verdict |
|---|---|---|---|
| D1 | range seam silently mis-bounds non-canonical/invalid/double-expanded input | Med | Fixed `db016406` |
| D2 | `DayRangeSelection` type reused for instant bounds | Low | Fixed (`DayRangeInstantBounds`) |
| D3 | per-row bound re-resolution in the audit filter | Low | Fixed (`isInstantWithinBounds`, resolve once) |
| D4 | audit/report tests timezone-fragile at month boundary | Med | Fixed (system-month anchor) |
| D5 | screens/inventory tests vacuous on the 15th | Med | Fixed (non-default day + guard test) |
| D6 | stale expense-form test comment (deleted bridge) | Low | Fixed |
| D7 | design doc round-1 risk contradicts round-2 | Low | Fixed (doc pointer) |
| D9 | invoice UTC-vs-Algeria seed/conversion | Pre-existing 3/10 | Reported to parent, not fixed |
| D12 | `workspace-queries.test` passes on pre-fix | Info | Dismissed — boundary pinned; round-1 regression covered by `table-primitives.test` + screen tests |
| D13 | round-2 range semantics beyond issue #428 | Info | Accepted — documented in design + wisdom; fixes real end-day drop + wire rejection |
| D14 | browser-local vs Algeria picker day | Info | Dismissed — round-trips exactly, no day shift |
| D15 | legacy `dd/MM/yyyy` defensive branch has no caller | Info | Dismissed — deliberate defense per design |

No money-loss, data-corruption, or crash path was found in the changed call
graph. The three fixes above close the latent classes the critic and defender
both reached from opposite directions.
