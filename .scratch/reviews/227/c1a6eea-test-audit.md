# Test Audit — issue #227 (head 9ccaf36, base f93c37c)

Three-agent audit (edge-case hunter / coverage analyst / quality reviewer)
of `tests/e2e/recovery-keys.spec.ts` + `helpers/session.ts` against the
diff `f93c37c...HEAD`.

## Edge cases found → action

| # | Finding | Risk | Action |
|---|---------|------|--------|
| 1 | Malformed key input (empty string) should hit the zod wire gate (HTTP 4xx), not the handler | 🟠 | FIXED — spec now asserts `consumeRecoveryKey({ key: "" })` returns HTTP 400 |
| 2 | Keys are case-sensitive secrets; an uppercased variant silently fails | 🟠 | FIXED — spec asserts `key.toUpperCase()` → `{ success: false }` |
| 3 | Parallel double-consume of one key must yield exactly one success (one-time-use atomicity) | 🟠 | FIXED — spec runs two concurrent `consumeRecoveryKey` calls and asserts exactly one `true` |
| 4 | Prefix-collision flake in the test itself (4-hex matching against the DOM) | 🟡 | FIXED — revoked/available keys are now resolved status-driven from `getRecoveryKeyPool` (no prefix matching, no class-based row selector) |
| 5 | Retry non-idempotence: CI `retries: 2` would re-run against a mutated pool and fail the empty-state precondition | 🟠 | FIXED — `test.describe.configure({ mode: "serial", retries: 0 })` |
| 6 | Concurrent generate at available=4 / parallel double-revoke | 🟠 | DEFERRED — domain-level port atomicity already covered by API unit tests (`withTransaction`, guarded `updateKeyStatus`); sequential overshoot + one-time-use races covered at the wire |
| 7 | DB-key change form error states (empty current key, short new key, wrong current key) | 🟡 | DEFERRED — desktop-only intent (PRAGMA rekey is a no-op on the unencrypted web dev DB); documented in the design doc |

## Coverage vs acceptance criteria

- Criterion 1 (spec covering generate → masked list → revoke → consume →
  pool counts): fully covered, plus empty pool, plain-text-never-leaks,
  one-time use, revoked-key rejection, replenishment, max-pool boundary.
- Criterion 2 (green in CI test-e2e): job added; verified green locally
  (full suite 11 passed / 2 skipped, serial, fresh per-run DB).

## Quality review

Grade: **A-** (was B; the fixes above address the medium findings).
Strengths: anchored regex locators, meaningful non-tautological assertions,
no `waitForTimeout`, `callRpc` reuses the page session cookie and matches the
ORPC envelope. Remaining notes (accepted): single monolithic lifecycle test is
justified by shared DB state + serial mode; `isVisible()` bootstrap branch is
deterministic under workers:1 + fresh DB; protocol coupling of `callRpc`
(documented).
