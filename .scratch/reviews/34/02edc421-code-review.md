# Code Review — Issue #34 (head `02edc42`, base `fbb7d02`)

Two-axis review (standards + spec) run by parallel `reviewer` sub-agents at
head `0e656ab`; findings applied in commit `02edc42` (dead i18n key removed,
retained-data edge test added, no-data assertions completed). Diff under
review: `git diff fbb7d02...HEAD` — 4 files (details page, its RTL test,
`ar.ts`, design record).

## Standards

**Correct**
- Commit staging per AGENTS.md: only source/test + the issue's design record
  committed; no `git add -A` evidence.
- `InvoiceLoadError` mirrors `DebtsLoadError`
  (`home-view-page-content-detail-pages.tsx:39-57`) structurally: same
  `Surface role="alert" variant="panel"`, `TriangleAlert aria-hidden`,
  `common.retry` (exists, `ar.ts:17`), outline retry button.
- Early return placed after all hooks; `isPending` short-circuits first;
  `!detail` covers settled-no-data. Rules of hooks respected.
- i18n block correctly nested (`detailPages.invoice` sibling of `shell`);
  RTL/a11y fine.

**Violation raised → resolved**
- Playwright-mandate exemption (`engineering-workflow.md` §3 / feature-implement
  §3: every user-facing feature gets a `tests/e2e/` test): **parent-mandated
  deferral** — the crew brief for this round explicitly forbids Playwright and
  assigns the E2E suite to lane #25 (shared e2e DB + ports); CI runs the full
  suite after merge. Recorded in `34-design.md` so it is not a silent deferral.

**Judgement calls**
- Duplicated Code: `InvoiceLoadError` is a byte-copy of `DebtsLoadError` except
  the message key — the task explicitly sanctioned mirroring. Now the 3rd
  repeat → proposed follow-up: extract a shared `LoadErrorSurface`.
- Dead i18n key: `detailPages.invoice.loading` was added but unused (loader
  stays the page's inline Arabic line). **Fixed**: key removed in `02edc42`;
  only the used `loadError` key remains. No string is duplicated across
  `ar.ts` / inline JSX / test.

## Spec

**Verified**
- `isError` → error surface with message + إعادة المحاولة retry; loader absent.
- has-id-but-no-data (settled, not pending, data undefined) → same surface,
  covered by `|| !detail`; unit-tested.
- `isPending` → loader; error surface absent. Guard ordering does not shadow
  pending (`!invoiceQuery.isPending && (isError || !detail)`).
- Success rendering untouched in the diff; success regression test present.
- UI strings i18n-keyed (`detailPages.invoice.loadError`, `common.retry`);
  RTL-safe (role=alert, aria-hidden icon, flex-centered layout).
- No RPC/API changes; no Playwright this round (per brief).

**Missing → resolved**
- Spec review flagged the unused `loading` key (spec's i18n requirement only
  half-met for the loader) → key dropped; loader intentionally reuses the page
  inline string, consistent with the rest of the page being inline Arabic.
- Retained stale data on settled `isError` (failed background refetch) was
  untested → test added asserting the error surface wins over stale data.
- No-data test lacked the "no invoice content" negation → assertions completed.

**Scope creep**: none remaining (only the one-dead-key note, fixed).

## Verdict

Standards: 0 open findings (1 hard violation was a parent-mandated deferral,
recorded). Spec: complete after one key removal + two test additions.
Per-axis worst issue: Standards — shared error-surface duplication (follow-up);
Spec — none.