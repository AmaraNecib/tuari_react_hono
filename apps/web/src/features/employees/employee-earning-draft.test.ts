import { describe, expect, it } from "vitest"

import {
  editEarningDraftRow,
  finalizeEmployeeEarningDraft,
  loadPendingEmployeeEarning,
  markEmployeeEarningPending,
  removePendingEmployeeEarning,
  type EmployeeEarningDraft,
} from "./employee-earning-draft"

const draft: EmployeeEarningDraft = {
  employeeId: "employee-1",
  periodStart: "2026-04-01T00:00:00.000Z",
  periodEnd: "2026-04-26T00:00:00.000Z",
  totalAmountText: "62,500",
  unallocatedAmountText: "0",
  referenceSalary: { period: "MONTHLY", amount: "30,000" },
  rows: [
    { id: "row-a1", projectId: "project-a", daysText: "5", amountText: "10,000" },
    { id: "row-b", projectId: "project-b", daysText: "15", amountText: "37,500" },
    { id: "row-a2", projectId: "project-a", daysText: "5", amountText: "15,000" },
  ],
}

function memoryStorage() {
  const values = new Map<string, string>()
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  }
}

const identity = { userId: "user-1", workspaceId: "workspace-1", employeeId: "employee-1" }

describe("employee earning draft interface", () => {
  it("finalizes ordered A/B/A rows exactly and edits only the addressed row", () => {
    const result = finalizeEmployeeEarningDraft(draft, () => "d0f2fd98-5ca5-49ae-9074-b139df26614d")
    expect(result.issues).toEqual([])
    expect(result.payload).toEqual({
      employeeId: "employee-1", requestId: "d0f2fd98-5ca5-49ae-9074-b139df26614d",
      periodStart: "2026-04-01T00:00:00.000Z", periodEnd: "2026-04-26T00:00:00.000Z", currencyCode: "DZD",
      totalAmount: "62500.00", unallocatedAmount: "0.00", referenceSalary: { period: "MONTHLY", amount: "30000.00" },
      segments: [
        { id: "row-a1", projectId: "project-a", days: 5, amount: "10000.00" },
        { id: "row-b", projectId: "project-b", days: 15, amount: "37500.00" },
        { id: "row-a2", projectId: "project-a", days: 5, amount: "15000.00" },
      ],
    })
    const edited = editEarningDraftRow(draft, "row-b", { amountText: "35,000" })
    expect(edited.rows.map(row => [row.id, row.amountText])).toEqual([
      ["row-a1", "10,000"], ["row-b", "35,000"], ["row-a2", "15,000"],
    ])
    expect(draft.totalAmountText).toBe("62,500")
    expect(draft.unallocatedAmountText).toBe("0")
  })

  it("reports whole-day, exact-amount and conservation failures at useful paths", () => {
    const result = finalizeEmployeeEarningDraft({
      ...draft,
      rows: [{ ...draft.rows[0]!, daysText: "1.5", amountText: "1.001" }],
    }, () => "d0f2fd98-5ca5-49ae-9074-b139df26614d")
    expect(result.payload).toBeNull()
    expect(result.issues).toEqual(expect.arrayContaining([
      { path: ["rows", "row-a1", "daysText"], message: "workforce.validation.earning.daysPositive" },
      { path: ["rows", "row-a1", "amountText"], message: expect.any(String) },
      { path: ["totalAmountText"], message: "workforce.validation.earning.conservation" },
    ]))
  })

  it("replays frozen payload identity after close/reopen and keeps it isolated", () => {
    const storage = memoryStorage()
    const pending = markEmployeeEarningPending(draft, identity, storage, () => "d0f2fd98-5ca5-49ae-9074-b139df26614d")
    expect(pending).toEqual({ ok: true, payload: expect.objectContaining({ requestId: "d0f2fd98-5ca5-49ae-9074-b139df26614d" }) })
    if (!pending.ok) throw new Error("Expected a pending approval")
    const reopened = loadPendingEmployeeEarning(identity, storage)
    expect(reopened).toEqual({ ok: true, pending: expect.objectContaining({ payload: pending.payload }) })
    expect(markEmployeeEarningPending({ ...draft, totalAmountText: "1" }, identity, storage, () => "f60d08ef-79d6-4e10-9555-a7e4e84ac84a")).toEqual(pending)
    expect(loadPendingEmployeeEarning({ ...identity, employeeId: "employee-2" }, storage)).toEqual({ ok: true, pending: null })
    expect(loadPendingEmployeeEarning({ ...identity, userId: "user-2" }, storage)).toEqual({ ok: true, pending: null })
    expect(loadPendingEmployeeEarning({ ...identity, workspaceId: "workspace-2" }, storage)).toEqual({ ok: true, pending: null })
    removePendingEmployeeEarning(identity, storage)
    expect(loadPendingEmployeeEarning(identity, storage)).toEqual({ ok: true, pending: null })
  })

  it("refuses malformed or version-mismatched pending data", () => {
    const storage = memoryStorage()
    const key = "employee-earning-pending:v1:user-1:workspace-1:employee-1"
    storage.setItem(key, "{broken")
    expect(loadPendingEmployeeEarning(identity, storage)).toMatchObject({ ok: false })
    storage.setItem(key, JSON.stringify({ version: 9 }))
    expect(loadPendingEmployeeEarning(identity, storage)).toMatchObject({ ok: false })
  })
})
