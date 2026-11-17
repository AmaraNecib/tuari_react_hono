import { withMonthlyApprovalIdentityLock } from "@/features/employees/exact-monthly-approval-recovery"

type RecoveryStorage = Pick<Storage, "length" | "key" | "getItem">

/** Account identity is shared across workspace routes, including legacy fallback. */
export async function saveAccountWithoutAnyPendingApproval<T>(userId: string, blockedMessage: string, save: () => Promise<T>, storage: RecoveryStorage = window.localStorage): Promise<T> {
  return withMonthlyApprovalIdentityLock(userId, async () => {
    const prefix = "tuari:slice543:monthly-approval:v1:"
    const suffix = `:${encodeURIComponent(userId)}`
    for (let index = 0; index < storage.length; index += 1) {
      const key = storage.key(index)
      if (key?.startsWith(prefix) && key.endsWith(suffix) && storage.getItem(key) !== null) throw new Error(blockedMessage)
    }
    return save()
  })
}
