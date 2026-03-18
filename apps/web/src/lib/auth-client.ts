import { createAuthClient } from "better-auth/client"
import { phoneNumberClient } from "better-auth/client/plugins"
import { resolveApiBaseUrl } from "./runtime-config"

export const authClient = createAuthClient({
  baseURL: resolveApiBaseUrl(),
  plugins: [phoneNumberClient()],
})
