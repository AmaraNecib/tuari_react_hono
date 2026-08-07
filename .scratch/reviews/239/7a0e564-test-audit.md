# Test Audit — issue 239 (recurring-patterns contract deletion)

- **Head:** `7a0e564` · **Base:** `fd94c41` · **Tier:** Standard
- **Method:** 3 parallel sub-agents (edge case hunter, coverage analyst, quality reviewer) over `git diff fd94c41...7a0e564`
- **Audited change:** deletion refactor — recurring RPC procedures dropped from the contract (no server handlers existed), `as any` removed at the router boundary, orphaned web hook/page + i18n keys deleted, 2 regression tests added in `packages/contracts/src/index.test.ts`.

## Findings applied (fixes)

1. **Cast-free existence check (quality reviewer, B+ → A- path).** Replaced `appContract as Record<string, unknown>` with the `in` operator: `expect("recurringPatternsList" in appContract).toBe(false)`. The cast silently allowed key misspellings to pass (false positive on the very invariant being guarded); the `in` check is fully type-safe.
2. **Negative validation case (edge case hunter F2).** The schema pin was happy-path only; added `expect(() => recurringPatternSchema.parse({ ...input, frequency: "YEARLY" })).toThrow()` so the schema is pinned as a *validator*, not just a shape — a future regression making it permissive fails here.
3. **Cleaner, less brittle assertion (quality reviewer #2).** Factored the payload const and asserted `toEqual({ ...input, requiresApproval: true })` — makes the `requiresApproval` default pin explicit and cuts the 30-line input/expected duplication.

Re-verified after fixes: contracts tests 97/97, `pnpm typecheck` green (4 tasks).

## Findings dismissed (with rationale)

- **F1 — optional fields (`customDays`/`formula`/`CUSTOM`/`FORMULA`) not exercised.** 🟡 cosmetic; the optional fields have zero consumers today (feature is future work) and will get real tests when the feature lands. Proportionate to skip.
- **F6 — `docs/COMPLETION_STATUS.md:81-83` lists the deleted files as delivered.** 🟡 cosmetic; the doc is a dated historical completion report for commit 7caf1de — the files *were* delivered then. Editing history to hide a later deletion would falsify the record. No change.
- **F7 — `recurringPatternListSchema` / `RecurringPatternList` remain exported with zero consumers.** Deliberate design decision (keep the recurring domain model exported for the future feature); documented in `.scratch/implementation/239-design.md`.
- **Coverage #2 — "no `as any`" criterion has no runtime test.** Inherent: a cast is compile-time, not runtime-observable. Guarded by `@typescript-eslint/no-explicit-any` lint + `pnpm typecheck` (`os.router(allHandlers)` now typechecks natively) + this audit's grep (zero `as any` in `apps/api/src/rpc/`).
- **Coverage #3 — router black-box test would not catch contract/server drift.** By design: `router.test.ts` is `@ts-nocheck` and bypasses the client type. The contract-level negative test (this change) + the api typecheck are the sentinels for re-introduced drift.

## Residual risks

- A re-added recurring procedure under a *different* name (e.g. `recurringPatternsListV2`) would pass the key-based negative test until extended; the compiler/lint still catch any `as any` re-introduction.
- Full-shape `toEqual` will need updating when the future recurring feature legitimately extends `recurringPatternSchema` (noted; test is deliberately small).

## Verdict

No 🔴/🟠 findings. Deletion is well-guarded: negative test fully covers the removed surface, no stale references survive (repo-wide grep clean), router typecheck is the compile-time sentinel, and all touched suites are green.
