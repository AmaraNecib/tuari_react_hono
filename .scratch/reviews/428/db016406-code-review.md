# #428 / PR #438 — code review evidence (`db016406`)

Two-axis review of `git diff edf1e5b3...db016406` against the BASE `develop`
(`edf1e5b3`) and issue #428 / `.scratch/implementation/428-design.md`.

## Standards axis (fresh-context reviewer)

- Contract inversion is coherent: `DatePicker` accepts canonical `yyyy-MM-dd`
  (or legacy display, normalized) and emits canonical (`date-picker.tsx`).
- The shared helper is the single range seam: all four range consumers call
  `resolveDayRangeBounds` / `isInstantWithinBounds`; no re-derivation.
- Bridge exports deleted with zero remaining references.
- Wisdom entry is the durable, agent-facing record; staging is explicit.
- Smells flagged as judgement calls: `DayRangeSelection` holding instants
  (Mysterious Name / Primitive Obsession), and per-row bound re-resolution
  (Duplicated/wasted compute). Both fixed in `db016406`.
- **Dismissed**: "orphaned malformed JSDoc introduced in `use-report-queries.ts`".
  Factually wrong: `git show edf1e5b3:apps/web/src/hooks/use-report-queries.ts`
  already contains the `useInventoryReport(startDate? component.` fragments. The
  PR changed only `useReportQuery`'s own comment; the rest are pre-existing
  repo-wide `check:unslop` warnings (1659 before and after).

## Spec axis (issue #428 + design doc)

| Requirement | Status |
|---|---|
| Audit every `DatePicker` usage; pick one convention and say why | Done — inversion chosen and justified; 16-site audit in the design |
| Add a test per fixed screen asserting the canonical value survives a pick | Done — screen tests assert the submitted value, not display |
| Consider a lint/test for a non-`dd/MM/yyyy` literal | Declined with rationale (the literal is now the correct input); defensible, not an omission |
| Round 2: end day inclusive, one shared helper, every consumer | Done and consistent |

- **Scope creep noted, accepted**: round-2 range semantics (`lib/date-range.ts`
  and its consumers) exceed the ticket's format-only scope but fix two real
  bugs (audit end-day drop; `reportsGenerate` wire rejection). Documented in the
  design doc and `.agents/wisdom/testing.md`, so the review record is explicit.
- No requirement was missing or partially implemented.

## Fixes in `db016406`

- `resolveDayRangeBounds` validates canonical days (round-trips through
  `Date.UTC`), throws on a non-blank invalid bound, and refuses its own output.
- New `DayRangeInstantBounds` type; `isInstantWithinBounds` takes pre-resolved
  bounds so the audit page resolves once per filter change.
- Test anchoring and no-op-pick fixes (see test-audit evidence).
