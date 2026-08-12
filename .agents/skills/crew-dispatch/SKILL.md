---
name: crew-dispatch
description: "Use when the user wants several agents working in parallel on separate worktrees — 'spawn 5 agents', 'run these 3 issues at once', 'one agent per worktree' — and needs to watch each one and keep them contained to its own worktree. The number of agents is whatever the user asks for. Also use for a read-only test run before letting parallel agents do real work."
---

# Crew Dispatch

## Why this skill exists

Telling one agent to "work on issue #N" is easy. Running several agents on several worktrees
at once fails for three predictable reasons, and this skill exists to prevent each:

1. **Collisions** — agents share `.scratch/reviews/`, `packages/`, branch targets and
   PR ownership. Every lane needs a *disjoint seam*.
2. **Invisibility** — in-process or quiet agents stream nothing; you can't tell a
   working lane from a wedged one. Every lane is an async, inspectable run.
3. **Drift** — an agent "working on worktree X" can still `cd ..` and touch the main
   checkout. Containment is asserted before and verified with git after.

The parent (you) is the orchestrator and the only decision-maker. You never edit
code inside a lane; you launch, supervise, verify, synthesize, and land.

## Role split

| Role | Agent | Contract |
|---|---|---|
| Parent | you (this session) | Intake, lane briefs, launch, supervision, verification, review fanout, PR/merge. Never edits lane code. |
| Worker | `worker` (or a custom agent) | One lane, one worktree, one bounded task. May edit only inside its worktree. |
| Reviewer | `reviewer` (fresh context) | Read-only review fanout over the combined diff after lanes land. |

## When to use which shape

- **Default for this repo (captain preference): visible agents in Herdr's Agents
  panel, one workspace per lane in the sidebar.** The user wants to SEE each
  agent in the herdr sidebar like firstmate, and type into a pane directly.
  On this stack (herdr preview on Windows) the proven recipe is:
  1. `herdr workspace create --cwd <worktree> --label <slug>` → returns
     `workspace_id` + `root_pane_id` (each workspace has its own root pane).
  2. `herdr pane run <root-pane> pi` → starts a real Pi session in the pane.
  3. Herdr auto-detects it → the agent appears in the **Agents** panel
     (identity = pane id; check with `herdr agent list`).
  4. `herdr agent prompt <pane-id> "<lane brief>"` → submit the brief.
  5. Watch: `herdr pane read <pane> --source recent --lines 60`; steer by
     typing into the pane (the captain's word is authoritative).
  **Do NOT use `subagent({ action: "project.open" })` on this setup** — it
  splits a pane into the current workspace and runs `& pi "<msg>"`, and every
  such pane dies ~10s after launch (signal=Hangup, exit 0xC000013A) on this
  herdr/Windows preview. Workspace-create + pane-run + agent-prompt avoids that
  path entirely and is verified working.
- **Lightweight alternative: headless children.** `runs.all` with per-child
  `cwd`, supervised via `/subagents-fleet` and `steer`. Cheaper and disposable,
  but never visible as herdr tabs — the `H` inspector only mirrors artifacts.
  Use when the captain is not watching, for cheap scouts, or for a quick
  containment test.
- **Single issue, full pipeline** → use `feature-implement` directly, one worktree,
  one agent. `crew-dispatch` is not needed.
- **Mechanism check before trusting the machinery** → `--smoke` mode: lanes are
  read-only (inspect + report, change nothing). Use it the first time, after
  upgrading Pi/subagents, or when a lane misbehaves and you need a clean probe.

## Intake (before launching anything)

1. **Resolve the issues.** For each: `gh issue view <n>` and record the essentials
   (title, acceptance criteria, labels, milestone) into the lane brief. Never make a
   worker guess the issue from a bare number.
2. **Map issues to worktrees.**
   - If the user already has a worktree for the issue (check `worktrees/` and
     `git worktree list`), **pin the lane to it with `cwd`** — do NOT use
     `worktree: true`, which would create a fresh managed worktree from HEAD and
     delete it at the end. The user's long-lived worktrees keep their own branches.
   - If no worktree exists, create one per lane (`git worktree add
     worktrees/<issue-slug> -b <branch>` from a clean `develop` base).
3. **Verify seam disjointness.** Build the file-set each lane will touch (from the
   issue + `git diff develop...<worktree branch> --name-only`). Overlapping paths
   across lanes = collision. If overlap exists, either narrow the lanes or note the
   shared files are parent-owned (the parent makes shared changes once, lanes treat
   them as done-deal).
4. **Decide the mode**: `--pipeline` (default: workers run feature-implement) or
   `--smoke` (read-only). Pass it explicitly in the brief so a lane never guesses.

## Lane brief template

Every lane brief is one `task` string. Fill the placeholders; never hand a worker
the whole `crew-dispatch` skill — it is parent-only.

```
You are a worker lane pinned to the git worktree at: <ABSOLUTE_CWD>

AUTHORITY BOUNDARY (hard rules):
- Work ONLY inside <ABSOLUTE_CWD>. Never read, edit, create, delete, or run
  state-changing commands outside it. If you need something from outside, stop
  and list it in your report instead of reaching out.
- You may commit only inside this worktree, on branch <BRANCH>.
- Do not push, open PRs, merge, or touch GitHub. The parent owns landing.
- Do not run `git add -A` / `git add .`; stage only the files you changed.

ISSUE: #<n> — <title>
CONTEXT: <paste the issue essentials: what, why, acceptance criteria>
BASE: target branch is `develop`; fetch and diff against `origin/develop`.

TASK (mode: pipeline|smoke):
- <pipeline> Follow the repo's feature-implement workflow, scoped to THIS issue
  and THIS worktree: write .scratch/implementation/<n>-design.md, implement TDD
  (unit tests via pnpm test, Playwright E2E in tests/e2e/ if the flow is
  user-facing, pnpm typecheck && pnpm test:web && pnpm test:api), then run guard
  Phase 1. STOP once guard Phase 1 passes and report — do NOT push, do NOT open a
  PR, do NOT run debate/test-audit/code-review. The parent owns every stage from
  review onward so parallel lanes never collide on review evidence, branch
  naming, or GitHub.
- <smoke> READ-ONLY. Change nothing. Inspect the code related to this issue and
  report: what the relevant module does, its structure, tests present, and any
  risks you notice.

REPORT CONTRACT — end your run with:
- Working directory you resolved (pwd + git rev-parse --show-toplevel)
- Branch and HEAD sha
- Files changed (pipeline) or files inspected (smoke)
- Commands run with exit codes; validation evidence (pipeline)
- Anything you needed from outside the worktree
```

## Launch (visible agents — the default path)

One workspace per lane in herdr, one `pi` in each, one brief per agent. This is
verified working on this stack (project.open is NOT — see When to use which
shape):

```bash
# 1. workspace per lane (returns workspace_id + root_pane_id)
herdr workspace create --cwd <worktree> --label <slug>
# 2. start pi in the pane — herdr auto-detects it in the Agents panel
herdr pane run <root-pane> pi
# 3. submit the lane brief to the agent (identity = pane id)
herdr agent prompt <pane-id> "<lane brief>"
# 4. watch a lane's output
herdr pane read <pane-id> --source recent --lines 60
# 5. steer = type into the pane directly; close = close the workspace
```

Wait a few seconds after `pane run pi` for herdr to detect the agent before
prompting (`herdr agent list` shows agent_status). Prompt one lane at a time or
all in parallel — the panes are independent.

## Launch (headless — the lightweight alternative)

One async workflow, `runs.all`, per-child `cwd`. Do not launch lanes one at a time.

```typescript
subagent({
  async: true,
  workflowScript: `
    const lanes = await runs.all([
      { key: "lane-234", agent: "worker", cwd: "D:/projects/tuari_react_hono/worktrees/issue-234-zwsp-trim",
        task: "…brief for issue #234…" },
      { key: "lane-263", agent: "worker", cwd: "D:/projects/tuari_react_hono/worktrees/issue-263-employee-create",
        task: "…brief for issue #263…" }
      // one item per lane; distinct keys, distinct cwd
    ]);
    return lanes.map(l => ({ key: l.key, status: l.status, output: l.output }));
  `
})
```

- `async: true` — never block the parent turn on lanes; you supervise, you don't wait.
- Per-child `cwd` is the pin. Windows paths work as `D:/projects/...`.
- No `turnBudget`/hard `toolBudget` on mutation-capable workers (the default tool
  budget blocks read tools, not mutation tools — a bad tradeoff for writers).
- Keep `projectRootResolution: "git-root"` in `.pi/settings.json` so worktree
  children resolve repo config correctly.

## Pipeline run — the real-work sequence

When the captain says "run the lanes for real", follow this order:

1. **Preflight (never skip).**
   - `gh issue view <n>` for every lane; paste essentials into each brief.
   - Build each lane's file set from `git -C <worktree> diff develop...HEAD
     --name-only` + the issue. Overlapping files across lanes = collision:
     narrow the lanes, serialize the shared files, or make the parent own them.
   - Snapshot `git status --porcelain` for every worktree AND the main checkout
     BEFORE prompting, so post-run verification attributes only the delta.
   - Note dirty worktrees: in-flight work stays; the lane builds on top of it
     (continue, don't reset).
2. **Brief.** Prompt every agent with the pipeline lane brief (TASK mode:
   pipeline above) — feature-implement scoped to its worktree, STOP after guard
   Phase 1. Agents are already running in their panes; just `agent prompt` each.
3. **Supervise.** Watch the Agents panel / `herdr agent list`; steer by typing
   into a pane; on a stuck lane (status stuck at working with no output for a
   long time), read its pane, then type a redirect or ask the captain.
4. **Collect.** When a lane reports done: read its pane output (report
   contract), then verify containment: `git -C <worktree> status` matches
   preflight + the lane's claimed files, and the main checkout is untouched.
5. **Review fanout (parent, headless is fine — read-only).** For each lane's
   diff, run `debate` (high-assurance only), `test-audit`, and `code-review` as
   fresh-context `reviewer` children over `git diff develop...HEAD` in that
   worktree. Fix findings by steering the lane or as parent-owned shared changes.
6. **Guard + land.** guard Phase 2 per lane, then push + open one PR per lane
   (branch already exists in the worktree) with the review evidence linked, wait
   for CI green, guard Phase 3, and hand the captain full PR URLs. NEVER merge
   without the captain's explicit word.

If a lane needs the same shared file as another lane mid-run, stop and resolve
seam ownership with the captain rather than letting both write it.

## Supervision (this is how you SEE the crew)

- Tell the user to open **`/subagents-fleet`** in the Pi TUI — live per-lane
  model badge, tool/token/elapsed counters, current activity, expandable recent
  tools/output. That is the fleet view firstmate gets from herdr tabs.
- When Herdr 0.7.5+ is available, `H` inside the fleet view opens a raw
  inspector dashboard for the selected child — a dedicated visual pane that
  mirrors the child's artifacts (status/events). Note: it mirrors, it does not
  attach to a live terminal; subagents are headless in-process runs.
- If the user genuinely wants each agent working in its own visible terminal
  (the firstmate herdr-tab model), do not use subagents for those lanes — open a
  project pane (a separate Pi session rooted at the worktree in a Herdr pane)
  and orchestrate it through a mission/status contract instead.
- Check status with `subagent({ action: "status", view: "fleet" })` for an overview
  or `subagent({ action: "status", id, view: "transcript", index: 0 })` to tail one
  lane. Inspect async runs via their `asyncId`/`asyncDir` (`status.json`,
  `events.jsonl`, output logs).
- Steer a confused lane with `subagent({ action: "steer", id, message })` — short,
  single-line guidance. Never steer by typing into the lane's terminal yourself.
- Absorb, don't poll. Wait on `subagent_wait({ all: true })` or wake per-lane via
  `subagent_wait({ id, nonBlocking: true })`. `needs_attention` events surface a
  lane that stopped reporting — that's your stale-wake equivalent; investigate a
  lane that goes quiet mid-run rather than assuming it's fine.

## Verification (containment is proven, not promised)

After the lanes finish, prove each lane stayed inside its worktree:

```bash
# what each lane actually did (read-only):
git -C worktrees/<slug> diff develop...HEAD --stat
# did any lane escape? the main checkout must be unchanged:
git -C . status --short
```

If the main checkout is dirty with lane files, the lane escaped — stop and
remediate. If a lane needed files outside its worktree (e.g. `packages/contracts`),
that's a seam problem to fix at intake, not a boundary to relax after the fact.
A lane whose worktree was already dirty before launch (in-flight work) should have
its pre-launch `git status` snapshot compared against the post-launch one so you
only attribute the delta.

## Reporting and landing

- Report per-lane outcomes in plain language: status, changed files, test/validation
  evidence, risks. Never paste raw transcripts or status lines verbatim.
- Synthesize: run `debate`/`test-audit`/`code-review` as fresh-context read-only
  fanout over the combined diff (`reviewer` agent), then guard Phase 2/3.
- Landing stays with the parent and the user: per-lane PRs (or one combined PR if
  the user prefers), full `https://...` URLs, CI green before merge, never merge
  without explicit user word.

## Gotchas

- **Dirty worktrees**: a worktree with uncommitted in-flight work is still safe for
  `--smoke` lanes, but snapshot `git status` before launching a pipeline lane so
  post-run verification attributes only the delta.
- **node_modules**: fresh worktrees may lack them; pi-subagents symlinks the root
  checkout's `node_modules` when present. Treat dependency setup as an explicit
  bootstrap step in the brief if a lane runs tests.
- **Shared seams**: `packages/`, `apps/api/src/shared`, migrations — one writer only.
  Serialize lanes that touch them or make the parent the owner of shared changes.
- **Budgets**: never pass a hard `toolBudget` to a writer; prefer a lane brief
  narrow enough that a deadline is not needed.

## Maintaining this file

Keep the parent-only / worker-brief split crisp — that split is the whole point.
When the mechanism changes (new pi-subagents flags, new visibility surfaces),
update this file before trusting the crew again.
