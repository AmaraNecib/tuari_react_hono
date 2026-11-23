## Testing a "never"-typed defensive branch and an auth-plugin validator (🟡 Minor)

Two useful patterns from closing #259's deferred branches:
- A `switch` `default:` that `throw`s after a `const _exhaustive: never = …` assignment is
  unreachable through the validated schema by construction. The only way to cover it is a
  scoped per-test cast (`{ ...config, dbAdapter: "postgres" } as unknown as AppConfig`)
  with a comment explaining it pins future defense-in-depth (schema growth). Greptile and
  review accepted this as honest.
- better-auth's `phoneNumber` plugin calls `phoneNumberValidator` BEFORE any DB access on
  both the `send-phone-number-otp` and `sign-in/phone-number` routes, so the validator's
  return-false branch can be tested with a fake db (`createAuth({} as never, config)`); only
  the validator-true path (which reaches the verification store) needs the real dependency
  graph. The two routes produce distinct errors (`"Invalid phone number"` vs the sendOTP
  hard-fail), so assertions discriminate which branch fired.

