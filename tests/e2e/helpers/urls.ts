/**
 * Resolved API/Web URLs for the E2E suite.
 *
 * delegates to apps/web/src/lib/ports.ts — the single source of truth for port
 * normalization and env precedence (API_PORT / WEB_PORT / PLAYWRIGHT_BASE_URL)
 * shared with vite.config.ts, the web app, and playwright.config.ts. Specs that
 * talk directly to the API or send an Origin header hit the current lane's
 * ports instead of assuming the baked-in 4318/3000. Loopback-only.
 */

export { apiBaseUrl, webBaseUrl } from "../../../apps/web/src/lib/ports"
