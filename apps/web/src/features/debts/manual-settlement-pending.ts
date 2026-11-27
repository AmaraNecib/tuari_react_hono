import { confirmManualSettlementSchema, reverseManualSettlementSchema, type ConfirmManualSettlement, type ReverseManualSettlement } from "@tuari/contracts"
export type PendingSettlement = { kind: "confirm"; input: ConfirmManualSettlement } | { kind: "reverse"; input: ReverseManualSettlement }
type StoragePort = Pick<Storage, "getItem" | "setItem" | "removeItem">
export type SettlementStorageScope = "manual" | "experimental"
const key = (owner: string, party: string, scope: SettlementStorageScope) => JSON.stringify([scope === "manual" ? "manual-settlement-v1" : "experimental-settlement-v1", owner, party])
function validate(value: unknown): PendingSettlement {
  if (!value || typeof value !== "object" || !("kind" in value) || !("input" in value)) throw new Error("Invalid pending settlement")
  if (value.kind === "confirm") return { kind: "confirm", input: confirmManualSettlementSchema.parse(value.input) }
  if (value.kind === "reverse") return { kind: "reverse", input: reverseManualSettlementSchema.parse(value.input) }
  throw new Error("Invalid pending settlement")
}
export function loadPendingSettlement(storage: StoragePort, owner: string, party: string, scope: SettlementStorageScope = "manual"): PendingSettlement | null {
  const raw = storage.getItem(key(owner, party, scope))
  if (!raw) return null
  const envelope = JSON.parse(raw)
  if (envelope.owner !== owner || envelope.party !== party || (envelope.scope ?? "manual") !== scope) throw new Error("Pending settlement identity mismatch")
  const pending = validate(envelope.pending)
  if (pending.kind === "confirm" && pending.input.externalCounterpartyId !== party) throw new Error("Pending settlement party mismatch")
  return pending
}
export function savePendingSettlement(storage: StoragePort, owner: string, party: string, value: PendingSettlement, scope: SettlementStorageScope = "manual"): void {
  const pending = validate(value)
  if (pending.kind === "confirm" && pending.input.externalCounterpartyId !== party) throw new Error("Pending settlement party mismatch")
  const current = loadPendingSettlement(storage, owner, party, scope)
  if (current && JSON.stringify(current) !== JSON.stringify(pending)) throw new Error("Another settlement intent owns this slot")
  storage.setItem(key(owner, party, scope), JSON.stringify({ owner, party, scope, pending }))
}
export function clearPendingSettlement(storage: StoragePort, owner: string, party: string, expected: PendingSettlement, scope: SettlementStorageScope = "manual"): boolean {
  const current = loadPendingSettlement(storage, owner, party, scope)
  if (!current || JSON.stringify(current) !== JSON.stringify(validate(expected))) return false
  storage.removeItem(key(owner, party, scope))
  return true
}
export function isDefiniteSettlementRefusal(error: unknown): boolean {
  return typeof error === "object" && error !== null && "data" in error && typeof error.data === "object" && error.data !== null && "manualSettlementOutcome" in error.data && error.data.manualSettlementOutcome === "UNCOMMITTED"
}
