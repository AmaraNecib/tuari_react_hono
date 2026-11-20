# #491 worktree contracts preflight

## Scope and authority

Base `bd1101edeb431e8f06580aa841303192ccc2e85a`; worktree `D:/worktrees/tuari_react_hono/t3-babeccf0-e208fcf7c43cdfe1`. Partial #491: add a read-only Node operation/CLI that checks whether API and web resolve this checkout's `packages/contracts` and its declared runtime/type entries. This does not address backups, alter dependency management, or close the issue.

Verification mode: focused-local / CI-final-enforced, strict ruleset 26837184, required CI acceptance app15368, no bypass. High-assurance: false-positive ownership checks could make dependency/proof provenance appear trustworthy when sibling output is used. Three initial lenses remain parent-owned.

## Interface and vocabulary

`inspectWorktreeContracts(repositoryRoot = process.cwd())` returns `{ ok, diagnostics }`; the CLI supports an optional root and `--json`. The seam is filesystem resolution: canonical repository root, expected contracts package, each app's workspace link, and the package's `import` and `types` targets. A valid location is not evidence that generated output is fresh or matches source SHA.

## Domain and design

A contracts workspace package owns the API and web runtime/type entry targets; a package-manager content-addressed store is not the ownership contract. The module keeps resolution, metadata validation, diagnostics, and CLI formatting behind one small exported operation. Its tests exercise real temporary filesystem links, not mocked path helpers. This adds a developer CLI/filesystem seam, not an application interface. Parent architecture review is scoped to that operation and its test callers.

## Wisdom applied

Applied stale contracts `dist` and stale installed dependency lessons: successful existence/ownership checks do not establish freshness; build evidence stays separate. Excluded historical universal shared-link claims: #550 sampled installed links locally, so this check tests current observed resolutions rather than assuming all worktrees share links. Applied the worktree package-manifest lesson by keeping fixtures independent and not changing manifests.

## Verification and review

Focused test: `node --test tests/worktree-contracts.test.mjs`. Expected-red import failure recorded separately before implementation. Parent handles three review lenses. Changed-file manifest: the CLI, its usage README, focused test, root `package.json`, and this design note. The root manifest change adds the fixture suite to the existing `check:repo-hygiene` script, already invoked by CI and root lint/test; no dependency, lockfile, workflow or protection change.

## Bounded review corrections

Initial reviews found directory export targets could pass and web-link coverage could be masked by a still-invalid API link. Parent confirmed these, malformed/null metadata behavior and insufficient negative/CLI proof. Export targets now require package-relative forward-slash paths and regular files after canonical containment. Malformed/null metadata returns diagnostics; unsupported/duplicate CLI arguments fail with usage status2. Each sibling case starts with the other app valid. All sibling fixtures live under a uniquely owned temporary sandbox, never a fixed shared sibling directory.

Expanded tests were run against the original module first: 17 passed and 8 failed. Corrected implementation passes 25 ownership/CLI cases plus 5 existing repo-hygiene cases. Cases cover both missing links, independent sibling ownership, missing/type/runtime targets, directories, malformed metadata, lexical/symlink escapes, spaces/root aliases and CLI success/default/failure. No claim of generated freshness or complete dependency-manager resolution. Initial worker exact-head logs were unavailable in its tree; parent preserved fresh expected-red and green logs separately rather than inventing those earlier records. Corrections and committed-head proof require a fresh bounded combined-delta review.

## Hosted finding: fixture suite not selected by CI

Greptile identified that the new suite was not included in root or CI command discovery. Parent verified the existing explicit lists. `check:repo-hygiene` now includes the fixture suite; CI already calls this command, as do root lint/test, so no workflow or gate change is needed. This runs isolated fixtures, not the preflight against CI's installed dependencies. The exact root command must pass and its script wiring is reviewed in the bounded delta. Issue #491 remains partial; hosted current-head 5/5 and acceptance still required.
