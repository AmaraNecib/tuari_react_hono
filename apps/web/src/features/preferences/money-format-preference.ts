import { useSyncExternalStore } from "react"

const STORAGE_KEY = "tuari.moneyGrouping"
const CHANGE_EVENT = "tuari:money-format-changed"

function readMoneyGrouping(): boolean {
  if (typeof window === "undefined") return true
  return window.localStorage.getItem(STORAGE_KEY) !== "plain"
}

function subscribe(onChange: () => void) {
  const onStorage = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY || event.key === null) onChange()
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
  window.localStorage.setItem(STORAGE_KEY, grouped ? "grouped" : "plain")
  window.dispatchEvent(new Event(CHANGE_EVENT))
}

export function useMoneyGrouping() {
  return useSyncExternalStore(subscribe, readMoneyGrouping, () => true)
}
