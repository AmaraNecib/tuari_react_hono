import { expect, it, vi } from "vitest"
import { saveAccountWithoutAnyPendingApproval } from "./approval-account-fence"
vi.mock("@/features/employees/exact-monthly-approval-recovery", () => ({ withMonthlyApprovalIdentityLock: async (_user: string, run: () => Promise<unknown>) => run() }))
const key = "tuari:slice543:monthly-approval:v1:workspace:owner"

it("refuses account changes for malformed but durable intent without trying to erase it", async () => {
  const storage = { length: 1, key: () => key, getItem: () => "malformed intent" }
  const save = vi.fn(async () => undefined)
  await expect(saveAccountWithoutAnyPendingApproval("owner", "Resolve approval first", save, storage)).rejects.toThrow("Resolve approval first")
  expect(save).not.toHaveBeenCalled()
})

it("fails closed for unreadable recovery storage instead of renaming the approval actor", async () => {
  const storage = { length: 1, key: () => key, getItem: () => { throw new Error("Storage unavailable") } }
  const save = vi.fn(async () => undefined)
  await expect(saveAccountWithoutAnyPendingApproval("owner", "Resolve approval first", save, storage)).rejects.toThrow("Storage unavailable")
  expect(save).not.toHaveBeenCalled()
})

it("allows changes after resolution and ignores unrelated localStorage records", async () => {
  const storage = { length: 1, key: () => "unrelated:owner", getItem: () => "unrelated" }
  const save = vi.fn(async () => "saved")
  await expect(saveAccountWithoutAnyPendingApproval("owner", "Resolve approval first", save, storage)).resolves.toBe("saved")
  expect(save).toHaveBeenCalledOnce()
})
