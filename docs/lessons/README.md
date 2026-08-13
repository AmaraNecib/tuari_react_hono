# Lessons (human-facing rationale)

This directory holds **human-facing rationale documents** — the deep "why"
behind a convention, linked from AGENTS.md or PRs when the full story matters.

- `gh-pr-merge-squash-issue-close.md` — why issues never auto-close (PRs target
  `develop`, not the default branch) and the multi-PR close rule. Referenced
  from AGENTS.md.

Agent-facing knowledge (terse, severity-labeled, grep-able lessons with
**Always** actions) lives in `.agents/wisdom/*.md` — that is the store agents
actually read (crew-dispatch greps it per task; capture-wisdom writes to it).
Do NOT add new agent-facing lessons here; file them in `.agents/wisdom/`.
