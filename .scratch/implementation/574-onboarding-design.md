# Issue 574: factual onboarding correction

- Worktree: `D:/worktrees/tuari_react_hono/t3-384322e7-1f3e1d423105f46f`
- Base: `f94af99e1dee404e704d44c4d5d67d161a9a5efe`
- Spec: GitHub issue #574; parent supplied local-only implementation authority.
- Tier: standard reviewable documentation. Risk is misleading current persistence, startup, or build ownership; no runtime behavior changes.
- Verification mode: focused-local / CI-final-enforced, as supplied by parent.
- Scope: README.md, docs/ARCHITECTURE.md, docs/README.md, and this note only.
- Current vocabulary: API starts at `apps/api/src/index.ts`; `createAppDependencies` composes migrated SQLite, Drizzle and domain ports; transport is Hono/oRPC; shared contracts are in `packages/contracts`.
- Deletion-test depth: delete this onboarding text and a new contributor must reconstruct entry point, persistence and current documentation navigation. The guide is useful if it points to their actual owners.
- No interface or runtime seam changed. Architecture review: no seam moved.
- Accepted ADR content remains untouched. No runtime, salary, settings, policy, dependency or CI files changed.
- Wisdom applied: searched startup and persistence lessons; none directly changes this factual documentation scope. Wisdom candidate: none.
- Verification plan: verify changed source claims and relative links, run the repository prose check and `git diff --check`; no app suite or desktop build for prose.
