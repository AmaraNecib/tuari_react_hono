import type { ExperimentalExactInvoice, ExperimentalExactInvoicesClient } from "@tuari/contracts"
import { useInfiniteQuery } from "@tanstack/react-query"

import { useWorkspaceScopedQuery } from "@/features/app-shell/workspace-queries"
import { useSessionQuery } from "@/features/session/use-session-query"
import { exactCommercePrefix } from "@/features/shared/exact-commerce-queries"

export function useExperimentalExactInvoices(client: ExperimentalExactInvoicesClient, enabled: boolean) {
  const session = useSessionQuery()
  return useInfiniteQuery({
    queryKey: [...exactCommercePrefix(client), session.data?.user?.id ?? null, "experimental-invoices", "list"],
    enabled: Boolean(session.data?.user) && enabled,
    initialPageParam: undefined as string | undefined,
    staleTime: 0,
    refetchOnMount: "always",
    retry: false,
    queryFn: ({ pageParam }) => client.listInvoices({ limit: 100, cursor: pageParam }),
    getNextPageParam: page => page.hasMore ? page.nextCursor ?? undefined : undefined,
  })
}

export function useExperimentalExactInvoice(client: ExperimentalExactInvoicesClient, id: string | undefined, enabled: boolean) {
  return useWorkspaceScopedQuery({
    key: owner => [...exactCommercePrefix(client), owner, "experimental-invoices", "detail", id ?? null],
    enabled: Boolean(id) && enabled,
    staleTime: 0,
    refetchOnMount: "always",
    retry: false,
    queryFn: () => client.getInvoice({ id: id! }),
  })
}

export function useExperimentalExactInvoicePayments(client: ExperimentalExactInvoicesClient, invoice: ExperimentalExactInvoice | undefined, enabled: boolean) {
  const session = useSessionQuery()
  return useInfiniteQuery({
    queryKey: [...exactCommercePrefix(client), session.data?.user?.id ?? null, "experimental-invoices", "payments", invoice?.counterpartyId ?? null, invoice?.direction ?? null],
    enabled: Boolean(session.data?.user) && enabled && Boolean(invoice),
    initialPageParam: undefined as string | undefined,
    staleTime: 0,
    refetchOnMount: "always",
    retry: false,
    queryFn: ({ pageParam }) => client.listPayments({
      limit: 100,
      cursor: pageParam,
      filters: { counterpartyId: invoice!.counterpartyId, direction: invoice!.direction },
    }),
    getNextPageParam: page => page.hasMore ? page.nextCursor ?? undefined : undefined,
  })
}
