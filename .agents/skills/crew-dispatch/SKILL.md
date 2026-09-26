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
| Parent | you (this session) | Intake, lane briefs, launch, supervision, verification, review fanout, landing. Never edits lane code; receives `crew_report` handoffs. |
| Worker lane | one agent per worktree | One lane, one worktree, one bounded task. May edit only inside its worktree. |
| Reviewer | fresh-context agents | Read-only review of each lane's diff; parent aggregates. |

## When to use which shape

- **Default: visible agents — REQUIRED for mutation lanes while the captain is
  present.** The captain wants to SEE each agent work and type into its
  terminal directly. Each lane = one workspace in the session backend
  (Herdr/tmux/…) with a real agent session inside it, auto-detected in the UI.
  Visible lanes launched by `launch-lane.mjs` also receive the `crew_report`
  tool, which writes a handoff artifact and sends a completion/blocker message
  directly to the parent pane. Verified recipe (Herdr, any OS): see Launch.
  Project policy defaults to six concurrent mutation lanes; the captain may
  explicitly choose another positive cap for a batch.
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

## Lane naming (one convention, enforced)

A lane label is an identity: it names the Herdr workspace, the lane manifest and
the handoff. Use **`<type>-<short-slug>`** in kebab-case — the same shape the
worktree directory and the branch use:

| Label | Branch | Worktree |
| --- | --- | --- |
| `fix-dashboard-followups` | `fix/282-dashboard-followups` | `worktrees/fix-dashboard-followups` |
| `chore-ui-skills` | `chore/66-ui-skills` | `worktrees/chore-ui-skills` |
| `feat-release-path` | `feat/release-installer-path` | `worktrees/feat-release-path` |

Allowed types: `feat`, `fix`, `chore`, `refactor`, `test`, `docs`, `perf`,
`release`, `issue`, `rev`. `launch-lane.mjs` rejects anything else before it
creates workspace state, so a bare issue number, a project codename or a
sentence can never become a lane name.

## Intake — resolve everything from the target repo

Nothing is assumed; detect each of these before launching:

1. **Issues/tasks.** For each: fetch the issue (`gh issue view <n>` or the
   project's tracker) and paste the essentials into the lane brief. Never make a
   worker guess from a bare number.
2. **Base branch.** Resolve the branch ORDINARY work integrates into. Signals,
   strongest first, and never a guess from a branch name alone:

   1. the documented convention (`AGENTS.md`, `docs/*workflow*`) — authoritative
      when present;
   2. the base of recent merged PRs, EXCLUDING release/hotfix branches
      (`release/*`, `hotfix/*`, `chore/release*`): use it when at least three of
      the last five qualifying merges agree on one base;
   3. `git symbolic-ref --short refs/remotes/origin/HEAD`.

   If the signals disagree, stop and ask the captain which branch ordinary work
   lands on — a release or hotfix merged into `main` must not redefine the target
   for feature lanes. State the resolved base in the brief AND pass it explicitly
   on landing (`gh pr create --base <base>`).
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
- COMMIT BEFORE YOU REPORT. The parent reviews `git diff <base>...HEAD`, so
  uncommitted work is invisible to that review and can be lost. Stage the files
  you changed (never `git add -A`), commit them, and report the commit SHA. If
  you genuinely cannot commit, say so explicitly in the report, list the exact
  uncommitted paths, and include `git status --short` output.
- Do not push, open PRs, merge, or touch the remote. The parent owns landing.
- Do not run `git add -A` / `git add .`; stage only the files you changed.
- At progress, completion, or blockage, call the visible-lane `crew_report`
  tool. Include branch/HEAD, changed files, commands + exit codes, risks, and
  the next action. If work may be deferred, include the exact finding,
  proposed follow-up PR, dependency impact, and ask the parent to decide
  fix-now versus defer. The tool sends the report to the parent; the final
  text report is still required as a fallback.

ISSUE: #<n> — <title>
CONTEXT: <paste the issue essentials: what, why, acceptance criteria>
BASE: <base-branch>; fetch and diff against origin/<base-branch>.
SKILLS/ROUTING: <pipeline> lanes MUST load and follow
  .agents/skills/feature-implement/SKILL.md (the launcher preamble enforces
  this too, so a custom brief cannot skip it); review/smoke lanes may skip it
  and follow the brief's own contract.

TASK (mode: pipeline|smoke):
- <pipeline> FIRST, grep the project's lessons for your domain and read only the
  matches: `grep -rin "<domain>" .agents/wisdom/*.md docs/lessons/*.md` (skip
  if the files don't exist). Then:
  - If the project has a feature-implement skill (check .agents/skills/), load
    it and follow its implementation stages, scoped to this issue and this
    worktree. The lane may run local `cli-review` and `greploop --local` against
    the pinned base and report the raw Greptile status/findings to the parent.
    Stop before pushing, opening PRs, merging, or changing remote state — the
    parent owns those so parallel lanes never collide. Issue-specific review
    evidence may be refreshed by the lane when the parent explicitly delegates
    it; shared/cross-lane evidence remains parent-owned. Where that skill names
    a base branch, package-manager commands, or repo conventions, the values in
    THIS brief (BASE: <base-branch>, commands from package.json) win — the skill
    is a template, the brief is the contract.
  - If not, follow this inline contract: write the design doc at
    <scratch>/<id>-design.md, implement TDD (read package.json for the real
    commands; unit tests + user-facing E2E if the flow is user-facing; run the
    project's typecheck/lint/tests), then run the project's guard equivalent —
    build + typecheck + lint + tests all green — and STOP.
  STOP after implementation + local checks pass, run the delegated local
  Greptile review when requested, and report. Do NOT open PRs, do NOT push, do
  NOT merge, and do not decide silent deferrals.
- <smoke> READ-ONLY. Change nothing. Inspect the code related to this issue and
  report: what the relevant module does, its structure, tests present, and any
  risks you notice.

REPORT CONTRACT — end your run with:
- Working directory you resolved (pwd + git rev-parse --show-toplevel)
- Branch and HEAD sha
- Files changed (pipeline) or files inspected (smoke)
- Commands run with exit codes; validation evidence (pipeline)
- Anything you needed from outside the worktree
- A `crew_report` handoff with `status: done` or `status: blocked` before
  stopping (visible lanes); if the tool is unavailable, write the same JSON
  shape to `.scratch/sessions/crew/handoffs/<lane>.json` and say so
```

## Launch (visible agents — the default)

> If the repo ships `scripts/crew/launch-lane.mjs` (or an equivalent launch
> script), it is the ONLY sanctioned launcher for **visible** lanes AND
> reviewers — running it is mandatory for that shape. It turns the verified
> recipe below into one command, so the visible path is never the
> high-friction path. It does not apply to the headless shape: when the captain
> explicitly opts into headless ("run headless" / "don't use herdr"), launch
> through the async workflow below instead and do not run this script.

One workspace per lane in the session backend, one agent session in each, one
brief per agent. Verified recipe for Herdr (any OS):

### Pinning a lane's model

`PI_LANE_MODEL` pins the model a lane starts on:

```bash
PI_LANE_MODEL=opencode-go/deepseek-v4.1-flash node scripts/crew/launch-lane.mjs <label> <worktree> <brief>
```

Set it when the account's default model is unavailable — an unpinned lane dies
instantly with `The model <x> does not exist or you do not have access to it`,
which looks like a lane crash rather than a configuration problem. Leave it
unset to inherit the operator's pi default: the launcher never invents a model,
so it stays zero-config in any repo.

The pin applies **at launch only**. Relaunching a label whose agent is already
running cannot change that agent's model; the launcher says so explicitly
instead of silently ignoring the pin. Close the workspace and relaunch to apply
it.

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
5. **Review fanout (delegate first, parent aggregates).** Ask each live lane to
   run its local tests plus `cli-review`/`greploop --local` against the pinned
   base and send structured status/findings through `crew_report`. For
   Standard/High-assurance work, the parent may additionally dispatch fresh
   read-only debate/test-audit/code-review reviewers when independent review is
   needed. Findings are grouped by must-fix / should-fix / nit; the parent
   aggregates verdicts and makes scope/deferral decisions rather than repeating
   every command inline.
6. **Fix-findings loop (per lane, agent owns the fix).** For every lane with
   must-fix/should-fix findings: send the findings back to that lane's live
   agent (`agent prompt <pane> "Reviewer findings: <findings>. Fix in THIS
   worktree, re-run the checks, report what changed."`), then verify the delta.
   Loop until clean or the parent explicitly decides to defer. A lane may not
   silently call a finding out of scope: it must send a `crew_report` with
   `status: blocked`, the exact finding, proposed follow-up PR, dependency
   impact, and a parent decision request. The parent decides fix-now versus
   defer and may reorder/queue lanes accordingly. Two exceptions where the
   PARENT fixes directly: findings on a shared seam (parent-owned file — fix
   once, all lanes get the updated base) and findings after the lane's pane
   closed.
7. **Guard + land.** Run the project's guard (or the inline check set) per
   lane, then push + open/update one PR per lane (branch already exists in the
   worktree) with the review evidence linked, wait for CI green, and hand the
   captain full PR URLs. A 5/5 review is the stop condition, not merge
   permission: crew automation must NEVER merge. After the parent receives the
   handoff and creates/updates the PR, close the Herdr workspace only if the
   lane is terminal and no follow-up is expected. Keep reusable lanes alive;
   when closing, preserve the workspace/pane/session identifiers so the parent
   can reopen or resume the lane if needed.
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
  validation evidence, risks, deferred-work decisions, and dependency/order
  changes. Never paste raw transcripts verbatim.
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
