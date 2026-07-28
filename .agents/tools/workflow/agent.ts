/**
 * Pi SDK agent session helpers.
 * Supports:
 * - Named agents with labeled output
 * - Quiet mode (spinner only, no streaming)
 * - Verbose mode with thinking display
 * - File logging for later inspection
 * - Steering (send messages to running agents)
 * - Event callback for custom TUI rendering
 */

import { createAgentSession, DefaultResourceLoader, getAgentDir, SessionManager, ModelRuntime } from "@earendil-works/pi-coding-agent"
import { resolve } from "node:path"
import { mkdirSync, writeFileSync, appendFileSync, existsSync } from "node:fs"
import * as p from "@clack/prompts"

const ROOT = resolve(import.meta.dir, "../../..")

// ─── Model caching ───────────────────────────────────────────────

let _modelRuntime: ModelRuntime | null = null
async function getModelRuntime(): Promise<ModelRuntime> {
  if (!_modelRuntime) {
    _modelRuntime = await ModelRuntime.create()
  }
  return _modelRuntime
}

async function resolveModel(modelStr?: string): Promise<any | undefined> {
  if (!modelStr) return undefined
  const parts = modelStr.split("/")
  if (parts.length < 2) return undefined
  const runtime = await getModelRuntime()
  return runtime.getModel(parts[0], parts.slice(1).join("/"))
}

// ─── Log file helpers ────────────────────────────────────────────

const LOG_DIR = resolve(ROOT, ".scratch", "logs")

function ensureLogDir(issueId: string, stepName: string): string {
  const dir = resolve(LOG_DIR, issueId, stepName)
  mkdirSync(dir, { recursive: true })
  return dir
}

function logEvent(dir: string, agentName: string, event: any): void {
  appendFileSync(resolve(dir, `${agentName}.jsonl`), JSON.stringify({ t: Date.now(), ...event }) + "\n")
}

function writeSummary(dir: string, agentName: string, summary: string): void {
  writeFileSync(resolve(dir, `${agentName}-summary.md`), summary)
}

// ─── Agent session (quiet + file logging) ────────────────────────

export interface AgentResult {
  /** Full assistant response text */
  response: string
  /** The session object, kept alive for steering */
  session: any
  /** Disposes the session */
  dispose: () => void
}

/**
 * Run a named agent session.
 *
 * - Quiet by default — no stdout streaming, just a spinner
 * - Verbose mode (quiet=false) shows output + thinking in real time
 * - Logs full event stream to `.scratch/logs/<issue-id>/<step>/<name>.jsonl`
 * - Writes summary to `.scratch/logs/<issue-id>/<step>/<name>-summary.md`
 * - Interactive mode enables steering via onSessionReady callback
 *
 * @param task - The prompt/instructions for the agent
 * @param options - Configuration
 * @param options.name - Agent name (for labeling logs and spinner)
 * @param options.issueId - Issue number (for log directory)
 * @param options.stepName - Step name (for log directory)
 * @param options.skillNames - Skills to load
 * @param options.modelStr - Model to use (provider/model-id)
 * @param options.quiet - Suppress stdout streaming (default: true)
 * @param options.interactive - Enable steering (default: false)
 * @param options.onSessionReady - Called with session for steering setup
 * @param options.onDelta - Callback for each text delta
 * @param options.onThinking - Callback for thinking deltas
 * @param options.onToolExec - Callback for tool execution events
 * @param options.onStatus - Callback for status changes
 */
export async function namedAgent(
  task: string,
  options: {
    name: string
    issueId: string
    stepName: string
    skillNames?: string[]
    modelStr?: string
    quiet?: boolean
    interactive?: boolean
    onSessionReady?: (session: any) => void
    onDelta?: (text: string) => void
    onThinking?: (text: string) => void
    onToolExec?: (name: string, status: "start" | "end" | "update", detail?: string) => void
    onStatus?: (status: string) => void
  },
): Promise<AgentResult> {
  const {
    name,
    issueId,
    stepName,
    skillNames,
    modelStr,
    quiet = true,
    interactive = false,
    onSessionReady,
    onDelta,
    onThinking,
    onToolExec,
    onStatus,
  } = options

  const logDir = ensureLogDir(issueId, stepName)
  let responseText = ""

  // Spinner if quiet (but not interactive — interactive uses its own UI)
  let spinner: ReturnType<typeof p.spinner> | null = null
  if (quiet && !interactive) {
    spinner = p.spinner()
    spinner.start(name)
  }

  // Set up resource loader
  const loader = new DefaultResourceLoader({
    cwd: ROOT,
    agentDir: getAgentDir(),
    skillsOverride: skillNames
      ? (current) => {
          const filtered = current.skills.filter(s => skillNames.includes(s.name))
          return { skills: filtered, diagnostics: current.diagnostics }
        }
      : undefined,
  })
  await loader.reload()

  const model = await resolveModel(modelStr)
  const { session } = await createAgentSession({
    resourceLoader: loader,
    sessionManager: SessionManager.inMemory(),
    cwd: ROOT,
    model,
  })

  // Subscribe to events
  session.subscribe((event: any) => {
    logEvent(logDir, name, { type: event.type, ...event })

    if (event.type === "message_update") {
      const msg = event.assistantMessageEvent
      if (msg.type === "text_delta") {
        responseText += msg.delta
        if (!quiet) process.stdout.write(msg.delta)
        onDelta?.(msg.delta)
      }
      if (msg.type === "thinking_delta") {
        // Show thinking when verbose, dimmed
        if (!quiet) {
          process.stdout.write(`\x1b[2m${msg.delta}\x1b[22m`)
        }
        onThinking?.(msg.delta)
      }
    }

    if (event.type === "tool_execution_start") {
      onToolExec?.(event.toolName, "start")
    }
    if (event.type === "tool_execution_end") {
      onToolExec?.(event.toolName, "end", event.isError ? "error" : "success")
    }
    if (event.type === "agent_start") {
      onStatus?.("working")
    }
    if (event.type === "agent_end") {
      onStatus?.("completed")
    }
  })

  try {
    onStatus?.("starting")

    // Let caller attach steering before we block on prompt
    if (interactive) {
      onSessionReady?.(session)
    }

    await session.prompt(task)
    onStatus?.("done")

    const response = responseText

    // Write summary
    writeSummary(logDir, name, response)

    if (spinner) {
      spinner.stop(name)
    }

    return {
      response,
      session,
      dispose: () => session.dispose(),
    }
  } catch (e) {
    if (spinner) {
      spinner.stop(`${name} ❌`)
    }
    throw e
  }
}

/**
 * Run multiple named agents in parallel.
 * Events are logged to separate files with agent prefixes.
 *
 * @returns Map of agent name → AgentResult
 */
export async function parallelNamedAgents(
  tasks: Array<{
    task: string
    name: string
    skillNames?: string[]
    modelStr?: string
  }>,
  options: {
    issueId: string
    stepName: string
    quiet?: boolean
  },
): Promise<Map<string, AgentResult>> {
  const results = new Map<string, AgentResult>()

  const promises = tasks.map(async (t) => {
    const result = await namedAgent(t.task, {
      ...options,
      name: t.name,
      skillNames: t.skillNames,
      modelStr: t.modelStr,
    })
    results.set(t.name, result)
  })

  await Promise.all(promises)
  return results
}

/**
 * Simple agent session (no steering, no named logs).
 * For quick Q&A / decision queries.
 * Always quiet — no stdout streaming.
 */
export async function quickQuery(task: string, skillNames?: string[], modelStr?: string): Promise<string> {
  const loader = new DefaultResourceLoader({
    cwd: ROOT,
    agentDir: getAgentDir(),
    skillsOverride: skillNames
      ? (current) => {
          const filtered = current.skills.filter(s => skillNames.includes(s.name))
          return { skills: filtered, diagnostics: current.diagnostics }
        }
      : undefined,
  })
  await loader.reload()

  const model = await resolveModel(modelStr)
  const { session } = await createAgentSession({
    resourceLoader: loader,
    sessionManager: SessionManager.inMemory(),
    cwd: ROOT,
    model,
  })

  try {
    await session.prompt(task)
    const messages = session.state.messages
    return messages[messages.length - 1]?.content ?? ""
  } finally {
    session.dispose()
  }
}
