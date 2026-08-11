# Issue #333 — CI: cut per-PR wall-clock (parallel Build + Playwright browser cache)

**Tier:** Standard (CI workflow config)
**Base:** `origin/develop` @ `bb144f3`

## Problem (measured)

Full PR CI runs take **4:20–4:53 wall-clock** (runs 31444623668 / 31443809053 / 31442994951). Critical path:

1. `test-e2e` ≈ 2m43s — longest job: `playwright install --with-deps chromium` (~40s, browser re-downloaded every run) + suite (~2m).
2. `build` ≈ 1m27s — **serialized after ALL test jobs** via `needs: [lint, typecheck, test-api, test-web, test-e2e]`. Docs-only PRs pay it too.

## Decisions

### D1 — `build` runs in parallel with test jobs

Drop the `needs: test-*` edges on `build`; keep `needs: detect` (so the path filter still gates it where sensible) — actually keep it simple: `build` keeps `needs: detect` only.

- Merge safety unchanged: branch protection requires `Build` as a required check; the merge gate still waits for it, but the PR no longer pays test-time **plus** build-time sequentially.
- Wasted-compute risk (build runs on a failing-test PR) accepted: build is ~50s and turbo-cached; #297 already fixed the cost axis via path filters — this adds no new runner minutes, only overlaps existing ones.

### D2 — Cache the Playwright browser

Before `playwright install --with-deps chromium`, restore a cache at `~/.cache/ms-playwright` keyed on the installed Playwright version (`pnpm exec playwright --version`). Miss → install as today and save cache. Version bump busts the cache automatically.

## Public surface / files touched

- `.github/workflows/ci.yml` — only file changed
  - `build` job: `needs: [lint, typecheck, test-api, test-web, test-e2e]` → `needs: detect` (+ remove the `if: ...` guard that referenced them if present)
  - `test-e2e` job: add Playwright cache steps around the `playwright install` step

## Tests / validation

- `actionlint` on the modified workflow (if available) or YAML parse via ruby/python
- Verify with `gh workflow run` dry inspection is not possible — instead push a real branch and watch a full CI run: assert (a) `build` starts concurrently with tests, (b) E2E job restores the browser from cache (log line "Cache hit"), (c) all 6 required checks green
- Total wall-clock target: **≤ ~3 min** on a full PR

## Risks

- Build-parallelization wastes a build on red-test PRs (~50s) — accepted.
- Cache key drift: Playwright browser cache must be keyed on the exact Playwright version (path includes the version; a stale key just misses → full re-download, no correctness risk).
- `actions/cache` v4 requires `node20` runner — ubuntu-latest satisfies it.
