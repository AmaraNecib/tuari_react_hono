---
name: debate
description: "One adversarial reviewer session on a pinned diff. Present critic and defender cases; add a separate specialist only for a concrete unanswered question."
---

# Debate

Follow the initial lens requirements and bounded-fix rule in
`docs/engineering-workflow.md`. This is one lens execution, distinct from
test-audit and code-review, not two independently executed reviews.

Read the committed base/head diff, complete changed modules, direct callers,
acceptance spec and author account in one source-frozen worktree.

## Critic

Identify reachable defects, unnecessary complexity and concrete failure paths.
For each finding cite severity, file:line, triggering scenario and smallest fix.
Treat unproven reachability as a hypothesis, not an automatic test demand.

## Defender

Test each criticism against the implementation and existing evidence. Explain
the load-bearing decisions and cite counterexamples when disproving a claim.
State remaining uncertainty rather than defending an unsafe path.

## Parent disposition

The parent checks source and resolves every actionable finding. A false
positive needs code evidence. A nonblocking follow-up needs reviewer acceptance,
scope and destination; never silently defer a correctness dependency.

Reviewers edit nothing. The author commits bounded corrections and refreshes
affected proof. The workflow decides whether one fresh delta review or another
specific lens is needed. Do not restart a full round automatically.

Save exact base/head, actual reviewer model/session and findings in ignored
`.scratch/reviews/<scope>/<HEAD>-debate.md`. Do not commit, attach or post it.
Publication authority is separate; a review cannot create that authority.
