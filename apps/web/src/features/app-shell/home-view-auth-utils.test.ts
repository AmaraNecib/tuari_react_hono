// mapCredentialErrors / mapBootstrapErrors are pure — no DOM required.
import { describe, expect, it } from "vitest"

import { buildHomeViewCopy } from "./home-view-copy"
import { mapBootstrapErrors, mapCredentialErrors } from "./home-view-auth-utils"

/**
 * buildHomeViewCopy with the identity t() maps every copy slot to its i18n
 * key — so assertions pin the exact key the UI would render, and the
 * expected value never depends on the implementation under test.
 */
function buildCopy() {
  return buildHomeViewCopy(((key: string) => key) as never)
}

const VALID_PHONE = "0612345678"

describe("mapCredentialErrors", () => {
  const copy = buildCopy()

  it("shows the whitespace-only message for a spaces-only password", () => {
    expect(mapCredentialErrors(copy, VALID_PHONE, "        ").password).toBe(
      "auth.validation.passwordWhitespace",
    )
  })

  it("shows the whitespace-only message for an invisible-characters password", () => {
    expect(
      mapCredentialErrors(copy, VALID_PHONE, "\u200B\u200B\u200B\u200B\u200B\u200B\u200B\u200B")
        .password,
    ).toBe("auth.validation.passwordWhitespace")
  })

  it("still shows the short message for a short password", () => {
    expect(mapCredentialErrors(copy, VALID_PHONE, "1234567").password).toBe(
      "auth.validation.passwordShort",
    )
  })

  // The schema's length guard defers to .min(8) for short+blank values, so a
  // 6-space password shows the length message, not the whitespace message.
  it("shows the short message for a short blank password", () => {
    expect(mapCredentialErrors(copy, VALID_PHONE, "      ").password).toBe(
      "auth.validation.passwordShort",
    )
  })

  it("still shows the required message for an empty password", () => {
    expect(mapCredentialErrors(copy, VALID_PHONE, "").password).toBe("auth.validation.password")
  })

  it("accepts a password with internal spaces", () => {
    expect(mapCredentialErrors(copy, VALID_PHONE, "pass word 123").password).toBeUndefined()
  })
})

describe("mapBootstrapErrors", () => {
  const copy = buildCopy()

  it("shows the whitespace-only message for a blank-looking bootstrap password", () => {
    const errors = mapBootstrapErrors(copy, "المدير الأول", VALID_PHONE, "        ", "", false)
    expect(errors.password).toBe("auth.validation.passwordWhitespace")
  })

  it("keeps the required name error alongside a valid password", () => {
    const errors = mapBootstrapErrors(copy, "   ", VALID_PHONE, "password123", "", false)
    expect(errors.name).toBe("auth.validation.name")
    expect(errors.password).toBeUndefined()
  })
})
