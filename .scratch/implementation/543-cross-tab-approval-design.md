# Cross-tab monthly approval recovery

Base: `c6daf53dc0f2c643f69b67a5d4fde477695e9bc7`

Tier: high-assurance. Verification mode: focused-local / CI-final-pending.

Finding: "Two salary tabs opened before either approval each remember an empty store. After one tab gets an uncertain result, the other can overwrite its saved request and then clear the shared key after succeeding. save and clear never check which request currently owns that key. Reloading loses the uncertain request ID, so re-entering the wages can create another approval. Coordinate writers across tabs and clear only the matching request."

## Decision

The v1 browser-storage key and JSON record remain unchanged. `navigator.locks` provides an exclusive lock named from the existing key, held from the durable reload through the server result and storage update. The executor reloads after acquiring the lock. If the durable request differs from the submitted employee, request ID or normalized payload, it refuses before sending. An unresolved matching request can be retried with its existing request ID and payload.

Browser storage has no fallback lock. If Web Locks are unavailable, the browser store fails before dispatch. Storage `save` and `clear` also compare the current record identity and full normalized payload, so an alternate caller cannot replace or remove another pending intent. A definitive first rejection can clear only its own request. A retry loaded from storage stays ambiguous.

The memory adapter injects a lock manager shared by both test executors. The tests cover two executors created before the first write, an actual overlapping execution where the second waits behind the first, identity-aware save/clear, fail-closed behavior when browser locking is unavailable, and the difference between a definitive first rejection and a reloaded retry.

## Model and interface

The domain distinction is between a submitted monthly approval and a durable unresolved approval intent. The latter owns the shared v1 key until its matching operation receives a valid response or a definitive first rejection. The module's interface adds an exclusive-operation adapter for deterministic tests; the browser adapter uses native Web Locks. Callers still use the same executor and existing `MonthlyApprovalRecord` shape.

The changed seam stays inside `exact-monthly-approval-recovery.ts`. No direct caller changes, persistent-format migration, backend fingerprint change, or server receipt change is in scope. Architecture: the existing module gained a coordination adapter but no caller-facing workflow seam moved.

Applied lesson: `.agents/wisdom/security/a-resettable-recovery-file-must-not-hold-the-trial-anchor.md` is excluded. It concerns separating trial entitlement from resettable state, not cross-tab ownership. No matching recovery-specific wisdom entry exists.

## Limits

Cross-tab safety depends on browser support for Web Locks and shared `localStorage`. Unsupported browsers cannot submit approvals through this module. The lock covers the duration of the server request, so another tab waits until the first request resolves or rejects. This does not change backend idempotency or establish CI acceptance; CI-final activation remains pending.