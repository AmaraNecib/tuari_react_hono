import { confirmManualSettlementSchema, reverseManualSettlementSchema, type ConfirmManualSettlement, type ReverseManualSettlement } from "@tuari/contracts"
export type PendingSettlement = { kind: "confirm"; input: ConfirmManualSettlement } | { kind: "reverse"; input: ReverseManualSettlement }
type StoragePort = Pick<Storage, "getItem" | "setItem" | "removeItem">
const key = (owner: string, party: string) => JSON.stringify(["manual-settlement-v1", owner, party])
function validate(value: unknown): PendingSettlement {
  if (!value || typeof value !== "object" || !("kind" in value) || !("input" in value)) throw new Error("Invalid pending settlement")
  if (value.kind === "confirm") return { kind: "confirm", input: confirmManualSettlementSchema.parse(value.input) }
  if (value.kind === "reverse") return { kind: "reverse", input: reverseManualSettlementSchema.parse(value.input) }
  throw new Error("Invalid pending settlement")
}
export function loadPendingSettlement(storage: StoragePort, owner: string, party: string): PendingSettlement | null {
  const raw = storage.getItem(key(owner, party))
  if (!raw) return null
  const envelope = JSON.parse(raw)
  if (envelope.owner !== owner || envelope.party !== party) throw new Error("Pending settlement identity mismatch")
  const pending = validate(envelope.pending)
  if (pending.kind === "confirm" && pending.input.externalCounterpartyId !== party) throw new Error("Pending settlement party mismatch")
  return pending
}
export function savePendingSettlement(storage: StoragePort, owner: string, party: string, value: PendingSettlement): void {
  const pending = validate(value)
  if (pending.kind === "confirm" && pending.input.externalCounterpartyId !== party) throw new Error("Pending settlement party mismatch")
  storage.setItem(key(owner, party), JSON.stringify({ owner, party, pending }))
}
export function clearPendingSettlement(storage: StoragePort, owner: string, party: string): void { storage.removeItem(key(owner, party)) }
export function isDefiniteSettlementRefusal(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && ["BAD_REQUEST", "FORBIDDEN", "UNAUTHORIZED", "CONFLICT", "NOT_FOUND", "SERVICE_UNAVAILABLE", "UPGRADE_REQUIRED"].includes(String(error.code))
}
