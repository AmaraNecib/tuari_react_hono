import { clearDesktopBearerToken, createDesktopAuthorizationHeader, isDesktopRuntime, setDesktopBearerToken } from "./desktop-auth-session"
import { resolveApiBaseUrl } from "./runtime-config"

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

function resolveAuthUrl(path: string) {
  return new URL(`/api/auth${path}`, resolveApiBaseUrl()).toString()
}

async function readJsonBody(response: Response) {
  try {
    return (await response.json()) as Record<string, unknown>
  } catch {
    return null
  }
}

async function postAuthenticatedJson<TResponse>(path: string, body: Record<string, unknown>) {
  const response = await fetch(resolveAuthUrl(path), {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(isDesktopRuntime() ? createDesktopAuthorizationHeader() : {}),
    },
    credentials: "include",
    body: JSON.stringify(body),
  })

  const responseBody = await readJsonBody(response)

  if (!response.ok) {
    const message = typeof responseBody?.message === "string" && responseBody.message.trim().length > 0
      ? responseBody.message
      : response.statusText || "تعذر تنفيذ العملية الآن."
    throw new Error(message)
  }

  return responseBody as TResponse
}

export function extractAuthErrorMessage(error: unknown, fallbackMessage: string) {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message
  }

  if (typeof error === "object" && error !== null) {
    const message = Reflect.get(error, "message")
    if (typeof message === "string" && message.trim().length > 0) {
      return message
    }

    const nestedError = Reflect.get(error, "error")
    if (typeof nestedError === "object" && nestedError !== null) {
      const nestedMessage = Reflect.get(nestedError, "message")
      if (typeof nestedMessage === "string" && nestedMessage.trim().length > 0) {
        return nestedMessage
      }
    }

    const statusText = Reflect.get(error, "statusText")
    if (typeof statusText === "string" && statusText.trim().length > 0) {
      return statusText
    }
  }

  return fallbackMessage
}

export async function signInDesktopWithPhoneNumber(input: {
  phoneNumber: string
  password: string
  rememberMe?: boolean
}) {
  const response = await fetch(resolveAuthUrl("/sign-in/phone-number"), {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    credentials: "include",
    body: JSON.stringify(input),
  })

  const body = await readJsonBody(response)

  if (!response.ok) {
    const message = typeof body?.message === "string" && body.message.trim().length > 0
      ? body.message
      : response.statusText || "تعذر تسجيل الدخول الآن."
    throw new Error(message)
  }

  const data = body as SignInResponse | null
  if (!data?.token || data.token.trim().length === 0) {
    throw new Error("لم يتم استلام رمز جلسة صالح من الخادم.")
  }

  setDesktopBearerToken(data.token)
  return data
}

export async function signOutDesktopSession() {
  try {
    await fetch(resolveAuthUrl("/sign-out"), {
      method: "POST",
      headers: {
        ...createDesktopAuthorizationHeader(),
      },
      credentials: "include",
    })
  } finally {
    clearDesktopBearerToken()
  }
}

export async function updateCurrentProfile(input: { currentPassword?: string; name?: string; phone?: string }) {
  return postAuthenticatedJson<ProfileUpdateResponse>("/profile", input)
}

export async function changeCurrentPassword(input: {
  currentPassword: string
  newPassword: string
  revokeOtherSessions?: boolean
}) {
  return postAuthenticatedJson<{ token: string | null }>("/change-password", input)
}
