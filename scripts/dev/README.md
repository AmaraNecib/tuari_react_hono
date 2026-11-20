# Worktree contracts preflight

Run `node scripts/dev/check-worktree-contracts.mjs [repository-root]` before relying on API or web checks. It verifies both app links and the package's declared ESM and type entry files resolve inside that root's `packages/contracts` package. Add `--json` for structured diagnostics.

This read-only check does not prove generated files are fresh or built from the current source revision. Freshness needs separate build/provenance evidence. Shared pnpm content-addressed storage is not itself an error; the check follows the workspace package links.
