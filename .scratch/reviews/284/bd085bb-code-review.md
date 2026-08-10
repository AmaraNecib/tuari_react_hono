# Code Review — issue #284 repo hygiene

Diff: `git diff 03ec349` (uncommitted working tree vs develop HEAD).
Two parallel reviewer sub-agents: Standards + Spec.

## Standards

Documented standards (engineering-workflow.md, AGENTS.md, wisdom) — all met:
- TDD mandate: unit tests (5 new vitest cases in home-view.test.tsx) + Playwright E2E (tests/e2e/mobile-drawer.spec.ts)
- E2E follows repo wisdom (bootstrapOrSignIn, tour pre-seeded, heading waits)
- check:repo-hygiene wired into lint/test alongside the existing check:* chain
- Design doc + review evidence present
- repo-hygiene.test.mjs passes 3/3 on Windows (nul ENOENT check sound)

Baseline smells — all judgement calls, none actionable:
- Mysterious Name (minor): `.sb-mobile-backdrop` "sb" — dismissed: matches the repo's
  established sidebar prefix (`.sb-item-active`, `.sb-collapse-hide`)
- Duplicated Code (minor): explanatory comment duplicated in CSS + shell — prose only
- Divergent Change (minor): dataTour prop on WorkspaceSidebar for the shell's tour concern — minimal, accepted
- Speculative Generality (minor): dataTour single consumer — accepted (tour contract)
- Scope expansion: px→rem conversions — explicitly requested by the user

No blockers.

## Spec

All 5 issue items implemented and tested:
1. nul file: `/nul` gitignore rule + absence asserted (node test 1) ✓
2. tsconfig: prisma.config.ts dropped from include (node test 2) ✓
3. skip-to-content: SkipNavigation mounted pre-grid, MainContent wraps content
   (#main-content + tabIndex=-1); unit + E2E keyboard test ✓ (two placements, not
   literally "one line" — justified: the #main-content target is required)
4. focus ring: outline-ring/50 → outline-ring (node test 3) ✓
5. mobile drawer: wrapper div removed (root cause), real backdrop with onClick=closeSidebar,
   useEffect close on page change; unit + E2E ✓

Findings — none actionable:
- Same-page nav link doesn't close drawer (page unchanged) — edge case, not in issue text;
  backdrop tap still closes
- use-mobile-layout tablet-band close: beyond issue text, in design doc, tested (resize round trip)
- px→rem churn: user-requested
- Windows `access('nul')` suspicion — empirically cleared (passes on this machine)

## Verdict

Standards: 0 hard violations, 0 actionable smells.
Spec: 0 missing/partial requirements, 0 scope creep beyond justified additions.
No blockers either axis.
