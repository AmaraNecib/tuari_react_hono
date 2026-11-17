import { ORPCError } from "@orpc/client"
import { describe, expect, it, vi } from "vitest"
import { createKeyedAsyncTestLock } from "@/test-utils/keyed-async-test-lock"
import type { ExactSalaryMonthlyApprovalInput } from "@tuari/contracts"
import { browserMonthlyApprovalStore, createMonthlyApprovalExecutor, createMonthlyApprovalStore, type MonthlyApprovalCoordination, type MonthlyApprovalStorage } from "./exact-monthly-approval-recovery"

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

class MemoryCoordination implements MonthlyApprovalCoordination {
  private readonly runLock = createKeyedAsyncTestLock()
  runExclusive<T>(name: string, operation: () => Promise<T>): Promise<T> { return this.runLock(name, operation) }
}

class MemoryStorage implements MonthlyApprovalStorage {
  readonly values = new Map<string, string>()
  readonly coordination = new MemoryCoordination()
  failWrites = false
  failRemove = false
  getItem(key: string) { return this.values.get(key) ?? null }
  setItem(key: string, value: string) { if (this.failWrites) throw new Error("storage write failed"); this.values.set(key, value) }
  removeItem(key: string) { if (this.failRemove) throw new Error("storage clear failed"); this.values.delete(key) }
}

function createStore(storage: MemoryStorage, userId = scope.userId) {
  return createMonthlyApprovalStore(storage, scope.workspaceId, userId, storage.coordination)
}

describe("monthly approval recovery storage", () => {
  it("recovers an unresolved record from the established v1 browser-storage key", () => {
    const storage = new MemoryStorage()
    const key = "tuari:slice543:monthly-approval:v1:11111111-1111-4111-8111-111111111111:user-a"
    storage.values.set(key, JSON.stringify({ version: 1, ...scope, employeeId: input.employeeId, requestId: input.requestId, payload: input, ambiguous: true }))
    const store = createStore(storage)
    expect(store.load()).toMatchObject({ requestId: input.requestId, payload: normalizedInput, ambiguous: true })
  })

  it("persists the full normalized intent before dispatch and clears only after a valid response", async () => {
    const storage = new MemoryStorage()
    const store = createStore(storage)
    let writesBeforeSend = 0
    const execute = vi.fn(async payload => {
      writesBeforeSend = storage.values.size
      expect(payload).toEqual({ ...normalizedInput, months: [{ ...normalizedInput.months[0]!, amount: "10000.00", unallocatedAmount: "10000.00" }] })
      return validResult()
    })
    const runner = createMonthlyApprovalExecutor({ store, execute })
    await expect(runner.run(input)).resolves.toEqual(validResult())
    expect(writesBeforeSend).toBe(1)
    await expect(runner.run(input)).rejects.toThrow(/reload/i)
    expect(execute).toHaveBeenCalledTimes(1)
    expect(runner.record).toBeNull()
    expect(store.load()).toBeNull()
  })

  it("fails closed when storage cannot save, without sending", async () => {
    const storage = new MemoryStorage()
    storage.failWrites = true
    const execute = vi.fn()
    const runner = createMonthlyApprovalExecutor({ store: createStore(storage), execute })
    await expect(runner.run(input)).rejects.toThrow("storage write failed")
    expect(execute).not.toHaveBeenCalled()
  })

  it("treats an intent found after reload as ambiguous and retries only its exact payload", async () => {
    const storage = new MemoryStorage()
    const store = createStore(storage)
    const first = createMonthlyApprovalExecutor({ store, execute: async () => { throw new Error("response lost") } })
    await expect(first.run(input)).rejects.toThrow("response lost")
    const reopenedStore = createStore(storage)
    const states: string[] = []
    const retry = createMonthlyApprovalExecutor({ store: reopenedStore, execute: async () => validResult(), onState: state => states.push(state) })
    expect(retry.record?.ambiguous).toBe(true)
    expect(states).toEqual(["uncertain"])
    const changed = { ...input, months: [{ ...input.months[0]!, amount: "9999.00", unallocatedAmount: "9999.00" }] }
    await expect(retry.run(changed)).rejects.toThrow(/stored monthly approval intent/i)
    await expect(retry.run(input)).resolves.toEqual(validResult())
    expect(reopenedStore.load()).toBeNull()
  })

  it("retires a stale recovered executor after another tab confirms and clears the intent", async () => {
    const storage = new MemoryStorage()
    const firstStore = createStore(storage)
    firstStore.save({ version: 1, ...scope, employeeId: input.employeeId, requestId: input.requestId, payload: input, ambiguous: true })
    const confirmed = createMonthlyApprovalExecutor({ store: firstStore, execute: async () => validResult() })
    const sendFromStaleTab = vi.fn(async () => validResult())
    const states: string[] = []
    const stale = createMonthlyApprovalExecutor({ store: createStore(storage), execute: sendFromStaleTab, onState: state => states.push(state) })
    await expect(confirmed.run(input)).resolves.toEqual(validResult())
    expect(firstStore.load()).toBeNull()
    await expect(stale.run(input)).rejects.toThrow(/no longer pending|reload/i)
    await expect(stale.run(input)).rejects.toThrow(/reload/i)
    expect(sendFromStaleTab).not.toHaveBeenCalled()
    expect(firstStore.load()).toBeNull()
    expect(stale.record).toBeNull()
    expect(states).not.toContain("approved")
  })

  it("clears a definitive first rejection but keeps a reloaded retry ambiguous", async () => {
    const storage = new MemoryStorage()
    const firstStore = createStore(storage)
    const definitive = new ORPCError("BAD_REQUEST", { message: "invalid request" })
    const first = createMonthlyApprovalExecutor({ store: firstStore, execute: async () => { throw definitive } })
    await expect(first.run(input)).rejects.toBe(definitive)
    expect(first.record).toBeNull()
    expect(firstStore.load()).toBeNull()

    const uncertain = createMonthlyApprovalExecutor({ store: createStore(storage), execute: async () => { throw new Error("response lost") } })
    await expect(uncertain.run(input)).rejects.toThrow("response lost")
    const retryStore = createStore(storage)
    const retry = createMonthlyApprovalExecutor({ store: retryStore, execute: async () => { throw definitive } })
    await expect(retry.run(input)).rejects.toBe(definitive)
    expect(retry.record?.ambiguous).toBe(true)
    expect(retryStore.load()?.requestId).toBe(input.requestId)
  })

  it("refuses foreign, malformed, and mismatched recovery envelopes", () => {
    const storage = new MemoryStorage()
    const first = createStore(storage)
    first.save({ version: 1, ...scope, employeeId: input.employeeId, requestId: input.requestId, payload: input, ambiguous: false })
    expect(() => createStore(storage, "user-b").load()).not.toThrow()
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

  it("refuses a different request when saving or clearing the durable intent", () => {
    const storage = new MemoryStorage()
    const store = createStore(storage)
    const pending = { version: 1 as const, ...scope, employeeId: input.employeeId, requestId: input.requestId, payload: input, ambiguous: true }
    const different = { ...pending, requestId: "approval-2", payload: { ...input, requestId: "approval-2" } }
    store.save(pending)

    expect(() => store.save(different)).toThrow(/stored monthly approval intent/i)
    expect(() => store.clear(different)).toThrow(/different monthly approval intent/i)
    expect(store.load()?.requestId).toBe(input.requestId)
  })

  it("fails closed without sending when the browser has no cross-tab lock manager", async () => {
    vi.stubGlobal("navigator", {})
    try {
      const execute = vi.fn()
      const runner = createMonthlyApprovalExecutor({ store: browserMonthlyApprovalStore(scope.workspaceId, scope.userId), execute })
      await expect(runner.run(input)).rejects.toThrow(/coordination is unavailable/i)
      expect(execute).not.toHaveBeenCalled()
    } finally { vi.unstubAllGlobals() }
  })

  it("rejects same-tick duplicate sends and preserves a bad post-commit response as uncertain", async () => {
    const storage = new MemoryStorage()
    const store = createStore(storage)
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
    const store = createStore(storage)
    const runner = createMonthlyApprovalExecutor({ store, execute: async () => validResult() })
    storage.failRemove = true
    await expect(runner.run(input)).rejects.toThrow("storage clear failed")
    expect(runner.record?.ambiguous).toBe(true)
    expect(store.load()?.payload).toEqual(normalizedInput)
  })

  it("does not let a second pre-opened executor replace or clear an uncertain approval", async () => {
    const storage = new MemoryStorage()
    const firstStore = createStore(storage)
    const secondStore = createStore(storage)
    const first = createMonthlyApprovalExecutor({ store: firstStore, execute: async () => { throw new Error("response lost") } })
    const secondExecute = vi.fn(async () => validResult())
    const second = createMonthlyApprovalExecutor({ store: secondStore, execute: secondExecute })
    const otherInput = { ...input, requestId: "approval-2", months: [{ ...input.months[0]!, amount: "20000", unallocatedAmount: "20000" }] }

    await expect(first.run(input)).rejects.toThrow("response lost")
    await expect(second.run(otherInput)).rejects.toThrow(/stored monthly approval intent/i)
    expect(secondExecute).not.toHaveBeenCalled()
    expect(second.record?.requestId).toBe(input.requestId)
    expect(firstStore.load()?.requestId).toBe(input.requestId)
  })

  it("serializes overlapping executors and reloads shared intent after the first response is lost", async () => {
    const storage = new MemoryStorage()
    const firstStore = createStore(storage)
    const secondStore = createStore(storage)
    let markEntered = () => {}
    const entered = new Promise<void>(resolve => { markEntered = resolve })
    let loseResponse = () => {}
    const responseLost = new Promise<never>((_, reject) => { loseResponse = () => reject(new Error("response lost")) })
    const firstExecute = vi.fn(async () => { markEntered(); return responseLost })
    const secondExecute = vi.fn(async () => validResult())
    const first = createMonthlyApprovalExecutor({ store: firstStore, execute: firstExecute })
    const second = createMonthlyApprovalExecutor({ store: secondStore, execute: secondExecute })
    const otherInput = { ...input, requestId: "approval-2", months: [{ ...input.months[0]!, amount: "20000", unallocatedAmount: "20000" }] }

    const firstRun = first.run(input)
    await entered
    const secondRun = second.run(otherInput)
    expect(secondExecute).not.toHaveBeenCalled()
    loseResponse()
    await expect(firstRun).rejects.toThrow("response lost")
    await expect(secondRun).rejects.toThrow(/stored monthly approval intent/i)
    expect(secondExecute).not.toHaveBeenCalled()
    expect(second.record?.requestId).toBe(input.requestId)
    expect(second.retired).toBe(true)
    await expect(second.run(otherInput)).rejects.toThrow(/reload/i)
    firstStore.clear(firstStore.load()!)
    await expect(second.run(otherInput)).rejects.toThrow(/reload/i)
    expect(secondExecute).not.toHaveBeenCalled()
    expect(firstStore.load()).toBeNull()
  })
})
