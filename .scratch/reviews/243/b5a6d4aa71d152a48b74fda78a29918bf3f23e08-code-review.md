# Issue #243 — Code Review (Standards + Spec axes)

- **Base:** `origin/develop` @ `6be34976954dee8b6ef33a34ce923d348270cdb0`
- **Reviewed HEAD:** `b5a6d4aa71d152a48b74fda78a29918bf3f23e08`
- **Mode:** local-only. **Method:** two parallel reviewer sub-agents (Standards, Spec).
- **Raw outputs:** `.pi-subagents/artifacts/f1df4199_reviewer_0_output.md` (Standards), `.pi-subagents/artifacts/f24f0d3d_reviewer_0_output.md` (Spec).

## Post-evidence delta note

Reviews were produced at `f5f0c593`. Subsequent commits (`f5f0c593 → b5a6d4aa`)
are **test-only** (edge-case tests; `HistoryRow[]` type fix in
`record-page-frame.test.tsx`). No production code changed since the reviews, so
the findings stand for the final HEAD.

## Standards axis

Verdict: **no hard violations. Worst finding: Minor.**

- Compiles with AGENTS.md source-only staging (all source/test/design/.scratch, no generated artifacts), engineering-workflow §2 design doc committed, §8 evidence plan honored.
- Judgement-call smells (non-blocking, documented in design §2/§7):
  1. **Mysterious Name** — `AppShell*` components now resident in `features/shared/`. Deliberately retained (avoids shadcn `Table*` collisions in same files; rename deferred as cosmetic follow-up).
  2. **Duplicated Code / boilerplate** — pre-existing `@description Component` JSDoc blocks (and doubled doc blocks on `AppShellFilterShell`/`DateRangeFilter`) carried over by the move.
- No Feature Envy / Data Clumps / Primitive Obsession / Message Chains / Middle Man / Refused Bequest introduced — the move changes ownership only.

## Spec axis

Verdict: **ATTESTED — matches spec, no blockers. Zero scope creep.**

- Single owner = shared: both primitive files relocated to `features/shared/`.
- Dead code removed: `AppShellSectionSurface`/`AppShellSectionBody` (zero-consumer) and orphan cursor `PaginationControls` + test; grep-confirmed zero residual refs.
- Dependency inversion resolved: `record-page-frame.tsx` imports `./table-primitives`.
- All 12 consumers migrated (app-shell x5, audit, employee-table, record-page-frame, inventory-invoices, report-builder, debts-hub, externals); zero old-path imports remain.
- Behavior preserved: byte-identical relocation; `dir="rtl"`/`scope="col"`/`colSpan`/tooltip-wrap intact.
- Non-goals respected: no raw `<table>` migration, no shadcn `components/ui/table.tsx` migration, no #244 workspace-page-union work.

## Aggregate summary

- Standards: 2 non-blocking judgement calls (minor). Worst: `AppShell*` naming / JSDoc boilerplate.
- Spec: 0 findings. Complete, minimal, single-owner collapse.