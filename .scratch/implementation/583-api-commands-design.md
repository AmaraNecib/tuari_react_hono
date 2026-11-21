# #583 API command reference

## Scope and authority

Worktree: `D:/worktrees/tuari_react_hono/t3-fa35430a-9875fdd407728e88`
Base: `725ed1003d6c890e4a0867d464a75302e3828a93`
Issue: [#583](https://github.com/AmaraNecib/tuari_react_hono/issues/583)
Verification: focused-local / CI-final-enforced, supplied by parent. Hosted acceptance and effective protection remain separate parent gates.

Prospective owner-approved routine-review trial slot 4. Eligible factual documentation task: short, reversible API command reference, verified against package scripts and configs. Complete scope: `apps/api/README.md` and `.scratch/implementation/583-api-commands-design.md`. No runtime, config, package, tests, CI, policy, financial, authentication or security behavior changes. No overlap with #558 or #574. Combined local review is parent-owned after commit; no other initial lens is authorized for this eligible trial selection.

## Source facts

- Root `package.json`: `dev:api` checks web tracking and builds `@tuari/contracts` before filtered API dev; `test:api` builds contracts before filtered API test.
- `apps/api/package.json`: dev is `tsx watch src/index.ts`; build is `tsup`; start is `node dist/index.cjs`; test is `vitest run`; lint is `eslint .`; typecheck is `tsc --noEmit`.
- `apps/api/tsup.config.ts`: entry is `src/index.ts`.
- `apps/api/vitest.config.ts`: test files match `**/*.test.ts`.
- `packages/contracts/README.md` is the linked source for generated contract export preparation.
- `docs/engineering-workflow.md` is the verification authority. Focused tests do not replace applicable affected verification.

## Proof plan

Prose/source-reference checks and `git diff --check` only. No startup, full tests, build, browser run or dependency install for prose. Record exact commands, exits, elapsed time, logs and committed SHA in ignored `.scratch/reviews/583/` before handoff. Freeze source for parent review; run Phase 2 only after review/fixes.
