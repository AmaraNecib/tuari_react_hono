## Requiring a previously-optional field hides failures in loosely-typed test harnesses (🟠 Major)

On #458, `direction` became required on `createDebtAccount` and its schema. `tsc`
caught every **typed** caller, but the RPC/router and report tests drive the
contract through harnesses typed `any`/`never`, so ~7 calls still omitted the
field. They passed typecheck and only failed in the full suite as
`Input validation failed` / a thrown `DEBT_ACCOUNT_DIRECTION_REQUIRED_MESSAGE`
at runtime.

**Always**: when a field flips from optional to required (or a `.positive()` /
`.optional()` bound tightens), grep for the *call shape* — both the service
method (`createDebtAccount(`) and the wire method (`debtAccountsCreate(`) — not
just the TypeScript errors. Run the affected package's suite, not only
`tsc`, before claiming the call sites are migrated.

