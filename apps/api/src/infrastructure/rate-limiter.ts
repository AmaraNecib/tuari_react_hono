const CLEANUP_INTERVAL_MS = 60_000

type Window = { count: number; windowStart: number }

type ResolveClientIpInput = {
  forwardedFor?: string
  realIp?: string
  remoteAddress?: string
  trustProxyHeaders?: boolean
}

export class SlidingWindowRateLimiter {
  private readonly store = new Map<string, Window>()
  private cleanupTimer: ReturnType<typeof setInterval> | undefined

  constructor(
    private readonly maxRequests: number,
    private readonly windowMs: number,
  ) {}

  allow(key: string): boolean {
    const now = Date.now()
    const entry = this.store.get(key)

    if (!entry || now - entry.windowStart >= this.windowMs) {
      this.store.set(key, { count: 1, windowStart: now })
      return true
    }

    if (entry.count >= this.maxRequests) {
      return false
    }

    entry.count++
    return true
  }

  startCleanup() {
    this.cleanupTimer = setInterval(() => {
      const now = Date.now()
      for (const [key, entry] of this.store) {
        if (now - entry.windowStart >= this.windowMs) {
          this.store.delete(key)
        }
      }
    }, CLEANUP_INTERVAL_MS)

    this.cleanupTimer.unref?.()
    return this
  }

  stopCleanup() {
    if (this.cleanupTimer !== undefined) {
      clearInterval(this.cleanupTimer)
      this.cleanupTimer = undefined
    }
  }
}

export function resolveClientIp({
  forwardedFor,
  realIp,
  remoteAddress,
  trustProxyHeaders = false,
}: ResolveClientIpInput): string {
  if (trustProxyHeaders && forwardedFor) {
    const first = forwardedFor.split(",")[0]?.trim()
    if (first) return first
  }

  if (trustProxyHeaders && realIp?.trim()) {
    return realIp.trim()
  }

  return remoteAddress ?? "unknown"
}
