import type { ExpenseListFilters } from "@tuari/contracts"

import { toAlgeriaDayBoundaryIso } from "@/lib/algeria-time"

export type ExpenseFilterState = {
  projectId: string | null
  responsibleWorkerId: string | null
  /** `yyyy-mm-dd` from the date inputs. */
  fromDate: string
  toDate: string
}

/**
 * Default range for the screen: the current Algeria month to date.
 */
export function getDefaultExpenseDateRange(today: string) {
  return { fromDate: `${today.slice(0, 7)}-01`, toDate: today }
}

/**
 * Turn the screen's filter state into the wire filter object. Null selects are
 * omitted (the API treats an absent filter as "all"), and the date inputs are
 * expanded to Algeria day boundaries so the range is inclusive of the whole
 * selected days.
 */
export function buildExpenseFilters(state: ExpenseFilterState): ExpenseListFilters {
  const filters: ExpenseListFilters = {}

  if (state.projectId) filters.projectId = state.projectId
  if (state.responsibleWorkerId) filters.responsibleWorkerId = state.responsibleWorkerId

  const from = toAlgeriaDayBoundaryIso(state.fromDate, "start")
  const to = toAlgeriaDayBoundaryIso(state.toDate, "end")
  if (from) filters.fromDate = from
  if (to) filters.toDate = to

  return filters
}
