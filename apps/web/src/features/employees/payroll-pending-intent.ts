import {
  employeePayrollAdvanceOffsetInputSchema,
  employeePayrollAdvanceRepayInputSchema,
  employeePayrollCashRecordInputSchema,
  type EmployeePayrollAdvanceOffsetInput,
  type EmployeePayrollAdvanceRepayInput,
  type EmployeePayrollCashRecordInput,
} from "@tuari/contracts"

export type PayrollAction = "cash" | "repay" | "offset"
export type PayrollPayloadByAction = {
  cash: EmployeePayrollCashRecordInput
  repay: EmployeePayrollAdvanceRepayInput
  offset: EmployeePayrollAdvanceOffsetInput
}
export type PayrollIdentity = { userId: string; workspaceId: string; employeeId: string }
export type PayrollPendingIntent<A extends PayrollAction = PayrollAction> = A extends PayrollAction ? {
  version: 1
  action: A
  identity: PayrollIdentity
  payload: PayrollPayloadByAction[A]
} : never
export type PayrollStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">

const schemas = {
  cash: employeePayrollCashRecordInputSchema,
  repay: employeePayrollAdvanceRepayInputSchema,
  offset: employeePayrollAdvanceOffsetInputSchema,
} as const

const storageKey = (action: PayrollAction, identity: PayrollIdentity) =>
  `employee-payroll-pending:v1:${action}:${encodeURIComponent(identity.userId)}:${encodeURIComponent(identity.workspaceId)}:${encodeURIComponent(identity.employeeId)}`

function matchesIdentity(value: unknown, identity: PayrollIdentity): value is PayrollIdentity {
  if (!value || typeof value !== "object") return false
  const candidate = value as PayrollIdentity
  return candidate.userId === identity.userId && candidate.workspaceId === identity.workspaceId && candidate.employeeId === identity.employeeId
}

export type PayrollPendingLoad = { ok: true; pending: PayrollPendingIntent | null } | { ok: false }

export function loadPayrollPendingIntent<A extends PayrollAction>(
  action: A,
  identity: PayrollIdentity,
  storage: PayrollStorage,
): { ok: true; pending: PayrollPendingIntent<A> | null } | { ok: false } {
  const raw = storage.getItem(storageKey(action, identity))
  if (raw === null) return { ok: true, pending: null }
  try {
    const entry = JSON.parse(raw) as Partial<PayrollPendingIntent<A>>
    if (entry.version !== 1 || entry.action !== action || !matchesIdentity(entry.identity, identity)) return { ok: false }
    const parsed = schemas[action].safeParse(entry.payload)
    if (!parsed.success || parsed.data.employeeId !== identity.employeeId) return { ok: false }
    return { ok: true, pending: { version: 1, action, identity, payload: parsed.data } as PayrollPendingIntent<A> }
  } catch {
    return { ok: false }
  }
}

export function savePayrollPendingIntent<A extends PayrollAction>(
  action: A,
  identity: PayrollIdentity,
  payload: PayrollPayloadByAction[A],
  storage: PayrollStorage,
): PayrollPendingIntent<A> {
  if (payload.employeeId !== identity.employeeId) throw new TypeError("Payroll employee does not match pending identity")
  const parsed = schemas[action].parse(payload)
  const intent = { version: 1 as const, action, identity, payload: parsed } as PayrollPendingIntent<A>
  storage.setItem(storageKey(action, identity), JSON.stringify(intent))
  return intent
}

/** Remove only the intent whose write received this response. */
export function clearPayrollPendingIntent<A extends PayrollAction>(
  action: A,
  identity: PayrollIdentity,
  requestId: string,
  storage: PayrollStorage,
): boolean {
  const current = loadPayrollPendingIntent(action, identity, storage)
  if (!current.ok || current.pending?.payload.requestId !== requestId) return false
  storage.removeItem(storageKey(action, identity))
  return true
}

export function getPayrollStorage(): PayrollStorage | null {
  try { return typeof window === "undefined" ? null : window.localStorage }
  catch { return null }
}

export function createPayrollRequestId(): string {
  return crypto.randomUUID()
}
