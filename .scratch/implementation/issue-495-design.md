# Issue 495 portable runtime gate

## Scope and authority

Worktree: `D:/worktrees/tuari_react_hono/fix-v1-issue-495`.
Base: `93be734450380ddcf0e91590f0ce73e22bf5029a`, target `develop`.
The owner authorized implementation, publication and gated merge in this independent thread.
Issue #495 requires `portable:only` to reject previously staged plaintext runtimes.

Verification mode: focused-local / CI-final-enforced. Live ruleset 26837184 is active with no bypass, strict `CI acceptance` from app 15368 and review-thread resolution. The checked-in activation document predates that external rollout. Protection will be read again before merge.

Review tier: high-assurance. The reachable failure is publication of an artifact that silently ignores an encryption key.

## Design

The existing portable command is the caller-facing seam. It copies release inputs into a temporary portable folder. Run the existing built-runtime encryption proof against that exact copy before deleting a previous published folder or ZIP, renaming, or invoking tar. Reuse the proof's explicit path parser and defaults. Do not rebuild the runtime, add a plaintext override, or define a new crypto predicate.

The proof checks native loading, keyed file roundtrip, non-plaintext bytes, wrong-key/no-key/plain-reader rejection, then boots the copied API with a key and verifies its actual database and daily backup. This also detects a stale plaintext loader even when the encrypted native package is present. Failed proof must exit nonzero and preserve previous outputs. Temporary failed candidates are not published.

Domain terms remain unchanged. A staged runtime is an input; a portable folder and ZIP are published outputs. No product or financial rule changes. No UI changes.

## Proof and architecture

Add CLI-level isolated fixture tests for rejected and accepted proof results, exact copied paths, existing output preservation and archive ordering. Use the real proof for missing encrypted dependencies, a real plain SQLite binding that ignores encryption PRAGMAs, and a plaintext loader with the encrypted binding present. Native package resolution follows the installed dependency graph; CI fails rather than skipping missing dependencies. Exercise existing encryption-proof and availability tests and relevant repository checks. Wire the regression file into the existing `check:sqlcipher-proof` command.

A focused local contracts/API sidecar build is justified by the Windows packaging integration gap: the existing hosted encryption proof does not package the copied candidate through this CLI. Run the real portable script against that built API with a clearly synthetic shell placeholder and inspect its ZIP. This is runtime/packaging proof, not shell or installer acceptance. No full desktop build is needed.

The encryption proof is a deep existing module. Deleting it would duplicate native and API encryption validation in the packager. The portable CLI remains unchanged; no new configurable seam is needed. Applied wisdom: packaging must load the shipped prebuild, not merely find it. The full proof does that on the copied candidate.

All three independent local lenses remain required at a committed head. Hosted exact-head Greptile 5/5, current-head CI acceptance and effective strict protection remain merge gates.
