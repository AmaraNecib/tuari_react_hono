# Employee earning draft and retry recovery

Base: `29b3bfa2f935e71dcef1d1bb44739ba0acf344f1`. Scope: ordered earnings draft and durable duplicate-submit recovery for the upcoming shared salary dialog. Review tier: high-assurance because an uncertain approval retry can duplicate a financial operation. Verification mode: `focused-local / CI-final-pending`.

The draft keeps user-entered total, unallocated amount, period dates and row strings in order. Finalization normalizes amounts with the existing localized exact parsers, validates the resulting `EmployeeEarningApprovalInput`, and preserves row IDs and repeated project attribution. It never derives row amounts from days or salary reference. Daily reference salaries retain the contract's four-place unit-price scale; other reference periods use exact money.

Pending approval is a separate frozen payload in injected storage, keyed by authenticated user, workspace and employee. The draft employee must match that identity before storage or submission. Once stored, another submit returns the same validated payload and request ID, regardless of edits to the open draft. Only explicit success cleanup removes it. Invalid or mismatched cached data refuses submission. The module reads no browser global at import time.

The interface is `finalizeEmployeeEarningDraft`, `editEarningDraftRow`, `markEmployeeEarningPending`, `loadPendingEmployeeEarning`, and `removePendingEmployeeEarning`. Issues use draft field names and stable row IDs, including when the contract reports an indexed segment issue. Tests call these exported functions as the dialog integration seam. No UI, query hook, backend, schema or package files changed. Architecture: the draft module creates one focused seam; no additional storage abstraction or moved interface.

Applied wisdom: `dialogs-snapshot-identity-not-derived-data-reset-a-mutation-s-terminal-state-per-draft.md`. The new module stores employee identity in draft state and scopes unresolved requests to the user/workspace/employee tuple.
