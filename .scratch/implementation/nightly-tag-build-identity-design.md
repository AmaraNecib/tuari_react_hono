# Nightly tag build identity

## Scope and authority

- Worktree: `D:/worktrees/tuari_react_hono/t3-30713a63-e25fe5a673c9661d`
- Base: `origin/develop` at `c253231d4a581a083818d891677c481c143fff23`
- Risk: high, because the Nightly workflow publishes artifacts and moves a release tag.
- Authority: the owner authorized this local workflow repair and tag correction. The parent owns publication, hosted checks, Greptile, finding resolution, and merge. This lane must not publish or dispatch a new build.
- Verification mode: `focused-local / CI-final-enforced`; ruleset `26837184`, app `15368`, strict checks, no bypass. This lane does not verify or change repository protection.

## Behavior

`Capture checked-out source SHA` runs `git rev-parse HEAD` once, validates a full commit SHA, and records it as the workflow step output. After the portable archive, artifact verifier, sidecar probe, SQLCipher check, and installer smoke test pass, the workflow updates `refs/tags/nightly` to that SHA. The helper uses GitHub's refs API with `force=false`; it creates the ref only after an HTTP 404. Other read, create, update, and readback errors fail the job. The helper checks the tag readback against the captured SHA. Release creation then uses that same SHA as `--target`.

The interface is the helper's command line: one full commit SHA, `GITHUB_REPOSITORY`, and the authenticated `gh` CLI. It changes only the Git ref. Release deletion and asset upload remain in the workflow, with explicit native exit-code checks. Existing signed/version tags and immutable release assets are outside this change.

## Failure boundary

The Git ref update and release delete/create calls are separate GitHub operations. If the tag update succeeds and release creation later fails, `nightly` can point at the new source while the previous release remains absent or incomplete. The workflow does not roll back the ref: another publisher could have advanced it, and rollback would overwrite that writer. This is not an atomic transaction.

## Test seam and proof

The helper runs as a Node process and calls the real `gh api` subprocess interface. Tests place a harmless fake `gh` executable first on `PATH`, backed by queued HTTP responses, and use a temporary Git repository to create the source commit. The expected SHA comes from a separate `git rev-parse` in the test fixture; the mocked API checks the exact SHA in the mutation arguments. Cases cover existing-ref advance, 404-only creation, permission/API failure, non-fast-forward rejection, wrong readback, and a `GITHUB_SHA` value that differs from the checked-out SHA. Workflow assertions cover smoke-before-tag ordering, tag-before-release deletion/creation, shared release target identity, and unchanged artifact upload scope.

## Design and wisdom

The helper is a small module around one write-and-verify behavior. `gh` is its external adapter; the fake executable tests the same process seam without production credentials or network writes. The workflow remains the composition point. No domain glossary term or architecture seam moved, so no `CONTEXT.md` or ADR change is warranted.

Read and applied the process wisdom on CI host changes. Its runner and workflow-snapshot warnings do not apply to this tag identity repair. No matching Nightly release lesson exists in the indexed wisdom.
