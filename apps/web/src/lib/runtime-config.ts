import { getRuntimeStatus } from "./runtime-bridge"

const DEFAULT_API_PORT = "4318"

export type ResolvedRuntimeConfig = {
  apiBaseUrl: string
}

let runtimeConfig: ResolvedRuntimeConfig = {
  apiBaseUrl: normalizeApiBaseUrl(import.meta.env.VITE_API_URL?.trim() || getDefaultApiBaseUrl()),
}

function getDefaultApiBaseUrl() {
  if (typeof window !== "undefined") {
    const { hostname, protocol } = window.location

    if (isLocalHostname(hostname)) {
      return `${protocol}//${hostname}:${DEFAULT_API_PORT}`
    }
  }

  return `http://127.0.0.1:${DEFAULT_API_PORT}`
}

function isLocalHostname(hostname: string) {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "0.0.0.0" || hostname === "[::1]" || hostname === "::1" || hostname === "tauri.localhost"
}

function normalizeApiBaseUrl(value: string) {
  const trimmedValue = value.trim()

  if (trimmedValue.length === 0) {
    throw new Error("API base URL cannot be empty")
  }

  let parsedUrl: URL

  try {
    parsedUrl = new URL(trimmedValue)
  } catch {
    throw new Error(`Invalid API base URL: ${value}`)
  }

  if (!["http:", "https:"].includes(parsedUrl.protocol)) {
    throw new Error(`API base URL must use http or https, received "${parsedUrl.protocol}"`)
  }

  if (parsedUrl.username || parsedUrl.password || parsedUrl.search || parsedUrl.hash) {
    throw new Error("API base URL must not include credentials, query parameters, or fragments")
  }

  if (!isLocalHostname(parsedUrl.hostname) && parsedUrl.protocol !== "https:") {
    throw new Error("API base URL must use https for non-local hosts")
  }

  return parsedUrl.toString().replace(/\/+$/, "")
}

/** Resolves a full API URL from a relative path. */
export function resolveApiUrl(path: string) {
  const baseUrl = new URL(`${resolveApiBaseUrl().replace(/\/+$/, "")}/`)
  return new URL(path.replace(/^\//, ""), baseUrl).toString()
}

/** Returns the configured API base URL. */
export function resolveApiBaseUrl() {
  return runtimeConfig.apiBaseUrl
}

export async function initializeRuntimeConfig() {
  const status = await getRuntimeStatus()

  if (status.config) {
    runtimeConfig = {
      apiBaseUrl: normalizeApiBaseUrl(status.config.apiBaseUrl.trim() || runtimeConfig.apiBaseUrl),
    }
  }

  return runtimeConfig
}

export function resetRuntimeConfigForTests() {
  runtimeConfig = {
    apiBaseUrl: normalizeApiBaseUrl(import.meta.env.VITE_API_URL?.trim() || getDefaultApiBaseUrl()),
  }
}
