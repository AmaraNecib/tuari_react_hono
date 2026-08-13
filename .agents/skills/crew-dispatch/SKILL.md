---
name: crew-dispatch
description: "Use when the user wants several agents working in parallel on separate worktrees — 'spawn 5 agents', 'run these 3 issues at once', 'one agent per worktree' — and needs to watch each one and keep them contained to its own worktree. The number of agents is whatever the user asks for. Also use for a read-only test run before letting parallel agents do real work. Portable: works in any git repo with zero config — it resolves the repo's branch, package manager, commands, and available skills itself."
---

# Crew Dispatch

## Why this skill exists

Telling one agent to "work on issue #N" is easy. Running several agents on
several worktrees fails for three predictable reasons, and this skill exists to
prevent each:

1. **Collisions** — agents share review evidence, shared packages, branch
   targets and PR ownership. Every lane needs a *disjoint seam*.
2. **Invisibility** — quiet or in-process agents stream nothing; you can't tell
   a working lane from a wedged one.
3. **Drift** — an agent "working on worktree X" can still `cd ..` and touch the
   main checkout. Containment is asserted before and verified with git after.

The parent (you) is the orchestrator and the only decision-maker. You never edit
code inside a lane; you launch, supervise, verify, synthesize, and land.

**Portability promise:** this skill contains NO hardcoded paths, branches,
package managers, or repo conventions. Everything is resolved from the target
repo at intake. Copy this folder plus the companion skills below into any
project and it works unchanged.

## Companion skills (copy alongside, optional but recommended)

| Skill | If present | If absent |
|---|---|---|
| `feature-implement` | lanes follow its implementation steps (see Lane brief) | lanes follow the inline implement contract in the brief |
| `guard` | parent uses its phases as gates | parent runs the inline check set (build, typecheck, lint, tests) |
| `capture-wisdom` | parent uses it to file lessons | parent appends to the project's `docs/lessons/` or `AGENTS.md` |
| `implement`, `tdd` | lanes load them for the implement step | inline TDD instructions |
| `debate`, `test-audit`, `code-review` | reviewer fanout uses them | reviewers follow the inline severity+file:line reporting contract |

Copy only what exists; every missing skill degrades to an inline equivalent,
never to skipped work. The parent checks `ls <repo>/.agents/skills/` at intake
and tells each lane exactly which skills to load.

## Role split

| Role | Agent | Contract |
|---|---|---|
| Parent | you (this session) | Intake, lane briefs, launch, supervision, verification, review fanout, landing. Never edits lane code. |
| Worker lane | one agent per worktree | One lane, one worktree, one bounded task. May edit only inside its worktree. |
| Reviewer | fresh-context agents | Read-only review of each lane's diff; parent aggregates. |

## When to use which shape

- **Default: visible agents — REQUIRED for mutation lanes while the captain is
  present.** The captain wants to SEE each agent work and type into its
  terminal directly. Each lane = one workspace in the session backend
  (Herdr/tmux/…) with a real agent session inside it, auto-detected in the UI.
  Verified recipe (Herdr, any OS): see Launch.
- **Headless children require explicit captain opt-in.** Cheaper, disposable,
  not visible as live terminals. Allowed ONLY for cheap scouts, read-only
  probes, when the captain is not watching — or when the captain explicitly
  says so ("run headless" / "don't use herdr").
- **Captain opt-out always wins.** If the captain says don't use Herdr (or a
  specific backend), comply — visible lanes then mean that backend's
  workspaces, or headless if that is what was asked.
- **Decision gate (never silent):** before launching, record the chosen shape
  and — for headless with a present captain — the captain's explicit opt-in.
  If you didn't ask, you used the wrong shape. "Run-to-completion" never
  means "invisible".
- **Single issue, full pipeline** → run the repo's feature workflow directly
  with one agent; `crew-dispatch` is not needed.
- **Mechanism check before trusting the machinery** → `--smoke` mode: lanes are
  read-only (inspect + report, change nothing).

## Intake — resolve everything from the target repo

Nothing is assumed; detect each of these before launching:

1. **Issues/tasks.** For each: fetch the issue (`gh issue view <n>` or the
   project's tracker) and paste the essentials into the lane brief. Never make a
   worker guess from a bare number.
2. **Base branch.** Resolve the project's default branch:
   `git symbolic-ref --short refs/remotes/origin/HEAD` (falls back to
   `main`/`master`/whatever `git worktree list` shows the main checkout on).
   Never hardcode `develop`.
3. **Package manager + commands.** Detect from the lockfile:
   `pnpm-lock.yaml` → pnpm, `package-lock.json` → npm, `yarn.lock` → yarn,
   `bun.lockb` → bun. Read the root `package.json` scripts and record the
   project's real `typecheck` / `lint` / `test` / e2e command names. Use those
   names in briefs — not a fixed list.
4. **Scratch/design-doc convention.** If the project's `AGENTS.md` defines one,
   use it. Otherwise default to `<repo>/.scratch/implementation/<id>-design.md`
   and tell the lane so.
5. **Available skills.** `ls <repo>/.agents/skills/` and record which companion
   skills exist (feature-implement, guard, capture-wisdom, implement, tdd,
   debate, test-audit, code-review). Each brief names exactly the skills that
   exist; the pipeline uses inline fallbacks for the rest.
6. **Worktree mapping.** If the captain already has worktrees
   (`git worktree list`), pin each lane to one with its absolute path. If not,
   create one per lane: `git worktree add <repo>/worktrees/<slug> -b <branch>`
   from a clean base-branch state.
7. **Seam disjointness.** Build each lane's file set from
   `git -C <worktree> diff <base>...HEAD --name-only` + the issue. Overlapping
   files across lanes = collision: narrow the lanes, serialize the shared
   files, or make the parent own them.
8. **Wisdom search (if the project keeps lessons).** `grep -rin "<domain>"
   <repo>/.agents/wisdom/*.md <repo>/docs/lessons/*.md` per issue domain and
   paste the relevant lessons into that lane's brief. Selective search, never a
   bulk dump — a large wisdom store is a context tax that makes agents skip it.
9. **Snapshot.** Record `git status --porcelain` for every worktree AND the main
   checkout BEFORE prompting, so post-run verification attributes only the
   delta. Dirty worktrees keep their in-flight work; the lane builds on top.

## Lane brief template

Every lane brief is one task string. Fill the placeholders; never hand a worker
this whole skill — it is parent-only.

```
You are a worker lane pinned to the git worktree at: <ABSOLUTE_WORKTREE>

AUTHORITY BOUNDARY (hard rules):
- Work ONLY inside <ABSOLUTE_WORKTREE>. Never read, edit, create, delete, or
  run state-changing commands outside it. If you need something from outside,
  stop and list it in your report instead of reaching out.
- You may commit only inside this worktree, on branch <BRANCH>.
- Do not push, open PRs, merge, or touch the remote. The parent owns landing.
- Do not run `git add -A` / `git add .`; stage only the files you changed.

ISSUE: #<n> — <title>
CONTEXT: <paste the issue essentials: what, why, acceptance criteria>
BASE: <base-branch>; fetch and diff against origin/<base-branch>.

TASK (mode: pipeline|smoke):
- <pipeline> FIRST, grep the project's lessons for your domain and read only the
  matches: `grep -rin "<domain>" .agents/wisdom/*.md docs/lessons/*.md` (skip
  if the files don't exist). Then:
  - If the project has a feature-implement skill (check .agents/skills/), load
    it and follow ONLY its implementation stages, scoped to this issue and this
    worktree, and STOP before any stage that writes shared review evidence,
    branches, PRs, or remote state — the parent owns every one of those so
    parallel lanes never collide. Where that skill names a base branch,
    package-manager commands, or repo conventions, the values in THIS brief
    (BASE: <base-branch>, commands from package.json) win — the skill is a
    template, the brief is the contract.
  - If not, follow this inline contract: write the design doc at
    <scratch>/<id>-design.md, implement TDD (read package.json for the real
    commands; unit tests + user-facing E2E if the flow is user-facing; run the
    project's typecheck/lint/tests), then run the project's guard equivalent —
    build + typecheck + lint + tests all green — and STOP.
  STOP after implementation + local checks pass and report. Do NOT open PRs,
  do NOT push, do NOT run reviews.
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

## Launch (visible agents — the default)

> If the repo ships `scripts/crew/launch-lane.mjs` (or an equivalent launch
> script), it is the ONLY sanctioned launcher for lanes AND reviewers — running
> it is mandatory. It turns the verified recipe below into one command, so the
> visible path is never the high-friction path.

One workspace per lane in the session backend, one agent session in each, one
brief per agent. Verified recipe for Herdr (any OS):

```bash
# 1. workspace per lane (returns workspace_id + root_pane_id)
herdr workspace create --cwd <ABSOLUTE_WORKTREE> --label <slug>
# 2. start the agent CLI in the pane — herdr auto-detects it in the Agents panel
herdr pane run <root-pane> <agent-cli>
# 3. submit the lane brief (identity = pane id)
herdr agent prompt <pane-id> "<lane brief>"
# 4. watch a lane's output
herdr pane read <pane-id> --source recent --lines 60
# 5. steer = type into the pane directly; close = close the workspace
```

Wait a few seconds after `pane run` for herdr to detect the agent before
prompting (`herdr agent list` shows agent_status). Prompt lanes in parallel —
the panes are independent. For tmux the same shape works with one tmux window
per lane; for any backend, the invariant is: one real, visible, steerable agent
session per lane, each rooted at its worktree.

Known trap (Herdr on Windows preview): a generic "project pane" API that
splits the current workspace and runs `& <agent> "<msg>"` can spawn panes that
die ~10s after launch (signal=Hangup). The workspace-create → pane-run →
agent-prompt sequence above avoids that path and is verified.

## Launch (headless — the lightweight alternative)

> Gate: headless REQUIRES the captain's explicit opt-in when the captain is
> present and lanes mutate code. See "When to use which shape". An explicit
> "don't use herdr" / "run headless" instruction also lands here.

One async workflow, `runs.all`, per-child `cwd`. Do not launch lanes one at a
time.

```typescript
subagent({
  async: true,
  workflowScript: `
    const lanes = await runs.all([
      { key: "lane-1", agent: "worker", cwd: "<ABSOLUTE_WORKTREE-1>",
        task: "…brief for lane 1…" },
      { key: "lane-2", agent: "worker", cwd: "<ABSOLUTE_WORKTREE-2>",
        task: "…brief for lane 2…" }
      // one item per lane; distinct keys, distinct cwd
    ]);
    return lanes.map(l => ({ key: l.key, status: l.status, output: l.output }));
  `
})
```

- `async: true` — never block the parent turn on lanes; supervise, don't wait.
- No `turnBudget`/hard `toolBudget` on mutation-capable workers (the default
  tool budget blocks read tools, not mutation tools — a bad tradeoff for
  writers).
- If children resolve project config from an incidental nested `.pi`/`.agents`
  directory in a worktree, set `subagents.projectRootResolution: "git-root"`
  in the repo root settings.

## Pipeline run — the real-work sequence

When the captain says "run the lanes for real", follow this order:

1. **Preflight (never skip).** Intake steps above: issues, base branch, package
   manager + commands, scratch convention, available skills, worktree mapping,
   seam check, wisdom search, git snapshot. **Lane shape**: confirm
   visible/headless with the captain (or apply their opt-out — "don't use
   herdr" wins) and record the choice. Never default silently.
2. **Brief.** Prompt every agent with the pipeline lane brief. Agents are
   already running in their panes; just `agent prompt` each.
3. **Supervise.** Watch the backend's agent panel; steer by typing into a pane;
   on a lane stuck working with no output for a long time, read its pane, then
   type a redirect or ask the captain.
4. **Collect.** When a lane reports done: read its output (report contract),
   then verify containment: `git -C <worktree> status` matches preflight + the
   lane's claimed files, and the main checkout is untouched.
5. **Review fanout (parent dispatches, fresh-context reviewers judge).** For
   each lane's diff, run the project's review skills (debate/test-audit/
   code-review) as fresh-context reviewer children over
   `git diff <base>...HEAD` in that worktree; if the skills are absent, follow
   the inline contract: findings with severity + file:line, grouped by
   must-fix / should-fix / nit. The parent aggregates verdicts; it is a
   dispatcher, not the judge.
6. **Fix-findings loop (per lane, agent owns the fix).** For every lane with
   must-fix/should-fix findings: send the findings back to that lane's live
   agent (`agent prompt <pane> "Reviewer findings: <findings>. Fix in THIS
   worktree, re-run the checks, report what changed."`), then verify the delta.
   Loop until clean or explicitly deferred. Two exceptions where the PARENT
   fixes directly: findings on a shared seam (parent-owned file — fix once,
   all lanes get the updated base) and findings after the lane's pane closed.
7. **Guard + land.** Run the project's guard (or the inline check set) per
   lane, then push + open one PR per lane (branch already exists in the
   worktree) with the review evidence linked, wait for CI green, and hand the
   captain full PR URLs. NEVER merge without the captain's explicit word — when
   the captain says merge, the parent executes it.
8. **Lessons (parent-owned, serialized — lanes never write shared state).**
   If the project keeps lessons (capture-wisdom / docs/lessons/ / AGENTS.md
   convention), the parent files per-lane technical lessons after each PR lands
   and one crew-level pass at batch end for operational lessons. Lanes never
   write shared files.

## Supervision (how you SEE the crew)

- Tell the captain how to open the live agent view in their backend (Herdr:
  the Agents panel; the fleet inspector for headless children).
- Check status on demand; steer with a single short message into the pane
  (visible) or `steer` (headless). A lane that goes quiet mid-run needs a look,
  not an assumption.
- Absorb, don't poll. The captain watches; you act on their word or on
  completion wakes.

## Verification (containment is proven, not promised)

After the lanes finish:

```bash
# what each lane actually did (read-only):
git -C <worktree> diff <base>...HEAD --stat
# did any lane escape? the main checkout must be unchanged:
git -C . status --short
```

If the main checkout is dirty with lane files, the lane escaped — stop and
remediate. Compare against the preflight snapshot so in-flight work before the
run is not attributed to the lane.

## Reporting and landing

- Report per-lane outcomes in plain language: status, changed files,
  validation evidence, risks. Never paste raw transcripts verbatim.
- Landing stays with the parent and the captain: per-lane PRs, full URLs, CI
  green before merge, never merge without the captain's word.

## Gotchas

- **Dirty worktrees**: safe for `--smoke` lanes; for pipeline lanes, snapshot
  `git status` before launching so verification attributes only the delta.
- **Dependencies**: fresh worktrees may lack `node_modules`; provision them
  (symlink from the main checkout or install) before lanes run tests.
- **Shared seams**: any shared package/dir across lanes = one writer only.
  Serialize those lanes or make the parent own shared changes.
- **Budgets**: never pass a hard `toolBudget` to a writer; prefer a lane brief
  narrow enough that a deadline is not needed.

## Portability checklist (when copying to a new project)

1. Copy `.agents/skills/crew-dispatch/` (this folder).
2. Copy whichever companions exist in this project (feature-implement, guard,
   capture-wisdom, implement, tdd, debate, test-audit, code-review) — all
   optional; every missing one degrades to an inline fallback.
3. That's it. No paths, branches, or commands are hardcoded; the skill detects
   them from the target repo at intake.

## Maintaining this file

Keep the parent-only / worker-brief split crisp — that split is the whole
point. When the mechanism changes (new backend flags, new visibility surfaces),
update this file before trusting the crew again. When you add a repo-specific
detail, ask whether it can be detected at intake instead — hardcoded values are
how portability dies.
