/**
 * run-workflow.ts — Feature implementation lifecycle orchestrator.
 *
 * Orchestrates the full feature lifecycle from issue to PR-ready:
 * - Reads the GitHub issue for full context
 * - Agent parts: implement, debate, test-audit, code-review, capture-wisdom
 * - Programmatic parts: guard checks, git, PR creation, CI polling
 * - Split-screen TUI with steering (interactive mode)
 * - Quiet named agents with file logging (default)
 *
 * Usage:
 *   bun run .agents/tools/run-workflow.ts #175
 *   bun run .agents/tools/run-workflow.ts #175 --message "Add TLS 1.3"
 *   bun run .agents/tools/run-workflow.ts #175 --resume
 *   bun run .agents/tools/run-workflow.ts #177 --skip-impl
 *   bun run .agents/tools/run-workflow.ts #175 --model anthropic/claude-sonnet-4-20250514
 *   bun run .agents/tools/run-workflow.ts #175 --model-implement opencode-go/mimo-2.5
 *   bun run .agents/tools/run-workflow.ts #175 --non-interactive   # skip prompts, use defaults
 *   bun run .agents/tools/run-workflow.ts #175 --verbose           # show agent streaming
 *   bun run .agents/tools/run-workflow.ts #175 --interactive       # split-screen TUI + steering
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
import { namedAgent, parallelNamedAgents, quickQuery } from "./workflow/agent.ts"
import { createState, loadState, saveState, type WorkflowState } from "./workflow/state.ts"
import { TuiScreen } from "./workflow/tui.ts"
import { isCancel } from "@clack/prompts"

const isTTY = process.stdout.isTTY

// ─── CLI parsing ────────────────────────────────────────────────

interface CliOptions {
  issueId: string
  message: string
  skipImpl: boolean
  resume: boolean
  nonInteractive: boolean
  autoApprove: boolean
  verbose: boolean
  interactive: boolean
  model?: string
  modelImplement?: string
  modelDebate?: string
  modelTestAudit?: string
  modelCodeReview?: string
  modelCapture?: string
}

function parseArgs(): CliOptions {
  const opts: CliOptions = { issueId: "", message: "", skipImpl: false, resume: false, nonInteractive: false, autoApprove: false, verbose: false, interactive: false }
  const argv = process.argv.slice(2)
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg.startsWith("#") || /^\d+$/.test(arg)) {
      const raw = arg.replace("#", "")
      if (!/^\d+$/.test(raw)) {
        console.error(`Invalid issue ID: "${arg}". Must be a numeric issue number.`)
        process.exit(1)
      }
      opts.issueId = raw
    } else if (arg === "--message" || arg === "-m") {
      opts.message = argv[++i] ?? ""
    } else if (arg === "--skip-impl") {
      opts.skipImpl = true
    } else if (arg === "--resume") {
      opts.resume = true
    } else if (arg === "--non-interactive") {
      opts.nonInteractive = true
    } else if (arg === "--verbose") {
      opts.verbose = true
    } else if (arg === "--interactive") {
      opts.interactive = true
      opts.verbose = true // interactive implies verbose
    } else if (arg === "--yes" || arg === "-y") {
      opts.autoApprove = true
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
  --verbose               Show agent streaming output (default: quiet)
  --interactive           Split-screen TUI with steering (implies --verbose)
  --yes, -y               Auto-approve destructive ops (push, PR, CI) in non-interactive mode
  --model <provider/id>   Default model for all agent steps
  --model-implement <id>  Model for implementation step
  --model-debate <id>     Model for debate step
  --model-test-audit <id> Model for test audit step
  --model-code-review <id> Model for code review step
  --model-capture <id>    Model for capture wisdom step
  --help, -h              Show this help

Model format: provider/model-id (e.g. anthropic/claude-sonnet-4-20250514)

Examples:
  bun run run-workflow.ts #175                                      # quiet, spinner only
  bun run run-workflow.ts #175 --verbose                            # streaming output
  bun run run-workflow.ts #175 --interactive                        # split-screen TUI + steer
  bun run run-workflow.ts #175 --message "Add TLS 1.3"
  bun run run-workflow.ts #175 --resume
  bun run run-workflow.ts #177 --skip-impl
  bun run run-workflow.ts #175 --model anthropic/claude-sonnet-4-20250514
  bun run run-workflow.ts #175 --model-implement opencode-go/mimo-2.5 --model-debate opencode-go/mimo-2.5
`)
  p.outro("Run without args to see this help")
}

// ─── TUI helpers ─────────────────────────────────────────────────

/**
 * Create agent callbacks that wire to the split-screen TUI.
 * Returns an object with onDelta, onThinking, onStatus, onSessionReady.
 * When interactive, also sets up steer on the TUI.
 */
function tuiAgentCallbacks(
  tui: TuiScreen | null,
  agentName: string,
  stepLabel: string,
  steerRef?: { current: ((msg: string) => Promise<void>) | null },
): {
  onDelta?: (text: string) => void
  onThinking?: (text: string) => void
  onStatus?: (status: string) => void
  onSessionReady?: (session: any) => void
  interactive?: boolean
} {
  if (!tui) return {}

  const callbacks: ReturnType<typeof tuiAgentCallbacks> = {
    onDelta: (text: string) => tui.writeOutput(agentName, text),
    onThinking: (text: string) => tui.writeThinking(agentName, text),
    onStatus: (status: string) => tui.setStatus(`${stepLabel} | ${agentName}: ${status}`),
  }

  if (opts.interactive && steerRef) {
    callbacks.interactive = true
    callbacks.onSessionReady = (session: any) => {
      steerRef.current = (msg: string) => session.steer(msg)
      // Also wire the TUI steer callback
      const tuiSteerFn = (msg: string) => session.steer(msg)
      tui.setOnSteer(tuiSteerFn)
    }
  }

  return callbacks
}

// ─── Misc helpers ────────────────────────────────────────────────

async function confirmStep(label: string, msg: string): Promise<boolean> {
  if (!isTTY || opts.nonInteractive) return true
  const result = await p.confirm({ message: `${label}: ${msg}`, initialValue: true })
  if (isCancel(result)) process.exit(0)
  return result as boolean
}

async function withSpinner<T>(label: string, fn: () => Promise<T>): Promise<T> {
  const s = p.spinner()
  s.start(label)
  const start = Date.now()
  try {
    const result = await fn()
    s.stop(`${label} — ${((Date.now() - start) / 1000).toFixed(1)}s`)
    return result
  } catch (e) {
    s.stop(`${label} — FAILED (${((Date.now() - start) / 1000).toFixed(1)}s)`)
    throw e
  }
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

// ─── Steering helper (fallback for non-TUI mode) ─────────────────

import { createInterface } from "node:readline"

/**
 * Listen for steer input from stdin during agent execution.
 * Used in quiet/verbose mode without TUI.
 * User types: s: <message>  — steer the agent
 */
function setupSteering(label: string): {
  steerRef: { current: ((msg: string) => Promise<void>) | null }
  cleanup: () => void
} {
  const steerRef: { current: ((msg: string) => Promise<void>) | null } = { current: null }

  if (!opts.interactive || !isTTY) return { steerRef, cleanup: () => {} }
  // In TUI mode, steer is handled by TuiScreen raw-mode input
  if (tui) return { steerRef, cleanup: () => {} }

  const rl = createInterface({ input: process.stdin, output: process.stdout })
  rl.on("line", (line: string) => {
    const trimmed = line.trim()
    if (trimmed.startsWith("s:") || trimmed.startsWith("s ")) {
      const msg = trimmed.replace(/^s[:\s]/, "").trim()
      if (msg && steerRef.current) {
        p.log.step(`[steer → ${label}] ${msg}`)
        steerRef.current(msg)
      }
    }
  })

  return { steerRef, cleanup: () => { rl.close() } }
}

// ─── Globals (set after arg parsing) ────────────────────────────
let opts: CliOptions
let tui: TuiScreen | null = null

// ─── Step runner ─────────────────────────────────────────────────

async function runStep(state: WorkflowState, n: number, label: string, fn: () => Promise<void>): Promise<void> {
  // Skip if already done
  if (state.step > n) { p.log.info(`⏩ Step ${n} (${label}) already done`); return }
  // Advance through gaps (skipped steps)
  if (state.step < n - 1) {
    for (let s = state.step + 1; s < n; s++) {
      p.log.info(`⏩ Step ${s} (skipped)`)
    }
    state.step = n - 1
  }
  const labelPadded = `[${n}] ${label}`

  // Notify TUI of step start
  if (tui) {
    tui.startStep(labelPadded)
    tui.setStatus(labelPadded)
  }

  p.log.step(labelPadded)
  try {
    await fn()
    state.step = n
    state.stepLabel = label
    saveState(state)
  } catch (e) {
    state.status = "failed"
    state.error = String(e)
    try { saveState(state) } catch { /* best-effort */ }
    p.log.error(`[${n}] ${label} FAILED: ${e}`)
    p.log.info(`Resume: bun run ${process.argv[1]} #${state.issueId} --resume`)
    process.exit(1)
  }
}

// ─── Guard helpers ───────────────────────────────────────────────

function runGuardCheck(description: string, args: string[]): void {
  const r = pnpm(args, { quiet: true })
  if (r.exitCode !== 0) {
    throw new Error(`${description} failed:\n${r.stderr.slice(0, 500)}`)
  }
}

async function guardPhase1(label: string): Promise<void> {
  if (tui) {
    tui.setStatus(`${label}: contracts build`)
    runGuardCheck("Contracts build", ["--filter", "@tuari/contracts", "build"])
    tui.setStatus(`${label}: typecheck`)
    runGuardCheck("TypeCheck", ["typecheck"])
    tui.setStatus(`${label}: lint`)
    runGuardCheck("Lint", ["lint"])
    tui.setStatus(`${label}: API tests`)
    runGuardCheck("API tests", ["test:api"])
    tui.setStatus(`${label}: Web tests`)
    runGuardCheck("Web tests", ["test:web"])
  } else {
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
    if (!opts.skipImpl) {
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

  // ── Create TUI (split-screen) for interactive/verbose mode ──
  if (opts.interactive || opts.verbose) {
    tui = new TuiScreen({ interactive: opts.interactive })
    tui.clear()

    if (opts.interactive) {
      // Raw mode stdin for steer input
      process.stdin.setRawMode?.(true)
      process.stdin.on("data", (data: Buffer) => {
        tui!.handleRawInput(data)
      })
      tui.setStatus("run-workflow | initializing...")
    }
  }

  // Load or init state
  let state = opts.resume ? loadState(opts.issueId) : null
  if (state && state.status === "success") {
    const msg = `Issue #${opts.issueId} already completed. PR: ${state.prUrl}`
    if (tui) { tui.setStatus(msg); tui.dispose() }
    p.log.success(msg)
    p.outro("Done")
    return
  }

  if (!state) {
    const issue = await withSpinner(`Fetching issue #${opts.issueId}`, async () => fetchIssue(opts.issueId))
    if (tui) tui.setStatus(`Fetched: ${issue.title}`)
    p.log.info(`Title: ${issue.title}`)
    if (issue.labels.length) p.log.info(`Labels: ${issue.labels.join(", ")}`)
    if (issue.milestone) p.log.info(`Milestone: ${issue.milestone}`)

    state = createState(opts.issueId, issue.title, opts.message)
    state.tier = guessTier(issue.labels, issue.body)
    state.branch = `${branchPrefix(issue.labels)}/issue-${opts.issueId}-${slugify(issue.title)}`
    saveState(state)
  }

  if (tui) tui.setStatus(`Tier: ${state.tier} | Branch: ${state.branch}`)
  p.log.info(`Tier: ${state.tier} | Branch: ${state.branch}`)
  if (state.step > 0) p.log.info(`Resuming from step ${state.step}`)

  // ── Step 1: Base SHA ─────────────────────────────────────────
  await runStep(state, 1, "Base SHA", async () => {
    let defaultBranch = "develop"
    const brResult = gh(["repo", "view", "--json", "defaultBranch"], { quiet: true })
    if (brResult.exitCode === 0 && brResult.stdout) {
      try {
        defaultBranch = JSON.parse(brResult.stdout).defaultBranch ?? "develop"
      } catch { /* fall through */ }
    }
    await withSpinner(`Fetching origin/${defaultBranch}`, async () => {
      const r = git(["fetch", "origin", defaultBranch], { quiet: true })
      if (r.exitCode !== 0) throw new Error(`git fetch origin/${defaultBranch} failed:\n${r.stderr.slice(0, 300)}`)
    })
    const r = git(["merge-base", `origin/${defaultBranch}`, "HEAD"], { quiet: true })
    if (r.exitCode !== 0 || !r.stdout) throw new Error(`Could not find merge-base with origin/${defaultBranch}:\n${r.stderr.slice(0, 300)}`)
    state.baseSha = r.stdout
    if (tui) tui.setStatus(`Base SHA: ${state.baseSha.slice(0, 12)}`)
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
    if (tui) tui.setStatus(`Tier: ${state.tier}`)
  })

  // ── Step 3: Implement (agent) ─────────────────────────────────
  if (opts.skipImpl) {
    await runStep(state, 3, "Implementation (skipped)", async () => {
      if (tui) tui.setStatus("Implementation (skipped)")
    })
  } else {
    await runStep(state, 3, "Implementation", async () => {
      const task = `Implement issue #${state.issueId}: "${state.title}" using TDD.

Requirements:
1. Unit tests for business logic (vitest)
2. Playwright E2E tests for the user flow (tests/e2e/)
3. Run pnpm typecheck && pnpm test:api && pnpm test:web during implementation
4. If touching Rust Core (apps/desktop/src-tauri/src/), run cargo test && cargo clippy

${state.message ? `Additional instructions: ${state.message}` : ""}`
      const { steerRef, cleanup } = setupSteering("implement")
      const cb = tuiAgentCallbacks(tui, "implement", "Step 3: Implement", steerRef)
      await namedAgent(task, {
        name: "implement",
        issueId: state.issueId,
        stepName: "03-implement",
        skillNames: ["implement", "tdd"],
        modelStr: opts.modelImplement ?? opts.model,
        quiet: !opts.verbose,
        interactive: cb.interactive ?? false,
        ...cb,
      })
      cleanup()
    })
  }

  // ── Step 4: Guard Phase 1 ────────────────────────────────────
  await runStep(state, 4, "Guard Phase 1 (pre-commit)", () => guardPhase1("Guard 1"))

  // ── Step 5: Quality check (agent) ────────────────────────────
  await runStep(state, 5, "Quality Check", async () => {
    if (tui) tui.setStatus("Quality Check: analyzing diff...")
    const analysis = await quickQuery(
      `Analyze git diff ${state.baseSha}..HEAD for issue #${state.issueId}.
What skills should be loaded? (codebase-design, diagnosing-bugs, domain-modeling, frontend-design, vercel-composition-patterns, tauri-v2, hono, playwright-best-practices, accessibility)
Respond with a comma-separated list.`,
      ["codebase-design", "diagnosing-bugs", "domain-modeling", "frontend-design"],
      opts.model ?? opts.model
    )
    if (tui) tui.setStatus(`Quality Check: ${analysis.slice(0, 60)}...`)
    p.log.info(`Agent selected: ${analysis.slice(0, 200)}`)

    // Actually run the selected skills against the diff
    const selectedSkills = analysis.split(",").map(s => s.trim()).filter(Boolean)
    if (selectedSkills.length > 0) {
      if (tui) tui.setStatus(`Quality Check: running ${selectedSkills.length} skill(s)...`)
      const cb = tuiAgentCallbacks(tui, "quality", "Step 5: Quality Check")
      await namedAgent(
        `Run quality check using git diff ${state.baseSha}..HEAD for issue #${state.issueId}.
Loaded skills: ${selectedSkills.join(", ")}
Review the diff against each skill's guidance, report findings, and fix any issues found.`,
        {
          name: "quality-check",
          issueId: state.issueId,
          stepName: "05-quality-check",
          skillNames: selectedSkills,
          modelStr: opts.model ?? opts.model,
          quiet: !opts.verbose,
          interactive: opts.interactive,
          onSessionReady: (s) => cb.onSessionReady?.(s),
          onDelta: cb.onDelta,
          onThinking: cb.onThinking,
          onStatus: cb.onStatus,
        }
      )
    }
  })

  // ── Step 6: Debate — parallel critic + defender ─────────────
  if (state.tier === "high-assurance") {
    await runStep(state, 6, "Debate", async () => {
      const ok = await confirmStep("Debate", "Run adversarial review (critic + defender)?")
      if (ok) {
        if (tui) tui.setStatus("Debate: launching critic + defender in parallel...")
        const cb = tuiAgentCallbacks(tui, "debate", "Step 6: Debate")
        const results = await parallelNamedAgents([
          {
            name: "critic",
            task: `You are the CRITIC. Review issue #${state.issueId} with maximum rigor.
Base SHA: ${state.baseSha}
Diff: git diff ${state.baseSha}...HEAD

Find every bug, design flaw, missing test, security concern, and edge case.
Be harsh and thorough — this is a high-assurance review.

Write your findings to .scratch/reviews/${state.issueId}/${state.baseSha.slice(0, 12)}-critic.md
Then fix all actionable issues.`,
            skillNames: ["debate", "code-review", "diagnosing-bugs"],
            modelStr: opts.modelDebate ?? opts.model,
          },
          {
            name: "defender",
            task: `You are the DEFENDER. Review issue #${state.issueId} constructively.
Base SHA: ${state.baseSha}
Diff: git diff ${state.baseSha}...HEAD

Find pragmatic compromises, acceptable technical debt, tests that are good enough,
and things done right. Flag false positives from the critic.

Write your findings to .scratch/reviews/${state.issueId}/${state.baseSha.slice(0, 12)}-defender.md`,
            skillNames: ["debate", "code-review"],
            modelStr: opts.modelDebate ?? opts.model,
          },
        ], {
          issueId: state.issueId,
          stepName: "06-debate",
          quiet: !opts.verbose,
          ...cb,
        })

        if (tui) tui.setStatus("Debate: synthesizing results...")
        const critic = results.get("critic")?.response ?? ""
        const defender = results.get("defender")?.response ?? ""
        p.log.info(`Critic: ${critic.slice(0, 100)}...`)
        p.log.info(`Defender: ${defender.slice(0, 100)}...`)
        p.log.step("Debate complete — see .scratch/reviews/ for full reports")
      }
    })
  }

  // ── Step 7: Test audit (standard + high-assurance) ───────────
  if (state.tier === "lightweight") {
    await runStep(state, 7, "Test Audit (skipped — lightweight)", async () => {
      if (tui) tui.setStatus("Test Audit (skipped — lightweight)")
    })
  } else {
    await runStep(state, 7, "Test Audit", async () => {
      const ok = await confirmStep("Test Audit", "Run 3-agent test quality review?")
      if (ok) {
        const { steerRef, cleanup } = setupSteering("test-audit")
        const cb = tuiAgentCallbacks(tui, "test-audit", "Step 7: Test Audit", steerRef)
        await namedAgent(
          `Run test audit for issue #${state.issueId}.
Base SHA: ${state.baseSha}
1. Edge case hunter, coverage analyst, quality reviewer
2. Fix all findings
3. Save to .scratch/reviews/${state.issueId}/${state.baseSha.slice(0, 12)}-test-audit.md`,
          {
            name: "test-audit",
            issueId: state.issueId,
            stepName: "07-test-audit",
            skillNames: ["test-audit"],
            modelStr: opts.modelTestAudit ?? opts.model,
            quiet: !opts.verbose,
            interactive: cb.interactive ?? false,
            ...cb,
          }
        )
        cleanup()
      }
    })
  }

  // ── Step 8: Code review (agent) ──────────────────────────────
  await runStep(state, 8, "Code Review", async () => {
    const { steerRef, cleanup } = setupSteering("code-review")
    const cb = tuiAgentCallbacks(tui, "code-review", "Step 8: Code Review", steerRef)
    await namedAgent(
      `Run code review for issue #${state.issueId}.
Base SHA: ${state.baseSha}
Diff: git diff ${state.baseSha}...HEAD
1. Standards + Spec sub-agents
2. Fix findings
3. Save to .scratch/reviews/${state.issueId}/${state.baseSha.slice(0, 12)}-code-review.md`,
      {
        name: "code-review",
        issueId: state.issueId,
        stepName: "08-code-review",
        skillNames: ["code-review"],
        modelStr: opts.modelCodeReview ?? opts.model,
        quiet: !opts.verbose,
        interactive: cb.interactive ?? false,
        ...cb,
      }
    )
    cleanup()
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

    if (tui) tui.setStatus("Push: pushing branch...")
    await withSpinner("Pushing branch", async () => {
      const co = git(["checkout", "-B", state.branch], { quiet: true })
      if (co.exitCode !== 0) throw new Error(`git checkout -B ${state.branch} failed:\n${co.stderr.slice(0, 300)}`)
      const pu = git(["push", "origin", state.branch], { quiet: true })
      if (pu.exitCode !== 0) throw new Error(`git push origin ${state.branch} failed:\n${pu.stderr.slice(0, 300)}`)
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
    if (pr.exitCode !== 0 || !pr.stdout) {
      throw new Error(`gh pr create failed:\n${pr.stderr.slice(0, 300)}`)
    }
    state.prUrl = pr.stdout
    const prNum = parseInt(pr.stdout.split("/").pop() ?? "", 10)
    if (isNaN(prNum)) throw new Error(`Could not parse PR number from: "${pr.stdout}"`)
    state.prNumber = prNum
    if (tui) tui.setStatus(`PR: ${state.prUrl}`)
    p.log.success(`PR: ${state.prUrl}`)
  })

  // ── Step 11: CI + Greptile ───────────────────────────────────
  await runStep(state, 11, "CI & Greptile", async () => {
    const ok = await confirmStep("CI", "Wait for CI and trigger Greptile?")
    if (!ok) { p.log.warn("Skipping CI"); return }

    if (tui) tui.setStatus("CI: waiting for checks...")
    await withSpinner("Waiting for CI to finish", async () => {
      let runId = ""
      const listResult = gh(["run", "list", "--branch", state.branch, "--limit", "1", "--json", "databaseId"], { quiet: true })
      if (listResult.exitCode === 0 && listResult.stdout) {
        try {
          const runs = JSON.parse(listResult.stdout)
          if (runs.length > 0) runId = String(runs[0].databaseId)
        } catch { /* fall through */ }
      }
      const args = runId ? ["run", "watch", runId, "--exit-status"] : ["run", "watch", "--exit-status"]
      const r = gh(args, { quiet: true })
      if (r.exitCode !== 0) throw new Error(`CI run failed (exit code ${r.exitCode}):\n${r.stderr.slice(0, 300)}`)
    })
    if (tui) tui.setStatus("CI: green — triggering Greptile")
    p.log.success("CI green")

    gh(["pr", "comment", String(state.prNumber), "--body", "@greptile-apps review"], { quiet: true })
    p.log.info("Greptile triggered")

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
      const { steerRef, cleanup } = setupSteering("capture-wisdom")
      const cb = tuiAgentCallbacks(tui, "capture-wisdom", "Step 12: Wisdom", steerRef)
      await namedAgent(
        `Capture wisdom from issue #${state.issueId}.
Write to .agents/wisdom/*.md:
- Things that went wrong/surprised you
- Patterns worth remembering
- Cross-PR observations`,
        {
          name: "capture-wisdom",
          issueId: state.issueId,
          stepName: "12-capture-wisdom",
          skillNames: ["capture-wisdom"],
          modelStr: opts.modelCapture ?? opts.model,
          quiet: !opts.verbose,
          interactive: cb.interactive ?? false,
          ...cb,
        }
      )
      cleanup()
    }
  })

  // ── Step 13: Report ──────────────────────────────────────────
  await runStep(state, 13, "Report", async () => {
    const report = `\n═══════════════════════════════════════════
Workflow complete for issue #${state.issueId}
PR: ${state.prUrl}
Tier: ${state.tier}
Branch: ${state.branch}

Next steps:
1. Review the PR
2. If approved, merge:
   gh pr merge ${state.prNumber} --squash
3. Close issue #${state.issueId}

Evidence: .scratch/reviews/${state.issueId}/`
    if (tui) tui.setStatus(report)
    p.log.success(report)
  })

  // ── Done ──────────────────────────────────────────────────────
  state.status = "success"
  state.completedAt = new Date().toISOString()
  saveState(state)

  if (tui) {
    tui.setStatus(`✅ Done — Issue #${state.issueId} complete. PR: ${state.prUrl}`)
    tui.dispose()
  }
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
  if (tui) { tui.setStatus(`Fatal: ${e}`); tui.dispose() }
  p.log.error(`Fatal: ${e}`)
  process.exit(1)
})
