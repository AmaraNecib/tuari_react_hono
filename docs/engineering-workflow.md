# Engineering workflow

This is Tuari's lifecycle policy. Read this, then use `feature-implement`.
The owner requested Dockan's CI-final approach, adapted to pnpm, Hono, Vitest
and Tauri. The reference revision and deliberate differences are recorded in
[workflow adoption](workflow-adoption.md).

## Authority and state

A worker commits and reports. The parent owns publication, current-head hosted
checks, finding resolution and merge. Publication and merge require owner
authority; a worker never pushes or opens a PR. The current workflow-adoption
task is local-only by owner instruction, not because GitHub is unavailable.

Use remote issue data and fresh `origin/develop` normally. In owner-requested
local-only mode, use the supplied spec and cached refs, record that boundary,
and do not claim hosted acceptance or issue closure.

## Lifecycle

1. Read the wisdom index and matching lessons. Pin the worktree, base, spec,
   review tier and verification mode in the committed design note.
2. Implement with focused failing-first proof. Run Guard Phase 1, then commit
   the complete reviewable scope. Keep source frozen for reviewers.
3. Run the required local lenses once at that HEAD. Resolve findings against
   source. Commit bounded corrections, refresh affected proof and obtain one
   fresh combined-delta review that explicitly carries unchanged conclusions.
4. Run Guard Phase 2 on the committed HEAD. Return the verified SHA and local
   evidence path. The worker stops here.
5. When authorized, the parent publishes, links and watches the PR, requests
   hosted review once per head, verifies current-head CI and effective
   protection, and applies Guard Phase 3 before an authorized merge.

Do not restart all initial reviews just because a bounded correction produced
a new head. Rerun another lens only for a concrete risk introduced by that fix.
After three correction rounds, reassess the design instead of repeating the
same loop. Never defer or relabel an actionable finding to reach a score.

## Verification mode

**Activation is pending.** This change defines the CI-final implementation;
it does not configure GitHub protection. The last protection inspection
returned `404 Branch not protected`. See the explicit owner rollout in
[CI-final activation](ci-final-activation.md). Never borrow Dockan's activation
evidence for this repository.

The parent passes `focused-local / CI-final-pending` before activation, or
`focused-local / CI-final-enforced` after checking current effective protection.
Both modes use affected local proof. Pending means not merge-ready, not a
reason to silently restore routine full local suites. A real enforcement
regression blocks merge and goes to the owner.

### Local proof

Run focused regression and affected integration tests for changed behavior and
direct callers. Add relevant lint, typecheck and generated-file checks. Preserve
negative proof for money, inventory, auth, crypto and recovery contracts.
Every test needs a reachable failure and an independent expected result.

Full local suites, full browser runs, production builds and dependency audits
are not routine. Record a concrete uncertainty or CI coverage gap before
running one locally. `heavy_run` schedules a justified run; it does not justify
broader scope. Full suites, builds and the dependency audit run in CI.

For a browser-reachable change, inspect the existing selector before taking a
heavy slot:

```bash
git diff --name-only --no-renames <base> HEAD > .scratch/sessions/changed.txt
node scripts/ci/e2e-selection.mjs --files .scratch/sessions/changed.txt
```

Use the result to select affected browser cases. An unknown or critical path
fails closed to full scope; explain any local expansion rather than treating
the selector as permission to run everything. CI independently computes its
event range and honors its full-run override. No local red-on-parent replay
is required or introduced by this adoption.

### Background verification and records

Delegate verification only when authorized, through a visible T3 child.
Give it an absolute worktree, committed SHA, explicit verification mode,
bounded test files and direct callers, commands and unique log directory.
It reads source and writes ignored evidence only. One writer owns each tree;
serialize build/test generators within that tree. Completion wakes the parent;
do not poll a live child. Heavy commands use the shared slot queue.

The parent checks the actual result, not just the child's success label. Save
`.scratch/reviews/<scope>/<HEAD>-verification.md` with:

- exact base and tested HEAD, worktree, mode, start/end and elapsed duration;
- changed paths, selected cases and selector decision, including skips;
- each command, native exit code, test counts and raw log paths;
- failures, retries and expected-red probes separately from passing checks;
- the final source fingerprint and any changes made during execution.

Use saved `.ps1` files with literal absolute paths on Windows. Do not put
PowerShell variables inside Bash double-quoted commands. Preserve UTF-8 logs,
inspect compiler diagnostics even after exit zero, refuse log overwrites and
avoid cleanup. Never overwrite a failed attempt with a retry.

### CI acceptance

`.github/workflows/ci.yml` owns the full checks. A single event-SHA selector
decides API, web, Rust and E2E applicability. Both sides of renames are retained.
Unknown paths or history, pushes to develop, manual dispatch and the
`e2e:full` label force full scope. CI records the decision in its job summary.

The stable `CI acceptance` job always runs and fails closed. Lint, typecheck,
build, dependency audit and detection must succeed. API, web, Rust and E2E may
skip only after a successful, explicit selector decision. Missing, failed,
cancelled or malformed results are not green. Current-head acceptance is
required before merge, separately from local readiness and protection.

## Review depth and independence

The tier follows the named reachable failure, not line count or a path alone.
Record the tier and reason in the design note. Lightweight is reserved for
truly non-reviewable files; code, tests, docs, config and skills are reviewable.

This repository retains three distinct initial sessions: `debate`,
`test-audit`, then `code-review`. High-assurance applies to reachable money,
stock, debt-direction, auth/session/secrets, crypto, recovery, dependency,
schema, CI/release/merge-policy and unresolved integration risks. Do not
silently import Dockan's repository-specific routine-review exception.

A bounded correction needs one fresh review of the combined delta and direct
affected callers, not a restart of every lens. Read prior findings as claims,
verify source, record what remains valid and expose any new risk.

Select `openai-codex/gpt-6-luna` explicitly for ordinary workers and reviewers.
Use the currently enabled routes. OpenCode is opt-in, never a quota fallback.
Prefer an enabled working non-author family. If none is enabled, use separate
same-family sessions under the owner's standing approval and record:

```json
{"independence":{"approvedBy":"owner","reason":"Standing owner approval: OpenCode unavailable; same-family separate-session review"}}
```

Record actual reviewer session/model IDs and source SHAs. Never infer a model
or verdict from a clean command. No local score or separate confidence
assessment is required. Greptile is the scored review gate: require its
current-head 5/5 and resolve actionable findings when publication is authorized.
Request Greptile once per pushed head. Missing verdicts, including exhausted credit, block merge; do not retry
to spend more credit on the same head. Preserve existing configured hosted
requirements rather than claiming they were waived.

## Design and architecture

Use `domain-modeling` and `codebase-design` while working. For the changed
modules and direct callers, record vocabulary, real interfaces, deletion-test
depth and duplication. The parent applies `improve-codebase-architecture`
after a clean local review when a module, interface, adapter or seam changed.
If none changed, record `architecture: no seam moved`. Keep this scoped to
the diff. It is not a repository-wide audit or automatic specialist fanout.

## Evidence and wisdom

Design decisions remain committed under `.scratch/implementation/`.
Review reports and verification logs remain local, ignored and exact-SHA
anchored under `.scratch/reviews/`. Never stage them, make evidence-only
commits, attach the reports or post their contents. When authorized, publish
only the concise readiness summary the owner asks for, not review files.
Existing tracked reports are untracked without deleting their local copies.

Wisdom lives in `.agents/wisdom/<category>/<lesson>.md`. Read the index,
search relevant symbols/failures and read only matching lessons. The parent
writes a lesson after a pattern recurs; workers report candidates under
`Lesson:` in their commit body. Wisdom is history, not a second policy gate.

## Source and merge discipline

Stage explicit paths only, never `git add .` or `git add -A`. Generated builds,
native binaries, databases, dependencies and scratch logs stay out of source
commits. Preserve unrelated files and partial work.

A lane never merges. The parent needs owner authority, current-head local
and hosted verdicts without actionable findings, successful `CI acceptance`,
effective protection and all issue acceptance criteria. A CI, schema,
published-contract, crypto/recovery or other expensive decision goes to the
owner. A green check never overrides an owner-only decision.

Put `Part of #N` in the PR body for partial delivery and `Closes #N` only for
complete scope. Never infer closure from a PR title. Verify issue state after
an authorized merge and preserve remaining acceptance gates.
