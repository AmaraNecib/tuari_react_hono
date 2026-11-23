## Playwright toast assertions must gate on the save response (🟠 Major)

On #254, a `~50%` E2E flake: after a password change, the follow-up sign-out
sometimes left the app signed in despite a 200 `/api/auth/sign-out`. Root
cause: the success-toast assertion used `.first()` to tolerate stacked toasts,
which could match an EARLIER save's still-visible toast, so the test moved on
(sign-out) while the CURRENT save's change-password was still in flight. When
that save completed, its session re-establishment (better-auth's
`revokeOtherSessions` deletes ALL sessions including the current one and
creates a new one) re-signed the app in *after* the sign-out. The tell in the
network log: a change-password POST arrives AFTER the sign-out POST.

Fix pattern (`saveAccountAndExpectSuccess`):
`page.waitForResponse(r => r.url().includes('/api/auth/change-password'))`
set up BEFORE the save click, assert the response is 200, then assert the
toast. The save is provably settled before the next step runs.

**Always**: when an E2E asserts a toast as proof a mutation succeeded, gate the
assertion on the mutation's HTTP response first. A `.first()`/substring toast
match can silently pass on stale toasts.

