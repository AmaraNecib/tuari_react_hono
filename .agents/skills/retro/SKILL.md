---
name: retro
description: "Review a coding session and recommend evidence-backed improvements to the agent's environment."
disable-model-invocation: true
---

# Session retrospective

Use when the owner requests a retrospective. Review how the work happened,
not just the code it produced. Default to the current session when no session
is named. A retrospective produces recommendations, not implementation.

Resolve paths beginning with `../` from this skill's directory. Resolve all
other repository paths in this skill from the repository root, not the session's
working directory. Locate that root from this skill at `../../../`.

Read `../writing-for-agents/SKILL.md` and `../unslop/SKILL.md` before writing.
`docs/engineering-workflow.md` remains the lifecycle authority.

## 1. Pin the evidence

Identify the requested session, repository, worktree and relevant revisions.
Read its primary sources: messages, command results, commits and available
local logs. Scope searches to the named session or repository. For a T3 thread,
use the harness thread-reading tool; load it through tool discovery if needed.

Cite source identifiers or paths instead of copying transcripts or reports.
Redact credentials and personal data. Keep operational notes and review reports
ignored and local under `.scratch/reviews/<scope>/`.

If evidence is missing, state the gap. Limit conclusions to the sources you
can read; an unavailable log is not proof of what happened.

## 2. Inspect the existing environment

Read `AGENTS.md`, relevant skills and the task-scoped wisdom index before
proposing another instruction. Read only matching lessons and check their
assumptions against source.

For a proposed automated check, inspect the repository's actual scripts,
hooks and CI wiring first. An existing check that is skipped, broken or
unwired needs repair, not a duplicate. Distinguish a check that detects a
failure from a text assertion that only matches policy wording.

Inspect these areas where the session supplies evidence:

- Navigation and information access: missing pointers, hidden dependencies,
  unavailable diagnostics or unnecessarily broad searches.
- Automated checks: mistakes detectable by lint, types, focused tests or
  existing hook and CI mechanisms.
- Reviewer guidance: judgement calls that require cross-file or domain
  reasoning rather than a deterministic check.
- Instruction quality: duplicated, stale or ineffective steering, including
  instructions that belong in a scoped reference rather than `AGENTS.md`.
- Tool economy: repeated reads, excessive output, unnecessary delegation,
  repeated verification or retries that ignore known state.

## 3. Choose the smallest prevention

Tie each candidate to an observed event and its consequence. Separate facts
from hypotheses. Prefer a deterministic check for a mechanical failure and
a concise reviewer rule for a genuine judgement call.

Use existing tools, documents and checks before proposing new ones. A check
must target a reachable failure with an independent expected result.
The implementation still follows documented standards; reviewer guidance
does not exempt authors from them.

Keep recommendations inside the requested retrospective. Do not turn a
feature task into an unrelated environment rewrite. A recommendation does not
authorize edits, installs, delegation, schedules, publication or issue closure.
Owner-only policy, schema, contract and security decisions remain owner-only.

## 4. Present ranked candidates

Return at most five candidates, highest consequence first. For each, include
the observed failure, source reference, smallest proposed change and a way
to verify that it prevents recurrence. State material evidence gaps.

If the evidence supports no useful change, say so instead of inventing work.
Stop after presenting recommendations. Wait for authorization before applying
a candidate through the normal implementation and review lifecycle.

## Relationship to the existing workflow

Retro is optional and owner-invoked, not a new completion or merge gate.
It does not replace `feature-implement`, `guard`, any required review lens
or current-head hosted acceptance. It does not rerun valid verification.

Use `../capture-wisdom/SKILL.md` for durable repeated lessons. Only the parent
writes those lessons after recurrence; a single observation remains a candidate.
Keep current policy in the engineering workflow rather than creating a second
policy source or a parallel wiki.
