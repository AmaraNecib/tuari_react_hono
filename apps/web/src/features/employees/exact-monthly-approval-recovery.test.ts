import { describe, expect, it, vi } from "vitest"
import type { ExactSalaryMonthlyApprovalInput } from "@tuari/contracts"
import { createMonthlyApprovalExecutor, createMonthlyApprovalStore, type MonthlyApprovalStorage } from "./exact-monthly-approval-recovery"

const scope = { workspaceId: "11111111-1111-4111-8111-111111111111", userId: "user-a" }
const input: ExactSalaryMonthlyApprovalInput = {
  requestId: "approval-1", employeeId: "employee-a", currency: "DZD",
  months: [{ id: "month-a", month: "2026-10", amount: "10000", unallocatedAmount: "10000", segments: [] }],
}
const normalizedInput = { ...input, months: [{ ...input.months[0]!, amount: "10000.00", unallocatedAmount: "10000.00" }] }
const validResult = () => {
  const month = input.months[0]!
  return { currency: "DZD" as const, totalAmount: "10000.00", months: [{ id: month.id, month: month.month, earning: {
    id: "earning-a", employeeId: input.employeeId, currency: "DZD" as const,
    periodStart: "2026-10-01", periodEnd: "2026-10-31", approvedAmount: "10000.00", unallocatedAmount: "10000.00", segments: [],
    debtAccountId: "account-a", debtEntryId: "entry-a", actorUserId: "user-a", actorLabel: "Operator", transactionId: "txn-a", createdAt: "2026-11-11T00:00:00.000Z",
  } }] }
}

class MemoryStorage implements MonthlyApprovalStorage {
  readonly values = new Map<string, string>()
  failWrites = false
  failRemove = false
  getItem(key: string) { return this.values.get(key) ?? null }
  setItem(key: string, value: string) { if (this.failWrites) throw new Error("storage write failed"); this.values.set(key, value) }
  removeItem(key: string) { if (this.failRemove) throw new Error("storage clear failed"); this.values.delete(key) }
}

describe("monthly approval recovery storage", () => {
  it("recovers an unresolved record from the established v1 browser-storage key", () => {
    const storage = new MemoryStorage()
    const key = "tuari:slice543:monthly-approval:v1:11111111-1111-4111-8111-111111111111:user-a"
    storage.values.set(key, JSON.stringify({ version: 1, ...scope, employeeId: input.employeeId, requestId: input.requestId, payload: input, ambiguous: true }))
    const store = createMonthlyApprovalStore(storage, scope.workspaceId, scope.userId)
    expect(store.load()).toMatchObject({ requestId: input.requestId, payload: normalizedInput, ambiguous: true })
  })

  it("persists the full normalized intent before dispatch and clears only after a valid response", async () => {
    const storage = new MemoryStorage()
    const store = createMonthlyApprovalStore(storage, scope.workspaceId, scope.userId)
    let writesBeforeSend = 0
    const execute = vi.fn(async payload => {
      writesBeforeSend = storage.values.size
      expect(payload).toEqual({ ...normalizedInput, months: [{ ...normalizedInput.months[0]!, amount: "10000.00", unallocatedAmount: "10000.00" }] })
      return validResult()
    })
    const runner = createMonthlyApprovalExecutor({ store, execute })
    await expect(runner.run(input)).resolves.toEqual(validResult())
    expect(writesBeforeSend).toBe(1)
    expect(execute).toHaveBeenCalledTimes(1)
    expect(runner.record).toBeNull()
  })

  it("fails closed when storage cannot save, without sending", async () => {
    const storage = new MemoryStorage()
    storage.failWrites = true
    const execute = vi.fn()
    const runner = createMonthlyApprovalExecutor({ store: createMonthlyApprovalStore(storage, scope.workspaceId, scope.userId), execute })
    await expect(runner.run(input)).rejects.toThrow("storage write failed")
    expect(execute).not.toHaveBeenCalled()
  })

  it("treats an intent found after reload as ambiguous and retries only its exact payload", async () => {
    const storage = new MemoryStorage()
    const store = createMonthlyApprovalStore(storage, scope.workspaceId, scope.userId)
    const first = createMonthlyApprovalExecutor({ store, execute: async () => { throw new Error("response lost") } })
    await expect(first.run(input)).rejects.toThrow("response lost")
    const reopenedStore = createMonthlyApprovalStore(storage, scope.workspaceId, scope.userId)
    const states: string[] = []
    const retry = createMonthlyApprovalExecutor({ store: reopenedStore, execute: async () => validResult(), onState: state => states.push(state) })
    expect(retry.record?.ambiguous).toBe(true)
    expect(states).toEqual(["uncertain"])
    const changed = { ...input, months: [{ ...input.months[0]!, amount: "9999.00", unallocatedAmount: "9999.00" }] }
    await expect(retry.run(changed)).rejects.toThrow(/stored monthly approval intent/i)
    await expect(retry.run(input)).resolves.toEqual(validResult())
    expect(reopenedStore.load()).toBeNull()
  })

  it("refuses foreign, malformed, and mismatched recovery envelopes", () => {
    const storage = new MemoryStorage()
    const first = createMonthlyApprovalStore(storage, scope.workspaceId, scope.userId)
    first.save({ version: 1, ...scope, employeeId: input.employeeId, requestId: input.requestId, payload: input, ambiguous: false })
    expect(() => createMonthlyApprovalStore(storage, scope.workspaceId, "user-b").load()).not.toThrow()
    const key = [...storage.values.keys()][0]!
    const value = JSON.parse(storage.values.get(key)!) as Record<string, unknown>
    value.userId = "user-b"
    storage.values.set(key, JSON.stringify(value))
    expect(() => first.load()).toThrow(/scope mismatch/i)
    value.userId = scope.userId
    value.requestId = "tampered"
    storage.values.set(key, JSON.stringify(value))
    expect(() => first.load()).toThrow(/envelope mismatch/i)
  })

  it("rejects same-tick duplicate sends and preserves a bad post-commit response as uncertain", async () => {
    const storage = new MemoryStorage()
    const store = createMonthlyApprovalStore(storage, scope.workspaceId, scope.userId)
    let finish: ((value: unknown) => void) | undefined
    const execute = vi.fn(() => new Promise(resolve => { finish = resolve }))
    const runner = createMonthlyApprovalExecutor({ store, execute })
    const first = runner.run(input)
    await expect(runner.run(input)).rejects.toThrow(/already in flight/i)
    expect(execute).toHaveBeenCalledTimes(1)
    finish!({ currency: "DZD", totalAmount: "wrong", months: [] })
    await expect(first).rejects.toThrow()
    expect(runner.record?.ambiguous).toBe(true)
    expect(store.load()?.requestId).toBe(input.requestId)
  })

  it("keeps a fence when clearing after a valid server response fails", async () => {
    const storage = new MemoryStorage()
    const store = createMonthlyApprovalStore(storage, scope.workspaceId, scope.userId)
    const runner = createMonthlyApprovalExecutor({ store, execute: async () => validResult() })
    storage.failRemove = true
    await expect(runner.run(input)).rejects.toThrow("storage clear failed")
    expect(runner.record?.ambiguous).toBe(true)
    expect(store.load()?.payload).toEqual(normalizedInput)
  })
})
