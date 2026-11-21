# Debt search balance display

Base: `6587e466cdc5913c28777362740a0270ffb8fe6d`. Worktree: `D:/worktrees/tuari_react_hono/t3-9c051ab5-abca3de050b396d4`. Verification mode: focused-local / CI-final-pending. Risk tier: high assurance; debt-direction and exact aggregate display.

Global search displays each account's signed balance beside a phrase chosen only from account direction. That makes a negative PAYABLE balance read as debt owed by us and exposes a negative amount. The correction chooses the existing canonical `DEBT_BALANCE_STATE_PHRASE` from exact value sign plus ledger direction, normalizes zero to settled, and formats the unsigned exact magnitude through the aggregate-capable formatter. It does not reinterpret or mutate the account direction or stored value.

Vocabulary: `direction` is the ledger's fixed PAYABLE/RECEIVABLE semantic; the signed exact `currentBalance` represents its balance state; the search result's phrase and magnitude are display-only. The seam remains the search corpus mapping in `home-view-signed-in-shell.tsx`; no shared module or schema changed. Architecture: no seam moved.

Applied wisdom: `.agents/wisdom/testing/aging-buckets-must-share-the-same-threshold-as-the-classification-they-feed.md` reinforces testing derived labels at threshold boundaries; here zero is the critical state boundary. Excluded unrelated debt/report lessons after checking relevance.

Scope: `apps/web/src/features/app-shell/home-view-signed-in-shell.tsx`; focused mounted global-search proof remains required. No debt page/API/locale changes, no publication, no new dependencies. Local proof, exact counts, durations, logs, and SHA will be recorded after implementation.