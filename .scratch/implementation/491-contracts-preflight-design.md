# #491 worktree contracts preflight

## Scope and authority

Base `bd1101edeb431e8f06580aa841303192ccc2e85a`; worktree `D:/worktrees/tuari_react_hono/t3-babeccf0-e208fcf7c43cdfe1`. Partial #491: add a read-only Node operation/CLI that checks whether API and web resolve this checkout's `packages/contracts` and its declared runtime/type entries. This does not address backups, alter dependency management, or close the issue.

Verification mode: focused-local / CI-final-enforced, strict ruleset 26837184, required CI acceptance app15368, no bypass. High-assurance: false-positive ownership checks could make dependency/proof provenance appear trustworthy when sibling output is used. Three initial lenses remain parent-owned.

## Interface and vocabulary

`inspectWorktreeContracts(repositoryRoot = process.cwd())` returns `{ ok, diagnostics }`; the CLI supports an optional root and `--json`. The seam is filesystem resolution: canonical repository root, expected contracts package, each app's workspace link, and the package's `import` and `types` targets. A valid location is not evidence that generated output is fresh or matches source SHA.

## Domain and design

A contracts workspace package owns the API and web runtime/type entry targets; a package-manager content-addressed store is not the ownership contract. The module keeps resolution, metadata validation, diagnostics, and CLI formatting behind one small exported operation. Its tests exercise real temporary filesystem links, not mocked path helpers. No architecture seam beyond this CLI operation moved.

## Wisdom applied

Applied stale contracts `dist` and stale installed dependency lessons: successful existence/ownership checks do not establish freshness; build evidence stays separate. Excluded historical universal shared-link claims: #550 sampled installed links locally, so this check tests current observed resolutions rather than assuming all worktrees share links. Applied the worktree package-manifest lesson by keeping fixtures independent and not changing manifests.

## Verification and review

Focused test: `node --test tests/worktree-contracts.test.mjs`. Expected-red import failure recorded separately before implementation. Parent handles three review lenses. Changed-file manifest: the two requested scripts, focused test, and this design note only.
