## Greptile OAuth dies mid-worktree: headless lanes record the block, never fabricate (🟠 Major)

On #35 the cached Greptile session (`~/.greptile/auth.json`, OAuth) expired and
`greptile whoami` / `greptile review` both returned `error: refresh failed:
access_denied` — the refresh token is rejected by the issuer, and fixing it
requires an interactive `greptile login` (browser/device or an API key) that a
headless crew lane cannot complete. Do not fake a JSON result or claim "not
actionable". Instead: (1) write `.scratch/reviews/<id>/<sha>-greptile-local.md`
stating exactly what was attempted and the auth error; (2) push per the
parent's explicit VALIDATION GATES (the brief's gate list is the binding
contract for the push); (3) hand `greptile login` + re-review to the parent in
the crew report as a decisionRequest. Also expect the pre-push hook to run
`test:api` even in a web-only round — the hook is
`contracts build && typecheck && lint && test:api && test:web`; a web-only
change still needs API tests green to push, so budget for it.

**Always**: when a mandatory process gate is infra-blocked (Greptile auth,
CI outage), record the block with evidence, push on the parent's explicit
gates, and escalate the re-run to the parent — a failed-gate waiver is a
parent decision, never a silent skip.
