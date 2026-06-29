/**
 * KeyboardShortcuts - Unified keyboard shortcuts module
 * 
 * Deep module that handles all keyboard shortcut concerns:
 * - Registration/unregistration
 * - Platform detection (Ctrl vs Cmd)
 * - Input field detection
 * - Conflict resolution
 */

import { useEffect, useCallback, useRef } from "react"

// ============ Types ============

interface ShortcutDefinition {
  /** Key combination (e.g., "Ctrl+K", "Cmd+N", "Escape") */
  key: string
  /** Handler function */
  handler: () => void
  /** Whether this shortcut works in input fields */
  allowInInput?: boolean
}

interface ShortcutConfig {
  /** Global shortcuts that work everywhere */
  shortcuts: ShortcutDefinition[]
}

// ============ Internal Helpers ============

function isInputField(target: EventTarget | null): boolean {
  const el = target as HTMLElement
  return (
    el?.tagName === "INPUT" ||
    el?.tagName === "TEXTAREA" ||
    el?.tagName === "SELECT" ||
    el?.isContentEditable
  )
}

function parseKeyCombo(combo: string): { key: string; ctrl: boolean; shift: boolean; alt: boolean } {
  const parts = combo.toLowerCase().split("+").map(s => s.trim())
  return {
    key: parts.find(p => !["ctrl", "cmd", "meta", "shift", "alt"].includes(p)) || "",
    ctrl: parts.includes("ctrl") || parts.includes("cmd") || parts.includes("meta"),
    shift: parts.includes("shift"),
    alt: parts.includes("alt"),
  }
}

function matchesShortcut(event: KeyboardEvent, combo: string): boolean {
  const parsed = parseKeyCombo(combo)
  const isMod = event.metaKey || event.ctrlKey
  
  // Check modifier keys
  if (parsed.ctrl && !isMod) return false
  if (parsed.shift && !event.shiftKey) return false
  if (parsed.alt && !event.altKey) return false
  
  // Check main key (case-insensitive)
  return event.key.toLowerCase() === parsed.key
}

// ============ Main Module ============

export class KeyboardShortcutsManager {
  private shortcuts = new Map<string, ShortcutDefinition>()
  private handler = this.handleKeyDown.bind(this)

  constructor() {
    if (typeof window !== "undefined") {
      window.addEventListener("keydown", this.handler)
    }
  }

  destroy() {
    if (typeof window !== "undefined") {
      window.removeEventListener("keydown", this.handler)
    }
  }

  register(definition: ShortcutDefinition): void {
    this.shortcuts.set(definition.key, definition)
  }

  unregister(key: string): void {
    this.shortcuts.delete(key)
  }

  private handleKeyDown(event: KeyboardEvent): void {
    for (const [combo, definition] of this.shortcuts) {
      if (matchesShortcut(event, combo)) {
        // Skip if in input field and not allowed
        if (isInputField(event.target) && !definition.allowInInput) {
          continue
        }
        
        event.preventDefault()
        definition.handler()
        return
      }
    }
  }
}

// ============ React Integration ============

let globalManager: KeyboardShortcutsManager | null = null

function getManager(): KeyboardShortcutsManager {
  if (!globalManager) {
    globalManager = new KeyboardShortcutsManager()
  }
  return globalManager
}

/**
 * Hook to register keyboard shortcuts.
 * Automatically cleans up on unmount.
 */
export function useKeyboardShortcuts(shortcuts: ShortcutDefinition[]): void {
  const managerRef = useRef<KeyboardShortcutsManager | null>(null)

  useEffect(() => {
    const manager = getManager()
    managerRef.current = manager

    // Register all shortcuts
    shortcuts.forEach(s => manager.register(s))

    return () => {
      // Unregister all shortcuts on cleanup
      shortcuts.forEach(s => manager.unregister(s))
    }
  }, [shortcuts])
}

/**
 * Hook to register a single keyboard shortcut.
 */
export function useKeyboardShortcut(key: string, handler: () => void, allowInInput = false): void {
  const managerRef = useRef<KeyboardShortcutsManager | null>(null)

  useEffect(() => {
    const manager = getManager()
    managerRef.current = manager
    manager.register({ key, handler, allowInInput })

    return () => {
      manager.unregister(key)
    }
  }, [key, handler, allowInInput])
}

/**
 * Get the global shortcuts manager for programmatic control.
 */
export function getShortcutsManager(): KeyboardShortcutsManager {
  return getManager()
}

export default KeyboardShortcutsManager
