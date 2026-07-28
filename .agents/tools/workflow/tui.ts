/**
 * TUI — Lightweight split-screen terminal UI for workflow agents.
 *
 * Uses ansi-escapes for cursor control.
 * Layout (interactive mode):
 *   ┌─ Output area (scrollable) ─────────────────────────┐
 *   │ [agent] thinking line 1                            │
 *   │ [agent] output line 1                              │
 *   │ [agent] output line 2                              │
 *   ├─ Status bar ───────────────────────────────────────┤
 *   │ Step: 03-implement | implement | elapsed: 1m23s   │
 *   ├─ Steer input ──────────────────────────────────────┤
 *   │ steer> _                                           │
 *   └────────────────────────────────────────────────────┘
 *
 * Verbose-only mode: no steer bar, output + status only.
 * Quiet mode: no TUI at all (spinner).
 */

import ansiEscapes from "ansi-escapes"

/**
 * Handle raw-mode stdin keys and forward to TuiScreen.
 * Attach to `process.stdin.on("data", tui.handleRawInput)`.
 */
function decodeRawInput(data: Buffer): Array<"enter" | "backspace" | "ctrl-c" | { char: string }> {
  const events: Array<"enter" | "backspace" | "ctrl-c" | { char: string }> = []
  for (let i = 0; i < data.length; i++) {
    const byte = data[i]
    if (byte === 0x0d || byte === 0x0a) {
      events.push("enter")
    } else if (byte === 0x7f || byte === 0x08) {
      events.push("backspace")
    } else if (byte === 0x03) {
      events.push("ctrl-c")
    } else if (byte >= 0x20 && byte <= 0x7e) {
      events.push({ char: String.fromCharCode(byte) })
    }
    // Ignore other control characters
  }
  return events
}

export interface TuiConfig {
  rows?: number
  interactive?: boolean
}

export class TuiScreen {
  private outputLines: string[] = []
  private statusText = ""
  private steerBuffer = ""
  private steerCallback: ((msg: string) => void) | null = null
  private maxRows: number
  private outputRow = 0
  private statusRow = 0
  private steerRow = 0
  private _interactive: boolean

  constructor(config?: TuiConfig) {
    this.maxRows = config?.rows ?? (process.stdout.rows || 24)
    this._interactive = config?.interactive ?? false
    // Reserve rows: 1 for header, maxRows-5 for output, 1 for status, 2 for steer
    this.outputRow = 1
    this.statusRow = Math.max(this.maxRows - 3, 3)
    this.steerRow = this.statusRow + 1
  }

  /** Begin a new step — clears output area */
  startStep(stepLabel: string): void {
    this.outputLines = []
    this.statusText = stepLabel
    this.steerBuffer = "steer> "
    this.render()
  }

  /** Write agent output (appended to scroll area) */
  writeOutput(agentName: string, text: string): void {
    const lines = text.split("\n")
    for (const line of lines) {
      this.outputLines.push(`[${agentName}] ${line}`)
    }
    this.render()
  }

  /** Write thinking text (shown dimmed) */
  writeThinking(agentName: string, text: string): void {
    const lines = text.split("\n")
    for (const line of lines) {
      if (line.trim()) {
        this.outputLines.push(`  \x1b[2m${line}\x1b[22m`)
      }
    }
    this.render()
  }

  /** Update status bar (step: agent: message) */
  setStatus(text: string): void {
    if (!text) return
    this.statusText = text
    this.render()
  }

  /** Set steer callback (called when user hits Enter with a message) */
  setOnSteer(callback: (msg: string) => void): void {
    this.steerCallback = callback
  }

  /**
   * Handle raw-mode stdin data events.
   * Call this from `process.stdin.on("data", buf => tui.handleRawInput(buf))`
   */
  handleRawInput(data: Buffer): void {
    const events = decodeRawInput(data)
    for (const ev of events) {
      if (ev === "enter") {
        this.handleSteerSubmit()
      } else if (ev === "backspace") {
        this.handleSteerBackspace()
      } else if (ev === "ctrl-c") {
        process.exit(0)
      } else if ("char" in ev) {
        this.handleSteerInput(ev.char)
      }
    }
  }

  /** Append a character to the steer buffer */
  private handleSteerInput(ch: string): void {
    if (!this._interactive) return
    this.steerBuffer += ch
    this.render()
  }

  /** Submit the steer message */
  private handleSteerSubmit(): void {
    if (!this._interactive) return
    const raw = this.steerBuffer.replace(/^steer>\s*/, "").trim()
    this.steerBuffer = "steer> "
    if (raw) {
      this.outputLines.push(`  → steer: ${raw}`)
      this.steerCallback?.(raw)
    }
    this.render()
  }

  /** Delete last character from steer buffer */
  private handleSteerBackspace(): void {
    if (!this._interactive || this.steerBuffer.length <= 8) return
    this.steerBuffer = this.steerBuffer.slice(0, -1)
    this.render()
  }

  /** Clear screen */
  clear(): void {
    process.stdout.write(ansiEscapes.clearScreen)
  }

  /** Number of output rows available */
  private getOutputHeight(): number {
    return Math.max(this.statusRow - this.outputRow - 2, 3)
  }

  /** Render the full screen */
  render(): void {
    const height = this.maxRows
    const outputHeight = this.getOutputHeight()

    // Build output area (show last N lines)
    const visibleLines = this.outputLines.slice(-outputHeight)

    // Build status line (inverted colors)
    const cols = process.stdout.columns || 80
    const status = this.statusText.slice(0, cols - 4)
    const statusLine = `\x1b[7m ${status.padEnd(cols - 2)} \x1b[27m`

    // Build steer line
    const steerLine = this._interactive ? this.steerBuffer : ""

    // Assemble frame
    let rendered = ""
    rendered += ansiEscapes.cursorHide
    rendered += ansiEscapes.cursorLeft

    for (let i = 0; i < height; i++) {
      rendered += ansiEscapes.eraseLine
      if (i === this.statusRow) {
        rendered += statusLine
      } else if (i === this.steerRow && this._interactive) {
        rendered += steerLine
      } else if (i >= this.outputRow && i < this.outputRow + visibleLines.length) {
        const lineIndex = i - this.outputRow
        const line = visibleLines[lineIndex]
        if (line) {
          rendered += line.length > cols - 1
            ? line.slice(0, cols - 4) + "..."
            : line
        }
      }
      rendered += "\n"
    }

    // Move cursor to steer input line
    if (this._interactive) {
      const cursorCol = Math.min(this.steerBuffer.length + 1, cols - 1)
      rendered += ansiEscapes.cursorTo(cursorCol, this.steerRow)
    } else {
      rendered += ansiEscapes.cursorTo(0, this.maxRows - 1)
    }

    rendered += ansiEscapes.cursorShow
    process.stdout.write(rendered)
  }

  /** Clean exit — restore cursor and newline */
  dispose(): void {
    process.stdout.write(ansiEscapes.cursorShow + "\n")
  }
}
