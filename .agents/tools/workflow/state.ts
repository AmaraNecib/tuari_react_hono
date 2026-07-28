/**
 * State management for the workflow orchestrator.
 * Persists workflow state to .scratch/workflow/<issue-id>.json
 * for resume and status tracking across runs.
 */

import { readFileSync, writeFileSync, renameSync, mkdirSync, existsSync } from "node:fs"
import { resolve } from "node:path"

export interface WorkflowState {
  issueId: string
  title: string
  message: string
  tier: "lightweight" | "standard" | "high-assurance"
  baseSha: string
  branch: string
  prUrl: string
  prNumber: number
  step: number
  stepLabel: string
  status: "running" | "success" | "failed"
  error?: string
  startedAt: string
  completedAt?: string
}

const STATE_DIR = resolve(import.meta.dir, "../../../.scratch/workflow")

export function stateFile(issueId: string): string {
  return resolve(STATE_DIR, `${issueId}.json`)
}

export function saveState(state: WorkflowState): void {
  mkdirSync(STATE_DIR, { recursive: true })
  const file = stateFile(state.issueId)
  const tmp = file + ".tmp." + process.pid
  writeFileSync(tmp, JSON.stringify(state, null, 2))
  renameSync(tmp, file)
}

export function loadState(issueId: string): WorkflowState | null {
  const file = stateFile(issueId)
  if (!existsSync(file)) return null
  return JSON.parse(readFileSync(file, "utf-8"))
}

export function createState(issueId: string, title: string, message?: string): WorkflowState {
  return {
    issueId,
    title,
    message: message ?? "",
    tier: "standard",
    baseSha: "",
    branch: `feature/issue-${issueId}`,
    prUrl: "",
    prNumber: 0,
    step: 0,
    stepLabel: "",
    status: "running",
    startedAt: new Date().toISOString(),
  }
}
