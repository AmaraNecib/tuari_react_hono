/**
 * TUI — Lightweight split-screen terminal UI for workflow agents.
 *
 * Uses ansi-escapes for cursor control.
 * Layout:
 *   ┌─ Output area (scrollable) ─────────────────────────┐
 *   │ AgentName: status message                          │
 *   │ > output line 1                                    │
 *   │ > output line 2                                    │
 *   ├─ Status bar ───────────────────────────────────────┤
 *   │ Model: sonnet-4 | Step: 3/13 | Time: 1m23s        │
 *   ├─ Steer input (interactive only) ───────────────────┤
 *   │ steer> _                                           │
 *   └────────────────────────────────────────────────────┘
 *
 * Non-interactive mode: just writes to stdout normally.
 */

import ansiEscapes from "ansi-escapes"

const isWindows = process.platform === "win32"

export interface TuiConfig {
  rows?: number
}

export class TuiScreen {
  private outputLines: string[] = []
  private statusText = ""
  private steerText = ""
  private steerActive = false
  private onSteer?: (msg: string) => void
  private maxRows: number
  private outputRow = 0
  private statusRow = 0
  private steerRow = 0

  constructor(config?: TuiConfig) {
    this.maxRows = config?.rows ?? (process.stdout.rows || 24)
    // Reserve rows: 1 for header, maxRows-5 for output, 1 for status, 2 for steer
    this.outputRow = 1
    this.statusRow = Math.max(this.maxRows - 3, 3)
    this.steerRow = this.statusRow + 1
  }

  /** Write agent output (appended to scroll area) */
  writeOutput(agentName: string, text: string): void {
    const lines = text.split("\n")
    for (const line of lines) {
      this.outputLines.push(`[${agentName}] ${line}`)
    }
    this.render()
  }

  /** Write thinking text (shown dimmed, same agent) */
  writeThinking(agentName: string, text: string): void {
    // Thinking is shown inline but dimmed
    const lines = text.split("\n")
    for (const line of lines) {
      if (line.trim()) {
        this.outputLines.push(`  \x1b[2m${line}\x1b[22m`)
      }
    }
    this.render()
  }

  /** Update status bar */
  setStatus(text: string): void {
    this.statusText = text
    this.render()
  }

  /** Show steer prompt */
  showSteer(): void {
    this.steerActive = true
    this.steerText = "steer> "
    if (this.onSteer) {
      this.render()
    }
  }

  /** Hide steer prompt */
  hideSteer(): void {
    this.steerActive = false
    this.render()
  }

  /** Set steer callback */
  setOnSteer(callback: (msg: string) => void): void {
    this.onSteer = callback
  }

  /** Handle steer input character */
  handleSteerInput(chunk: string): void {
    if (!this.steerActive) return
    // Each character appends
    this.steerText += chunk
    // Move cursor to steer row, clear line, write
    this.render()
  }

  /** Handle steer enter (submit) */
  handleSteerSubmit(): void {
    if (!this.steerActive) return
    const msg = this.steerText.replace(/^steer>\s*/, "").trim()
    if (msg) {
      // Write a confirmation line to output
      this.outputLines.push(`  → steer: ${msg}`)
      this.onSteer?.(msg)
    }
    this.steerText = "steer> "
    this.render()
  }

  /** Handle steer backspace */
  handleSteerBackspace(): void {
    if (!this.steerActive || this.steerText.length <= 8) return
    this.steerText = this.steerText.slice(0, -1)
    this.render()
  }

  /** Clear the screen */
  clear(): void {
    process.stdout.write(ansiEscapes.clearScreen)
  }

  /** Get the number of output lines that fit */
  private getOutputHeight(): number {
    return Math.max(this.statusRow - this.outputRow - 2, 3)
  }

  /** Render the full screen */
  render(): void {
    const height = this.maxRows
    const outputHeight = this.getOutputHeight()

    // Build output area (show last N lines)
    const visibleLines = this.outputLines.slice(-outputHeight)

    // Build status line
    const statusLine = `\x1b[7m ${this.statusText.padEnd(process.stdout.columns - 4)} \x1b[27m`

    // Build steer line
    const steerLine = this.steerActive ? this.steerText : ""

    // Write output
    let rendered = ""
    rendered += ansiEscapes.cursorHide
    rendered += ansiEscapes.cursorLeft

    // Go to top and write output
    for (let i = 0; i < height; i++) {
      rendered += ansiEscapes.eraseLine
      if (i === this.statusRow) {
        rendered += statusLine
      } else if (i === this.steerRow && this.steerActive) {
        rendered += steerLine
      } else if (i >= this.outputRow && i < this.outputRow + visibleLines.length) {
        const lineIndex = i - this.outputRow
        if (lineIndex < visibleLines.length) {
          const line = visibleLines[lineIndex]
          rendered += line.length > process.stdout.columns - 1
            ? line.slice(0, process.stdout.columns - 4) + "..."
            : line
        }
      }
      rendered += "\n"
    }

    // Move cursor to steer input line
    if (this.steerActive) {
      const cursorCol = Math.min(this.steerText.length + 1, process.stdout.columns - 1)
      rendered += ansiEscapes.cursorTo(cursorCol, this.steerRow)
    } else {
      rendered += ansiEscapes.cursorTo(0, this.maxRows - 1)
    }

    rendered += ansiEscapes.cursorShow

    process.stdout.write(rendered)
  }

  /** Clean exit — restore cursor */
  dispose(): void {
    process.stdout.write(ansiEscapes.cursorShow + "\n")
  }
}
