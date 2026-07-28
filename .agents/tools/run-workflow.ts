/**
 * run-workflow.ts — Feature implementation lifecycle orchestrator.
 *
 * Orchestrates the full feature lifecycle from issue to PR-ready:
 * - Reads the GitHub issue for full context
 * - Agent parts: implement, debate, test-audit, code-review, capture-wisdom
 * - Programmatic parts: guard checks, git, PR creation, CI polling
 *
 * Usage:
 *   bun run .agents/tools/run-workflow.ts #175
 *   bun run .agents/tools/run-workflow.ts #175 --message "Add TLS 1.3"
 *   bun run .agents/tools/run-workflow.ts #175 --resume
 *   bun run .agents/tools/run-workflow.ts #177 --skip-impl
 *
 * Run multiple in parallel:
 *   bun run .agents/tools/run-workflow.ts #175 &
 *   bun run .agents/tools/run-workflow.ts #177 &
 *
 * State is saved to .scratch/workflow/<issue-id>.json for resume/status.
 */

import { pnpm, git, gh } from "./workflow/shell.ts"
import { fetchIssue, branchPrefix, guessTier } from "./workflow/issues.ts"
import { agentSession, quickQuery } from "./workflow/agent.ts"
import { createState, loadState, saveState, type WorkflowState } from "./workflow/state.ts"
import { resolve } from "node:path"

const ROOT = resolve(import.meta.dir, "..")

// ─── CLI parsing ────────────────────────────────────────────────

interface CliOptions {
  issueId: string
  message: string
  skipImpl: boolean
  resume: boolean
}

function parseArgs(): CliOptions {
  const opts: CliOptions = { issueId: "", message: "", skipImpl: false, resume: false }
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
    } else if (arg === "--help" || arg === "-h") {
      printHelp()
      process.exit(0)
    }
  }
  return opts
}

function printHelp(): void {
  console.log(`
Usage: bun run .agents/tools/run-workflow.ts <issue-id> [options]

Arguments:
  #<id> or <id>          GitHub issue number

Options:
  --message, -m <text>   Additional instructions for implementation
  --skip-impl            Skip implementation (reviews only)
  --resume               Resume from last saved state
  --help, -h             Show this help

Examples:
  bun run run-workflow.ts #175
  bun run run-workflow.ts #175 --message "Add TLS 1.3 support"
  bun run run-workflow.ts #175 --resume
  bun run run-workflow.ts #177 --skip-impl
`)
}

// ─── Logger ──────────────────────────────────────────────────────

function log(...args: any[]): void {
  console.log(`[workflow]`, ...args)
}

// ─── Step runner ─────────────────────────────────────────────────

async function runStep(state: WorkflowState, n: number, label: string, fn: () => Promise<void>): Promise<void> {
  if (state.step > n) { log(`⏩ Step ${n} (${label}) already done`); return }
  if (state.step < n - 1) {
    log(`⚠️  Step ${n} requires steps ${state.step + 1}–${n - 1} first. Run without --resume or fix state.`)
    process.exit(1)
  }
  state.step = n
  state.stepLabel = label
  saveState(state)
  log(`\n═══════ [${n}] ${label} ═══════════════════════════════`)
  const start = Date.now()
  try {
    await fn()
    log(`✅ [${n}] ${label} — ${((Date.now() - start) / 1000).toFixed(1)}s`)
  } catch (e) {
    state.status = "failed"
    state.error = String(e)
    saveState(state)
    log(`❌ [${n}] ${label} FAILED: ${e}`)
    log(`   Resume: bun run ${process.argv[1]} #${state.issueId} --resume`)
    process.exit(1)
  }
}

// ─── Guard helpers ───────────────────────────────────────────────

function runGuardCheck(description: string, cmd: string, args: string[]): void {
  log(`   🔍 ${description}`)
  const r = pnpm(args, { quiet: true })
  if (r.exitCode !== 0) {
    throw new Error(`${description} failed:\n${r.stderr.slice(0, 500)}`)
  }
}

async function guardPhase1(): Promise<void> {
  runGuardCheck("Contracts build", ["--filter", "@tuari/contracts", "build"])
  runGuardCheck("TypeCheck", ["typecheck"])
  runGuardCheck("Lint", ["lint"])
  runGuardCheck("API tests", ["test:api"])
  runGuardCheck("Web tests", ["test:web"])
}

// ─── Main ────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const opts = parseArgs()
  if (!opts.issueId) { printHelp(); process.exit(1) }

  // Load or init state
  let state = opts.resume ? loadState(opts.issueId) : null
  if (state && state.status === "success") {
    log(`Issue #${opts.issueId} already completed. PR: ${state.prUrl}`)
    return
  }

  if (!state) {
    // Fetch issue from GitHub
    log(`📡 Fetching issue #${opts.issueId} from GitHub...`)
    const issue = fetchIssue(opts.issueId)
    log(`   Title: ${issue.title}`)
    log(`   Labels: ${issue.labels.join(", ") || "(none)"}`)
    log(`   State: ${issue.state}`)
    if (issue.milestone) log(`   Milestone: ${issue.milestone}`)

    state = createState(opts.issueId, issue.title, opts.message)
    state.tier = guessTier(issue.labels, issue.body)
    state.branch = `${branchPrefix(issue.labels)}/issue-${opts.issueId}-${slugify(issue.title)}`
    saveState(state)
  }

  log(`🚀 Running workflow for issue #${state.issueId}: "${state.title}"`)
  if (state.message) log(`   Message: ${state.message}`)
  if (state.step > 0) log(`   Resuming from step ${state.step} (${state.stepLabel})`)
  log(`   Tier: ${state.tier} | Branch: ${state.branch}`)

  // ── Step 1: Base SHA ─────────────────────────────────────────
  await runStep(state, 1, "Base SHA", async () => {
    git(["fetch", "origin", "develop"])
    const r = git(["merge-base", "origin/develop", "HEAD"], { quiet: true })
    state.baseSha = r.stdout
    log(`   Merge-base: ${state.baseSha}`)
  })

  // ── Step 2: Confirm tier via agent ────────────────────────────
  await runStep(state, 2, "Review Tier", async () => {
    const result = await quickQuery(
      `Issue #${state.issueId}: "${state.title}"
${state.message ? `Message: ${state.message}` : ""}

Analyze git diff ${state.baseSha}..HEAD.

What review tier applies?
- lightweight: .gitignore, LICENSE, .scratch/ only
- standard: code, CI, config, UI, API, skills
- high-assurance: authz/RBAC, licensing/crypto, debt financials, security

Respond with ONLY the exact tier name: lightweight, standard, or high-assurance`,
      ["code-review"]
    )
    const match = result.toLowerCase().match(/(lightweight|standard|high-assurance)/)
    if (match) {
      state.tier = match[1] as WorkflowState["tier"]
      log(`   Agent confirmed tier: ${state.tier}`)
    }
  })

  // ── Step 3: Implement (agent) ─────────────────────────────────
  if (!opts.skipImpl) {
    await runStep(state, 3, "Implementation", async () => {
      const task = `Implement issue #${state.issueId}: "${state.title}" using TDD.

Requirements:
1. Write unit tests for business logic (vitest)
2. Write Playwright E2E tests for the user flow (tests/e2e/)
3. Run pnpm typecheck && pnpm test:api && pnpm test:web during implementation
4. If touching Rust Core (apps/desktop/src-tauri/src/), run cargo test && cargo clippy
5. Use the implement skill for TDD approach

${state.message ? `Additional instructions: ${state.message}` : ""}`
      await agentSession(task, ["implement", "tdd"])
    })
  }

  // ── Step 4: Guard Phase 1 ────────────────────────────────────
  await runStep(state, 4, "Guard Phase 1", guardPhase1)

  // ── Step 5: Quality check (agent) ────────────────────────────
  await runStep(state, 5, "Quality Check", async () => {
    await agentSession(
      `Run quality check on issue #${state.issueId}.
Analyze git diff ${state.baseSha}..HEAD.

Load the right skills based on what the change touches:
- codebase-design → new modules/interfaces
- diagnosing-bugs → complex logic
- domain-modeling → domain entities
- frontend-design → UI components
- vercel-composition-patterns → component APIs
- tauri-v2 → Tauri desktop features
- hono → API routes
- playwright-best-practices → E2E tests
- accessibility → UI a11y

Report findings and fix issues before proceeding.`,
      ["codebase-design", "diagnosing-bugs", "domain-modeling", "frontend-design"]
    )
  })

  // ── Step 6: Debate (high-assurance only) ─────────────────────
  if (state.tier === "high-assurance") {
    await runStep(state, 6, "Debate", async () => {
      await agentSession(
        `Run adversarial review (debate) for issue #${state.issueId}.
Base SHA: ${state.baseSha}

1. Launch critic + defender sub-agents in parallel
2. Critic: find every flaw, rate severity 1-10
3. Defender: argue for the design
4. Synthesize: fix blockers, defer expensive minors as issues
5. Save evidence to .scratch/reviews/${state.issueId}/${state.baseSha.slice(0, 12)}-debate.md`,
        ["debate"]
      )
    })
  }

  // ── Step 7: Test audit (standard + high-assurance) ───────────
  if (state.tier !== "lightweight") {
    await runStep(state, 7, "Test Audit", async () => {
      await agentSession(
        `Run test audit for issue #${state.issueId}.
Base SHA: ${state.baseSha}

1. Launch 3 sub-agents in parallel:
   - Edge case hunter: find missing edge cases
   - Coverage analyst: check acceptance criteria coverage
   - Quality reviewer: grade test quality A-D
2. Fix all findings
3. Save to .scratch/reviews/${state.issueId}/${state.baseSha.slice(0, 12)}-test-audit.md`,
        ["test-audit"]
      )
    })
  }

  // ── Step 8: Code review (agent) ──────────────────────────────
  await runStep(state, 8, "Code Review", async () => {
    await agentSession(
      `Run code review for issue #${state.issueId}.
Base SHA: ${state.baseSha}
Diff: git diff ${state.baseSha}...HEAD

1. Launch Standards + Spec sub-agents in parallel
2. Fix actionable findings
3. Save to .scratch/reviews/${state.issueId}/${state.baseSha.slice(0, 12)}-code-review.md`,
      ["code-review"]
    )
  })

  // ── Step 9: Guard Phase 2 (pre-push) ─────────────────────────
  await runStep(state, 9, "Guard Phase 2", async () => {
    await guardPhase1()
    // Check working tree
    const status = git(["status", "--short"], { quiet: true })
    if (status.stdout) log(`   ⚠️  Uncommitted:\n${status.stdout}`)
    else log(`   ✓ Clean tree`)
  })

  // ── Step 10: Push + PR ───────────────────────────────────────
  await runStep(state, 10, "Push & PR", async () => {
    // Ensure branch exists
    git(["checkout", "-B", state.branch])
    git(["push", "origin", state.branch])

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

    const pr = gh(
      ["pr", "create", "--title", title, "--body", body, "--label", `tier:${state.tier}`],
      { quiet: true }
    )
    state.prUrl = pr.stdout
    state.prNumber = parseInt(pr.stdout.split("/").pop() ?? "0", 10)
    log(`   PR: ${state.prUrl}`)
  })

  // ── Step 11: CI + Greptile ───────────────────────────────────
  await runStep(state, 11, "CI & Greptile", async () => {
    // Wait for CI
    log(`   ⏳ Waiting for CI...`)
    gh(["run", "watch", "--exit-status"], { quiet: true })
    log(`   ✅ CI green`)

    // Trigger Greptile
    gh(["pr", "comment", String(state.prNumber), "--body", "@greptile-apps review"])
    log(`   🤖 Greptile triggered`)

    // Ask agent to check Greptile findings
    await agentSession(
      `Check Greptile review on PR #${state.prNumber} for issue #${state.issueId}.
1. Fetch PR comments from GitHub
2. Read Greptile findings
3. If actionable: fix, push, re-trigger, wait, re-check
4. Repeat until no actionable findings remain`,
      ["code-review"]
    )
  })

  // ── Step 12: Capture wisdom ──────────────────────────────────
  await runStep(state, 12, "Capture Wisdom", async () => {
    await agentSession(
      `Capture wisdom from the feature workflow for issue #${state.issueId}.
Write to .agents/wisdom/*.md:
- Things that went wrong
- Things that surprised you
- Patterns worth remembering
- Any cross-PR observations`,
      ["capture-wisdom"]
    )
  })

  // ── Step 13: Report ──────────────────────────────────────────
  await runStep(state, 13, "Report", async () => {
    log(`\n═════════════════════════════════════════════════════`)
    log(`✅ Workflow complete for issue #${state.issueId}`)
    log(`   Title: ${state.title}`)
    log(`   PR: ${state.prUrl}`)
    log(`   Tier: ${state.tier}`)
    log(`   Branch: ${state.branch}`)
    log(`   Evidence: .scratch/reviews/${state.issueId}/`)
    log(``)
    log(`   Next steps for the user:`)
    log(`   1. Review the PR`)
    log(`   2. If approved, merge:`)
    log(`      gh pr merge ${state.prNumber} --squash`)
    log(`   3. Close the issue: #${state.issueId}`)
    log(`═════════════════════════════════════════════════════`)
  })

  // ── Done ──────────────────────────────────────────────────────
  state.status = "success"
  state.completedAt = new Date().toISOString()
  saveState(state)
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
  log(`❌ Fatal: ${e}`)
  process.exit(1)
})
