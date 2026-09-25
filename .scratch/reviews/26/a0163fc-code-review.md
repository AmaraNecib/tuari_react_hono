# Issue #26 — Code Review (Standard tier)

**HEAD:** `a0163fc` · **Base:** `389336a` · **Date:** 2026-08-22

Two parallel fresh-context reviewer agents (Standards axis, Spec axis) audited
`git diff 389336a...a0163fc` against `.agents/wisdom/*.md`,
`docs/engineering-workflow.md`, and `.scratch/implementation/26-design.md`.

## Standards axis

### Correct
- Migration matches the repo's additive pattern exactly: `schema-definitions.ts`
  CREATE TABLE + `additiveStatements` `ALTER TABLE ... ADD COLUMN` (mirrors the
  `salary_period` precedent), drizzle schema updated, `employee_checked` rebuild
  mirror + INSERT-SELECT carry the column. Idempotent via the existing
  duplicate-column catch. Nullable, no CHECK.
- All new web strings i18n-keyed via `ar.ts`; no hardcoded Arabic in production
  UI. Label renames confined to the employee surfaces only.
- Occupation plumbed through all three mappers (`shared.ts`,
  `sqlite-company.repository.ts`, `company.repository-mappers.ts`), both
  adapters (sqlite + in-memory), `workforce.service.ts`, and the deep module.
- Occupation changes correctly do NOT trigger employee state history.
- Tests follow repo idioms; fixtures updated mechanically.

### Findings
- **minor** — CRLF vs LF: 6 files in the diff are CRLF-stored at base (verified
  byte-level; base blob 100% CRLF); no prior PR added lines to them, so
  `git diff --check` flags CRLF-added lines there. The committed blobs now match
  base CRLF byte-for-byte; neither the pre-push hook nor CI runs `--check`
  (verified in `.husky/pre-push` and `.github/workflows`). Repo-convention
  follow-up: converting these legacy files to LF could be a separate chore.
- **note** — `employee_checked` rebuild INSERT-SELECT references `occupation` on
  both sides; depends on the additive ALTER running first (same dependence as
  the existing `salary_*` columns, which shipped).
- **note** — `employee-edit-page-v2.tsx` `handleSaveAll` is a pre-existing stub
  (verified at base `389336a`) and the component is unreferenced; its
  FormState/field were brought in line for UI consistency only.

## Spec axis

Verified every design-doc claim lands: contract output `nullableTextSchema` +
input `max(120).nullable().optional()` (batch inherits), additive migration +
drizzle + rebuild path, both repos + both services + deep module, web
draft/row-card/create-page/details/edit v1+v2/table/derived payload, ar.ts
renames + new keys, tests. **No scope creep**: `git diff --name-only`
contains zero seed/RBAC files; `rbac_three_role` and role semantics untouched.
No Playwright (matches instruction).

## Verdict
No blockers. All actionable findings from the review round were addressed
(see test-audit evidence). Remaining items are pre-existing behaviour or repo
convention chores, not #26 regressions.