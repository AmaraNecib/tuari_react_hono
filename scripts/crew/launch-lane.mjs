#!/usr/bin/env node
/**
 * launch-lane.mjs — spawn a VISIBLE Herdr agent lane rooted at a worktree.
 *
 * This is the ONLY sanctioned way to launch VISIBLE crew-dispatch lanes (workers
 * and reviewers) in this repo. It encapsulates the verified Herdr recipe
 * (workspace create -> pane run -> agent prompt) so the visible path is one
 * command. It does NOT cover the headless shape: when the captain explicitly
 * opts into headless ("run headless" / "don't use herdr"), lanes launch through
 * the async subagent workflow instead and this script does not apply. See
 * AGENTS.md "Crew dispatch shape" and .agents/skills/crew-dispatch/SKILL.md.
 *
 * Manifest lifecycle: the lane manifest is written with status "starting"
 * before the Herdr launch sequence and is promoted to "ready" (with the
 * pane/agent identity) only after the agent is detected and briefed. Every
 * failure path — missing brief, no pane, undetected agent, prompt error —
 * restores any pre-existing manifest or removes a fresh starting manifest, so
 * a failed launch can never leave an orphan that looks like a live lane and
 * can never destroy a live lane's routing metadata. A hard kill leaves a
 * "starting" manifest (or the pre-existing one), which handoff tooling must
 * treat as not-ready. Reuse by label validates that the
 * existing workspace's root pane cwd matches the requested cwd; a mismatch
 * fails the launch instead of publishing a ready manifest routed to a pane in
 * a different worktree. A relaunch preserves any pre-existing manifest for the
 * label until the new launch succeeds, so a failed or rejected relaunch can
 * never destroy a live lane's routing metadata — it restores the old manifest
 * instead of deleting it. Once the ready manifest is published, cleanup is
 * disarmed: a late termination signal must never revert or delete a live
 * lane's current routing information. Every brief prompt is prefixed with a
 * short CREW routing preamble that mandates feature-implement for pipeline
 * lanes; custom briefs cannot omit it, and brief/base values still override
 * skill defaults.
 *
 * Usage:
 *   node scripts/crew/launch-lane.mjs <label> <worktree-abs-path> [brief-file]
 *
 * Examples:
 *   node scripts/crew/launch-lane.mjs issue-999 D:/repo/worktrees/issue-999 \
 *     .scratch/sessions/crew/999-brief.txt
 *   node scripts/crew/launch-lane.mjs rev-999 D:/repo/worktrees/issue-999 \
 *     .scratch/sessions/crew/rev-999-brief.txt
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

const [, , label, cwd, brief] = process.argv;
const safeLabel = String(label || "lane").replace(/[^a-zA-Z0-9._-]/g, "_");

// Lane labels follow one convention: <type>-<short-slug> in kebab-case, e.g.
// fix-dashboard-followups, chore-ui-skills, feat-release-path. The label is an
// identity — it names the Herdr workspace, the manifest and the handoff — so an
// off-convention label (a bare issue number, "mvp-...", a sentence) is rejected
// before any workspace state exists.
const LANE_LABEL_PATTERN = /^(feat|fix|chore|refactor|test|docs|perf|release|issue|rev)-[a-z0-9]+(-[a-z0-9]+)*$/;
if (!LANE_LABEL_PATTERN.test(safeLabel)) {
  console.error(
    `[launch-lane] label "${label}" breaks the lane naming convention <type>-<short-slug> ` +
      `(e.g. fix-dashboard-followups). Allowed types: feat, fix, chore, refactor, test, docs, perf, release, issue, rev.`,
  );
  process.exit(2);
}

// Resolve the pane that owns this lane. HERDR_PANE_ID may be stale or absent
// (e.g. a Herdr restart renumbered panes, or launch-lane runs outside a pane).
// A stale id silently hides the lane from its real parent in crew-watch
// (isFamilyAgent requires manifest.parentPaneId === the parent's pane), so we
// only trust it if it is still a live herdr pane; otherwise return null, which
// makes crew-watch fall back to legacy "show all" rather than hiding the lane.
const liveParentPane = () => {
  const fromEnv = process.env.HERDR_PANE_ID;
  if (fromEnv) {
    try {
      const panes = execFileSync("herdr", ["pane", "list"], {
        encoding: "utf8",
        maxBuffer: 1 << 24,
      }).toString().trim();
      const ids = (JSON.parse(panes)?.result?.panes ?? []).map((p) => p.pane_id);
      if (ids.includes(fromEnv)) return fromEnv;
    } catch {
      // An unverified parent must not constrain crew-watch family routing.
      // If we cannot confirm the pane is live, fall back to null (show-all)
      // rather than trusting a possibly-stale env value that would keep
      // hiding the relaunched lane from its real parent.
      return null;
    }
  }
  return null;
};

if (!label || !cwd) {
  console.error("usage: launch-lane.mjs <label> <worktree-abs-path> [brief-file]");
  process.exit(2);
}

// Static validation first: a missing brief must fail before any manifest or
// Herdr state is created.
if (brief && !existsSync(brief)) {
  console.error(`[launch-lane] brief file not found: ${brief}`);
  process.exit(1);
}

const crewDir = join(cwd, ".scratch", "sessions", "crew");
const manifestPath = join(crewDir, `${safeLabel}.manifest.json`);

// Capture any pre-existing manifest for this label before the launch, so a
// failure cannot destroy a live lane's routing metadata (e.g. a rejected or
// failed relaunch of a label whose workspace is still running).
let preexistingManifest = null;
try {
  preexistingManifest = readFileSync(manifestPath, "utf8");
} catch {
  preexistingManifest = null;
}

const seedManifest = {
  schema: 1,
  label,
  cwd,
  brief: brief || null,
  parentPaneId: liveParentPane(),
  createdAt: new Date().toISOString(),
};

const writeManifest = (patch) => {
  let current = seedManifest;
  try {
    current = { ...seedManifest, ...JSON.parse(readFileSync(manifestPath, "utf8")) };
  } catch {
    // first write or unreadable manifest: start from the seed
  }
  // Always refresh parentPaneId to the live parent, never preserve a stale one.
  current.parentPaneId = liveParentPane();
  mkdirSync(crewDir, { recursive: true });
  writeFileSync(
    manifestPath,
    JSON.stringify({ ...current, ...patch, updatedAt: new Date().toISOString() }, null, 2),
  );
};

// Set once the ready manifest is published; after that, cleanup handlers must
// never touch the manifest — the lane is live and its routing metadata is
// current.
let manifestPublished = false;

// Restore the pre-existing manifest on failure (relaunch of a live lane) or
// remove the starting manifest we created (fresh launch). No-op once the
// ready manifest is published, so a late signal cannot revert it.
const restoreOrCleanup = () => {
  if (manifestPublished) return;
  if (preexistingManifest !== null) {
    writeFileSync(manifestPath, preexistingManifest);
  } else {
    rmSync(manifestPath, { force: true });
  }
};

// Cleanup contract: any failure exit restores a pre-existing manifest or
// removes a starting one, so a failed launch can neither orphan a live lane
// nor leave a fresh manifest that could be mistaken for a live lane.
const fail = (message) => {
  console.error(message);
  restoreOrCleanup();
  process.exit(1);
};
const cleanupOnSignal = (code) => () => {
  restoreOrCleanup();
  process.exit(code);
};
process.once("SIGINT", cleanupOnSignal(130));
process.once("SIGTERM", cleanupOnSignal(143));

// A "starting" marker is only written for a fresh launch. A relaunch keeps
// the existing manifest untouched until the launch succeeds, so a failed
// relaunch can never erase a live lane's routing metadata.
if (preexistingManifest === null) {
  writeManifest({ status: "starting" });
}

// Concise routing preamble injected into every brief prompt. A custom brief
// cannot omit feature-implement for pipeline lanes: the preamble mandates it,
// while brief/base values still override skill defaults and review/smoke lanes
// follow the brief's own contract. Kept short — the brief carries the full
// workflow.
const LANE_PREAMBLE = [
  "CREW: For pipeline/implementation lanes, load .agents/skills/feature-implement/SKILL.md before work.",
  "Brief/base values override it. Parent owns push/PR; never merge; report via crew_report.",
  "",
].join("\n");

const herdr = (args) => {
  const out = execFileSync("herdr", args, { encoding: "utf8", maxBuffer: 1 << 26 }).toString().trim();
  return JSON.parse(out);
};

const pickPane = (workspaceId) => {
  const panes = herdr(["pane", "list"]).result.panes ?? [];
  return panes.find((p) => p.workspace_id === workspaceId);
};

// Absolute, separator-normalized path for containment comparison. On Windows
// the comparison is case-insensitive (herdr pane cwd uses backslashes while
// the requested cwd may use forward slashes).
const normalizePath = (p) => {
  if (!p) return "";
  const normalized = resolve(p).replace(/\\/g, "/");
  return process.platform === "win32" ? normalized.toLowerCase() : normalized;
};

let workspaceId;
let pane;

try {
  // 1. Find or create the workspace pinned to the worktree.
  const existing = (herdr(["workspace", "list"]).result.workspaces ?? []).find((w) => w.label === label);
  if (existing) {
    workspaceId = existing.workspace_id;
    const existingPane = pickPane(workspaceId);
    const existingRoot = normalizePath(existingPane?.cwd);
    const requestedRoot = normalizePath(cwd);
    // Reuse only when the existing workspace PROVABLY belongs to this worktree.
    // A label is not an identity: a reused label pointing at another checkout
    // would deliver the brief to an agent working on the wrong files, and an
    // unresolvable pane/cwd is exactly that case, not a pass.
    if (!existingPane || !existingRoot) {
      fail(
        `[launch-lane] workspace ${label} exists but its root pane/cwd cannot be resolved; close it or choose another label (refusing to reuse an unverified workspace)`,
      );
    }
    if (existingRoot !== requestedRoot) {
      fail(
        `[launch-lane] workspace ${label} is rooted at ${existingPane.cwd} not ${cwd}; close it or choose another label`,
      );
    }
    console.log(`[launch-lane] workspace ${label} already exists (${workspaceId})`);
  } else {
    const created = herdr(["workspace", "create", "--cwd", cwd, "--label", label, "--no-focus"]).result;
    workspaceId = created.workspace.workspace_id;
    console.log(`[launch-lane] created workspace ${label} (${workspaceId}) at ${cwd}`);
  }

  // 2. Resolve the root pane.
  pane = pickPane(workspaceId);
  if (!pane) {
    fail(`[launch-lane] no pane found in workspace ${workspaceId}`);
  }
  console.log(`[launch-lane] root pane ${pane.pane_id}`);

  // 3. Start the pi agent in the pane if it is not detected yet.
  const agentReady = () => {
    const p = pickPane(workspaceId);
    return p && p.agent_status && p.agent_status !== "unknown" && p.agent;
  };
  if (!agentReady()) {
    execFileSync("herdr", ["pane", "run", pane.pane_id, "pi"], { stdio: "inherit" });
    console.log("[launch-lane] started pi agent, waiting for detection...");
    for (let i = 0; i < 30; i++) {
      if (agentReady()) break;
      await sleep(1000);
    }
    if (!agentReady()) {
      fail("[launch-lane] agent not detected after 30s — check the pane");
    }
    pane = pickPane(workspaceId);
  }
  console.log(`[launch-lane] agent ${pane.agent} ready in ${pane.pane_id} (${pane.agent_status})`);

  // 4. Wait until the agent is idle before prompting, so the brief is not lost.
  //    Stay tied to the pane whose worktree we verified: a workspace can hold
  //    several panes, so re-resolving by workspace could hand the brief to a
  //    different checkout when the pane order changes. A vanished pane, a cwd
  //    that no longer matches, or an agent still busy after the timeout is a
  //    hard failure the operator can act on.
  const requestedRootForPane = normalizePath(cwd);
  const findVerifiedPane = () => {
    const panes = herdr(["pane", "list"]).result.panes ?? [];
    return panes.find((p) => p.pane_id === pane.pane_id);
  };
  let idle = false;
  for (let i = 0; i < 30; i++) {
    const current = findVerifiedPane();
    if (!current) {
      fail(
        `[launch-lane] pane ${pane.pane_id} disappeared while waiting for idle — not prompting`,
      );
    }
    const currentRoot = normalizePath(current.cwd);
    if (!currentRoot || currentRoot !== requestedRootForPane) {
      fail(
        `[launch-lane] pane ${current.pane_id} now reports cwd ${current.cwd ?? "(unknown)"} instead of ${cwd} — not prompting`,
      );
    }
    pane = current;
    if (current.agent_status === "idle") {
      idle = true;
      break;
    }
    await sleep(1000);
  }
  if (!idle) {
    fail(
      `[launch-lane] agent in ${pane.pane_id} is still ${pane.agent_status} after 30s — not prompting (that would interrupt the running lane)`,
    );
  }

  // 5. Prompt with the brief file if provided (routing preamble first, so a
  //    custom brief cannot skip the pipeline skill mandate).
  if (brief) {
    const text = LANE_PREAMBLE + readFileSync(brief, "utf8");
    execFileSync("herdr", ["agent", "prompt", pane.pane_id, text], { stdio: "inherit" });
    console.log(`[launch-lane] prompted ${pane.pane_id} with ${brief}`);
  } else {
    console.log(`[launch-lane] lane ${label} ready in ${pane.pane_id} — prompt it with: herdr agent prompt ${pane.pane_id} "<brief>"`);
  }
} catch (err) {
  fail(`[launch-lane] launch failed: ${err.message}`);
}

// 6. The lane is fully launched: promote the manifest to ready so crew_report
//    and handoff tooling can route to this lane with the pane identity.
//    Identity fields are re-supplied explicitly so a relaunch refreshes any
//    stale brief/cwd values captured in a pre-existing manifest. Publish is
//    recorded before the write so even a signal in the write window no-ops;
//    the signal handlers are then disarmed entirely.
manifestPublished = true;
writeManifest({
  status: "ready",
  cwd,
  brief: brief || null,
  workspaceId,
  paneId: pane.pane_id,
  agent: pane.agent,
  agentStatus: pane.agent_status,
});
process.removeAllListeners("SIGINT");
process.removeAllListeners("SIGTERM");
