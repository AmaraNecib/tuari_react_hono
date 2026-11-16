import { ORPCError } from "@orpc/client"
import { z } from "zod"
import { exactSalaryMonthlyApprovalInputSchema, exactSalaryMonthlyApprovalResultSchema, type ExactSalaryMonthlyApprovalInput } from "@tuari/contracts"

const id = z.string().min(1).max(256)
const recordSchema = z.object({
  version: z.literal(1),
  workspaceId: z.uuid(),
  userId: id,
  employeeId: id,
  requestId: id,
  payload: z.unknown(),
  ambiguous: z.boolean(),
}).strict()

export type MonthlyApprovalRecord = {
  version: 1
  workspaceId: string
  userId: string
  employeeId: string
  requestId: string
  payload: ExactSalaryMonthlyApprovalInput
  ambiguous: boolean
}

function normalizePayload(raw: unknown): ExactSalaryMonthlyApprovalInput {
  const parsed = exactSalaryMonthlyApprovalInputSchema.parse(raw)
  return {
    requestId: parsed.requestId,
    employeeId: parsed.employeeId,
    currency: parsed.currency,
    months: parsed.months.map(({ id, month, amount, unallocatedAmount, segments }) => ({ id, month, amount, unallocatedAmount, segments })),
  }
}
export interface MonthlyApprovalStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

function canonical(value: unknown): string {
  const encoded = JSON.stringify(value)
  if (encoded === undefined || JSON.stringify(JSON.parse(encoded)) !== encoded) throw new Error("Monthly approval intent is not stable JSON")
  return encoded
}

/** Existing v1 browser-storage protocol key. Keep it stable across application module renames so unresolved approvals remain recoverable. */
function storageKey(workspaceId: string, userId: string): string {
  return `tuari:slice543:monthly-approval:v1:${encodeURIComponent(workspaceId)}:${encodeURIComponent(userId)}`
}

function parseRecord(raw: unknown): MonthlyApprovalRecord {
  const parsed = recordSchema.parse(raw)
  return { ...parsed, payload: normalizePayload(parsed.payload) }
}

export function createMonthlyApprovalStore(storage: MonthlyApprovalStorage, workspaceId: string, userId: string) {
  const scope = z.object({ workspaceId: z.uuid(), userId: id }).strict().parse({ workspaceId, userId })
  const key = storageKey(scope.workspaceId, scope.userId)
  return {
    ...scope,
    load(): MonthlyApprovalRecord | null {
      const raw = storage.getItem(key)
      if (raw === null) return null
      const record = parseRecord(JSON.parse(raw))
      if (record.workspaceId !== scope.workspaceId || record.userId !== scope.userId) throw new Error("Monthly approval recovery scope mismatch")
      const payload = normalizePayload(record.payload)
      if (record.employeeId !== payload.employeeId || record.requestId !== payload.requestId) throw new Error("Monthly approval recovery envelope mismatch")
      const recovered = { ...record, payload, ambiguous: true }
      if (record.ambiguous !== true) storage.setItem(key, canonical(recovered))
      return recovered
    },
    save(record: MonthlyApprovalRecord): void {
      const checked = parseRecord(record)
      const payload = checked.payload
      if (checked.workspaceId !== scope.workspaceId || checked.userId !== scope.userId) throw new Error("Monthly approval recovery scope mismatch")
      if (checked.employeeId !== payload.employeeId || checked.requestId !== payload.requestId) throw new Error("Monthly approval recovery envelope mismatch")
      storage.setItem(key, canonical({ ...checked, payload }))
    },
    clear(): void { storage.removeItem(key) },
  }
}

export function browserMonthlyApprovalStore(workspaceId: string, userId: string) {
  if (typeof window === "undefined" || !window.localStorage) throw new Error("Durable monthly approval storage is unavailable")
  return createMonthlyApprovalStore(window.localStorage, workspaceId, userId)
}

export function createMonthlyApprovalExecutor<TResult = z.output<typeof exactSalaryMonthlyApprovalResultSchema>>(options: {
  store: ReturnType<typeof createMonthlyApprovalStore>
  execute: (payload: ExactSalaryMonthlyApprovalInput) => Promise<unknown>
  onState?: (state: "idle" | "pending" | "uncertain" | "approved") => void
}) {
  let record: MonthlyApprovalRecord | null
  try { record = options.store.load() }
  catch (error) { try { options.onState?.("uncertain") } catch { /* Storage errors stay authoritative. */ }; throw error }
  let inFlight = false
  const notify = (state: "idle" | "pending" | "uncertain" | "approved") => {
    try { options.onState?.(state) } catch { /* UI state cannot change a durable command result. */ }
  }
  if (record) notify("uncertain")

  return {
    get record() { return record },
    async run(payload: ExactSalaryMonthlyApprovalInput): Promise<TResult> {
      if (inFlight) throw new Error("Monthly approval is already in flight")
      const normalized = normalizePayload(payload)
      if (record && (record.employeeId !== normalized.employeeId || record.requestId !== normalized.requestId || canonical(record.payload) !== canonical(normalized))) {
        throw new Error("Resolve the stored monthly approval intent before changing it")
      }
      const current: MonthlyApprovalRecord = record ?? {
        version: 1,
        workspaceId: options.store.workspaceId,
        userId: options.store.userId,
        employeeId: normalized.employeeId,
        requestId: normalized.requestId,
        payload: normalized,
        ambiguous: false,
      }
      inFlight = true
      notify("pending")
      try {
        if (!record) {
          options.store.save(current)
          record = current
        }
        const raw = await options.execute(structuredClone(current.payload))
        const result = exactSalaryMonthlyApprovalResultSchema.parse(raw) as TResult
        options.store.clear()
        record = null
        notify("approved")
        return result
      } catch (error) {
        const definitiveFirstRejection = !current.ambiguous && error instanceof ORPCError && ["BAD_REQUEST", "NOT_FOUND", "UNAUTHORIZED", "FORBIDDEN", "CONFLICT"].includes(error.code)
        if (definitiveFirstRejection) {
          try { options.store.clear(); record = null; notify("idle") }
          catch { record = current; notify("uncertain") }
        } else {
          const sticky = { ...current, ambiguous: true }
          try { options.store.save(sticky) } catch { /* The original durable record still fences retry. */ }
          record = sticky
          notify("uncertain")
        }
        throw error
      } finally { inFlight = false }
    },
  }
}
