/**
 * Pi SDK agent session helpers.
 * Creates isolated sessions for implementation, review, debate, etc.
 */

import { createAgentSession, DefaultResourceLoader, getAgentDir, SessionManager } from "@earendil-works/pi-coding-agent"
import type { Skill } from "@earendil-works/pi-coding-agent"

const ROOT = resolve(import.meta.dir, "../../..")
import { resolve } from "node:path"

/**
 * Run an agent session with specific skills loaded.
 * Returns the last assistant message content.
 */
export async function agentSession(task: string, skillNames?: string[]): Promise<string> {
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

  const { session } = await createAgentSession({
    resourceLoader: loader,
    sessionManager: SessionManager.inMemory(),
    cwd: ROOT,
  })

  try {
    session.subscribe((event) => {
      if (event.type === "message_update" && event.assistantMessageEvent.type === "text_delta") {
        process.stdout.write(event.assistantMessageEvent.delta)
      }
    })
    await session.prompt(task)
    const messages = session.state.messages
    return messages[messages.length - 1]?.content ?? ""
  } finally {
    session.dispose()
  }
}

/**
 * Quick agent query — returns a short answer without streaming to stdout.
 * Used for decision points (e.g., "what tier is this?").
 */
export async function quickQuery(task: string, skillNames?: string[]): Promise<string> {
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

  const { session } = await createAgentSession({
    resourceLoader: loader,
    sessionManager: SessionManager.inMemory(),
    cwd: ROOT,
  })

  try {
    await session.prompt(task)
    const messages = session.state.messages
    return messages[messages.length - 1]?.content ?? ""
  } finally {
    session.dispose()
  }
}
