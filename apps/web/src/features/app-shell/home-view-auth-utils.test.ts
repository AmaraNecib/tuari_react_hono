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

  // #321: sign-in only verifies against an existing hash, so an all-invisible
  // password is no longer blocked client-side — it is the legacy recovery
  // channel for a pre-#230 whitespace-password user (the server verifies the
  // hash). Bootstrap stays strict (see mapBootstrapErrors below).
  it("no longer blocks a spaces-only sign-in password (legacy recovery)", () => {
    expect(mapCredentialErrors(copy, VALID_PHONE, "        ").password).toBeUndefined()
  })

  it("no longer blocks an invisible-characters sign-in password", () => {
    expect(
      mapCredentialErrors(copy, VALID_PHONE, "\u200B\u200B\u200B\u200B\u200B\u200B\u200B\u200B")
        .password,
    ).toBeUndefined()
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

  // #321: the bootstrap gate must stay strict even though the sign-in schema
  // is now legacy-compatible — invisible-character passwords are still
  // rejected when CREATING the credential.
  it("shows the whitespace-only message for an invisible-characters bootstrap password", () => {
    const errors = mapBootstrapErrors(
      copy,
      "المدير الأول",
      VALID_PHONE,
      "\u200B\u200B\u200B\u200B\u200B\u200B\u200B\u200B",
      "",
      false,
    )
    expect(errors.password).toBe("auth.validation.passwordWhitespace")
  })

  it("keeps the required name error alongside a valid password", () => {
    const errors = mapBootstrapErrors(copy, "   ", VALID_PHONE, "password123", "", false)
    expect(errors.name).toBe("auth.validation.name")
    expect(errors.password).toBeUndefined()
  })
})
