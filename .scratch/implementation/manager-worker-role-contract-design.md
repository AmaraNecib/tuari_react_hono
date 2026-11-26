# CEO, issue manager and worker role contract proposal

Status: proposal only. No adoption, publication or merge is authorized by this
change.

## Scope and source

Base: `631f1fc8417058cb6e9e1e30d6e22f40534114b9`.
Verification mode: `focused-local / CI-final-pending`.

The issue manager owns the separate tree at
`D:/worktrees/tuari_react_hono/docs-manager-worker-rol-810c80ddb8e0370c` on
`docs/manager-worker-role-contract`. This proposal changes only `AGENTS.md`,
`docs/engineering-workflow.md`, `.agents/skills/crew-dispatch/SKILL.md`,
`.agents/skills/writing-for-agents/delegation-template.md`, and this design
note. It does not touch the manager tree, host/global instructions, runtime,
CI, dependencies or wisdom. It adds no child tasks and does not count against
Queue 21.

## Diagnosis

The repository says workers commit and report while "the parent" owns
publication, PR watches and merge. The workflow tells the worker to stop after
Guard Phase 2, and the dispatch skill says child completion wakes the parent.
Those statements do not distinguish CEO queue ownership from an issue
manager's responsibility to carry an issue through its remaining acceptance.

The observed issue is wording and task setup, not evidence of a T3 runtime
fault. The CEO's read thread `5b204fb7-d188-429b-890b-c64d3193f6a2` set a
"try once and stop" bound for that run; the bound remains valid. Future briefs
need to separate a worker's experiment limit from the manager's outcome
responsibility. The #393 manager had a correct publication handoff, but its
thread was bound to `develop`, not the source-owning tree. The assigned manager
tree for this proposal is correct.

CEO thread metadata marks it top-level with no parent thread. A top-level
issue-manager thread is not a `delegate_task` child of the CEO, so delegated
completion wake behavior cannot guarantee CEO notification. An explicit
terminal or blocker handoff is a procedural mitigation, not runtime
enforcement.

## Proposed contract

`docs/engineering-workflow.md` is the single authoritative role table. The
other edited instructions point to it and remove conflicting shorthand. The
CEO owns queue order and cross-lane decisions. The issue manager owns one
issue's outcome, scope, evidence, remaining acceptance and next safe path. A
Luna worker implements or reviews its assigned scope, then commits and reports.
Role is declared in the brief, not inferred from model, thread position or
parentage.

A manager inspects a terminal worker result and remaining acceptance. It may
continue only with a materially different authorized next step, wait only for a
named live gate, or record a concrete external or owner blocker. It must not
duplicate writes, blindly retry, or expand scope. Failed worker attempts with
an authorized alternative do not grant permission for unrelated work. Explicit
per-run limits, owner-only decisions, safety and credit limits, review depth
and adoption gates remain binding. Managers cannot authorize their own risky
scope. Delegated children cannot defeat higher-priority limits by claiming the
manager role.

Workers never publish or merge. The role distinction does not expand general
publication or merge authority. A manager may publish only with explicit
authority and from the correct bound tree, subject to all higher-priority
instructions and existing review/CI gates. A partial PR does not close the
issue. This proposal cannot authorize its own publication or merge.

For heavy work, instructions require an external wall-clock bound and durable
queued/start/end, phase, identified process/PID, native-exit and log evidence.
A missing exit is unverified, not successful. On mismatch, compare the queue
slot, identified process tree and logs before intervening. No broad kills,
blind retry loops or runtime enforcement changes are proposed.

## Scenario checks

| Scenario | Actor | Expected next action |
| --- | --- | --- |
| Worker fails and an authorized alternative exists | Issue manager | Inspect failure/source, verify the alternative is in scope, then assign or perform that distinct step. Preserve failed evidence. |
| Worker hits a hard stop with no alternative | Issue manager | Stop and record the exact owner/CEO decision required. Do not extend the task. |
| Worker delivers a successful partial PR | Issue manager | Verify shipped and remaining acceptance; keep the issue open and identify the next authorized deliverable. |
| Tool is bound to the wrong tree | Issue manager | Stop edits/publication, identify tree and SHA, then rebind only under authorized scope. Do not copy changes blindly. |
| Heavy process vanishes before exit evidence | Issue manager | Mark run unverified; compare slot, process tree and logs before intervention. No broad kill or blind retry. |

## Verification and review boundary

Run changed-Markdown-link checks, compare these five cases with the workflow
table, scan for contradictory actor wording, run `git diff --check` and
`pnpm check:unslop`. Record native exits, counts, durations and exact committed
SHA in a unique ignored `.scratch/reviews/manager-worker-role-contract/`
record. No full suite, build, browser work or install is justified.

This is reviewable high-assurance governance work. It retains the three
required initial lenses, owned by the issue manager. The drafting worker does
not run reviewers. CI-final remains pending; this proposal does not change its
activation or claim hosted acceptance. No architecture seam moved.
