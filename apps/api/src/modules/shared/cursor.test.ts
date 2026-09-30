import { describe, it, expect } from "vitest"

import {
  ALLOWED_PAGE_SIZES,
  decodeCursor,
  encodeCursor,
  isCursorPaginationInput,
  normalizePageSize,
  type Cursor,
  type CursorPaginationInput,
} from "./cursor"

/**
 * The cursor module is a small, focused utility. It has only one job:
 * turn structured cursor data into an opaque string token and back.
 *
 * These tests are the contract: any breaking change here is a breaking
 * change for every paginated endpoint, so they need to be tight.
 */
describe("cursor module", () => {
  describe("encodeCursor / decodeCursor", () => {
    it("round-trips a simple cursor", () => {
      const original: Cursor = { sortKey: "2024-01-15T10:00:00.000Z", id: "abc-123" }

      const encoded = encodeCursor(original)
      const decoded = decodeCursor(encoded)

      expect(decoded).toEqual(original)
    })

    it("produces an opaque string (no raw field values visible)", () => {
      const cursor: Cursor = { sortKey: "2024-01-15T10:00:00.000Z", id: "secret-id-123" }

      const encoded = encodeCursor(cursor)

      // An opaque cursor should not leak its raw field values. Encoding
      // (base64 of JSON) is fine because the format itself doesn't change
      // the implementation contract — the consumer must always decode
      // through decodeCursor, never inspect the string.
      expect(typeof encoded).toBe("string")
      expect(encoded.length).toBeGreaterThan(0)
      // The encoded value is base64, so it should not contain raw JSON brackets
      expect(encoded.startsWith("{")).toBe(false)
    })

    it("encodes unicode characters correctly", () => {
      const cursor: Cursor = { sortKey: "2024-01-15T10:00:00.000Z", id: "id-with-émojis-🎉" }

      const encoded = encodeCursor(cursor)
      const decoded = decodeCursor(encoded)

      expect(decoded).toEqual(cursor)
    })

    it("round-trips an optional scope fingerprint", () => {
      const cursor: Cursor = { sortKey: "إسمنت", id: "abc", scope: "STOCK_REFERENCE::" }
      expect(decodeCursor(encodeCursor(cursor))).toEqual(cursor)
    })

    it("rejects a non-string scope", () => {
      const token = Buffer.from(
        JSON.stringify({ sortKey: "a", id: "b", scope: 1 }),
      ).toString("base64url")
      expect(() => decodeCursor(token)).toThrow()
    })

    it("throws on malformed cursor", () => {
      expect(() => decodeCursor("not-a-valid-cursor")).toThrow()
      expect(() => decodeCursor("")).toThrow()
      expect(() => decodeCursor("abc")).toThrow()
    })

    it("throws on cursor with missing required fields", () => {
      // base64 of {"sortKey":"2024-01-15T10:00:00.000Z"} — missing id
      const incomplete = Buffer.from(
        JSON.stringify({ sortKey: "2024-01-15T10:00:00.000Z" }),
      ).toString("base64url")

      expect(() => decodeCursor(incomplete)).toThrow()
    })

    it("produces different encoded values for different cursors", () => {
      const a = encodeCursor({ sortKey: "2024-01-15T10:00:00.000Z", id: "a" })
      const b = encodeCursor({ sortKey: "2024-01-15T10:00:00.000Z", id: "b" })
      const c = encodeCursor({ sortKey: "2024-01-16T10:00:00.000Z", id: "a" })

      expect(a).not.toBe(b)
      expect(a).not.toBe(c)
      expect(b).not.toBe(c)
    })

    it("is stable: same cursor encodes to same string", () => {
      const cursor: Cursor = { sortKey: "2024-01-15T10:00:00.000Z", id: "abc" }

      const a = encodeCursor(cursor)
      const b = encodeCursor(cursor)

      expect(a).toBe(b)
    })
  })

  describe("normalizePageSize", () => {
    it("returns the input when within bounds", () => {
      expect(normalizePageSize(25)).toBe(25)
      expect(normalizePageSize(1)).toBe(1)
      expect(normalizePageSize(100)).toBe(100)
    })

    it("defaults to 50 when undefined", () => {
      expect(normalizePageSize(undefined)).toBe(50)
    })

    it("clamps to minimum of 1", () => {
      expect(normalizePageSize(0)).toBe(1)
      expect(normalizePageSize(-5)).toBe(1)
    })

    it("clamps to maximum of 100", () => {
      expect(normalizePageSize(101)).toBe(100)
      expect(normalizePageSize(9999)).toBe(100)
    })

    it("rounds non-integer values", () => {
      expect(normalizePageSize(25.7)).toBe(26)
      expect(normalizePageSize(25.2)).toBe(25)
    })
  })

  describe("isCursorPaginationInput", () => {
    it("returns true when cursor or limit is present", () => {
      expect(isCursorPaginationInput({ cursor: "abc" })).toBe(true)
      expect(isCursorPaginationInput({ limit: 25 })).toBe(true)
      expect(isCursorPaginationInput({ cursor: "abc", limit: 25 })).toBe(true)
    })

    it("returns false when both are absent", () => {
      expect(isCursorPaginationInput({})).toBe(false)
      expect(isCursorPaginationInput(undefined)).toBe(false)
    })
  })

  describe("type guards", () => {
    it("Cursor type is structurally usable", () => {
      // Compile-time check: the Cursor type has the two fields we expect.
      // If this compiles, the test passes.
      const cursor: Cursor = { sortKey: "2024-01-15T10:00:00.000Z", id: "x" }
      const paginationInput: CursorPaginationInput = { cursor: "x", limit: 10 }

      expect(cursor.sortKey).toBe("2024-01-15T10:00:00.000Z")
      expect(paginationInput.limit).toBe(10)
    })
  })
})
