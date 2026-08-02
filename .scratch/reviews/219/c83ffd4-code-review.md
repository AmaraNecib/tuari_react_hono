# Code Review (#219 — flaky home-view tests)

**Issue:** #219 — Flaky web tests: home-view navigation findByRole timing under full-suite load
**Tier:** Standard (test-only change)
**Base SHA:** `2039627` (origin/develop)
**Head SHA:** `c83ffd4`
**Date:** 2026-08-03

## Change

`apps/web/src/features/app-shell/home-view.test.tsx`: adds
`configure({ asyncUtilTimeout: 5000 })` from `@testing-library/react`
(+ comment referencing #219), raising the default async-wait timeout for all
`findBy*`/`waitFor` calls in the file from 1s to 5s.

## Review (single reviewer, both axes — proportional for a 2-line test fix)

- **Canonical API confirmed:** `configure` + `asyncUtilTimeout` exist in
  installed `@testing-library/dom@10.4.1`; `waitFor` defaults to
  `getConfig().asyncUtilTimeout`; `findBy*` is built on `waitFor` — so the
  config covers all 8 `findBy*` + 9 `waitFor` calls in the file.
- **Standards:** no violations; no production code touched; config is
  module-scoped under vitest per-file isolation (no cross-file leakage).
- **Smells:** N/A (test-only). Note: line 423's explicit `{ timeout: 5000 }`
  is now redundant but harmless — left as-is to keep the diff minimal.
- **Spec (#219):** satisfied — 5s default for all async utils, minimal
  reviewable diff, no scope creep.

## Validation

- Standalone file: 33/33 pass.
- Full web suite: 341/341 pass (three consecutive runs) + pre-push hook
  full guard suite green (contracts build, typecheck, lint, test:api 601,
  test:web 341).
- Root cause confirmed pre-existing on base `80d4926` (clean worktree) —
  same file, same findBy* timing pattern.

## Test-audit note (proportionality)

Full 3-agent test-audit fan-out skipped as disproportionate for a 2-line
timeout-config change with zero behavior/coverage delta; the change itself is a
test-quality improvement aligned with `playwright-best-practices` (UI-driven
flakiness → adequate waits) and validated by repeated full-suite runs.

**Verdict: no blockers; safe to push.**
