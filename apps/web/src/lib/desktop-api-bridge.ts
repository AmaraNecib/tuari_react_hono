/**
 * Desktop API bridge for Electron/Tauri integration.
 */
import { isDesktopRuntime } from "./desktop-auth-session"
import { resolveApiBaseUrl } from "./runtime-config"

type DesktopBridgeMultipartFile = {
  fieldName: string
  fileName: string
  mimeType?: string | null
  bytes: number[]
}

type DesktopBridgeRequest = {
  method: string
  path: string
  headers: Record<string, string>
  body?: number[]
  authenticated: boolean
  multipartFiles?: DesktopBridgeMultipartFile[]
}

type DesktopBridgeResponse = {
  status: number
  headers: Record<string, string>
  body: number[]
}

type DesktopApiFetchInit = RequestInit & {
  authenticated?: boolean
  multipartFiles?: DesktopBridgeMultipartFile[]
}

type DesktopPhoneSignInInput = {
  phoneNumber: string
  password: string
  rememberMe?: boolean
}

type DesktopChangePasswordInput = {
  currentPassword: string
  newPassword: string
  revokeOtherSessions?: boolean
}

const FORWARDED_HEADER_DENYLIST = new Set(["authorization", "cookie", "host", "origin", "content-length"])

/** Stable discriminator for structured errors returned by the native bridge. */
export const DESKTOP_BRIDGE_ERROR_KIND = "desktop-api-bridge" as const

/**
 * Delivery phases reported by the native bridge.
 *
 * `pre-delivery` is reserved for failures that prove the HTTP request never
 * reached the local API. `response-body-read` means response headers arrived
 * and the request outcome is therefore unknown. `unknown` is the fail-closed
 * bucket for bridge failures that cannot prove either outcome.
 */
export const DESKTOP_BRIDGE_FAILURE_PHASE = {
  PRE_DELIVERY: "pre-delivery",
  RESPONSE_BODY_READ: "response-body-read",
  UNKNOWN: "unknown",
} as const

export type DesktopBridgeFailurePhase =
  (typeof DESKTOP_BRIDGE_FAILURE_PHASE)[keyof typeof DESKTOP_BRIDGE_FAILURE_PHASE]

export type DesktopBridgeErrorMetadata = {
  kind: typeof DESKTOP_BRIDGE_ERROR_KIND
  phase: DesktopBridgeFailurePhase
}

type DesktopBridgeError = Error & {
  desktopBridge?: DesktopBridgeErrorMetadata
}

function getDesktopBridgeErrorMetadata(error: unknown): DesktopBridgeErrorMetadata | undefined {
  if (typeof error !== "object" || error === null) {
    return undefined
  }

  const metadata = Reflect.get(error, "desktopBridge")
  if (typeof metadata !== "object" || metadata === null) {
    return undefined
  }

  const kind = Reflect.get(metadata, "kind")
  const phase = Reflect.get(metadata, "phase")
  if (kind !== DESKTOP_BRIDGE_ERROR_KIND || !isDesktopBridgeFailurePhase(phase)) {
    return undefined
  }

  return { kind, phase }
}

function isDesktopBridgeFailurePhase(value: unknown): value is DesktopBridgeFailurePhase {
  return value === DESKTOP_BRIDGE_FAILURE_PHASE.PRE_DELIVERY
    || value === DESKTOP_BRIDGE_FAILURE_PHASE.RESPONSE_BODY_READ
    || value === DESKTOP_BRIDGE_FAILURE_PHASE.UNKNOWN
}

/** Read the native bridge delivery marker from an RPC failure, if present. */
export function getDesktopBridgeFailurePhase(error: unknown): DesktopBridgeFailurePhase | undefined {
  return getDesktopBridgeErrorMetadata(error)?.phase
}

function getDesktopBridgeErrorMessage(error: unknown) {
  if (typeof error === "string" && error.trim().length > 0) {
    return error
  }

  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message
  }

  if (typeof error === "object" && error !== null) {
    const message = Reflect.get(error, "message")
    if (typeof message === "string" && message.trim().length > 0) {
      return message
    }
  }

  return "Desktop bridge request failed."
}

function markDesktopBridgeFailure(error: unknown, phase: DesktopBridgeFailurePhase): DesktopBridgeError {
  const normalizedError: DesktopBridgeError =
    error instanceof Error ? error : new Error(getDesktopBridgeErrorMessage(error))
  normalizedError.desktopBridge = { kind: DESKTOP_BRIDGE_ERROR_KIND, phase }
  return normalizedError
}

async function invokeDesktopBridgeCommand<TResponse>(command: string, args?: Record<string, unknown>) {
  const { invoke } = await import("@tauri-apps/api/core")

  try {
    return await invoke<TResponse>(command, args)
  } catch (error) {
    const normalizedError = markDesktopBridgeFailure(
      error,
      getDesktopBridgeErrorMetadata(error)?.phase ?? DESKTOP_BRIDGE_FAILURE_PHASE.UNKNOWN,
    )
    throw normalizedError
  }
}

function normalizeHeaders(headersInit?: HeadersInit) {
  const headers = new Headers(headersInit)
  const normalized: Record<string, string> = {}

  headers.forEach((value, key) => {
    const normalizedKey = key.trim().toLowerCase()
    if (FORWARDED_HEADER_DENYLIST.has(normalizedKey)) {
      return
    }

    normalized[normalizedKey] = value
  })

  return normalized
}

function resolveDesktopApiPath(input: RequestInfo | URL) {
  const baseUrl = new URL(`${resolveApiBaseUrl().replace(/\/+$/, "")}/`)
  const requestUrl = input instanceof Request
    ? new URL(input.url)
    : input instanceof URL
      ? input
      : new URL(String(input), baseUrl)

  if (requestUrl.origin !== baseUrl.origin) {
    throw new Error("Desktop API bridge only supports the configured API origin.")
  }

  return `${requestUrl.pathname}${requestUrl.search}`
}

async function serializeBody(body: BodyInit | null | undefined) {
  if (body == null) {
    return undefined
  }

  if (typeof body === "string") {
    return Array.from(new TextEncoder().encode(body))
  }

  if (body instanceof URLSearchParams) {
    return Array.from(new TextEncoder().encode(body.toString()))
  }

  if (body instanceof Blob) {
    return Array.from(new Uint8Array(await body.arrayBuffer()))
  }

  if (body instanceof ArrayBuffer) {
    return Array.from(new Uint8Array(body))
  }

  if (ArrayBuffer.isView(body)) {
    return Array.from(new Uint8Array(body.buffer, body.byteOffset, body.byteLength))
  }

  throw new Error("Unsupported desktop bridge request body.")
}

async function resolveRequestBody(input: RequestInfo | URL, init?: RequestInit) {
  if (init?.body !== undefined) {
    return serializeBody(init.body)
  }

  if (input instanceof Request) {
    const clonedRequest = input.clone()

    if (clonedRequest.method === "GET" || clonedRequest.method === "HEAD") {
      return undefined
    }

    const bodyBuffer = await clonedRequest.arrayBuffer().catch(() => null)
    return bodyBuffer ? Array.from(new Uint8Array(bodyBuffer)) : undefined
  }

  return undefined
}

export async function desktopApiFetch(input: RequestInfo | URL, init?: DesktopApiFetchInit) {
  if (!isDesktopRuntime()) {
    return globalThis.fetch(input, init)
  }

  let bridgeRequest: DesktopBridgeRequest
  try {
    const request = input instanceof Request ? input : null
    const headers = {
      ...normalizeHeaders(request?.headers),
      ...normalizeHeaders(init?.headers),
    }
    bridgeRequest = {
      authenticated: init?.authenticated === true,
      body: init?.multipartFiles ? undefined : await resolveRequestBody(input, init),
      headers,
      method: init?.method ?? request?.method ?? "GET",
      multipartFiles: init?.multipartFiles,
      path: resolveDesktopApiPath(input),
    } satisfies DesktopBridgeRequest
  } catch (error) {
    // Request construction happens before the native command is invoked, so
    // it is definitive that no HTTP request was delivered.
    throw markDesktopBridgeFailure(error, DESKTOP_BRIDGE_FAILURE_PHASE.PRE_DELIVERY)
  }

  const response = await invokeDesktopBridgeCommand<DesktopBridgeResponse>("desktop_api_request", {
    request: bridgeRequest,
  })

  return new Response(Uint8Array.from(response.body), {
    headers: response.headers,
    status: response.status,
  })
}

export async function desktopBridgeSignInWithPhoneNumber(input: DesktopPhoneSignInInput) {
  await invokeDesktopBridgeCommand("desktop_sign_in_with_phone_number", {
    input: {
      password: input.password,
      phoneNumber: input.phoneNumber,
      rememberMe: input.rememberMe === true,
    },
  })
}

export async function desktopBridgeSignOutSession() {
  await invokeDesktopBridgeCommand("desktop_sign_out_session")
}

export async function desktopBridgeChangePassword(input: DesktopChangePasswordInput) {
  await invokeDesktopBridgeCommand("desktop_change_password", {
    input: {
      currentPassword: input.currentPassword,
      newPassword: input.newPassword,
      revokeOtherSessions: input.revokeOtherSessions === true,
    },
  })
}

export async function downloadDesktopApiFile(input: RequestInfo | URL, fileName: string) {
  const response = await desktopApiFetch(input, { authenticated: true })
  if (!response.ok) {
    throw new Error("تعذر تحميل الملف المطلوب.")
  }

  const blob = await response.blob()
  const objectUrl = URL.createObjectURL(blob)
  const anchor = document.createElement("a")
  anchor.href = objectUrl
  anchor.download = fileName
  anchor.rel = "noreferrer"
  anchor.target = "_blank"
  anchor.click()
  setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000)
}

export type { DesktopBridgeMultipartFile }
