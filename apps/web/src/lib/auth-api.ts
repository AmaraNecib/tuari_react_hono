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

function translateAuthApiErrorMessage(message: string) {
  const normalized = message.trim().toLowerCase()

  if (normalized === "invalid password") {
    return "كلمة المرور الحالية غير صحيحة."
  }

  if (normalized === "user not found") {
    return "تعذر العثور على المستخدم الحالي."
  }

  if (normalized === "session expired") {
    return "انتهت الجلسة الحالية. يرجى تسجيل الدخول مرة أخرى."
  }

  return message
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

/** Extracts a user-friendly error message from auth errors. */
export function extractAuthErrorMessage(error: unknown, fallbackMessage: string) {
  if (typeof error === "string" && error.trim().length > 0) {
    return error
  }

  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message
  }

  if (typeof error === "object" && error !== null) {
    const obj = error as Record<string, unknown>

    const message = obj["message"]
    if (typeof message === "string" && message.trim().length > 0) {
      return message
    }

    const nestedError = obj["error"]
    if (typeof nestedError === "object" && nestedError !== null) {
      const nestedMessage = (nestedError as Record<string, unknown>)["message"]
      if (typeof nestedMessage === "string" && nestedMessage.trim().length > 0) {
        return nestedMessage
      }
    }

    const statusText = obj["statusText"]
    if (typeof statusText === "string" && statusText.trim().length > 0) {
      return statusText
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
