import {
  desktopApiFetch,
  desktopBridgeChangePassword,
  desktopBridgeSignInWithPhoneNumber,
  desktopBridgeSignOutSession,
} from "./desktop-api-bridge"
import {
  isDesktopRuntime,
} from "./desktop-auth-session"
import { resolveApiUrl } from "./runtime-config"
import { i18n } from "@/i18n"

type SignInResponse = {
  token?: string
}

type ProfileUpdateResponse = {
  user: {
    id: string
    name: string | null
    phone: string
  }
}

/**
 * Maps API error messages to i18n keys for translation.
 * 
 * Why this approach:
 * - API (better-auth) returns English messages we can't control
 * - UI translates them using i18n for any language
 * - Easy to add new translations when building mobile apps
 * - Unknown failures use caller-owned fallback copy
 * 
 * To add a new language:
 * 1. Add translations in src/i18n/resources/<lang>.ts under auth.errors
 * 2. The mapping below handles the rest automatically
 */
const API_ERROR_TO_I18N_KEY: Record<string, string> = {
  "رقم الهاتف مستخدم بالفعل.": "auth.errors.phoneAlreadyUsed",
  "invalid password": "auth.errors.invalidPassword",
  "invalid phone number or password": "auth.errors.invalidCredentials",
  "invalid credentials": "auth.errors.invalidCredentials",
  "user not found": "auth.errors.userNotFound",
  "session expired": "auth.errors.sessionExpired",
}

function translateAuthApiErrorMessage(message: string, fallbackMessage = i18n.t("toasts.actionError")): string {
  const normalized = message.trim().toLowerCase().replace(/\s+/g, " ")
  const i18nKey = API_ERROR_TO_I18N_KEY[normalized]
  
  if (i18nKey) {
    return i18n.t(i18nKey)
  }
  
  const translated = Object.values(API_ERROR_TO_I18N_KEY).map(key => i18n.t(key))
  return translated.includes(message) ? message : fallbackMessage
}

function resolveAuthUrl(path: string) {
  return resolveApiUrl(`api/auth${path}`)
}

function resolveAuthRequestCredentials(): RequestCredentials {
  return isDesktopRuntime() ? "omit" : "include"
}

async function readJsonBody(response: Response) {
  try {
    return (await response.json()) as Record<string, unknown>
  } catch {
    return null
  }
}

async function postAuthenticatedJson<TResponse>(path: string, body: Record<string, unknown>) {
  const response = isDesktopRuntime()
    ? await desktopApiFetch(resolveAuthUrl(path), {
      authenticated: true,
      body: JSON.stringify(body),
      headers: {
        "content-type": "application/json",
      },
      method: "POST",
    })
    : await fetch(resolveAuthUrl(path), {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      credentials: resolveAuthRequestCredentials(),
      body: JSON.stringify(body),
    })

  const responseBody = await readJsonBody(response)

  if (!response.ok) {
    const message = typeof responseBody?.message === "string" && responseBody.message.trim().length > 0
      ? translateAuthApiErrorMessage(responseBody.message)
      : response.statusText || "تعذر تنفيذ العملية الآن."
    throw new Error(message)
  }

  return responseBody as TResponse
}

/** Extracts a user-friendly, translated error message from auth errors. */
export function extractAuthErrorMessage(error: unknown, fallbackMessage: string) {
  if (typeof error === "string" && error.trim().length > 0) {
    return translateAuthApiErrorMessage(error, fallbackMessage)
  }

  if (error instanceof Error && error.message.trim().length > 0) {
    return translateAuthApiErrorMessage(error.message, fallbackMessage)
  }

  if (typeof error === "object" && error !== null) {
    const obj = error as Record<string, unknown>

    const message = obj["message"]
    if (typeof message === "string" && message.trim().length > 0) {
      return translateAuthApiErrorMessage(message, fallbackMessage)
    }

    const nestedError = obj["error"]
    if (typeof nestedError === "object" && nestedError !== null) {
      const nestedMessage = (nestedError as Record<string, unknown>)["message"]
      if (typeof nestedMessage === "string" && nestedMessage.trim().length > 0) {
        return translateAuthApiErrorMessage(nestedMessage, fallbackMessage)
      }
    }

    const statusText = obj["statusText"]
    if (typeof statusText === "string" && statusText.trim().length > 0) {
      return translateAuthApiErrorMessage(statusText, fallbackMessage)
    }
  }

  return fallbackMessage
}

/** Signs in via phone number (desktop mode). */
export async function signInDesktopWithPhoneNumber(input: {
  phoneNumber: string
  password: string
  rememberMe?: boolean
}) {
  if (isDesktopRuntime()) {
    await desktopBridgeSignInWithPhoneNumber(input)
    return { success: true as const }
  }

  const response = await fetch(resolveAuthUrl("/sign-in/phone-number"), {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    credentials: resolveAuthRequestCredentials(),
    body: JSON.stringify(input),
  })

  const body = await readJsonBody(response)

  if (!response.ok) {
    const message = typeof body?.message === "string" && body.message.trim().length > 0
      ? translateAuthApiErrorMessage(body.message)
      : response.statusText || "تعذر تسجيل الدخول الآن."
    throw new Error(message)
  }

  return body as SignInResponse | null
}

export async function signOutDesktopSession() {
  if (isDesktopRuntime()) {
    await desktopBridgeSignOutSession()
    return
  }

  await fetch(resolveAuthUrl("/sign-out"), {
    method: "POST",
    credentials: resolveAuthRequestCredentials(),
  })
}

export async function updateCurrentProfile(input: { currentPassword?: string; name?: string; phone?: string }) {
  return postAuthenticatedJson<ProfileUpdateResponse>("/profile", input)
}

export async function changeCurrentPassword(input: {
  currentPassword: string
  newPassword: string
  revokeOtherSessions?: boolean
}) {
  if (isDesktopRuntime()) {
    await desktopBridgeChangePassword(input)
    return { token: null } as const
  }

  const response = await postAuthenticatedJson<{ token: string | null }>("/change-password", input)

  return response
}
