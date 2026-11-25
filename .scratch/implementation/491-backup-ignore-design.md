# #491 runtime backup ignore

Base: `d9510a7ec43986d825139b72d04ecf70253322d6`. Worktree: `D:/worktrees/tuari_react_hono/fix-491-contracts-tree-isolation`. Verification mode: `focused-local / CI-final-enforced`, under owner acceptance record `.scratch/sessions/ci-final-owner-acceptance-616.md`; ruleset `26837184` requires strict CI acceptance from integration `15368`. This local slice does not recheck live protection or claim hosted acceptance.

PR #585 (`cabe73da`) added the read-only `scripts/dev/check-worktree-contracts.mjs` preflight, which detects missing or external API/web contract links and malformed or missing generated entry files. It does not change links or assert freshness. Its isolated fixture tests cover a sibling-target failure independently for API and web; the suite is wired into `check:repo-hygiene`. The remaining scoped issue item is that `.gitignore` did not exclude runtime `apps/api/backups/`.

Add the directory to `.gitignore` and use `git check-ignore --no-index` against a synthetic nonexistent backup pathname. The test must not enumerate or read the actual backup directory. No product source, installed dependencies, shared node_modules links or backup contents are touched.

Architecture: no seam moved. Applicable wisdom: stale contracts `dist` lesson, because path ownership is not build freshness; excluded for this ignore-only change. Existing PR #585 tests provide sibling-link protection coverage; no redundant changes to that preflight are planned unless focused evidence finds a gap.
