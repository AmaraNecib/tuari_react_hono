export type SalariesTab = "recent" | "workers" | "earnings"

export type SalariesRouteSearch = {
  tab: SalariesTab
  page: number
  pageSize: number
  [key: string]: unknown
}

const DEFAULT_PAGE_SIZE = 10
const PAGE_SIZES = new Set([10, 25, 50, 100])
const TABS = new Set<SalariesTab>(["recent", "workers", "earnings"])

function positiveInteger(value: unknown): number | null {
  const parsed = typeof value === "string" && /^\d+$/.test(value)
    ? Number(value)
    : typeof value === "number" ? value : NaN
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null
}

export function parseSalariesSearch(search: Record<string, unknown>): SalariesRouteSearch {
  const tab = typeof search.tab === "string" && TABS.has(search.tab as SalariesTab)
    ? search.tab as SalariesTab
    : "recent"
  const page = positiveInteger(search.page) ?? 1
  const requestedPageSize = positiveInteger(search.pageSize)
  const pageSize = requestedPageSize !== null && PAGE_SIZES.has(requestedPageSize)
    ? requestedPageSize
    : DEFAULT_PAGE_SIZE

  return { ...search, tab, page, pageSize }
}

export function patchSalariesSearch(
  previous: SalariesRouteSearch,
  patch: Partial<Pick<SalariesRouteSearch, "tab" | "page" | "pageSize">>,
): SalariesRouteSearch {
  return { ...previous, ...patch }
}
