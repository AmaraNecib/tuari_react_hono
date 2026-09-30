import type { ExpenseListFilters } from "@tuari/contracts"

import { resolveDayRangeBounds } from "@/lib/date-range"

export type ExpenseFilterState = {
  projectId: string | null
  responsibleWorkerId: string | null
  /** `yyyy-mm-dd` from the date inputs. */
  fromDate: string
  toDate: string
}

/**
 * Turn the screen's filter state into the wire filter object. Null selects are
 * omitted (the API treats an absent filter as "all"), and the date inputs are
 * expanded to Algeria day boundaries so the range is inclusive of the whole
 * selected days. Blank date inputs mean no date filter at all.
 */
export function buildExpenseFilters(state: ExpenseFilterState): ExpenseListFilters {
  const filters: ExpenseListFilters = {}

  if (state.projectId) filters.projectId = state.projectId
  if (state.responsibleWorkerId) filters.responsibleWorkerId = state.responsibleWorkerId

  const { fromDate, toDate } = resolveDayRangeBounds(state)
  if (fromDate) filters.fromDate = fromDate
  if (toDate) filters.toDate = toDate

  return filters
}
