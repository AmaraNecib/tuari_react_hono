#!/usr/bin/env node
/**
 * launch-lane.mjs — spawn a VISIBLE Herdr agent lane rooted at a worktree.
 *
 * This is the ONLY sanctioned way to launch crew-dispatch lanes (workers and
 * reviewers) in this repo. It encapsulates the verified Herdr recipe
 * (workspace create -> pane run -> agent prompt) so the visible path is one
 * command. If you are launching a lane any other way — e.g. headless subagent
 * children — you are doing it wrong. See AGENTS.md "Crew dispatch shape" and
 * .agents/skills/crew-dispatch/SKILL.md.
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
import { existsSync, readFileSync } from "node:fs";
import { setTimeout as sleep } from "node:timers/promises";

const [, , label, cwd, brief] = process.argv;

if (!label || !cwd) {
  console.error("usage: launch-lane.mjs <label> <worktree-abs-path> [brief-file]");
  process.exit(2);
}

const herdr = (args) => {
  const out = execFileSync("herdr", args, { encoding: "utf8", maxBuffer: 1 << 26 }).toString().trim();
  return JSON.parse(out);
};

const pickPane = (workspaceId) => {
  const panes = herdr(["pane", "list"]).result.panes ?? [];
  return panes.find((p) => p.workspace_id === workspaceId);
};

// 1. Find or create the workspace pinned to the worktree.
let workspaceId;
const existing = (herdr(["workspace", "list"]).result.workspaces ?? []).find((w) => w.label === label);
if (existing) {
  workspaceId = existing.workspace_id;
  console.log(`[launch-lane] workspace ${label} already exists (${workspaceId})`);
} else {
  const created = herdr(["workspace", "create", "--cwd", cwd, "--label", label, "--no-focus"]).result;
  workspaceId = created.workspace.workspace_id;
  console.log(`[launch-lane] created workspace ${label} (${workspaceId}) at ${cwd}`);
}

// 2. Resolve the root pane.
let pane = pickPane(workspaceId);
if (!pane) {
  console.error(`[launch-lane] no pane found in workspace ${workspaceId}`);
  process.exit(1);
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
    console.error("[launch-lane] agent not detected after 30s — check the pane");
    process.exit(1);
  }
  pane = pickPane(workspaceId);
}
console.log(`[launch-lane] agent ${pane.agent} ready in ${pane.pane_id} (${pane.agent_status})`);

// 4. Wait until the agent is idle before prompting (so the brief is not lost).
for (let i = 0; i < 30; i++) {
  const p = pickPane(workspaceId);
  if (!p || p.agent_status === "idle") break;
  await sleep(1000);
}

// 5. Prompt with the brief file if provided.
if (brief) {
  if (!existsSync(brief)) {
    console.error(`[launch-lane] brief file not found: ${brief}`);
    process.exit(1);
  }
  const text = readFileSync(brief, "utf8");
  execFileSync("herdr", ["agent", "prompt", pane.pane_id, text], { stdio: "inherit" });
  console.log(`[launch-lane] prompted ${pane.pane_id} with ${brief}`);
} else {
  console.log(`[launch-lane] lane ${label} ready in ${pane.pane_id} — prompt it with: herdr agent prompt ${pane.pane_id} "<brief>"`);
}
