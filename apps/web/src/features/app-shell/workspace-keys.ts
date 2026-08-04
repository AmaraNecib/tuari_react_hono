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
import type { QueryClient } from "@tanstack/react-query"

/** Prefix of the workspace-domain query namespace. */
export const workspaceDomainQueryPrefix = ["phase1", "workspace-domain"] as const

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
  debtAccounts: (userId: UserId = ANONYMOUS) => ["phase1", "workspace-domain", "debt-accounts", userId] as const,
  inventoryItems: (userId: UserId = ANONYMOUS) => ["phase1", "workspace-domain", "inventory-items", userId] as const,
  inventoryInvoices: (userId: UserId = ANONYMOUS) => ["phase1", "workspace-domain", "inventory-invoices", userId] as const,
  inventoryOutboundTransfers: (userId: UserId = ANONYMOUS) => ["phase1", "workspace-domain", "inventory-outbound-transfers", userId] as const,
  employeeStateHistory: (userId: UserId = ANONYMOUS) => ["phase1", "workspace-domain", "employee-state-history", userId] as const,
  projectManagerOwnership: (userId: UserId = ANONYMOUS) => ["phase1", "workspace-domain", "project-manager-ownership", userId] as const,
  warehouseManagerOwnership: (userId: UserId = ANONYMOUS) => ["phase1", "workspace-domain", "warehouse-manager-ownership", userId] as const,

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
 */
export type WorkspaceDomain = {
  [K in keyof typeof workspaceQueryKeys]: Parameters<(typeof workspaceQueryKeys)[K]>["length"] extends 1 ? K : never
}[keyof typeof workspaceQueryKeys]

/**
 * Type-checked invalidation for flat workspace domains.
 *
 * Maps a domains record to `invalidateQueries` calls against the resolved
 * userId; when the userId is unknown (session not yet cached) it invalidates
 * the whole workspace-domain prefix — a safe over-invalidation that can never
 * miss. Callers never construct key arrays by hand, so no string literal can
 * drift from the factory.
 */
export async function invalidateWorkspaceDomains(
  queryClient: Pick<QueryClient, "invalidateQueries">,
  userId: UserId,
  domains: Partial<Record<WorkspaceDomain, true>>,
): Promise<void> {
  if (userId === null) {
    await queryClient.invalidateQueries({ queryKey: workspaceDomainQueryPrefix })
    return
  }

  await Promise.all(
    (Object.keys(domains) as WorkspaceDomain[]).map((domain) =>
      queryClient.invalidateQueries({
        // `domain` is a flat key by construction (the record type only admits
        // `WorkspaceDomain` entries), so a single-arg call is sound here.
        queryKey: (workspaceQueryKeys[domain] as (userId: UserId) => readonly unknown[])(userId),
      }),
    ),
  )
}
