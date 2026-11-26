# Engineering workflow

This is Tuari's lifecycle policy. Read this, then use `feature-implement`.
The owner requested Dockan's CI-final approach, adapted to pnpm, Hono, Vitest
and Tauri. The reference revision and deliberate differences are recorded in
[workflow adoption](workflow-adoption.md).

## Authority and state

This table defines the repository's CEO / issue manager / Luna worker terms.
Role comes from the task brief, never from model, thread position or parentage.
It clarifies lane ownership; it does not override higher-priority instructions,
owner-only gates or an explicit per-run restriction. Workers and delegated
children cannot gain publication authority by calling themselves managers.

| Role | Owns | Required action |
| --- | --- | --- |
| CEO / queue owner | Queue order, cross-lane priorities and decisions spanning issues | Assign an issue outcome and authority to its manager. Resolve cross-lane conflicts and route owner-only decisions to the owner. |
| Issue manager | One issue's outcome, scope, evidence, remaining acceptance criteria and next safe path | Bind each worker to the correct tree and bounded task. Inspect worker evidence and source, verify remaining acceptance, then take a materially different authorized next step, wait only for a named live gate, or record a concrete external or owner blocker. Publication requires explicit authority and the correct bound tree. |
| Luna worker | The assigned implementation or review, within the named tree and scope | Implement and commit, or review and report. Hand back exact SHA, evidence, findings and blockers. Do not publish, open a PR, merge or write wisdom. |

Managers do not duplicate a worker's write, retry blindly, or authorize their
own risky scope. A worker stops at its explicit per-run boundary. A successful
partial PR remains partial and does not close the issue. The CEO owns queue
coordination, not each issue's acceptance outcome. Publication and merge remain
subject to owner authority, higher-priority rules and the existing CI/review
gates. This proposal changes no general merge authority and cannot authorize
its own publication or merge.

Use remote issue data and fresh `origin/develop` normally. In owner-requested
local-only mode, use the supplied spec and cached refs, record that boundary,
and do not claim hosted acceptance or issue closure.

Here, `parent` means the worker's responsible manager for issue-local decisions,
not automatically the queue CEO. It names responsibility, not additional tool
or publication authority. A delegated worker's terminal completion wakes its
calling thread. A top-level manager is not a delegated child of the CEO.
It sends its terminal proposal, material blocker or unavoidable publication
handoff to the assigning CEO's thread. In T3, use the visible `t3_thread_send`
route with that thread's supplied ID. Name the CEO as next actor when a CEO
decision is required. If delivery is unavailable, preserve the exact handoff
and surface the delivery blocker in the current thread; do not claim delivery.
A named live gate records who acts next, its expected result and the evidence
that ends the wait. These are procedural duties, not a runtime wake guarantee.

### Manager handoff checks

Before choosing the next action, the manager reads the committed worker result,
checks the actual source and evidence, and compares remaining acceptance with
the task's explicit stops. The manager must not infer success from a child
status or completion notification. If the worker's terminal result leaves work:
continue only with a materially different, already authorized action; wait only
for a named live gate; otherwise record the specific blocker and required
owner/CEO action. Do not start a duplicate writer or repeat a failed attempt
without a new diagnosis and a safe alternative.

| Scenario | Next actor | Next action | Evidence ending that step |
| --- | --- | --- | --- |
| Worker fails with an authorized alternative | Issue manager | Inspect the failure and remaining acceptance; assign or perform the materially different in-scope step. | Preserved failure, named alternative, scope authority and its bounded expected result. |
| Hard scope stop, no authorized alternative | Issue manager, then CEO or owner for the named decision | Stop affected work and report the concrete blocker; do not extend the brief. | Exact restriction and requested decision, or the external prerequisite needed to resume. |
| Successful partial PR | Issue manager | Verify the published SHA and shipped acceptance; retain the remaining work and keep the issue open. Workers supply commits, not PRs. | Shipped-versus-remaining acceptance with one authorized next deliverable or a named live gate/blocker. |
| Publication tool bound to the wrong tree | Issue manager, then authorized publisher if rebinding is unavailable | Stop publication, compare actual tool binding, branch and SHA with the reviewed tree; route a handoff if necessary. | Confirmed correct publication binding and reviewed SHA, or an exact-tree publication handoff. Never push coordinator changes to compensate. |
| Heavy process vanishes or exits while worker still awaits the tool | Issue manager or independent observer alerting that manager | Compare slot, owned process tree and durable logs; distinguish native exit from tool return before scoped intervention. | Separate native-exit and tool-return states, missing evidence and diagnosed next safe action. PID disappearance alone proves neither success nor tool return. |

## Lifecycle

1. Read the wisdom index and matching lessons. Pin the worktree, base, spec,
   review tier and verification mode in the committed design note.
2. Implement with focused failing-first proof. Run Guard Phase 1, then commit
   the complete reviewable scope. Keep source frozen for reviewers.
3. Run the required local lenses once at that HEAD. Resolve findings against
   source. Commit bounded corrections, refresh affected proof and obtain one
   fresh combined-delta review that explicitly carries unchanged conclusions.
4. Run Guard Phase 2 on the committed HEAD. Return the verified SHA and local
   evidence path. The worker stops at the task's explicit boundary.
5. The issue manager checks source, evidence and remaining acceptance, then
   follows the manager handoff checks above. When explicitly authorized and
   allowed by higher-priority instructions, the authorized publisher uses the
   correct bound tree to publish, link and watch the PR, requests hosted review
   once per head, verifies current-head CI and effective protection, and applies
   Guard Phase 3 before an authorized merge.

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
serialize build/test generators within that tree. Use the role contract above
for completion ownership; do not poll a live child.

Before calling `heavy_run`, record a unique attempt ID, admission-inclusive
wall-clock budget, queued time and durable log location. Use an independent
observer that can alert the responsible manager even when the worker is blocked
inside the tool. Keep an external command timeout and cleanup limited to the
owned process tree under existing safety rules.

Inside the owned command wrapper, record `started` with time, phase and PID,
then `ended` with time and the native exit code under that same attempt ID.
Only after `heavy_run` actually returns to the worker record `returned` with
time and the tool result. For failed admission, preserve the actual returned
result without inventing a process start or native exit. Never reuse attempt
IDs or overwrite failure evidence.

Native child exit and tool return are separate events. A missing native exit
is unverified execution; a recorded native exit without `returned` means tool
return remains unconfirmed. PID disappearance alone establishes neither. When
a deadline or state mismatch occurs, compare queue-slot ownership, the identified
process tree and logs before scoped intervention. Do not broadly kill processes,
duplicate a live writer or blindly retry. Record the last durable phase, missing
result and next safe action. These instructions describe procedural mitigation;
they neither install an observer nor enforce a timeout or repair tool behavior.
Use the current run's supplied observer setup, not a machine-local path in this
policy.

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

Use three distinct initial sessions in order: `debate`, `test-audit`, then
`code-review`, for all other reviewable work outside the eligible routine
classes below. This includes reachable money, stock, debt-direction,
auth/session/secrets, security, crypto, recovery, schema, dependency,
CI/release/merge-policy and unresolved integration risks. This policy change
itself uses that deeper route; it cannot approve its own lighter review.

A bounded correction needs one fresh review of the combined delta and direct
affected callers, not a restart of every lens. Read prior findings as claims,
verify source, record what remains valid and expose any new risk.

### Narrow routine review

The owner approved preparing adoption after the completed eight-task trial.
The trial covered four narrow factual-documentation changes and four related
visual-unit changes. It established feasibility, not measured cost savings,
and is not evidence of equal defect-detection sensitivity. It does not justify
lighter routing for broader runtime or domain changes.

Activation requires a separate explicit owner adoption decision after governance
review. Approval to prepare and review the proposal does not satisfy that gate.
Record the adoption decision, merge the reviewed repository instructions, then
apply the matching reviewed higher-priority instruction alignment. Until that
sequence is complete, retain the three-session default. The adoption design
records each gate without treating a pending decision as granted. Reviewer
approval alone cannot activate this exception. The completed trial does not restart or
authorize additional trial slots.

After activation, one fresh combined independent reviewer may replace the
three initial sessions only for:
- Narrow source-backed factual corrections with direct current-source proof,
  no accepted-authority conflict, and no broad guidance rewrite or removal.
- Small reversible visual-only changes whose actual rendering evidence and
  relevant interaction tests establish unchanged behavior and domain contracts.

Record eligibility, rationale and the complete changed-file manifest in the
existing design note before outcomes. Account for direct callers, reachable
consequences, uncertainty and reversibility; disposition every file. Labels,
line count, docs-only or tests-only status never establish eligibility.
Mixed scope or unresolved eligibility uses the three-session default.

Exclude the elevated risks listed above, consequential test weakening without
proved equivalent detection, authoritative-source conflicts and broad guidance
changes. A cosmetic change in a business caller is not automatically a domain
change, but unchanged semantics must be proved, not assumed from a CSS-only
label. State/event/contract changes are outside the visual class.

The combined reviewer covers applicable standards, specification and proof
adequacy at the committed frozen HEAD. Review execution remains independent
of authorship. A success label, class-string assertion or screenshot alone
does not establish actual CSS behavior or interaction correctness. The parent
checks exact-tree execution evidence and failed-attempt boundaries. Missing
required proof blocks readiness; never relabel it as a passing run.

This exception changes only local initial review depth. Tests, UI, negative
and integration proof, current-head hosted verdicts, CI acceptance, effective
protection, reviewer independence, finding resolution and owner-only gates
remain unchanged. It changes no elevated scheduling. A consequential miss,
misclassification or evidence failure pauses lighter routing for reassessment.
Correct incomplete attempts before accepting their evidence; preserve failures
and escalate if eligibility or required proof remains uncertain.

Use the existing design/handoff and ignored execution records, not a new
mandatory per-task report, classifier child or automatic retrospective.
Record actual review/execution counts, confirmed defects and disposition;
measure parent/reviewer active and elapsed time when available. Tokens and
currency remain unknown unless observed. Separate setup, checking and CI wait
costs; never infer savings from fewer sessions alone. Do not manufacture tasks
or a new quota to measure the route.

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

A worker never merges. The role contract above gives an issue manager outcome
ownership, not merge permission. A lane assignment alone grants no merge
authority. Merge still requires owner authority,
current-head local and hosted verdicts without actionable findings, successful
`CI acceptance`, effective protection and all issue acceptance criteria. A CI,
schema, published-contract, crypto/recovery or other expensive decision goes
to the owner. A green check never overrides an owner-only decision.

Put `Part of #N` in the PR body for partial delivery and `Closes #N` only for
complete scope. Never infer closure from a PR title. Verify issue state after
an authorized merge and preserve remaining acceptance gates.
