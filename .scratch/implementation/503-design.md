# Issue #503: coordinated negation

## Scope and baseline

Worktree: `D:/worktrees/tuari_react_hono/fix-issue-503-independe-c0b3f65c060f7211`.
Base: `55a61c8f665b468b8b7a375dc3fbff0f83ab0347`, fresh origin/develop.
Live issue #503 has no comments and remains reproducible. Current path is
`scripts/ci/close-linked-issues.sh`; history shows #487 did not fix this case.
High-assurance applies because the script changes external issue state.
Mode: focused-local / CI-final-enforced. Ruleset 26837184 was inspected live:
active, strict CI acceptance from app 15368, no bypass, resolved threads,
force-push and deletion guards. Historical pending documentation is superseded
by the owner's explicit effective rollout instruction, not edited here.

## Contract and design

A closing reference is an immediately adjacent closing verb and issue number.
A negated closing reference must not cause a close request. The existing
sentence splitter and affirmative idiom exception retain their meanings.
No product-domain vocabulary or public interface changes.

The agreed test seam is the real Bash entry point with fake curl and real jq.
Tests assert literal expected issue-state effects, not a copied matcher.
Extend only the NEGATED_CLOSE gap to cross complete closing references when
each is immediately followed by whitespace, `or`, and whitespace. Repetition
allows a chain without admitting arbitrary issue markers or contrast prose.
A bounded hosted-review correction permits the existing `*` and `_` emphasis
markers after each crossed reference. Without this, `fix **#A** or resolve #B`
incorrectly closes B. All four supported emphasis spellings get state-effect
regressions with an affirmative contrast control. The focused real-shell
probe first reported B and the affirmative control as close candidates, exit 1,
then only the control after the gap correction, exit 0. No new grammar or
extraction behavior is introduced.
A second bounded hosted correction also permits supported emphasis before
coordinated verbs. `or **resolve** #B` is already an affirmative extraction
form and must remain under the original negator. Add four verb-emphasis
variants with next-sentence affirmative controls. Its real-shell probe failed
before this correction and passed afterward. Together the gap supports
closing emphasis on the previous reference and opening emphasis on the next
verb, without changing CLOSE_REF, conjunction grammar or sentence splitting.
`does not close #A, but Closes #B` still closes B. The affirmative extraction,
sentence splitting, number subtraction and API behavior stay unchanged.
No broader grammar, comma-or extension, workflow or unrelated changes.

Architecture: no seam moved. The existing entry point hides extraction and
safety checks from the workflow caller. Deleting it would move that complexity
back into the workflow. Reuse CLOSE_REF rather than duplicate verb syntax.

## Proof and review

The new second-reference assertion failed against the original matcher.
Its exit-zero and next-sentence affirmative controls passed. The initial full
matrix exceeded a 200-second Bash timeout, so its final matrix result is not
accepted as baseline proof. Preserve that log, including a later unrelated
failure; do not label it a clean baseline run.

The focused script matrix is slow on Windows, so subsequent complete runs use
heavy_run with the explicit Git Bash executable. The first queue invocation
used cmd-incompatible syntax; the second resolved WSL Bash. Neither executed
the matrix. The third ran the affected matrix with 182 passes, zero failures.
Bash syntax and diff whitespace checks pass. ShellCheck is not installed;
TypeScript lint/typecheck do not apply to these Bash-only changes. Full
application checks remain CI-final.

Require distinct initial debate, test-audit and code-review sessions at the
committed head, then current-head CI acceptance and hosted Greptile 5/5.
Keep source frozen during review; record exact-SHA proof locally afterward.

## Authority and reversal

No UI change. Reverting the matcher is easy, but external issue-state changes
can generate notifications and misleading closure history that a code revert
does not erase. Treat merge as owner-approval-needed rather than infer that
small diff size makes durable effects cheap. Publication is explicitly
authorized. No merge before that approval and all technical gates.

## Applied wisdom

Apply the body-only closing-reference lesson and verify issue state after
merge. The historical instruction to close immediately is subordinate to
current full-scope acceptance and owner approval. No repeated new lesson is
asserted in this lane.
