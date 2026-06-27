/**
 * Auth client configuration for better-auth.
 */
import { createAuthClient } from "better-auth/client"
import { phoneNumberClient } from "better-auth/client/plugins"

import { resolveApiBaseUrl } from "./runtime-config"

/**
 * getAuthClient() component.
 */
export function getAuthClient() {
  return createAuthClient({
    baseURL: resolveApiBaseUrl(),
    plugins: [phoneNumberClient()],
  })
}
