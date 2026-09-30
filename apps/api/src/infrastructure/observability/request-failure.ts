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
 * - a `{ success: false }` envelope or a 4xx/5xx response is logged by the
 *   request interceptor from the already-decoded response body;
 * - every other 4xx/5xx (a transport route, the body-limit guard, an unknown
 *   route) is logged by the Hono middleware from the response body.
 *
 * The request body, query string, and procedure input are NEVER logged: they
 * can carry credentials.
 */
import { StructuredLogger } from "./logger";

/**
 * Per-request marker so the client interceptor (which has the real error) and
 * the request interceptor (which has the response) cannot both log the same
 * failure. Keyed by the request-scoped `RpcContext` object.
 */
const loggedFailures = new WeakSet<object>();

/** Marks a request as already logged. */
export function markFailureLogged(context: object): void {
  loggedFailures.add(context);
}

/** Whether a request has already produced its one failure line. */
export function isFailureLogged(context: object): boolean {
  return loggedFailures.has(context);
}

export type RequestFailure = {
  method: string;
  path: string;
  status: number;
  message: string;
  code?: string;
  error?: Error;
};

/** Emits the one readable line for a failed request. */
export function logRequestFailure(failure: RequestFailure): void {
  StructuredLogger.error("Request failed", failure.error, {
    method: failure.method,
    path: failure.path,
    status: failure.status,
    errorMessage: failure.message,
    ...(failure.code === undefined ? {} : { errorCode: failure.code }),
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
