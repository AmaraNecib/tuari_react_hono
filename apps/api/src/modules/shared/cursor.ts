/**
 * Cursor pagination — opaque token encoding.
 *
 * A cursor encodes a position in a sorted dataset. Pagination is done by
 * "where (sortKey, id) < (cursor.sortKey, cursor.id) ORDER BY sortKey, id
 * LIMIT N". This is O(log N) per page (uses the index) and stable under
 * concurrent inserts — a row inserted at the end of the table won't shift
 * the pages you've already seen.
 *
 * The cursor is opaque to consumers. Clients must not parse it or depend on
 * its format. They pass it back as-is to the next request.
 */

/**
 * Position cursor: the last seen row's sort key plus its id.
 *
 * `createdAt` is the primary sort key (descending — newest first) and `id`
 * is the tiebreaker (also descending for stability). `id` must always be
 * present as the tiebreaker because two rows can share a `createdAt`.
 */
export type Cursor = {
  createdAt: string
  id: string
}

export type CursorPaginationInput = {
  cursor?: string
  limit?: number
}

/** Default page size used when the client does not specify one. */
export const DEFAULT_PAGE_SIZE = 50

/** Lower bound on page size — never return 0 rows per page. */
export const MIN_PAGE_SIZE = 1

/** Upper bound on page size — protects the server from a client asking for 1M rows. */
export const MAX_PAGE_SIZE = 100

/**
 * The page sizes exposed in the UI's page-size selector.
 *
 * Includes `DEFAULT_PAGE_SIZE` so the default is always selectable. Order
 * is ascending — small to large — which is the natural UX order.
 */
export const ALLOWED_PAGE_SIZES = [10, 20, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE] as const

export type AllowedPageSize = (typeof ALLOWED_PAGE_SIZES)[number]

/**
 * Encode a cursor to an opaque string token.
 *
 * Uses base64url encoding of JSON. base64url is URL-safe (no `+`, `/`, or `=`
 * that need escaping in query params). The format is internal — consumers
 * must always pass the token through `decodeCursor`, never inspect it.
 */
export function encodeCursor(cursor: Cursor): string {
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url")
}

/**
 * Decode an opaque cursor token back into structured data.
 *
 * Throws if the token is malformed, was not produced by this module, or
 * has a shape that doesn't match the current Cursor type. Callers should
 * treat the throw as an invalid-input error.
 */
export function decodeCursor(token: string): Cursor {
  if (typeof token !== "string" || token.length === 0) {
    throw new Error("Invalid cursor: empty token")
  }

  let json: string
  json = Buffer.from(token, "base64url").toString("utf8")

  let parsed: unknown
  try {
    parsed = JSON.parse(json)
  } catch {
    throw new Error("Invalid cursor: not valid JSON")
  }

  if (!isCursor(parsed)) {
    throw new Error("Invalid cursor: unexpected shape")
  }

  return parsed
}

function isCursor(value: unknown): value is Cursor {
  if (typeof value !== "object" || value === null) return false
  const record = value as Record<string, unknown>
  return typeof record.createdAt === "string" && typeof record.id === "string"
}

/**
 * Normalize a client-supplied page size to a safe server-side value.
 *
 * - `undefined` → DEFAULT_PAGE_SIZE
 * - < 1 → MIN_PAGE_SIZE
 * - > MAX_PAGE_SIZE → MAX_PAGE_SIZE
 * - non-integer → rounded
 */
export function normalizePageSize(limit: number | undefined): number {
  if (limit === undefined) return DEFAULT_PAGE_SIZE
  if (!Number.isFinite(limit)) return DEFAULT_PAGE_SIZE
  const rounded = Math.round(limit)
  if (rounded < MIN_PAGE_SIZE) return MIN_PAGE_SIZE
  if (rounded > MAX_PAGE_SIZE) return MAX_PAGE_SIZE
  return rounded
}

/**
 * Type guard for "does this input specify pagination?". An empty object or
 * `undefined` means "no pagination" — return the full list.
 */
export function isCursorPaginationInput(input: unknown): input is CursorPaginationInput {
  if (input === undefined || input === null) return false
  if (typeof input !== "object") return false
  const record = input as Record<string, unknown>
  return record.cursor !== undefined || record.limit !== undefined
}
