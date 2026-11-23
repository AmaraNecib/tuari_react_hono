import { useSyncExternalStore } from "react"

import { DEFAULT_DATE_FORMAT, resolveDateFormat, type DateFormat } from "@/lib/date-format"

const STORAGE_KEY = "tuari.dateFormat"
const CHANGE_EVENT = "tuari:date-format-changed"
let sessionFormat: DateFormat | undefined

export function readDateFormat(): DateFormat {
  if (sessionFormat !== undefined) return sessionFormat
  if (typeof window === "undefined") return DEFAULT_DATE_FORMAT
  try {
    return resolveDateFormat(window.localStorage.getItem(STORAGE_KEY))
  } catch {
    return DEFAULT_DATE_FORMAT
  }
}

function subscribe(onChange: () => void) {
  const onStorage = (event: StorageEvent) => {
    if (event.storageArea) {
      try {
        if (event.storageArea !== window.localStorage) return
      } catch {
        return
      }
    }
    if (event.key === STORAGE_KEY || event.key === null) {
      sessionFormat = undefined
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

/** Storage denial changes persistence, never the user's ability to choose for this session. */
export function setDateFormat(value: unknown) {
  const format = resolveDateFormat(value)
  sessionFormat = format
  if (typeof window === "undefined") return
  try {
    window.localStorage.setItem(STORAGE_KEY, format)
    sessionFormat = undefined
  } catch {
    // Keep the validated session choice when storage is full or unavailable.
  }
  window.dispatchEvent(new Event(CHANGE_EVENT))
}

export function useDateFormat() {
  return useSyncExternalStore(subscribe, readDateFormat, () => DEFAULT_DATE_FORMAT)
}
