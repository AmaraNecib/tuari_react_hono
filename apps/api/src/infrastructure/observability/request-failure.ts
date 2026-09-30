/**
 * Request-failure observability.
 *
 * A user who reports "it did not save" must leave a readable trace in the
 * desktop shell's `api-server.log`. Failures are logged there through the
 * existing {@link StructuredLogger}; this module only decides what a failure
 * looks like.
 *
 * Exactly ONE line is emitted per failed request:
 *
 * - a procedure that throws is logged by the ORPC client interceptor, which is
 *   the only layer that still holds the original error (ORPC catches procedure
 *   errors and maps unknown ones to a generic 500 envelope before a response
 *   exists);
 * - a `{ success: false }` envelope is logged by the request interceptor from
 *   the already-decoded response body;
 * - a 4xx/5xx response the client never logged (a request ORPC could not
 *   decode, a response it could not encode) is logged by the `/rpc/*`
 *   middleware from the response ORPC already mapped;
 * - every other 4xx/5xx (a transport route, the body-limit guard, an unknown
 *   route) is logged by the global Hono middleware from the response body.
 *
 * The request body, query string, and procedure input are NEVER logged: they
 * can carry credentials.
 */
import { AsyncLocalStorage } from "node:async_hooks";

import { ORPCError } from "@orpc/server";

import { StructuredLogger } from "./logger";

/**
 * Per-request dedupe marker so the client interceptor (which has the real
 * error) and the transport middleware (which has the mapped status) cannot
 * both log the same failure.
 *
 * This deliberately does NOT key off the ORPC `context` object: ORPC shallow-
 * copies the context between layers, so the client interceptor and the
 * middleware receive different object identities for one request. An async
 * local store is established by the `/rpc/*` middleware and inherited by every
 * interceptor running inside it, independent of object identity.
 */
export type RpcFailureStore = {
  logged: boolean;
  /**
   * Set when the failure was the server failing to prepare its own response
   * (an encode/serialize error), as opposed to a request the client malformed.
   */
  encodeFailed?: boolean;
};

const rpcFailureStore = new AsyncLocalStorage<RpcFailureStore>();

/** Creates the per-request marker the transport middleware runs with. */
export function createRpcFailureStore(): RpcFailureStore {
  return { logged: false };
}

/**
 * Classifies the raw error ORPC is about to encode. It is the `cause` ORPC
 * attaches to the ORPCError it emits: a request body ORPC could not decode is
 * a SyntaxError (or an already-shaped ORPCError) that ORPC maps to 400, while
 * anything else thrown while preparing the response is an encode failure — the
 * one class an operator cannot act on, so it gets an explicit marker.
 */
export function recordInterceptedFailure(error: unknown): void {
  const store = rpcFailureStore.getStore();
  if (!store) {
    return;
  }

  store.encodeFailed = !(error instanceof ORPCError || error instanceof SyntaxError);
}

/** Runs `fn` with the request's marker visible to every nested interceptor. */
export function runWithRpcFailureStore<T>(
  store: RpcFailureStore,
  fn: () => T,
): T {
  return rpcFailureStore.run(store, fn);
}

/** Marks the current request as already logged. */
export function markFailureLogged(): void {
  const store = rpcFailureStore.getStore();
  if (store) {
    store.logged = true;
  }
}

/** Whether the current request has already produced its one failure line. */
export function isFailureLogged(): boolean {
  return rpcFailureStore.getStore()?.logged ?? false;
}

export type RequestFailure = {
  method: string;
  path: string;
  status: number;
  message: string;
  code?: string;
  error?: Error;
  /**
   * Present and `true` only when the server failed to encode its own response.
   * Absent for every other failure, including a malformed client request.
   */
  encodeFailed?: boolean;
};

/** Emits the one readable line for a failed request. */
export function logRequestFailure(failure: RequestFailure): void {
  StructuredLogger.error("Request failed", failure.error, {
    method: failure.method,
    path: failure.path,
    status: failure.status,
    errorMessage: failure.message,
    ...(failure.code === undefined ? {} : { errorCode: failure.code }),
    ...(failure.encodeFailed === true ? { encodeFailed: true } : {}),
  });
}

/** Whether a decoded body is a non-null object. */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/**
 * Unwraps the ORPC standard-protocol response body. Both success and error
 * responses cross the wire as `{ json: <payload>, meta?: [...] }`, so the
 * failure payload is the `json` member, not the envelope.
 */
export function unwrapResponseBody(body: unknown): unknown {
  if (isRecord(body) && "json" in body) {
    return body.json;
  }

  return body;
}

function firstNonEmptyString(candidates: unknown[]): string | undefined {
  return candidates.find(
    (candidate): candidate is string =>
      typeof candidate === "string" && candidate.trim().length > 0,
  );
}

/**
 * Extracts the human-readable message from an ORPC-decoded body. Both an
 * ORPCError envelope (`{ code, message }`) and an entity failure envelope
 * (`{ success: false, error: { code, message } }`) are supported.
 */
export function resolveFailureMessage(body: unknown): string | undefined {
  if (!isRecord(body)) {
    return undefined;
  }

  const error = isRecord(body.error) ? body.error : undefined;

  return firstNonEmptyString([error?.message, body.message]);
}

/** Extracts the app/ORPC error code from an ORPC-decoded body. */
export function resolveFailureCode(body: unknown): string | undefined {
  if (!isRecord(body)) {
    return undefined;
  }

  const error = isRecord(body.error) ? body.error : undefined;

  return firstNonEmptyString([error?.code, body.code]);
}

/**
 * Logs a matched ORPC failure the client interceptor did not already log, using
 * ORPC's mapped status (400 for a malformed request, 500 for a server-side
 * failure) and the encode-failure marker the request interceptor recorded.
 */
export async function logRpcResponseFailure(
  store: RpcFailureStore,
  method: string,
  path: string,
  response: Response,
): Promise<void> {
  if (response.status < 400 || store.logged) {
    return;
  }

  const body = unwrapResponseBody(await readResponseBody(response));
  logRequestFailure({
    method,
    path,
    status: response.status,
    message: resolveFailureMessage(body) ?? `HTTP ${response.status}`,
    code: resolveFailureCode(body),
    encodeFailed: store.encodeFailed,
  });
  store.logged = true;
}

/**
 * Decodes a fetch `Response` body without consuming the original. Only small
 * JSON error payloads reach this path (the caller only reads 4xx/5xx).
 */
export async function readResponseBody(response: Response): Promise<unknown> {
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("json")) {
    return undefined;
  }

  try {
    return await response.clone().json();
  } catch {
    return undefined;
  }
}
