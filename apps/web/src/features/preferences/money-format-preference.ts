import { useSyncExternalStore } from "react"

const STORAGE_KEY = "tuari.moneyGrouping"
const CHANGE_EVENT = "tuari:money-format-changed"
let sessionGrouping: boolean | undefined

function readMoneyGrouping(): boolean {
  if (sessionGrouping !== undefined) return sessionGrouping
  if (typeof window === "undefined") return true
  try {
    return window.localStorage.getItem(STORAGE_KEY) !== "plain"
  } catch {
    return true
  }
}

function subscribe(onChange: () => void) {
  const onStorage = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY || event.key === null) {
      sessionGrouping = undefined
      onChange()
    }
  }
  window.addEventListener(CHANGE_EVENT, onChange)
  window.addEventListener("storage", onStorage)
  return () => {
    window.removeEventListener(CHANGE_EVENT, onChange)
    window.removeEventListener("storage", onStorage)
  }
}

/** Local display preference only; it never transforms stored amounts or inputs. */
export function setMoneyGrouping(grouped: boolean) {
  try {
    window.localStorage.setItem(STORAGE_KEY, grouped ? "grouped" : "plain")
    sessionGrouping = undefined
  } catch {
    // Full or blocked storage must not prevent a session-only display choice.
    sessionGrouping = grouped
  }
  window.dispatchEvent(new Event(CHANGE_EVENT))
}

export function useMoneyGrouping() {
  return useSyncExternalStore(subscribe, readMoneyGrouping, () => true)
}
