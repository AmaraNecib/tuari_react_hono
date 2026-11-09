## Advertised-but-unimplemented contract surface: drop the procedures, don't stub handlers (💡 Design Principle)

On #239, the `recurringPatternsList/Get` procedures were spread into `appContract`
(so `AppClient` exposed them) with no server handlers; an `as any` at the router
boundary hid the gap. Resolution: **drop the procedures until the feature lands**,
not a stub implementation. With no DB table/module behind them, the only possible
handler returns a hard-coded empty list (fake behavior that renders an empty page
and claims the feature works), and a read-only list/get contract without
create/update is not a feature anyway. Deleting the procedures makes
`os.router(allHandlers)` typecheck natively, so contract/server drift becomes a
build error. Also delete the orphaned consumers (the hook/page that called the
procedures were unrouted, so deleting is behavior-preserving), and pin the deletion
with a negative contract test (`"key" in appContract` is false) so a re-added
spread without handlers fails at the contract level. Keep the domain *schemas*
(`recurring.ts`) exported. They're vocabulary for the future feature, not RPC
procedures.

**Always**: when a contract advertises procedures with no handlers, prefer
deletion over a stub; the compiler + a negative contract test are the drift
sentinels, and the `as any` cast must never be the thing that makes the router
typecheck.

