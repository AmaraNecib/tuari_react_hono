---
name: crew-dispatch
description: "Coordinate explicitly authorized parallel lanes in visible T3 children with isolated worktrees, bounded verification and parent-owned publication."
---

# Parallel lanes

Read `AGENTS.md` and `docs/engineering-workflow.md`. Delegate only when
authorized by the owner or applicable instructions. Existing PR work is not
authorization for unrelated issue lanes.

Resolve exact models through `orchestrator_capabilities`, choosing Luna
explicitly for ordinary work. Use `delegate_task` with `isolation: worktree`
for writers. Read-only reviewers use `shared` with the actual absolute
source-owning path and committed base/head. Verify paths exist first.

Use the brief in `../writing-for-agents/delegation-template.md`.
Pass the parent's verification mode and bounded affected commands. A worker
does not rediscover activation or widen testing. Model catalog availability
does not authorize optional OpenCode routes.

Default to six ordinary children on disjoint files, fewer for conflicts or
resource pressure. Serialize generators in one tree. Heavy jobs use the shared
queue after scope is justified. Assign shared-file landing order explicitly.

Use async mode for minute-scale work and a stable request ID per lane.
Completion wakes the parent. Do not poll live children or silently replace
their work. Cancel a task that is no longer needed, preserving its worktree.

A worker commits and hands off verified SHA, proof, applied wisdom and blockers.
It never pushes, opens a PR, merges or writes wisdom. The parent owns those
decisions and preserves existing watches. No custom Herdr launch is required
inside T3. Native invisible children are a fallback only if T3 delegation is
unavailable and the owner is told they will not appear in lineage.
