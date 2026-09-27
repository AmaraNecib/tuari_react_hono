/**
 * Workspace data layer — one query-key seam.
 *
 * Single source of truth for every React Query key in the workspace data
 * layer (workspace domains, inventory, employee-debt). One namespace
 * (`["phase1","workspace-domain",<domain>,<userId>]`), every key user-scoped.
 * Invalidation is type-checked through `invalidateWorkspaceDomains`, whose
 * `WorkspaceDomain` vocabulary is derived from the factory itself, so the
 * key map and the invalidation map cannot drift apart.
 *
 * Pure module — no hooks, no React. `queryClient` is an accepted dependency
 * ("accept dependencies, don't create them"), which keeps every function here
 * unit-testable without a component tree.
 */
import type { QueryClient, QueryKey } from "@tanstack/react-query"

import { orpc } from "@/lib/orpc-client"

/** Prefix of the workspace-domain query namespace. */
export const workspaceDomainQueryPrefix = ["phase1", "workspace-domain"] as const

/**
 * Prefix of the workspace snapshot query namespace (`["phase1","workspace",<userId>]`).
 *
 * The single `workspaceSnapshot()` RPC backing the shell composite (and the
 * demo snapshot query) mounts here. Kept OUT of the workspace-domain
 * namespace so sign-out/reset `removeQueries({ queryKey: workspaceQueryPrefix })`
 * keeps clearing it.
 */
export const workspaceQueryPrefix = ["phase1", "workspace"] as const

/**
 * The cache key the session query mounts under. NOT `orpc.session.key()`:
 * the bare `key()` omits the `type: "query"` field, so it never matches the
 * mounted query — every cache read/invalidation of the session must use this.
 */
export const sessionQueryKey = orpc.session.queryOptions().queryKey

type UserId = string | null

/** Legacy anonymous fallback used when no session user has resolved. */
const ANONYMOUS = "anonymous" as const

/**
 * One key factory per endpoint, user-scoped.
 *
 * Flat entries — `(userId?) => QueryKey` — make up the `WorkspaceDomain`
 * vocabulary used by `invalidateWorkspaceDomains`. Parameterized entries
 * (detail/ledger keys, two required args) are invalidated directly at the
 * mutation site via a factory call, never through the domains record.
 */
export const workspaceQueryKeys = {
  // ── workspace domains (flat) ─────────────────────────────────────────
  employees: (userId: UserId = ANONYMOUS) => ["phase1", "workspace-domain", "employees", userId] as const,
  projects: (userId: UserId = ANONYMOUS) => ["phase1", "workspace-domain", "projects", userId] as const,
  warehouses: (userId: UserId = ANONYMOUS) => ["phase1", "workspace-domain", "warehouses", userId] as const,
  debtsSummary: (userId: UserId = ANONYMOUS) => ["phase1", "workspace-domain", "debts-summary", userId] as const,
  debtsDetail: (userId: UserId = ANONYMOUS) => ["phase1", "workspace-domain", "debts-detail", userId] as const,
  systemLog: (userId: UserId = ANONYMOUS) => ["phase1", "workspace-domain", "system-log", userId] as const,
  roles: (userId: UserId = ANONYMOUS) => ["phase1", "workspace-domain", "roles", userId] as const,
  managerAssignments: (userId: UserId = ANONYMOUS) => ["phase1", "workspace-domain", "manager-assignments", userId] as const,
  projectAssignments: (userId: UserId = ANONYMOUS) => ["phase1", "workspace-domain", "project-assignments", userId] as const,
  warehouseAssignments: (userId: UserId = ANONYMOUS) => ["phase1", "workspace-domain", "warehouse-assignments", userId] as const,
  salaryPayments: (userId: UserId = ANONYMOUS) => ["phase1", "workspace-domain", "salary-payments", userId] as const,
  externalCounterparties: (userId: UserId = ANONYMOUS) => ["phase1", "workspace-domain", "external-counterparties", userId] as const,
  // Expenses are their own feature-scoped RPC (issue #411) — not part of the
  // workspace snapshot. Flat key so `invalidateWorkspaceDomains({ expenses })`
  // refreshes every filter variant (the list key is prefixed by this one).
  expenses: (userId: UserId = ANONYMOUS) => ["phase1", "workspace-domain", "expenses", userId] as const,
  debtAccounts: (userId: UserId = ANONYMOUS) => ["phase1", "workspace-domain", "debt-accounts", userId] as const,
  inventoryItems: (userId: UserId = ANONYMOUS) => ["phase1", "workspace-domain", "inventory-items", userId] as const,
  inventoryInvoices: (userId: UserId = ANONYMOUS) => ["phase1", "workspace-domain", "inventory-invoices", userId] as const,
  inventoryOutboundTransfers: (userId: UserId = ANONYMOUS) => ["phase1", "workspace-domain", "inventory-outbound-transfers", userId] as const,
  employeeStateHistory: (userId: UserId = ANONYMOUS) => ["phase1", "workspace-domain", "employee-state-history", userId] as const,
  projectManagerOwnership: (userId: UserId = ANONYMOUS) => ["phase1", "workspace-domain", "project-manager-ownership", userId] as const,
  warehouseManagerOwnership: (userId: UserId = ANONYMOUS) => ["phase1", "workspace-domain", "warehouse-manager-ownership", userId] as const,
  // The single workspaceSnapshot() RPC the shell composite mounts (issue #276).
  // Deliberately NOT in the workspace-domain namespace — see workspaceQueryPrefix.
  workspaceSnapshot: (userId: UserId = ANONYMOUS) => ["phase1", "workspace", userId] as const,

  // ── parameterized detail keys (invalidated directly at mutation sites) ──
  inventoryInvoiceGroup: (userId: UserId, invoiceId: string) => ["phase1", "workspace-domain", "inventory-invoice-groups", userId, invoiceId] as const,
  inventoryAsset: (userId: UserId, assetId: string) => ["phase1", "workspace-domain", "inventory-asset", userId, assetId] as const,
  inventoryLocationContents: (userId: UserId, input: { warehouseId?: string; projectId?: string }) =>
    ["phase1", "workspace-domain", "inventory-location-contents", userId, input] as const,
  employeeDebtAccount: (userId: UserId, employeeId: string) => ["phase1", "workspace-domain", "employee-debt-account", userId, employeeId] as const,
} as const

/**
 * The flat (userId-only) factory entries — the vocabulary accepted by
 * `invalidateWorkspaceDomains`. Derived from the factory by arity, so a key
 * added as a flat entry automatically joins the invalidation vocabulary and
 * a parameterized key is rejected at compile time.
 *
 * `0 | 1` (not `1`): flat factories are declared with a default param
 * (`(userId: UserId = ANONYMOUS) => ...`), which makes the tuple element
 * optional, so `Parameters<F>["length"]` is `0 | 1`. Checking against `1`
 * alone would map every flat key to `never` and collapse the type (issue
 * #307); `0 | 1` mirrors the runtime predicate `factory.length <= 1` used by
 * the flat-factory list test.
 */
export type WorkspaceDomain = {
  [K in keyof typeof workspaceQueryKeys]: Parameters<(typeof workspaceQueryKeys)[K]>["length"] extends 0 | 1 ? K : never
}[keyof typeof workspaceQueryKeys]

/**
 * Resolve the signed-in user id from the query cache, or null when the
 * session has not resolved yet (callers then fall back to prefix-wide
 * invalidation). Reads `sessionQueryKey` — the key the session query
 * actually mounts under.
 */
export function getCachedSessionUserId(queryClient: Pick<QueryClient, "getQueryData">): string | null {
  return queryClient.getQueryData<{ user?: { id?: string } | null }>(sessionQueryKey)?.user?.id ?? null
}

/**
 * Domains whose data the single `workspaceSnapshot()` RPC returns.
 *
 * `invalidateWorkspaceDomains` refreshes the snapshot whenever a mutation
 * touches one of these: the shell composite no longer mounts the per-domain
 * queries — the snapshot is its only workspace data source. Feature-scoped
 * keys (debtsSummary/debtsDetail/employeeDebtAccount, inventory keys,
 * systemLog) are deliberately excluded so a debts-only mutation does not
 * drag the whole snapshot through the wire again.
 *
 * Typed as `ReadonlySet<WorkspaceDomain>`: the membership is pinned by the
 * invalidateWorkspaceDomains unit tests, and the flat vocabulary is derived
 * from the same factory, so a domain cannot drift out of the type.
 */
const SNAPSHOT_BACKED_DOMAINS: ReadonlySet<WorkspaceDomain> = new Set([
  "roles",
  "employees",
  "projects",
  "warehouses",
  "externalCounterparties",
  "managerAssignments",
  "projectAssignments",
  "warehouseAssignments",
  "salaryPayments",
  "employeeStateHistory",
  "projectManagerOwnership",
  "warehouseManagerOwnership",
])

/**
 * Type-checked invalidation for flat workspace domains.
 *
 * Maps a domains record to `invalidateQueries` calls against the resolved
 * userId; when the userId is unknown (session not yet cached) it invalidates
 * the whole workspace-domain prefix — a safe over-invalidation that can never
 * miss. When a requested domain is backed by the single workspace snapshot
 * RPC (issue #276), the snapshot key is invalidated in parallel so the shell
 * composite refetches in one call. Callers never construct key arrays by
 * hand, so no string literal can drift from the factory.
 */
export async function invalidateWorkspaceDomains(
  queryClient: Pick<QueryClient, "invalidateQueries">,
  userId: UserId,
  domains: Partial<Record<WorkspaceDomain, true>>,
): Promise<void> {
  if (Object.keys(domains).length === 0) {
    return
  }

  const requested = Object.keys(domains) as WorkspaceDomain[]
  const snapshotInvalidation = requested.some((domain) => SNAPSHOT_BACKED_DOMAINS.has(domain))

  if (userId === null) {
    await queryClient.invalidateQueries({ queryKey: workspaceDomainQueryPrefix })
    if (snapshotInvalidation) {
      await queryClient.invalidateQueries({ queryKey: workspaceQueryPrefix })
    }
    return
  }

  const invalidations = requested.map((domain) =>
    queryClient.invalidateQueries({
      // `domain` is a flat key by construction (the record type only admits
      // `WorkspaceDomain` entries), so a single-arg call is sound here.
      queryKey: (workspaceQueryKeys[domain] as (userId: string) => readonly unknown[])(userId),
    }),
  )
  if (snapshotInvalidation) {
    invalidations.push(
      queryClient.invalidateQueries({
        queryKey: (workspaceQueryKeys.workspaceSnapshot as (userId: string) => readonly unknown[])(userId),
      }),
    )
  }
  await Promise.all(invalidations)
}

/**
 * Null-safe invalidation of a single user-scoped key, flat or parameterized.
 *
 * Used by mutations that refresh one precise cache entry (e.g. an invoice
 * group detail, an asset, a location's contents, an employee debt account).
 * When the userId is unknown it falls back to prefix-wide invalidation, so a
 * pre-session mutation can never leave a stale entry behind.
 */
export async function invalidateUserScopedQuery(
  queryClient: Pick<QueryClient, "invalidateQueries">,
  userId: string | null,
  key: (userId: string) => QueryKey,
): Promise<void> {
  if (userId === null) {
    await queryClient.invalidateQueries({ queryKey: workspaceDomainQueryPrefix })
    return
  }

  await queryClient.invalidateQueries({ queryKey: key(userId) })
}
