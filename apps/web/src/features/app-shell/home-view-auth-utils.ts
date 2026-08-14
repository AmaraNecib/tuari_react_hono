import { authBootstrapInputSchema, phonePasswordSignInSchema } from "@tuari/contracts"

import type { HomeViewCopy } from "./home-view-copy"
import type { FormErrors } from "./home-view-types"

/** Validates login form fields and returns error map. */
export function mapCredentialErrors(copy: HomeViewCopy, phone: string, password: string) {
  const errors: FormErrors = {}
  const result = phonePasswordSignInSchema.safeParse({
    phone: phone.trim(),
    password,
  })

  if (phone.trim().length === 0) {
    errors.phone = copy.validation.phone
  } else if (!result.success && result.error.issues.some((issue) => issue.path[0] === "phone")) {
    errors.phone = copy.validation.phoneFormat
  }

  if (password.length === 0) {
    errors.password = copy.validation.password
  } else if (!result.success && result.error.issues.some((issue) => issue.path[0] === "password")) {
    // #230: a `custom` issue on the password path is the shared schema's
    // blank-password refine (whitespace/format/control-only), which deserves
    // its own message rather than the misleading "at least 8 characters".
    const isBlankPassword = result.error.issues.some(
      (issue) => issue.path[0] === "password" && issue.code === "custom",
    )
    errors.password = isBlankPassword
      ? copy.validation.passwordWhitespace
      : copy.validation.passwordShort
  }

  return errors
}

/** Validates first-user bootstrap form fields. */
export function mapBootstrapErrors(
  copy: HomeViewCopy,
  name: string,
  phone: string,
  password: string,
  setupSecret: string,
  requiresSetupKey: boolean,
) {
  const errors = mapCredentialErrors(copy, phone, password)
  const result = authBootstrapInputSchema.safeParse({
    name: name.trim(),
    phone: phone.trim(),
    password,
  })

  // #321: mapCredentialErrors delegates to the sign-in schema, which is
  // legacy-compatible (no visible-character refine) so a pre-#230 whitespace
  // password can be verified at sign-in. Bootstrap CREATES the credential, so
  // the strict #230 policy must still surface client-side — re-check the
  // password against the strict bootstrap schema result parsed above.
  if (password.length > 0 && !result.success && result.error.issues.some((issue) => issue.path[0] === "password")) {
    const isBlankPassword = result.error.issues.some(
      (issue) => issue.path[0] === "password" && issue.code === "custom",
    )
    errors.password = isBlankPassword
      ? copy.validation.passwordWhitespace
      : copy.validation.passwordShort
  }

  if (name.trim().length === 0) {
    errors.name = copy.validation.name
  } else if (!result.success && result.error.issues.some((issue) => issue.path[0] === "name")) {
    errors.name = copy.validation.name
  }

  if (requiresSetupKey && setupSecret.trim().length === 0) {
    errors.setupSecret = copy.validation.setupSecret
  }

  return errors
}
