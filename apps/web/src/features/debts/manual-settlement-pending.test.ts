import { expect, it } from "vitest"
import { loadPendingSettlement, savePendingSettlement, clearPendingSettlement, isDefiniteSettlementRefusal } from "./manual-settlement-pending"
const input = { requestId: "stable-1", externalCounterpartyId: "party", payableOriginalEntryId: "payable", receivableOriginalEntryId: "receivable", currency: "DZD" as const, amountDzd: "25.00", expectedPayableRemainingDzd: "100.00", expectedReceivableRemainingDzd: "60.00", note: "Optional" }
it("retains the complete uncertain intent across reload and isolates owner and party", () => {
  const storage = new Map<string, string>()
  const port = { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => { storage.set(key, value) }, removeItem: (key: string) => { storage.delete(key) } }
  savePendingSettlement(port, "owner", "party", { kind: "confirm", input })
  expect(loadPendingSettlement(port, "owner", "party")).toEqual({ kind: "confirm", input })
  expect(loadPendingSettlement(port, "other", "party")).toBeNull()
  expect(loadPendingSettlement(port, "owner", "other")).toBeNull()
  clearPendingSettlement(port, "owner", "party", { kind: "confirm", input })
  expect(loadPendingSettlement(port, "owner", "party")).toBeNull()
})
it("keeps experimental retry identity separate from manual-settlement storage", () => {
  const values = new Map<string, string>()
  const port = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value) }, removeItem: (key: string) => { values.delete(key) } }
  const intent = { kind: "confirm" as const, input }
  savePendingSettlement(port, "owner", "party", intent)
  expect(loadPendingSettlement(port, "owner", "party", "experimental")).toBeNull()
  savePendingSettlement(port, "owner", "party", intent, "experimental")
  expect(loadPendingSettlement(port, "owner", "party")).toEqual(intent)
  expect(loadPendingSettlement(port, "owner", "party", "experimental")).toEqual(intent)
  clearPendingSettlement(port, "owner", "party", intent, "experimental")
  expect(loadPendingSettlement(port, "owner", "party")).toEqual(intent)
})
it("keeps transport and server uncertainty distinct from definite refusals", () => {
  expect(isDefiniteSettlementRefusal(new TypeError("Failed to fetch"))).toBe(false)
  expect(isDefiniteSettlementRefusal({ code: "INTERNAL_SERVER_ERROR" })).toBe(false)
  expect(isDefiniteSettlementRefusal({ code: "TIMEOUT" })).toBe(false)
  for (const code of ["BAD_REQUEST", "FORBIDDEN", "UNAUTHORIZED", "CONFLICT", "NOT_FOUND", "UPGRADE_REQUIRED", "SERVICE_UNAVAILABLE"]) expect(isDefiniteSettlementRefusal({ code })).toBe(false)
  expect(isDefiniteSettlementRefusal({ code: "CONFLICT", data: { manualSettlementOutcome: "UNCOMMITTED" } })).toBe(true)
})
