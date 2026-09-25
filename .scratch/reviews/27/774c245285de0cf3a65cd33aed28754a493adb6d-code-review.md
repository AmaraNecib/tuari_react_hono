# Code review — issue #27 (empty-state guidance)

- base SHA: `fbb7d029b78c56558764812c518bfec51bc1be7b`
- reviewed head: `774c245285de0cf3a65cd33aed28754a493adb6d`
- diff: `git diff fbb7d02...774c245` (4 commits: 0710a4b feat, f4196b6 round-1
  fixes, b90f339 evidence, 774c245 round-2 fix)
- reviews: round 1 = parallel `reviewer` subagents (Standards `8a282f3f`,
  Spec `c2541fa5`) + hosted Greptile on PR #40; round 2 = hosted Greptile
  finding fix + local re-verification
- tier: Standard — evidence SHA matches the final reviewed HEAD (later commits
  touch only `.scratch/`, non-reviewable)

## Round 1 (Standards + Spec axes, parallel reviewer subagents)

### Standards axis

Verified scope & intent: diff matches `.scratch/implementation/27-design.md`;
extends `RecordHistoryTable` with backward-compatible optional
`emptyHint`/`emptyAction`, wires four surfaces, adds `ar.ts` keys, RTL tests
only. `WorkspaceLink`/`WorkspaceRouteTarget` reuse consistent with the
navigation layer; no import cycle. AGENTS.md staging discipline respected;
design doc committed; no Playwright (lane #25 owns E2E).

**Doc-standard violations:** none.

**Baseline smells (judgement calls):**
1. Duplicated Code / Divergent Change (minor) — hint markup forked between
   `record-page-frame.tsx` and the items-catalog empty state. → FIXED (round
   1): single shared `AppShellEmptyHint` primitive in `table-primitives.tsx`.
2. Data Clump (minor) — `emptyLabel`+`emptyHint`+`emptyAction` travel
   together; a grouped `emptyState?` prop would be tidier. Accepted: props
   stay optional and independently gated (hint-only/CTA-only paths legal and
   tested).
3. Repeated Switches (trivial) — shared "إدارة العاملين" label under distinct
   keys. Matches per-surface keying convention; not a violation.

### Spec axis

All design commitments confirmed against implementation: shared primitive
extended as designed (label → hint → CTA inside `AppShellEmptyStateRow`,
`buttonVariants default sm`), CTA targets match the design table
(project/warehouse → `workspaceRoutes.employees()`; work-history →
`workspaceRoutes.employeeEdit(employee.id)`), items catalog keeps its create
CTA + gains the hint, i18n keys in the right namespaces pass the literal-key
gate, no scope creep (invoice create/details untouched; no API/RBAC/role
changes), RTL-safe via typed `WorkspaceRouteTarget` + frame `dir="rtl"`.

Round-1 findings fixed in `f4196b6`: work-history guidance gated on
`isWorker` (placement surface is worker-only), shared hint primitive, unit
cases for hint-only/CTA-only branches, non-worker regression, load-proof
timeouts.

## Round 2 — hosted Greptile finding (PR #40, 4/5) + fix (774c245)

Hosted Greptile flagged a real must-fix the CLI review missed: the work-history
empty CTA was gated on `isWorker` only, NOT on active status. An INACTIVE/LEFT
worker would see an edit-placement CTA pointing at `/employees/$id/edit`, but
the #20 placement flow persists workplace changes only for ACTIVE workers — the
non-active worker would submit and the change would be silently ignored. That
is the exact dead-end #27 exists to eliminate.

Fix (`774c245`): gate the hint + CTA on `canAssignWorkplace =
isWorker && employee.status === "ACTIVE"`, mirroring the existing add-payment
action gate in the same file. Non-active workers get the label-only empty
state; ACTIVE workers keep the guidance. Regression tests: `it.each`
INACTIVE/LEFT worker-role employees show no hint/CTA; the ACTIVE worker case
still shows both (verified: 578/578 web tests, typecheck + lint clean).

## Aggregate

Standards: 0 hard violations (3 judgement calls: 2 accepted, 1 fixed).
Spec: 0 findings after round-1 fixes; round-2 hosted finding fixed and
re-verified. No blockers remain.