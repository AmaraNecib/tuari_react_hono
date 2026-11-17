// @vitest-environment jsdom
import { waitFor } from "@testing-library/react"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { browserMonthlyApprovalStore, createMonthlyApprovalExecutor } from "@/features/employees/exact-monthly-approval-recovery"
import { saveAccountWithoutAnyPendingApproval } from "./approval-account-fence"
import { createKeyedAsyncTestLock } from "@/test-utils/keyed-async-test-lock"

const user = "shared-owner"
const workspace = "11111111-1111-4111-8111-111111111111"
const input = { requestId: "approval-1", employeeId: "worker", currency: "DZD" as const, months: [{ id: "m", month: "2026-10", amount: "10000", unallocatedAmount: "10000", segments: [] }] }
beforeEach(() => {
  localStorage.clear()
  const runExclusive = createKeyedAsyncTestLock()
  vi.stubGlobal("navigator", { locks: { request: (name: string, _options: unknown, operation: () => Promise<unknown>) => runExclusive(name, operation) } })
})
afterEach(() => vi.unstubAllGlobals())

it("queues an account rename behind an in-flight approval, then refuses its uncertain durable intent", async () => {
  let fail!: (error: Error) => void
  const execute = vi.fn(() => new Promise((_resolve, reject) => { fail = reject }))
  const runner = createMonthlyApprovalExecutor({ store: browserMonthlyApprovalStore(workspace, user), execute })
  const approval = runner.run(input).catch(error => error)
  await waitFor(() => expect(execute).toHaveBeenCalledOnce())
  const save = vi.fn(async () => undefined)
  const account = saveAccountWithoutAnyPendingApproval(user, "Resolve approval", save).catch(error => error)
  expect(save).not.toHaveBeenCalled()
  fail(new Error("Lost approval response"))
  expect(await approval).toBeInstanceOf(Error)
  expect(await account).toMatchObject({ message: "Resolve approval" })
  expect(save).not.toHaveBeenCalled()
  expect(browserMonthlyApprovalStore(workspace, user).load()?.requestId).toBe(input.requestId)
})

it("prevents a new approval from sending midway through an account identity update", async () => {
  let finish!: () => void
  const save = vi.fn(() => new Promise<void>(resolve => { finish = resolve }))
  const account = saveAccountWithoutAnyPendingApproval(user, "Resolve approval", save)
  await waitFor(() => expect(save).toHaveBeenCalledOnce())
  const execute = vi.fn(async () => { throw new Error("Lost response") })
  const runner = createMonthlyApprovalExecutor({ store: browserMonthlyApprovalStore(workspace, user), execute })
  const approval = runner.run(input).catch(error => error)
  expect(execute).not.toHaveBeenCalled()
  finish()
  await account
  expect(await approval).toBeInstanceOf(Error)
  expect(execute).toHaveBeenCalledOnce()
})
