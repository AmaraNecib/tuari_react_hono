import { getRuntimeStatus } from "./runtime-bridge"

const DEFAULT_API_URL = "http://127.0.0.1:4318"

export type ResolvedRuntimeConfig = {
  apiBaseUrl: string
  appClientKey: string
}

let runtimeConfig: ResolvedRuntimeConfig = {
  apiBaseUrl: import.meta.env.VITE_API_URL?.trim() || DEFAULT_API_URL,
  appClientKey: import.meta.env.VITE_APP_CLIENT_KEY?.trim() || "",
}

export function resolveApiBaseUrl() {
  return runtimeConfig.apiBaseUrl
}

export function resolveAppClientKey() {
  return runtimeConfig.appClientKey
}

export async function initializeRuntimeConfig() {
  const status = await getRuntimeStatus()

  if (status.config) {
    runtimeConfig = {
      apiBaseUrl: status.config.apiBaseUrl.trim() || runtimeConfig.apiBaseUrl,
      appClientKey: status.config.appClientKey.trim() || runtimeConfig.appClientKey,
    }
  }

  return runtimeConfig
}

export function resetRuntimeConfigForTests() {
  runtimeConfig = {
    apiBaseUrl: import.meta.env.VITE_API_URL?.trim() || DEFAULT_API_URL,
    appClientKey: import.meta.env.VITE_APP_CLIENT_KEY?.trim() || "",
  }
}
