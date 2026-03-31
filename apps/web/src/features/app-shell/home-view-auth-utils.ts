import { authBootstrapInputSchema, phonePasswordSignInSchema } from "@tuari/contracts"

import type { HomeViewCopy } from "./home-view-copy"
import type { FormErrors } from "./home-view-types"

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
    errors.password = copy.validation.passwordShort
  }

  return errors
}

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
