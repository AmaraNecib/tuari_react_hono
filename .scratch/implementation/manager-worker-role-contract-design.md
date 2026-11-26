# CEO, issue manager and worker role contract proposal

Status: proposed governance, not adopted. The manager's task authorizes a
reviewable PR, not owner acceptance or self-merge. This document grants no
authority beyond that task.

## Scope and verification mode

Base: `631f1fc8417058cb6e9e1e30d6e22f40534114b9`.
Publication branch: `docs/manager-worker-role-contract`.
Bound tree: `D:/worktrees/tuari_react_hono/docs-manager-worker-rol-810c80ddb8e0370c`.
Mode: `focused-local / CI-final-pending`.

Five Markdown paths change: AGENTS, engineering workflow, crew-dispatch,
delegation template and this design. Host/global instructions, runtime, CI,
dependencies, financial/release policy and wisdom remain unchanged. This
proposal is separate from Queue 21's task count.

One visible Luna drafting task produced `39992fd4`. Although isolated checkout
was requested, its reported tree and observed commit were this bound tree,
not a separate worker tree. The manager inspected that actual source rather
than assuming isolation. There was no concurrent manager source writer. The
worker is terminal before manager reconciliation begins. This observation
establishes a task-setup boundary, not a diagnosis of T3 runtime internals.

## Diagnosis

At the base, AGENTS says workers commit and report while "the parent" owns
publication, PR watches and merge. The workflow says "The worker stops here"
and "A lane never merges". Dispatch says completion wakes the parent. These
terms do not distinguish worker task completion from issue-manager outcome
ownership or queue CEO coordination.

The CEO's task and read conversation identify a #534 manager brief bounded to
"try once and stop". That run restriction remains binding. New briefs should
separate worker experiment limits from manager issue authority. #393's manager
correctly handed publication back because its controller was bound to develop,
not the reviewed correction branch. Repository prose cannot rebind a tool.

A top-level manager is not a delegated child of the CEO. Its terminal turn
cannot be assumed to send a delegated-child wake to the CEO. Explicit material
blocker, unavoidable publication handoff and terminal proposal messages are
procedural mitigation, not enforced runtime behavior. The same boundary applies
to an external observer alerting a manager while a worker awaits a tool.

Higher-priority global instructions also use parent/child wording. This
repository proposal cannot override them. A delegated child cannot gain
publication rights by changing its role label. No global-file alignment is
performed or claimed here.

## Instruction design

The engineering workflow holds the authoritative role table and decision
procedure. AGENTS and dispatch point to it at role assignment, terminal results
and publication. The template asks for role, authority, bounds, next actor and
completion evidence instead of copying the policy. This applies
`writing-for-agents`, including skill mechanics for the edited dispatch skill.

The workflow's five scenario checks identify both next actor and evidence
ending the step. They cover a failed worker with an authorized alternative,
a hard stop without one, a successful partial PR, a wrong-tree publication
tool and a vanished or exited heavy process with unconfirmed tool return.
Workers supply commits or reviews; a partial PR belongs to an authorized
publisher, not a worker publication exception.

Heavy-run guidance separates queued, started, native ended and tool returned.
An admission-inclusive budget and independent observer address a worker blocked
inside the tool. PID disappearance is neither a native success verdict nor
proof that the tool returned. The local Queue 21 observer is an existing
procedural mitigation, not a repository runtime change. Its machine-local path
and invocation are deliberately absent from policy. No heavy command is run
to test this documentation.

## Proof and unchanged gates

Use changed-Markdown link and anchor checks, manual scenario decision tracing,
actor consistency, committed whitespace and the existing prose error gate.
Run the directly affected workflow-policy and CI-final tests, not full suites,
builds, browsers or installs. Save exact-SHA commands, native exits, durations,
counts and raw logs in ignored `.scratch/reviews/manager-worker-role-contract/`.
Worker row-presence checks alone do not establish correct scenario decisions.

This governance change retains three distinct initial review sessions in order,
debate, test-audit and code-review. Bounded corrections use the existing fresh
combined-delta rule. Same-family separate-session review uses standing owner
approval because optional OpenCode is not opted in and no enabled non-author
family is available. Local readiness, current-head hosted review, CI acceptance
and effective protection remain separate. Existing review-depth adoption gates
and owner-only decisions remain unchanged.

The activation record still lacks recorded owner acceptance. The current
ruleset read found strict CI acceptance app 15368, active ruleset 26837184,
no bypass actors and current-user bypass never. The legacy protection endpoint
returned 404. Current enforcement does not invent historical activation.
Architecture: no seam moved.

## Wisdom

Applied ownership-extension and assigned-path lessons to bounded authority
and actual-tree verification. PowerShell script safety applies to any saved
verification wrapper. Orphaned-process identification informs the heavy-process
scenario but does not justify killing or inspecting unrelated processes here.
No new wisdom or process cleanup is part of this proposal.
