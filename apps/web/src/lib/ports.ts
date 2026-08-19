/**
 * Shared dev-port / URL resolution for the web app, Vite, and the E2E suite.
 *
 * Parallel Herdr lanes can each run on distinct ports (API_PORT / WEB_PORT)
 * without colliding on the default 4318/3000. Everything here is loopback-only
 * and side-effect free so the same rules are used by:
 *   - apps/web/vite.config.ts  (server/preview + VITE_API_PORT define)
 *   - apps/web/src/lib/analytics-db.ts (browser; VITE_API_PORT fallback)
 *   - playwright.config.ts       (webServer URLs + baseURL)
 *   - tests/e2e/helpers/urls.ts  (specs that hit the API / send an Origin)
 *
 * Port strings are normalized/validated consistently so non-canonical values
 * like "+3000" or "1e3" can never produce a malformed URL or a listener on a
 * different port than the URL we poll (the API normalizes them, but raw
 * interpolation into URLs would not).
 */

export const DEFAULT_API_PORT = "4318"
export const DEFAULT_WEB_PORT = "3000"

/** Loopback hosts for which we can start and manage our own local server. */
const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"])

export function normalizePort(
  value: string | undefined,
  fallback: string = DEFAULT_WEB_PORT,
): string {
  if (value === undefined || value === "") return fallback
  const n = Number(value)
  return Number.isInteger(n) && n > 0 && n < 65536 ? String(n) : fallback
}

/**
 * Resolve the web origin the test suite targets and whether Playwright should
 * start its own Vite web server (and on which port).
 *
 * - PLAYWRIGHT_BASE_URL unset  → start our own web server on WEB_PORT.
 * - http loopback override     → start our own web server aligned to the
 *                                override's port, surfaced at the exact address
 *                                Vite binds (127.0.0.1, http) so we never poll
 *                                an IPv6 ::1 / localhost address the IPv4-only
 *                                listener isn't on.
 * - https or non-loopback      → do NOT start a local server (our dev server is
 *                                HTTP-only and cannot serve an HTTPS endpoint);
 *                                preserve the configured URL and wait for the
 *                                externally managed server.
 */
export function resolveWebServer(
  env: Record<string, string | undefined> = process.env,
): { url: string; port: string; startOwn: boolean } {
  const defaultWebPort = normalizePort(env.WEB_PORT, DEFAULT_WEB_PORT)
  const defaultWebUrl = `http://127.0.0.1:${defaultWebPort}`
  const explicit = env.PLAYWRIGHT_BASE_URL
  if (!explicit) return { url: defaultWebUrl, port: defaultWebPort, startOwn: true }

  let parsed: URL | null = null
  try {
    parsed = new URL(explicit)
  } catch {
    parsed = null
  }
  const host = parsed?.hostname
  const isLoopback =
    host !== undefined && host !== null && LOOPBACK_HOSTS.has(host)
  // We only self-manage a plain-HTTP server Vite can actually bind (a single
  // IPv4 loopback address). An HTTPS loopback override cannot be served by our
  // HTTP-only dev server, so preserve the explicit endpoint and wait for an
  // externally managed server instead of silently downgrading https -> http.
  const selfManaged = parsed !== null && isLoopback && parsed.protocol === "http:"

  if (selfManaged) {
    const port = normalizePort(parsed?.port, defaultWebPort)
    return {
      url: parsed?.port ? `http://127.0.0.1:${port}` : defaultWebUrl,
      port,
      startOwn: true,
    }
  }

  if (parsed) return { url: explicit, port: defaultWebPort, startOwn: false }
  return { url: defaultWebUrl, port: defaultWebPort, startOwn: true }
}

/** API base URL — `API_PORT` (default 4318), loopback, normalized. */
export function apiBaseUrl(env: Record<string, string | undefined> = process.env): string {
  return `http://127.0.0.1:${normalizePort(env.API_PORT, DEFAULT_API_PORT)}`
}

export function apiPort(env: Record<string, string | undefined> = process.env): string {
  return normalizePort(env.API_PORT, DEFAULT_API_PORT)
}

/**
 * Web origin — mirrors `resolveWebServer().url` so the Origin header specs send
 * (e.g. to the API) always equals the Playwright `baseURL` and the API
 * `ALLOWED_ORIGINS` entry[0]. PLAYWRIGHT_BASE_URL wins; otherwise derived from
 * WEB_PORT (default 3000), loopback. Consistency here avoids CORS 403s when a
 * loopback override normalizes to the bound IPv4 address.
 */
export function webBaseUrl(env: Record<string, string | undefined> = process.env): string {
  return resolveWebServer(env).url
}
