## Pre-push hook load surfaces marginal timeout flakes (🟡 Minor)

The pre-push hook runs contracts build + typecheck + lint + test:api before
test:web in one chain. Under that load, vitest cold transforms run slower and
marginal timeouts tip over:

- `dependencies.test.ts` had a 20000ms describe timeout that passed standalone
  but hit ~20186ms under the hook (cold-start flake, per the entry above).
  Raised to 60000ms in #196.
- `apps/web/src/features/app-shell/home-view.test.tsx` ("renders project
  details as a dedicated page") flakes under load. `findByRole`'s default 1s
  timeout trips; passed 3/4 standalone runs. Untouched by API-only PRs.

**Always**: when a pre-push run fails on a *different* test than the previous
attempt, it's the loaded-machine cold-start class, not a regression. Verify the
failing file standalone, then retry the push. Do NOT "fix" web test files in an
API-only PR.

