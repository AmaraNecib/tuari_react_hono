# Greptile local review — issue #175 (migration/recovery lane)

- HEAD reviewed: `15f48c8` (branch `feature/issue-175-migration-recovery`)
- Base: `origin/develop` @ `6be3497` (pinned base; local `develop` ref is far
  ahead — first run against `--branch develop` produced an unrelated 483-file
  scope and was discarded; re-run with `--branch origin/develop` produced the
  correct 2-file scope).
- Command: `greptile review --json --branch origin/develop`
- Raw result: `.scratch/reviews/175/15f48c8-greptile-local.json`
- Stderr: `.scratch/reviews/175/15f48c8-greptile-local.err`
  (warning only: the evidence dir itself was uncommitted at review time)

## Verdict on THIS change set

- Summary of the diff under review matches the lane scope exactly: "adds
  isolated SQLite migration rollback and same-database recovery tests, plus an
  implementation design record."
- `comments: []` — zero review comments on `migration-recovery.test.ts` or the
  design doc.
- Overall confidence: **2/5** — driven entirely by two "Files Needing
  Attention" entries that are **NOT part of this diff** (verified below).

## Findings (both outside this change set → escalated to parent, not fixed here)

1. `apps/api/src/app/dependencies.ts` — Greptile claim: the composition root
   "continues opening the database with only the explicit injection key rather
   than the key loaded from the configured file".
   Verification: `git diff origin/develop...HEAD -- apps/api/src/app/dependencies.ts`
   is EMPTY. This is inherited M1.4 composition-root behaviour (#265/#352 era),
   untouched by this lane. Scope: desktop DB-key config flow — an M1.4/desktop
   concern, not schema-migration recovery.
2. `.agents/skills/cli-review/SKILL.md:55` — Greptile claim: the install
   instruction `curl -fsSL "https://greptile.com/cli/install" | sh` pipes an
   unpinned network response into a shell.
   Verification: introduced by base commit `6be3497` itself (the branch base);
   `git diff origin/develop...HEAD -- .agents/skills/cli-review/SKILL.md` is
   EMPTY. Doc/tooling concern in the base, pre-existing.

## Consistency

The first Greptile attempt (`--branch develop`) compared against the local
`develop` ref `bb144f3` instead of the pinned base, producing a giant
unrelated diff (same trap as the wisdom lesson "Greptile diffed the PR against
the wrong base"). The evidence below is from the corrected `origin/develop`
run only.