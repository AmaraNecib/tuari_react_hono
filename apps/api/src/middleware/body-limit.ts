import { bodyLimit } from "hono/body-limit";
import { createMiddleware } from "hono/factory";

export const MAX_JSON_BODY_BYTES = 1024 * 1024; // 1 MB
export const MAX_MULTIPART_BODY_BYTES = 30 * 1024 * 1024; // 30 MB

export function resolveBodyLimitMaxSize(contentType: string | undefined): number {
  return contentType?.toLowerCase().startsWith("multipart/form-data")
    ? MAX_MULTIPART_BODY_BYTES
    : MAX_JSON_BODY_BYTES;
}

/**
 * App-level request-body size guard.
 *
 * - `multipart/form-data` bodies are capped at 30 MB (upload route); everything else
 *   (JSON, urlencoded) is capped at 1 MB.
 * - When the client sends a `Content-Length`, Hono's `bodyLimit` rejects the request
 *   with 413 BEFORE the body is read/buffered.
 * - Chunked bodies (no `Content-Length`) are stream-counted and aborted as soon as the
 *   cap is exceeded.
 */
export const bodyLimitMiddleware = createMiddleware(async (c, next) => {
  const maxSize = resolveBodyLimitMaxSize(c.req.header("content-type"));

  // bodyLimit returns the 413 response on the Content-Length short-circuit path
  // (or forwards the downstream response), so propagate its return value.
  return bodyLimit({
    maxSize,
    onError: (c) => c.json({ message: "الطلب كبير جدًا." }, 413),
  })(c, next);
});
