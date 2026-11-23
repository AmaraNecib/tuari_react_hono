import type { EmployeeEarningApprovalInput } from "@tuari/contracts"
import { employeeEarningApprovalInputSchema } from "@tuari/contracts"

import { parseLocalizedMoneyInput, parseLocalizedUnitPriceInput } from "@/features/shared/exact-money-input"

export type EmployeeEarningDraftRow = { id: string; projectId: string; daysText: string; amountText: string }
export type EmployeeEarningDraft = {
  employeeId: string
  periodStart: string
  periodEnd: string
  totalAmountText: string
  unallocatedAmountText: string
  rows: EmployeeEarningDraftRow[]
  referenceSalary?: { period: "DAILY" | "WEEKLY" | "MONTHLY"; amount: string } | null
}
export type FinalizedEmployeeEarningApproval = EmployeeEarningApprovalInput
export type EarningDraftIssue = { path: (string | number)[]; message: string }
export type FinalizeEarningDraftResult = { payload: FinalizedEmployeeEarningApproval | null; issues: EarningDraftIssue[] }

function wireMoney(text: string) {
  return parseLocalizedMoneyInput(text).toWire()
}

export function editEarningDraftRow(draft: EmployeeEarningDraft, rowId: string, patch: Partial<Omit<EmployeeEarningDraftRow, "id">>): EmployeeEarningDraft {
  return { ...draft, rows: draft.rows.map(row => row.id === rowId ? { ...row, ...patch } : row) }
}

export function finalizeEmployeeEarningDraft(draft: EmployeeEarningDraft, newRequestId: () => string): FinalizeEarningDraftResult {
  const issues: EarningDraftIssue[] = []
  const totalPath = ["totalAmountText"]
  let totalAmount: string | null = null
  let unallocatedAmount: string | null = null
  try { totalAmount = wireMoney(draft.totalAmountText) } catch {
    issues.push({
      path: totalPath,
      message: draft.totalAmountText.trim() ? "workforce.validation.earning.positiveTotal" : "workforce.validation.earning.totalRequired",
    })
  }
  if (totalAmount !== null) {
    try { unallocatedAmount = wireMoney(draft.unallocatedAmountText) } catch { issues.push({ path: ["unallocatedAmountText"], message: "workforce.validation.earning.conservation" }) }
  }
  const segments: EmployeeEarningApprovalInput["segments"] = []
  let allocatedMinor = 0n
  for (const row of draft.rows) {
    if (!row.projectId.trim()) issues.push({ path: ["rows", row.id, "projectId"], message: "workforce.validation.earning.projectRequired" })
    const days = /^\d+$/.test(row.daysText.trim()) ? Number(row.daysText.trim()) : NaN
    if (!Number.isSafeInteger(days) || days <= 0) issues.push({ path: ["rows", row.id, "daysText"], message: "workforce.validation.earning.daysPositive" })
    let amount: string | null = null
    try {
      amount = wireMoney(row.amountText)
      const minor = BigInt(parseLocalizedMoneyInput(row.amountText).toMinorUnits())
      if (minor < 0n) issues.push({ path: ["rows", row.id, "amountText"], message: "workforce.validation.earning.positiveTotal" })
      else allocatedMinor += minor
    } catch {
      issues.push({
        path: ["rows", row.id, "amountText"],
        message: row.amountText.trim() ? "workforce.validation.earning.amountPrecision" : "workforce.validation.earning.amountRequired",
      })
    }
    if (amount !== null && Number.isSafeInteger(days) && days > 0) segments.push({ id: row.id, projectId: row.projectId, days, amount })
  }
  if (totalAmount !== null && unallocatedAmount !== null) {
    const totalMinor = BigInt(parseLocalizedMoneyInput(totalAmount).toMinorUnits())
    const unallocatedMinor = BigInt(parseLocalizedMoneyInput(unallocatedAmount).toMinorUnits())
    if (totalMinor !== allocatedMinor + unallocatedMinor) issues.push({ path: totalPath, message: "workforce.validation.earning.conservation" })
  }
  let referenceSalary: EmployeeEarningApprovalInput["referenceSalary"]
  if (draft.referenceSalary) {
    try {
      const amount = draft.referenceSalary.period === "DAILY"
        ? parseLocalizedUnitPriceInput(draft.referenceSalary.amount).toWire()
        : wireMoney(draft.referenceSalary.amount)
      referenceSalary = { period: draft.referenceSalary.period, amount }
    } catch { issues.push({ path: ["referenceSalary", "amount"], message: "workforce.validation.salaryReference.amountType" }) }
  } else referenceSalary = draft.referenceSalary
  if (issues.length || totalAmount === null || unallocatedAmount === null) return { payload: null, issues }
  const parsed = employeeEarningApprovalInputSchema.safeParse({
    employeeId: draft.employeeId,
    requestId: newRequestId(),
    periodStart: draft.periodStart,
    periodEnd: draft.periodEnd,
    currencyCode: "DZD",
    totalAmount,
    unallocatedAmount,
    ...(referenceSalary !== undefined ? { referenceSalary } : {}),
    segments,
  })
  if (!parsed.success) return { payload: null, issues: parsed.error.issues.map(issue => {
    const [field, index, ...rest] = issue.path as (string | number)[]
    if (field === "segments" && typeof index === "number") {
      const row = draft.rows[index]
      return { path: ["rows", row?.id ?? String(index), ...rest], message: issue.message }
    }
    const draftField: Record<string, string> = { totalAmount: "totalAmountText", unallocatedAmount: "unallocatedAmountText", periodStart: "periodStart", periodEnd: "periodEnd" }
    return { path: [draftField[String(field)] ?? String(field), ...rest], message: issue.message }
  }) }
  return { payload: parsed.data, issues: [] }
}

export type EarningDraftIdentity = { userId: string; workspaceId: string; employeeId: string }
export type EarningDraftStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">
export type PendingEmployeeEarning = { version: 1; identity: EarningDraftIdentity; payload: FinalizedEmployeeEarningApproval }
export type PendingLoadResult = { ok: true; pending: PendingEmployeeEarning | null } | { ok: false; issue: "malformed-pending-approval" }
export type MarkPendingResult = { ok: true; payload: FinalizedEmployeeEarningApproval } | { ok: false; issues: EarningDraftIssue[]; issue?: "malformed-pending-approval" | "employee-mismatch" }

const storageKey = ({ userId, workspaceId, employeeId }: EarningDraftIdentity) =>
  `employee-earning-pending:v1:${encodeURIComponent(userId)}:${encodeURIComponent(workspaceId)}:${encodeURIComponent(employeeId)}`

function isIdentity(value: unknown, identity: EarningDraftIdentity): value is EarningDraftIdentity {
  if (!value || typeof value !== "object") return false
  const candidate = value as EarningDraftIdentity
  return candidate.userId === identity.userId && candidate.workspaceId === identity.workspaceId && candidate.employeeId === identity.employeeId
}

export function loadPendingEmployeeEarning(identity: EarningDraftIdentity, storage: EarningDraftStorage): PendingLoadResult {
  const raw = storage.getItem(storageKey(identity))
  if (raw === null) return { ok: true, pending: null }
  try {
    const entry = JSON.parse(raw) as Partial<PendingEmployeeEarning>
    if (entry.version !== 1 || !isIdentity(entry.identity, identity)) return { ok: false, issue: "malformed-pending-approval" }
    const payload = employeeEarningApprovalInputSchema.safeParse(entry.payload)
    if (!payload.success || payload.data.employeeId !== identity.employeeId) return { ok: false, issue: "malformed-pending-approval" }
    return { ok: true, pending: { version: 1, identity, payload: payload.data } }
  } catch { return { ok: false, issue: "malformed-pending-approval" } }
}

export function markEmployeeEarningPending(draft: EmployeeEarningDraft, identity: EarningDraftIdentity, storage: EarningDraftStorage, newRequestId: () => string): MarkPendingResult {
  if (draft.employeeId !== identity.employeeId) return { ok: false, issues: [], issue: "employee-mismatch" }
  const existing = loadPendingEmployeeEarning(identity, storage)
  if (!existing.ok) return { ok: false, issues: [], issue: existing.issue }
  if (existing.pending) return { ok: true, payload: existing.pending.payload }
  const finalized = finalizeEmployeeEarningDraft(draft, newRequestId)
  if (!finalized.payload) return { ok: false, issues: finalized.issues }
  storage.setItem(storageKey(identity), JSON.stringify({ version: 1, identity, payload: finalized.payload } satisfies PendingEmployeeEarning))
  return { ok: true, payload: finalized.payload }
}

export function removePendingEmployeeEarning(identity: EarningDraftIdentity, storage: EarningDraftStorage): void {
  storage.removeItem(storageKey(identity))
}
