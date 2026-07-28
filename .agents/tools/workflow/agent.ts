/**
 * Pi SDK agent session helpers.
 * Supports:
 * - Named agents with labeled output
 * - Quiet mode (spinner only, no streaming)
 * - Verbose mode with thinking display
 * - File logging for later inspection
 * - Steering (send messages to running agents)
 * - Event callback for custom TUI rendering
 * - Parallel named agents with callbacks
 */

import { createAgentSession, DefaultResourceLoader, getAgentDir, SessionManager, ModelRuntime } from "@earendil-works/pi-coding-agent"
import { resolve } from "node:path"
import { mkdirSync, writeFileSync, appendFileSync } from "node:fs"
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

// ─── Shared agent options type ───────────────────────────────────

export interface AgentCallbacks {
  onDelta?: (text: string) => void
  onThinking?: (text: string) => void
  onToolExec?: (name: string, status: "start" | "end" | "update", detail?: string) => void
  onStatus?: (status: string) => void
}

export interface SessionCallbacks {
  interactive?: boolean
  onSessionReady?: (session: any) => void
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

export interface NamedAgentOptions extends AgentCallbacks, SessionCallbacks {
  name: string
  issueId: string
  stepName: string
  skillNames?: string[]
  modelStr?: string
  quiet?: boolean
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
 */
export async function namedAgent(
  task: string,
  options: NamedAgentOptions,
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

// ─── Parallel named agents ───────────────────────────────────────

export interface ParallelTask {
  task: string
  name: string
  skillNames?: string[]
  modelStr?: string
}

export interface ParallelOptions extends AgentCallbacks, SessionCallbacks {
  issueId: string
  stepName: string
  quiet?: boolean
}

/**
 * Run multiple named agents in parallel.
 * Each agent shares the same set of callbacks.
 * Events are logged to separate files by agent name.
 *
 * @returns Map of agent name → AgentResult
 */
export async function parallelNamedAgents(
  tasks: ParallelTask[],
  options: ParallelOptions,
): Promise<Map<string, AgentResult>> {
  const results = new Map<string, AgentResult>()

  const promises = tasks.map(async (t) => {
    const result = await namedAgent(t.task, {
      name: t.name,
      issueId: options.issueId,
      stepName: options.stepName,
      skillNames: t.skillNames,
      modelStr: t.modelStr,
      quiet: options.quiet,
      interactive: options.interactive,
      onSessionReady: options.onSessionReady,
      onDelta: options.onDelta,
      onThinking: options.onThinking,
      onToolExec: options.onToolExec,
      onStatus: options.onStatus,
    })
    results.set(t.name, result)
  })

  await Promise.all(promises)
  return results
}

// ─── Quick query ─────────────────────────────────────────────────

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
    const lastContent = messages[messages.length - 1]?.content
    if (typeof lastContent === "string") return lastContent
    if (Array.isArray(lastContent)) {
      // New SDK format: array of content blocks
      return lastContent.map((b: any) => b.text ?? b.content ?? "").join("\n")
    }
    return ""
  } finally {
    session.dispose()
  }
}
