import { afterEach, expect, it, vi } from "vitest"
import { saveAccountWithoutPendingApproval } from "./approval-account-fence"
const mocks = vi.hoisted(() => ({ load: vi.fn() }))
vi.mock("@/features/employees/exact-monthly-approval-recovery", () => ({ browserMonthlyApprovalStore: () => ({ load: mocks.load }) }))
afterEach(() => vi.clearAllMocks())
const scope = { workspaceId: "10000000-0000-4000-8000-000000000001", userId: "owner" }

it("refuses account changes if a different tab or page has left unresolved approval intent", async () => {
  mocks.load.mockReturnValue({ requestId: "original-approval" })
  const save = vi.fn(async () => undefined)
  await expect(saveAccountWithoutPendingApproval(scope, "Resolve approval first", save)).rejects.toThrow("Resolve approval first")
  expect(save).not.toHaveBeenCalled()
  expect(mocks.load).toHaveBeenCalledOnce()
})

it("fails closed for unreadable recovery instead of renaming the approval actor", async () => {
  mocks.load.mockImplementation(() => { throw new Error("Unreadable recovery") })
  const save = vi.fn(async () => undefined)
  await expect(saveAccountWithoutPendingApproval(scope, "Resolve approval first", save)).rejects.toThrow("Unreadable recovery")
  expect(save).not.toHaveBeenCalled()
})

it("allows settings changes once the stored approval is resolved", async () => {
  mocks.load.mockReturnValue(null)
  const save = vi.fn(async () => "saved")
  await expect(saveAccountWithoutPendingApproval(scope, "Resolve approval first", save)).resolves.toBe("saved")
  expect(save).toHaveBeenCalledOnce()
})
