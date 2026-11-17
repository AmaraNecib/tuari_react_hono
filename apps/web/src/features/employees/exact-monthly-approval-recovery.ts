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

export interface MonthlyApprovalCoordination {
  runExclusive<T>(name: string, operation: () => Promise<T>): Promise<T>
}

function browserMonthlyApprovalCoordination(): MonthlyApprovalCoordination {
  return { runExclusive<T>(name: string, operation: () => Promise<T>): Promise<T> {
    const locks = typeof navigator === "undefined" ? undefined : navigator.locks
    if (!locks) throw new Error("Reliable monthly approval coordination is unavailable")
    // Web Locks await callback promises, but this DOM declaration types only synchronous callback values.
    return locks.request(name, { mode: "exclusive" }, operation) as unknown as Promise<T>
  } }
}

export function withMonthlyApprovalIdentityLock<T>(userId: string, operation: () => Promise<T>, coordination: MonthlyApprovalCoordination = browserMonthlyApprovalCoordination()): Promise<T> {
  return coordination.runExclusive(`tuari:slice543:monthly-approval:v1:user:${encodeURIComponent(userId)}:identity`, operation)
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

export function createMonthlyApprovalStore(storage: MonthlyApprovalStorage, workspaceId: string, userId: string, coordination: MonthlyApprovalCoordination = browserMonthlyApprovalCoordination()) {
  const scope = z.object({ workspaceId: z.uuid(), userId: id }).strict().parse({ workspaceId, userId })
  const key = storageKey(scope.workspaceId, scope.userId)
  const identity = (record: MonthlyApprovalRecord) => canonical({ employeeId: record.employeeId, requestId: record.requestId, payload: record.payload })
  const read = (): MonthlyApprovalRecord | null => {
    const raw = storage.getItem(key)
    if (raw === null) return null
    const record = parseRecord(JSON.parse(raw))
    if (record.workspaceId !== scope.workspaceId || record.userId !== scope.userId) throw new Error("Monthly approval recovery scope mismatch")
    if (record.employeeId !== record.payload.employeeId || record.requestId !== record.payload.requestId) throw new Error("Monthly approval recovery envelope mismatch")
    return { ...record, ambiguous: true }
  }
  return {
    ...scope,
    runExclusive<T>(operation: () => Promise<T>): Promise<T> { return withMonthlyApprovalIdentityLock(scope.userId, operation, coordination) },
    load(): MonthlyApprovalRecord | null { return read() },
    save(record: MonthlyApprovalRecord): void {
      const checked = parseRecord(record)
      if (checked.workspaceId !== scope.workspaceId || checked.userId !== scope.userId) throw new Error("Monthly approval recovery scope mismatch")
      if (checked.employeeId !== checked.payload.employeeId || checked.requestId !== checked.payload.requestId) throw new Error("Monthly approval recovery envelope mismatch")
      const existing = read()
      if (existing && identity(existing) !== identity(checked)) throw new Error("Resolve the stored monthly approval intent before changing it")
      storage.setItem(key, canonical({ ...checked, payload: checked.payload }))
    },
    clear(expected: MonthlyApprovalRecord): void {
      const checked = parseRecord(expected)
      if (checked.workspaceId !== scope.workspaceId || checked.userId !== scope.userId) throw new Error("Monthly approval recovery scope mismatch")
      if (checked.employeeId !== checked.payload.employeeId || checked.requestId !== checked.payload.requestId) throw new Error("Monthly approval recovery envelope mismatch")
      const existing = read()
      if (!existing) return
      if (identity(existing) !== identity(checked)) throw new Error("Refusing to clear a different monthly approval intent")
      storage.removeItem(key)
    },
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
  let retired = false
  const notify = (state: "idle" | "pending" | "uncertain" | "approved") => {
    try { options.onState?.(state) } catch { /* UI state cannot change a durable command result. */ }
  }
  if (record) notify("uncertain")

  return {
    get record() { return record },
    async run(payload: ExactSalaryMonthlyApprovalInput): Promise<TResult> {
      if (retired) throw new Error("Monthly approval is no longer pending; reload before continuing")
      if (inFlight) throw new Error("Monthly approval is already in flight")
      const normalized = normalizePayload(payload)
      if (record && (record.employeeId !== normalized.employeeId || record.requestId !== normalized.requestId || canonical(record.payload) !== canonical(normalized))) {
        throw new Error("Resolve the stored monthly approval intent before changing it")
      }
      inFlight = true
      notify("pending")
      try {
        return await options.store.runExclusive(async () => {
          const durable = options.store.load()
          if (!durable && record) {
            // A second tab resolved this intent. Memory must not recreate its fence.
            record = null
            retired = true
            notify("idle")
            throw new Error("Monthly approval is no longer pending; reload before continuing")
          }
          if (durable) {
            record = durable
            if (durable.employeeId !== normalized.employeeId || durable.requestId !== normalized.requestId || canonical(durable.payload) !== canonical(normalized)) {
              notify("uncertain")
              throw new Error("Resolve the stored monthly approval intent before changing it")
            }
          }
          const current: MonthlyApprovalRecord = durable ?? record ?? {
            version: 1,
            workspaceId: options.store.workspaceId,
            userId: options.store.userId,
            employeeId: normalized.employeeId,
            requestId: normalized.requestId,
            payload: normalized,
            ambiguous: false,
          }
          if (!durable) options.store.save(current)
          record = current
          try {
            const raw = await options.execute(structuredClone(current.payload))
            const result = exactSalaryMonthlyApprovalResultSchema.parse(raw) as TResult
            options.store.clear(current)
            record = null
            retired = true
            notify("approved")
            return result
          } catch (error) {
            const definitiveFirstRejection = !current.ambiguous && error instanceof ORPCError && ["BAD_REQUEST", "NOT_FOUND", "UNAUTHORIZED", "FORBIDDEN", "CONFLICT"].includes(error.code)
            if (definitiveFirstRejection) {
              try { options.store.clear(current); record = null; notify("idle") }
              catch { record = { ...current, ambiguous: true }; notify("uncertain") }
            } else {
              const sticky = { ...current, ambiguous: true }
              try { options.store.save(sticky) } catch { /* The existing durable intent still fences retry. */ }
              record = sticky
              notify("uncertain")
            }
            throw error
          }
        })
      } catch (error) {
        if (record) notify("uncertain")
        throw error
      } finally { inFlight = false }
    },
  }
}
