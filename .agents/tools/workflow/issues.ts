/**
 * GitHub issue reader.
 * Fetches issue details via `gh issue view` for full context.
 */

import { gh } from "./shell.ts"

export interface IssueData {
  number: number
  title: string
  body: string
  labels: string[]
  state: string
  milestone?: string
}

/**
 * Fetch issue details from GitHub.
 */
export function fetchIssue(issueId: string): IssueData {
  const result = gh(
    ["issue", "view", issueId, "--json", "title,body,labels,state,milestone,number"],
    { quiet: true }
  )
  if (result.exitCode !== 0) {
    console.error(`❌ Could not fetch issue #${issueId}: ${result.stderr}`)
    console.error(`   Make sure gh is authenticated: gh auth status`)
    process.exit(1)
  }
  const raw = JSON.parse(result.stdout)
  return {
    number: raw.number,
    title: raw.title,
    body: raw.body ?? "",
    labels: (raw.labels ?? []).map((l: any) => l.name ?? l),
    state: raw.state,
    milestone: raw.milestone?.title,
  }
}

/**
 * Guess the branch prefix from issue labels.
 */
export function branchPrefix(labels: string[]): string {
  if (labels.some(l => l.includes("fix") || l.includes("bug"))) return "fix"
  if (labels.some(l => l.includes("refactor"))) return "refactor"
  if (labels.some(l => l.includes("test"))) return "test"
  return "feature"
}

/**
 * Guess the review tier from issue labels and body.
 */
export function guessTier(labels: string[], body: string): "lightweight" | "standard" | "high-assurance" {
  const text = [labels.join(" "), body].join(" ").toLowerCase()
  if (text.includes("rbac") || text.includes("permission") || text.includes("auth")
    || text.includes("license") || text.includes("crypto") || text.includes("security")
    || text.includes("financial") || text.includes("debt")) {
    return "high-assurance"
  }
  return "standard"
}
