# Code Review — issue 239 (recurring-patterns contract deletion)

- **Head:** `7a0e564` · **Base:** `fd94c41` · **Tier:** Standard
- **Method:** two parallel sub-agents (Standards + Spec) over `git diff fd94c41...HEAD` (single commit `7a0e564`), per the `code-review` skill.

## Standards

No hard violations of documented standards (AGENTS.md, docs/engineering-workflow.md, `.agents/wisdom/*.md`).

- ✅ AGENTS.md scratch lifecycle: `239-design.md` committed; `.scratch/reviews/239/` is the in-progress evidence dir.
- ✅ AGENTS.md issue-closing convention: commit says "part of #239", no `(closes #N)` in title.
- ✅ No leftover references to the deleted procedures/page/hook/i18n keys (grep verified across apps/packages).
- ✅ `recurring.ts` still exported from the contracts index (`export * from "./recurring"`) — no unreachable-export regression (wisdom: barrel re-exports).
- Judgement calls, all defensible:
  - No Playwright E2E (engineering-workflow §4 scopes E2E to a user-facing flow; the deleted page was never routed — nothing to drive). Documented in the design doc.
  - Speculative Generality (keeping `recurring.ts` domain schemas exported + pinned): deliberate, documented design decision — domain vocabulary for the future feature.
  - The deleted code itself carried smells (mangled JSDoc blocks nested in the hook's function bodies; hardcoded Arabic copy beside i18n keys in the page) — deletion cures them.

## Spec

Spec source: issue #239 body + `.scratch/implementation/239-design.md`.

- ✅ "Contract and server agree" — procedures deleted; the regression test `expect("recurringPatternsList" in appContract).toBe(false)` / `recurringPatternsGet` pins the drift guard.
- ✅ "No `as any` at the router boundary" — `os.router(allHandlers)` with the cast + comment removed; zero `as any` in `apps/api/src/rpc/`.
- ✅ "`pnpm typecheck && pnpm test && pnpm lint` green" — **verified by the implementing agent** (reviewer had no shell access): contracts build ✓, typecheck 4 tasks ✓, lint ✓, test:api 707/707 ✓, test:web 375/375 ✓, contracts tests 97/97 ✓.
- ✅ Deleting the orphaned page/hook/i18n key is in-scope, not creep: they are the only consumers of the dropped procedures, and nothing imports them (behavior preserved).
- Minor, harmless scope note: the second test additionally pins the `requiresApproval` default and rejects `frequency: "YEARLY"` — beyond drift-guarding, but these were the test-audit improvements and keep the surviving schema pinned as a validator, not just a shape.
- No requirement looks implemented but wrong.

## Verdict

Standards: 0 hard violations (3 noted judgement calls, all defensible). Spec: 0 missing/0 wrong (1 unattested gate re-verified by parent). Clean to push.
