# Crew handoff and landing protocol

## Decision

Visible Herdr lanes communicate completion, blockers, review results, and
follow-up proposals directly to the parent Pi session through `crew_report`.
The parent remains the only actor that decides scope/defer/order, pushes, and
opens PRs. Crew automation never merges.

## Scope

- Persist a lane manifest with the parent pane/session identity.
- Require structured lane handoffs with branch/HEAD, files, commands/results,
  risks, review result, dependencies, and deferral decision requests.
- Default to six concurrent mutation lanes, with an explicit captain override.
- Keep a lane alive when follow-up work is expected; close only terminal lanes
  and preserve identifiers for possible resume.
- Let lanes run their own local Greptile CLI review; the parent aggregates and
  decides whether to fix now, defer, or reorder lanes.
- Mandate feature-implement for pipeline lanes via a launcher-injected brief
  preamble and the lane-brief SKILLS/ROUTING line, so a custom brief cannot
  skip the required implementation path.

## Manifest lifecycle (per lane, gitignored)

`scripts/crew/launch-lane.mjs` writes and owns
`.scratch/sessions/crew/<label>.manifest.json` (`schema: 1`):

- `starting` — written only for a fresh launch, before the Herdr sequence. A
  hard kill can leave `starting`; tooling must treat anything that is not
  `ready` as not-ready.
- `ready` — promoted only after the agent is detected and briefed; carries
  `workspaceId`, `paneId`, `agent`, `agentStatus`, `cwd`, `brief`, and
  `parentPaneId` so `crew_report` and handoff tooling can route to the lane.
- Containment guard — when a label matches an existing Herdr workspace, the
  launcher compares the workspace's root pane cwd (normalized absolute path,
  Windows case-insensitive) to the requested cwd; a mismatch fails the launch
  so a ready manifest can never route to a pane in another worktree.
- Failed relaunch — any pre-existing manifest for the label is preserved
  until the new launch succeeds; failure restores it, so a live lane's
  routing metadata is never destroyed by a rejected or failed relaunch.
- Signal safety — once `ready` is published, cleanup is disarmed; a late
  SIGINT/SIGTERM cannot revert or delete a live lane's manifest.

## Lane brief routing

- `launch-lane.mjs` prepends a concise routing preamble to every brief prompt:
  pipeline lanes MUST load and follow
  `.agents/skills/feature-implement/SKILL.md`; review/smoke lanes remain
  conditional. The parent-owned push/open/no-merge rules are re-stated in the
  preamble so custom brief edits cannot drop them.
- The `crew-dispatch` lane-brief template carries an explicit mandatory
  SKILLS/ROUTING line mirroring the preamble for lanes prompted outside the
  launcher.

## Files

- `scripts/crew/launch-lane.mjs` writes the ignored parent/lane manifest and
  injects the routing preamble.
- The global Herdr `crew-watch` extension provides `crew_report` and
  `crew-send`; it is installed outside this repository and must be reloaded in
  active sessions.
- `AGENTS.md`, `crew-dispatch`, `feature-implement`, and
  `docs/engineering-workflow.md` document the contract.

## Validation

- `node --check scripts/crew/launch-lane.mjs`
- `git diff --check`
- Visible lanes are launched only through `scripts/crew/launch-lane.mjs`.
- No generated/build artifacts are staged.
