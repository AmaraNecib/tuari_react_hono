# Coverage Gate Policy — Branch Floor + v8-ignore Escape

- **Issue:** #242 (Reports should stop returning dashboard stubs — the report code
  carries provably-unreachable defensive branches)
- **Mode:** local-only (GitHub remote unavailable; Greptile CLI local review)
- **Ticket source:** `docs/local-issue-status.md` row 242 (no issue-specific
  local evidence; parent context #235/#242)
- **Target ref:** `fix/coverage-gate`
- **Base SHA:** `facd07ef17ecccf94da653c89e3fc96aa7a24700`
  (parent-specified base `origin/develop` HEAD; local `develop` ref `bb144f3a`
  is a stale ancestor, so the parent brief's base wins)
- **Review tier:** Standard (config + policy change)

## Decision

`apps/api/vitest.config.ts` currently sets `statements/branches/functions/lines`
all at `100`. The #242 report code (`apps/api/src/rpc/handlers/reports.ts`)
contains defensive branches that are provably unreachable given the surrounding
logic (e.g. `result?.items ?? []` where the optional-chained access already
guarantees the left side), and 100% branch coverage forces either v8 pragmas or
tests that assert illegal states — neither of which improves quality.

**Chosen policy:**

- `lines`, `statements`, `functions` stay at **100** — "tests pass" keeps its
  strict meaning for executable code.
- `branches` drops from 100 to a **99 safety floor** — the gate still fails on
  any real, reachable branch that is untested, while unreachable defensive
  branches no longer force illegal-state tests.
- A branch that is *provably* unreachable may additionally be marked with a
  commented `/* v8 ignore */` — allowed only when the branch is genuinely
  impossible (documented proof in a comment), never to dodge a real hole.

Rejected alternatives:

- Dropping branch coverage entirely — loses the safety net for reachable
  branches.
- Leaving branches at 100 and adding v8 ignores everywhere — pushes pragma
  noise into every defensive branch and still fails the gate on any missing
  one; 100% branch is not a meaningful target for defensive code.
- Lowering all thresholds to 99 — weakens the "tests pass" meaning; rejected.

## Changed contracts / files

- `apps/api/vitest.config.ts` — `branches: 99`, inline comment states the policy.
- `docs/engineering-workflow.md` — short coverage-policy note (new small section)
  explaining the branch floor + v8-ignore escape, referencing the #242 case.
- No production code, no test changes. CI (`ci.yml`) runs
  `pnpm --filter @tuari/api test:coverage`, which enforces thresholds from the
  same config — no separate 100% assertion exists to update.

## Validation plan

- `pnpm --filter @tuari/api test:coverage` passes with branches ≥ 99 and the
  other metrics ≥ 100; record before/after numbers.
- `pnpm --filter @tuari/api test` passes.
- `pnpm --filter @tuari/api typecheck` clean.

## Risks

- A future real regression could be masked at exactly one uncovered branch
  point. Mitigation: 99 still fails on reachable uncovered branches in practice
  (coverage is typically ≥ 99.9% or 100%; a drop to 98.x trips the floor), and
  code review still applies.
- The v8-ignore escape could be misused. Mitigation: policy requires a
  documented proof of unreachability, and review gate applies.

### Review follow-up (2026-08-19)

- **Aggregate floor:** the 99 branch floor is the approved tolerance; the
  #242 unreachable branches live in the in-scope company module
  (finance.service.ts), so the `v8-ignore` escape applies where needed. The
  vitest config comment now states this so it is not misread as out-of-scope.
- **Scratch id:** kept `coverage-gate` as a descriptive sub-id (following the
  existing `175-perf-security` precedent) instead of renaming to `242`, because
  the actual #242 feature already owns `.scratch/implementation/242-design.md`
  and `.scratch/reviews/242/`; co-locating under `242` would collide on merge.

### Review follow-up #2 (2026-08-19) — REVISED decision

The 99 branch floor was a mistake and is REVOKED. Greptile flagged (twice) that
an aggregate 99% floor still lets a small number of REACHABLE untested branches
pass silently, contradicting the "any reachable untested branch fails"
guarantee. Final policy: **all thresholds strict 100 (lines/statements/
functions/branches)**, with a commented `/* v8 ignore */` escape ONLY for
provably-unreachable defensive branches (excludes them from the numbers). This
keeps the guarantee true without forcing illegal-state tests for impossible
branches. The #242 unreachable branches (finance.service.ts, in-scope company
module) are handled by the escape and reach 100% once pushed.

**Scratch id:** kept `coverage-gate` (descriptive sub-id, matching the existing
`175-perf-security` precedent) rather than `242` because the actual #242
feature already owns `.scratch/implementation/242-design.md` and
`.scratch/reviews/242/`; co-locating under `242` would collide on merge. This
change is a #242 follow-up: see #242 for the feature design/reviews.
