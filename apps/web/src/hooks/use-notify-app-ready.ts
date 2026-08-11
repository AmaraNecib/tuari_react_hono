import { useEffect, useRef } from "react"

import { notifyAppReady } from "@/lib/app-ready"

/**
 * Calls `notifyAppReady()` exactly once when `ready` first becomes true —
 * the signal that closes the Tauri splashscreen and reveals the main
 * window. The ref guard makes re-renders and React StrictMode
 * double-effects harmless.
 */
export function useNotifyAppReady(ready: boolean): void {
  const notifiedRef = useRef(false)

  useEffect(() => {
    if (ready && !notifiedRef.current) {
      notifiedRef.current = true
      void notifyAppReady()
    }
  }, [ready])
}
