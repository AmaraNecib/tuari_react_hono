import { describe, expect, it } from "vitest"
import {
  clearPayrollPendingIntent,
  loadPayrollPendingIntent,
  markPayrollIntentAttempt,
  savePayrollPendingIntent,
  type PayrollIdentity,
  type PayrollStorage,
} from "./payroll-pending-intent"

function memoryStorage(): PayrollStorage {
  const values = new Map<string, string>()
  return {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => { values.set(key, value) },
    removeItem: key => { values.delete(key) },
  }
}

const identity: PayrollIdentity = { userId: "user-1", workspaceId: "http://workspace.test", employeeId: "employee-1" }
const payload = {
  requestId: "cash-request-1",
  employeeId: identity.employeeId,
  amount: "12.34",
  paymentDate: "2026-11-19T09:00:00.000Z",
  wages: [{ earningId: "earning-1", amount: "12.34" }],
}

describe("payroll pending intent recovery", () => {
  it("retains the confirmed opening correction and original request across reload", () => {
    const storage = memoryStorage()
    const input = { requestId: "opening-correction", employeeId: identity.employeeId, kind: "WAGE" as const, expectedAmount: "2000.00", amount: "1900.00", reason: "Verified document" }
    const saved = savePayrollPendingIntent("opening-correct", identity, input, storage)
    const attempted = markPayrollIntentAttempt(saved, storage)
    expect(loadPayrollPendingIntent("opening-correct", identity, storage)).toEqual({ ok: true, pending: attempted })
    expect(loadPayrollPendingIntent("opening-correct", { ...identity, userId: "other-user" }, storage)).toEqual({ ok: true, pending: null })
    expect(loadPayrollPendingIntent("opening-correct", { ...identity, workspaceId: "http://other-workspace.test" }, storage)).toEqual({ ok: true, pending: null })
    expect(attempted.payload).toEqual(input)
    expect(clearPayrollPendingIntent("opening-correct", identity, "different-request", storage)).toBe(false)
    expect(clearPayrollPendingIntent("opening-correct", identity, input.requestId, storage)).toBe(true)
  })
  it("persists distinct dispatch attempts without changing financial identity or payload", () => {
    const storage = memoryStorage()
    const saved = savePayrollPendingIntent("cash", identity, payload, storage)
    const first = markPayrollIntentAttempt(saved, storage)
    const second = markPayrollIntentAttempt(saved, storage)
    expect(first.attemptId).toBeTruthy()
    expect(second.attemptId).not.toBe(first.attemptId)
    expect(second.payload).toEqual(payload)
    expect(second.identity).toEqual(identity)
    expect(loadPayrollPendingIntent("cash", identity, storage)).toEqual({ ok: true, pending: second })
  })

  it("reloads the frozen canonical payload and request id for retry", () => {
    const storage = memoryStorage()
    savePayrollPendingIntent("cash", identity, payload, storage)

    expect(loadPayrollPendingIntent("cash", identity, storage)).toEqual({
      ok: true,
      pending: { version: 1, action: "cash", identity, payload },
    })
  })

  it("isolates pending writes by action, employee, user, and workspace", () => {
    const storage = memoryStorage()
    savePayrollPendingIntent("cash", identity, payload, storage)

    expect(loadPayrollPendingIntent("repay", identity, storage)).toEqual({ ok: true, pending: null })
    expect(loadPayrollPendingIntent("cash", { ...identity, employeeId: "employee-2" }, storage)).toEqual({ ok: true, pending: null })
    expect(loadPayrollPendingIntent("cash", { ...identity, userId: "user-2" }, storage)).toEqual({ ok: true, pending: null })
    expect(loadPayrollPendingIntent("cash", { ...identity, workspaceId: "http://other.test" }, storage)).toEqual({ ok: true, pending: null })
  })

  it("clears only after the matching request receives a response", () => {
    const storage = memoryStorage()
    savePayrollPendingIntent("cash", identity, payload, storage)

    expect(clearPayrollPendingIntent("cash", identity, "different-request", storage)).toBe(false)
    const retained = loadPayrollPendingIntent("cash", identity, storage)
    expect(retained.ok ? retained.pending?.payload.requestId : null).toBe(payload.requestId)
    expect(clearPayrollPendingIntent("cash", identity, payload.requestId, storage)).toBe(true)
    expect(loadPayrollPendingIntent("cash", identity, storage)).toEqual({ ok: true, pending: null })
  })

  it("rejects malformed or noncanonical amounts instead of changing a retry", () => {
    const storage = memoryStorage()
    savePayrollPendingIntent("cash", identity, payload, storage)
    const key = `employee-payroll-pending:v1:cash:${encodeURIComponent(identity.userId)}:${encodeURIComponent(identity.workspaceId)}:${encodeURIComponent(identity.employeeId)}`
    storage.setItem(key, JSON.stringify({ version: 1, action: "cash", identity, payload: { ...payload, amount: "12.345" } }))

    expect(loadPayrollPendingIntent("cash", identity, storage)).toEqual({ ok: false })
  })
})
