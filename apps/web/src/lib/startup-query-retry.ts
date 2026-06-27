/**
 * Startup query retry configuration.
 */
const STARTUP_QUERY_RETRY_LIMIT = 20
const STARTUP_QUERY_MAX_DELAY_MS = 1_500

/**
 * shouldRetryStartupQuery(failureCount component.
 */
export function shouldRetryStartupQuery(failureCount: number) {
/**
 * getStartupQueryRetryDelay(attemptIndex component.
 */
  return failureCount < STARTUP_QUERY_RETRY_LIMIT
}

export function getStartupQueryRetryDelay(attemptIndex: number) {
  return Math.min(250 * 2 ** Math.max(attemptIndex - 1, 0), STARTUP_QUERY_MAX_DELAY_MS)
}
