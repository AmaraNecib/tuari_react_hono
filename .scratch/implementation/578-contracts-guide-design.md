# #578 contracts package guide

- Worktree: `D:/worktrees/tuari_react_hono/t3-0e330824-4044b84b12ba32de`
- Base: `ccc60b6961f322ed38a291caaa9f428c9bc1bd4a`
- Verification mode: focused-local / CI-final-enforced (parent supplied; hosted acceptance remains separate).
- Prospective trial slot: 2, recorded before reviewer outcomes. Parent preselection: `D:/worktrees/tuari_react_hono/t3-82ba8730-b15d68d081398c59/.scratch/reviews/550/workflow-comparison/trial-slot-02.md`.
- Eligibility: narrow, reversible factual documentation checked against current package scripts and consumers. No financial, auth, schema, source, CI or config behavior changed. Reversal is deleting the package README and this design note.
- Complete manifest: `packages/contracts/README.md`; `.scratch/implementation/578-contracts-guide-design.md`.
- Dispositions: README adds package-local guidance without duplicating repository policy. Design note records scope and evidence. No interface/seam moved; architecture review not applicable.

## Source checks

- `packages/contracts/package.json`: package entry points resolve to `dist/index.js` / `dist/index.d.ts`; build is `tsup src/index.ts --format esm --dts --clean --external zod`; dev adds `--watch`; package test is `vitest run`; typecheck is `tsc --noEmit`.
- Root `package.json`: package-filter build/dev/test/typecheck invocations, `test:contracts`, and `test:api` (`contracts build && api test`) match the guide.
- `apps/api/vitest.config.ts`: API tests run via Vitest; they are distinct from package contract tests.
- `.gitignore`: `**/dist/` ignores generated output.
- Applied wisdom: `.agents/wisdom/testing/stale-contracts-dist-masks-schema-changes-from-api-tests.md`; confirmed against package exports and root `test:api` script. A direct API test after contract source edits needs a rebuild; root `pnpm test:api` already builds.
- Excluded matching lesson: `.agents/wisdom/testing/rebase-onto-develop-after-sibling-frontier-prs-merge-rebuild-contracts-dist.md`; rebasing is outside this task.

## Proof and handoff

Prose/source-reference, manifest, and diff checks only. No builds, application tests, installs, publication or generated dist changes. Record commands, native exits, elapsed durations, SHA and log path in ignored `.scratch/reviews/578/` evidence. Commit only after Guard Phase 1. Freeze the committed tree for the parent-owned single combined review, then stop for parent Guard Phase 2; no local review or CI/hosted verdict is claimed here.
