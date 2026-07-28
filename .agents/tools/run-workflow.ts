/**
 * run-workflow.ts — Feature implementation lifecycle orchestrator.
 *
 * Orchestrates the full feature lifecycle from issue to PR-ready:
 * - Reads the GitHub issue for full context
 * - Agent parts: implement, debate, test-audit, code-review, capture-wisdom
 * - Programmatic parts: guard checks, git, PR creation, CI polling
 * - Interactive TUI with model selection per step
 *
 * Usage:
 *   bun run .agents/tools/run-workflow.ts #175
 *   bun run .agents/tools/run-workflow.ts #175 --message "Add TLS 1.3"
 *   bun run .agents/tools/run-workflow.ts #175 --resume
 *   bun run .agents/tools/run-workflow.ts #177 --skip-impl
 *   bun run .agents/tools/run-workflow.ts #175 --model anthropic/claude-sonnet-4-20250514
 *   bun run .agents/tools/run-workflow.ts #175 --model-implement opencode-go/mimo-2.5
 *   bun run .agents/tools/run-workflow.ts #175 --non-interactive   # skip prompts, use defaults
 *
 * Run multiple in parallel:
 *   bun run .agents/tools/run-workflow.ts #175 &
 *   bun run .agents/tools/run-workflow.ts #177 &
 *
 * State saved to .scratch/workflow/<issue-id>.json for resume/status.
 */

import * as p from "@clack/prompts"
import { pnpm, git, gh } from "./workflow/shell.ts"
import { fetchIssue, branchPrefix, guessTier } from "./workflow/issues.ts"
import { createState, loadState, saveState, type WorkflowState } from "./workflow/state.ts"
import { resolve } from "node:path"
import { isCancel } from "@clack/prompts"

const ROOT = resolve(import.meta.dir, "..")
const isTTY = process.stdout.isTTY

// ─── CLI parsing ────────────────────────────────────────────────

interface CliOptions {
  issueId: string
  message: string
  skipImpl: boolean
  resume: boolean
  nonInteractive: boolean
  model?: string
  modelImplement?: string
  modelDebate?: string
  modelTestAudit?: string
  modelCodeReview?: string
  modelCapture?: string
}

function parseArgs(): CliOptions {
  const opts: CliOptions = { issueId: "", message: "", skipImpl: false, resume: false, nonInteractive: false }
  const argv = process.argv.slice(2)
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg.startsWith("#") || /^\d+$/.test(arg)) {
      opts.issueId = arg.replace("#", "")
    } else if (arg === "--message" || arg === "-m") {
      opts.message = argv[++i] ?? ""
    } else if (arg === "--skip-impl") {
      opts.skipImpl = true
    } else if (arg === "--resume") {
      opts.resume = true
    } else if (arg === "--non-interactive") {
      opts.nonInteractive = true
    } else if (arg === "--model") {
      opts.model = argv[++i]
    } else if (arg === "--model-implement") {
      opts.modelImplement = argv[++i]
    } else if (arg === "--model-debate") {
      opts.modelDebate = argv[++i]
    } else if (arg === "--model-test-audit") {
      opts.modelTestAudit = argv[++i]
    } else if (arg === "--model-code-review") {
      opts.modelCodeReview = argv[++i]
    } else if (arg === "--model-capture") {
      opts.modelCapture = argv[++i]
    } else if (arg === "--help" || arg === "-h") {
      printHelp()
      process.exit(0)
    }
  }
  return opts
}

function printHelp(): void {
  p.intro("run-workflow — Feature Implementation Lifecycle")
  console.log(`
Usage: bun run .agents/tools/run-workflow.ts <issue-id> [options]

Arguments:
  #<id> or <id>          GitHub issue number

Options:
  --message, -m <text>    Instructions for implementation
  --skip-impl             Skip implementation (reviews only)
  --resume                Resume from last saved state
  --non-interactive       Skip interactive prompts, use defaults
  --model <provider/id>   Default model for all agent steps
  --model-implement <id>  Model for implementation step
  --model-debate <id>     Model for debate step
  --model-test-audit <id> Model for test audit step
  --model-code-review <id> Model for code review step
  --model-capture <id>    Model for capture wisdom step
  --help, -h              Show this help

Model format: provider/model-id (e.g. anthropic/claude-sonnet-4-20250514)

Examples:
  bun run run-workflow.ts #175
  bun run run-workflow.ts #175 --message "Add TLS 1.3"
  bun run run-workflow.ts #175 --resume
  bun run run-workflow.ts #177 --skip-impl
  bun run run-workflow.ts #175 --model anthropic/claude-sonnet-4-20250514
  bun run run-workflow.ts #175 --model-implement opencode-go/mimo-2.5 --model-debate opencode-go/mimo-2.5
`)
  p.outro("Run without args to see this help")
}

// ─── TUI helpers ────────────────────────────────────────────────

async function confirmStep(label: string, msg: string): Promise<boolean> {
  if (!isTTY || opts.nonInteractive) return true
  const result = await p.confirm({ message: `${label}: ${msg}`, initialValue: true })
  if (isCancel(result)) process.exit(0)
  return result as boolean
}

function withSpinner<T>(label: string, fn: () => Promise<T>): Promise<T> {
  const s = p.spinner()
  s.start(label)
  const start = Date.now()
  return fn().then((result) => {
    s.stop(`${label} — ${((Date.now() - start) / 1000).toFixed(1)}s`)
    return result
  })
}

// ─── Model selection ────────────────────────────────────────────

const COMMON_MODELS = [
  { value: "anthropic/claude-sonnet-4-20250514", label: "Claude Sonnet 4" },
  { value: "anthropic/claude-sonnet-4-20250514:thinking", label: "Claude Sonnet 4 (thinking)" },
  { value: "opencode-go/mimo-2.5", label: "Mimo 2.5 (code review)" },
  { value: "openai/gpt-4o", label: "GPT-4o" },
  { value: "openai/o3", label: "o3" },
] as const

async function selectModel(prompt: string, defaultModel?: string): Promise<string | undefined> {
  if (!isTTY || opts.nonInteractive) return defaultModel
  const result = await p.select({
    message: prompt,
    options: [
      ...COMMON_MODELS.map(m => ({ value: m.value, label: m.label })),
      { value: "__custom__", label: "Custom model..." },
      { value: "__default__", label: `Default (${defaultModel ?? "system default"})` },
    ],
  })
  if (isCancel(result)) process.exit(0)
  if (result === "__custom__") {
    const custom = await p.text({ message: "Enter model (provider/model-id):", validate: (v) => v.includes("/") ? undefined : "Must be in format provider/model-id" })
    if (isCancel(custom)) process.exit(0)
    return custom as string
  }
  if (result === "__default__") return defaultModel
  return result as string
}

// ─── Globals (set after arg parsing) ────────────────────────────
let opts: CliOptions

// ─── Step runner ─────────────────────────────────────────────────

async function runStep(state: WorkflowState, n: number, label: string, fn: () => Promise<void>): Promise<void> {
  if (state.step > n) { p.log.info(`⏩ Step ${n} (${label}) already done`); return }
  if (state.step < n - 1) {
    p.log.error(`Step ${n} requires steps ${state.step + 1}–${n - 1} first`)
    process.exit(1)
  }
  state.step = n
  state.stepLabel = label
  saveState(state)
  p.log.step(`[${n}] ${label}`)
  try {
    await fn()
  } catch (e) {
    state.status = "failed"
    state.error = String(e)
    saveState(state)
    p.log.error(`[${n}] ${label} FAILED: ${e}`)
    p.log.info(`Resume: bun run ${process.argv[1]} #${state.issueId} --resume`)
    process.exit(1)
  }
}

// ─── Guard helpers ───────────────────────────────────────────────

function runGuardCheck(description: string, cmd: string, args: string[]): void {
  const r = pnpm(args, { quiet: true })
  if (r.exitCode !== 0) {
    throw new Error(`${description} failed:\n${r.stderr.slice(0, 500)}`)
  }
}

async function guardPhase1(label: string): Promise<void> {
  await withSpinner(`${label}: contracts build`, () => {
    runGuardCheck("Contracts build", ["--filter", "@tuari/contracts", "build"])
    return Promise.resolve()
  })
  await withSpinner(`${label}: typecheck`, () => {
    runGuardCheck("TypeCheck", ["typecheck"])
    return Promise.resolve()
  })
  await withSpinner(`${label}: lint`, () => {
    runGuardCheck("Lint", ["lint"])
    return Promise.resolve()
  })
  await withSpinner(`${label}: API tests`, () => {
    runGuardCheck("API tests", ["test:api"])
    return Promise.resolve()
  })
  await withSpinner(`${label}: Web tests`, () => {
    runGuardCheck("Web tests", ["test:web"])
    return Promise.resolve()
  })
}

// ─── Main ────────────────────────────────────────────────────────

async function main(): Promise<void> {
  p.intro("run-workflow")
  opts = parseArgs()
  if (!opts.issueId) { printHelp(); process.exit(1) }

  // Welcome banner
  p.log.info(`🚀 Issue #${opts.issueId}`)

  // Interactive model selection (if TTY and not --non-interactive)
  if (isTTY && !opts.nonInteractive) {
    const defaultModel = opts.model
    opts.model = await selectModel("Default model for all steps?", defaultModel)
    if (opts.skipImpl) {
      opts.modelImplement = await selectModel("Model for implementation?", opts.model)
    }
    if (!opts.modelDebate) {
      const ans = await p.confirm({ message: "Configure per-step models?", initialValue: false })
      if (!isCancel(ans) && ans) {
        opts.modelDebate = await selectModel("Model for debate?", opts.model)
        opts.modelTestAudit = await selectModel("Model for test audit?", opts.model)
        opts.modelCodeReview = await selectModel("Model for code review?", opts.model)
        opts.modelCapture = await selectModel("Model for capture wisdom?", opts.model)
      }
    }
  }

  // Load or init state
  let state = opts.resume ? loadState(opts.issueId) : null
  if (state && state.status === "success") {
    p.log.success(`Issue #${opts.issueId} already completed. PR: ${state.prUrl}`)
    p.outro("Done")
    return
  }

  if (!state) {
    // Fetch issue from GitHub
    const issue = await withSpinner(`Fetching issue #${opts.issueId}`, async () => fetchIssue(opts.issueId))
    p.log.info(`Title: ${issue.title}`)
    if (issue.labels.length) p.log.info(`Labels: ${issue.labels.join(", ")}`)
    if (issue.milestone) p.log.info(`Milestone: ${issue.milestone}`)

    state = createState(opts.issueId, issue.title, opts.message)
    state.tier = guessTier(issue.labels, issue.body)
    state.branch = `${branchPrefix(issue.labels)}/issue-${opts.issueId}-${slugify(issue.title)}`
    saveState(state)
  }

  p.log.info(`Tier: ${state.tier} | Branch: ${state.branch}`)
  if (state.step > 0) p.log.info(`Resuming from step ${state.step}`)

  // ── Step 1: Base SHA ─────────────────────────────────────────
  await runStep(state, 1, "Base SHA", async () => {
    await withSpinner("Fetching origin/develop", () => {
      git(["fetch", "origin", "develop"], { quiet: true })
      return Promise.resolve()
    })
    const r = git(["merge-base", "origin/develop", "HEAD"], { quiet: true })
    state.baseSha = r.stdout
    p.log.info(`Merge-base: ${state.baseSha.slice(0, 12)}`)
  })

  // ── Step 2: Confirm tier via agent ────────────────────────────
  await runStep(state, 2, "Review Tier", async () => {
    const confirmed = await confirmStep("Review Tier", `Agent suggests "${state.tier}". Confirm?`)
    if (!confirmed) {
      const choices = [
        { value: "lightweight" as const, label: "Lightweight (config/docs only)" },
        { value: "standard" as const, label: "Standard (code, UI, API)" },
        { value: "high-assurance" as const, label: "High-assurance (authz, crypto, financials)" },
      ]
      const result = await p.select({ message: "Select tier:", options: choices })
      if (isCancel(result)) process.exit(0)
      state.tier = result as WorkflowState["tier"]
      saveState(state)
    }
  })

  // ── Step 3: Implement (agent) ─────────────────────────────────
  if (!opts.skipImpl) {
    await runStep(state, 3, "Implementation", async () => {
      const task = `Implement issue #${state.issueId}: "${state.title}" using TDD.

Requirements:
1. Unit tests for business logic (vitest)
2. Playwright E2E tests for the user flow (tests/e2e/)
3. Run pnpm typecheck && pnpm test:api && pnpm test:web during implementation
4. If touching Rust Core (apps/desktop/src-tauri/src/), run cargo test && cargo clippy

${state.message ? `Additional instructions: ${state.message}` : ""}`
      const { agentSession } = await import("./workflow/agent.ts")
      await agentSession(task, ["implement", "tdd"], opts.modelImplement ?? opts.model)
    })
  }

  // ── Step 4: Guard Phase 1 ────────────────────────────────────
  await runStep(state, 4, "Guard Phase 1 (pre-commit)", () => guardPhase1("Guard 1"))

  // ── Step 5: Quality check (agent) ────────────────────────────
  await runStep(state, 5, "Quality Check", async () => {
    const { quickQuery } = await import("./workflow/agent.ts")
    const analysis = await quickQuery(
      `Analyze git diff ${state.baseSha}..HEAD for issue #${state.issueId}.
What skills should be loaded? (codebase-design, diagnosing-bugs, domain-modeling, frontend-design, vercel-composition-patterns, tauri-v2, hono, playwright-best-practices, accessibility)
Respond with a comma-separated list.`,
      ["codebase-design", "diagnosing-bugs", "domain-modeling", "frontend-design"],
      opts.model ?? opts.model
    )
    p.log.info(`Agent selected: ${analysis.slice(0, 200)}`)
  })

  // ── Step 6: Debate (high-assurance only) ─────────────────────
  if (state.tier === "high-assurance") {
    await runStep(state, 6, "Debate", async () => {
      const ok = await confirmStep("Debate", "Run adversarial review (critic + defender)?")
      if (ok) {
        const { agentSession } = await import("./workflow/agent.ts")
        await agentSession(
          `Run adversarial review for issue #${state.issueId}.
Base SHA: ${state.baseSha}
1. Launch critic + defender sub-agents in parallel
2. Fix blockers, defer expensive minors as issues
3. Save to .scratch/reviews/${state.issueId}/${state.baseSha.slice(0, 12)}-debate.md`,
          ["debate"],
          opts.modelDebate ?? opts.model
        )
      }
    })
  }

  // ── Step 7: Test audit (standard + high-assurance) ───────────
  if (state.tier !== "lightweight") {
    await runStep(state, 7, "Test Audit", async () => {
      const ok = await confirmStep("Test Audit", "Run 3-agent test quality review?")
      if (ok) {
        const { agentSession } = await import("./workflow/agent.ts")
        await agentSession(
          `Run test audit for issue #${state.issueId}.
Base SHA: ${state.baseSha}
1. Edge case hunter, coverage analyst, quality reviewer
2. Fix all findings
3. Save to .scratch/reviews/${state.issueId}/${state.baseSha.slice(0, 12)}-test-audit.md`,
          ["test-audit"],
          opts.modelTestAudit ?? opts.model
        )
      }
    })
  }

  // ── Step 8: Code review (agent) ──────────────────────────────
  await runStep(state, 8, "Code Review", async () => {
    const { agentSession } = await import("./workflow/agent.ts")
    await agentSession(
      `Run code review for issue #${state.issueId}.
Base SHA: ${state.baseSha}
Diff: git diff ${state.baseSha}...HEAD
1. Standards + Spec sub-agents
2. Fix findings
3. Save to .scratch/reviews/${state.issueId}/${state.baseSha.slice(0, 12)}-code-review.md`,
      ["code-review"],
      opts.modelCodeReview ?? opts.model
    )
  })

  // ── Step 9: Guard Phase 2 (pre-push) ─────────────────────────
  await runStep(state, 9, "Guard Phase 2 (pre-push)", async () => {
    await guardPhase1("Guard 2")
    const status = git(["status", "--short"], { quiet: true })
    if (status.stdout) p.log.warn(`Uncommitted:\n${status.stdout}`)
    else p.log.success("Clean working tree")
  })

  // ── Step 10: Push + PR ───────────────────────────────────────
  await runStep(state, 10, "Push & PR", async () => {
    const ok = await confirmStep("Push", `Push branch ${state.branch} and create PR?`)
    if (!ok) { p.log.warn("Skipping push"); return }

    await withSpinner("Pushing branch", () => {
      git(["checkout", "-B", state.branch], { quiet: true })
      git(["push", "origin", state.branch], { quiet: true })
      return Promise.resolve()
    })

    const title = `#${state.issueId}: ${state.title}`
    const body = `Closes #${state.issueId}

## Review evidence
See .scratch/reviews/${state.issueId}/

## Checklist
- [ ] Unit tests
- [ ] Playwright E2E tests
- [ ] TypeCheck passes
- [ ] Lint passes
- [ ] API tests pass
- [ ] Web tests pass${state.tier === "high-assurance" ? "\n- [ ] Debate completed\n- [ ] Test audit completed" : ""}
- [ ] Code review completed`

    const pr = gh(["pr", "create", "--title", title, "--body", body, "--label", `tier:${state.tier}`], { quiet: true })
    state.prUrl = pr.stdout
    state.prNumber = parseInt(pr.stdout.split("/").pop() ?? "0", 10)
    p.log.success(`PR: ${state.prUrl}`)
  })

  // ── Step 11: CI + Greptile ───────────────────────────────────
  await runStep(state, 11, "CI & Greptile", async () => {
    const ok = await confirmStep("CI", "Wait for CI and trigger Greptile?")
    if (!ok) { p.log.warn("Skipping CI"); return }

    await withSpinner("Waiting for CI to finish", () => {
      gh(["run", "watch", "--exit-status"], { quiet: true })
      return Promise.resolve()
    })
    p.log.success("CI green")

    gh(["pr", "comment", String(state.prNumber), "--body", "@greptile-apps review"], { quiet: true })
    p.log.info("Greptile triggered")

    const { quickQuery } = await import("./workflow/agent.ts")
    await quickQuery(
      `Check Greptile review on PR #${state.prNumber} for issue #${state.issueId}.
Fetch PR comments, read Greptile findings.
If actionable: fix, push, re-trigger, wait, re-check.
Repeat until no actionable findings.`,
      ["code-review"],
      opts.modelCodeReview ?? opts.model
    )
  })

  // ── Step 12: Capture wisdom ──────────────────────────────────
  await runStep(state, 12, "Capture Wisdom", async () => {
    const ok = await confirmStep("Wisdom", "Capture lessons from this session?")
    if (ok) {
      const { agentSession } = await import("./workflow/agent.ts")
      await agentSession(
        `Capture wisdom from issue #${state.issueId}.
Write to .agents/wisdom/*.md:
- Things that went wrong/surprised you
- Patterns worth remembering
- Cross-PR observations`,
        ["capture-wisdom"],
        opts.modelCapture ?? opts.model
      )
    }
  })

  // ── Step 13: Report ──────────────────────────────────────────
  await runStep(state, 13, "Report", async () => {
    p.log.success(`\n═══════════════════════════════════════════`)
    p.log.success(`Workflow complete for issue #${state.issueId}`)
    p.log.success(`PR: ${state.prUrl}`)
    p.log.success(`Tier: ${state.tier}`)
    p.log.success(`Branch: ${state.branch}`)
    p.log.info(`\nNext steps:`)
    p.log.info(`1. Review the PR`)
    p.log.info(`2. If approved, merge:`)
    p.log.info(`   gh pr merge ${state.prNumber} --squash`)
    p.log.info(`3. Close issue #${state.issueId}`)
    p.log.info(`\nEvidence: .scratch/reviews/${state.issueId}/`)
  })

  // ── Done ──────────────────────────────────────────────────────
  state.status = "success"
  state.completedAt = new Date().toISOString()
  saveState(state)
  p.outro("Done")
}

// ─── Helpers ────────────────────────────────────────────────────

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40)
}

// ─── Run ────────────────────────────────────────────────────────

main().catch((e) => {
  p.log.error(`Fatal: ${e}`)
  process.exit(1)
})
