# #576 web port documentation

## Scope and selection

Trial slot 1 of at most eight, selected before implementation or review outcomes. The parent recorded the preselection at `D:/worktrees/tuari_react_hono/t3-82ba8730-b15d68d081398c59/.scratch/reviews/550/workflow-comparison/trial-slot-01.md`.

Eligible because this is a narrow, reversible factual correction to document an existing shell override. `apps/web/vite.config.ts` reads `process.env.WEB_PORT` and applies it to Vite's dev and preview listeners. No runtime behavior, security policy, API configuration or auth behavior changes.

Review route selected before outcomes: one fresh combined code review after the complete scope is committed, under the adopted and aligned routine-review trial. Focused source and prose/link/diff checks only. CI, hosted verdicts, effective protection, independence, finding resolution and owner-only gates remain separate and unchanged.

## Pin and risk

- Issue: #576, prospective routine-review trial task.
- Worktree: `D:/worktrees/tuari_react_hono/t3-8ded065f-66ab6ec4b20a4b2c`
- Base: `d5f1c58ed5d8db60514b85c58f51d59d6923ea41`
- Verification mode: focused-local / CI-final-enforced, per parent; current-head CI and hosted acceptance remain distinct.
- Reachable risk: README could imply that changing the browser listener also changes API configuration or makes CORS/auth accept its origin. Text explicitly disclaims those effects.
- Reversal: revert the README paragraph and this design note. No app source or behavior requires rollback.

## Source basis

- `apps/web/vite.config.ts` reads `process.env.WEB_PORT` at line 15 and applies the resulting port to `server` and `preview` at lines 71-79; both bind `127.0.0.1` and use `strictPort`.
- `apps/web/src/lib/ports.ts` defines `DEFAULT_WEB_PORT = "3000"` at line 18. `normalizePort` at lines 23-37 trims and parses numeric values, returns the fallback for invalid/out-of-range values, and defaults to 3000. It is used by the Vite config.
- `apps/web/package.json` defines `dev` as `vite --host 127.0.0.1` at line 7.
- API URL/port resolution is separate in `apps/web/src/lib/ports.ts` at lines 88-95 (`PLAYWRIGHT_API_URL` / `API_PORT`). This documentation does not claim API URL, CORS or authentication changes.
- `.env` is not presented as the mechanism for this override; the example sets the shell environment variable in PowerShell.

## Complete file disposition

1. `apps/web/README.md` — add shell-level PowerShell example, default and invalid-value behavior, listener binding, and explicit API/CORS/auth limits.
2. `.scratch/implementation/576-web-port-design.md` — record selection, scope, source basis, verification and rollback.

No other files changed. No tests, UI, integration behavior, source, port logic, auth, CI, #574 files, packages or wisdom changed. No server started and no further task selected.

## Proof and handoff

Focused proof: inspected the cited source lines; `git diff --check` passed (exit 0). No application tests, build or server run because application behavior is unchanged. Exact command outcomes, duration and logs are recorded in the parent handoff; no test count, cost or savings are claimed. `architecture: no seam moved`.

The parent performs the selected fresh combined review and Guard Phase 2. This worker stops at the committed, frozen handoff. No push, PR, merge or tracker changes.
