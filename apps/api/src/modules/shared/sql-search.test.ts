import { describe, expect, it } from "vitest"

import { escapeLikePattern } from "./sql-search"

describe("escapeLikePattern", () => {
  it.each([
    ["%", "\\%"],
    ["_", "\\_"],
    ["\\", "\\\\"],
    ["a%_\\b", "a\\%\\_\\\\b"],
  ])("escapes LIKE pattern characters in %j as %j", (input, expected) => {
    expect(escapeLikePattern(input)).toBe(expected)
  })

  it("preserves ordinary Unicode text", () => {
    expect(escapeLikePattern("إسمنت 東京")).toBe("إسمنت 東京")
  })
})
