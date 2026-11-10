import type { ExactInvoicesClient, ExactInvoiceCreate, ExactInvoiceUpdate, ExactInvoiceCommand, ExactInvoiceVoid, ExactPaymentCreate, ExactPaymentAllocate } from "@tuari/contracts"
import { useInfiniteQuery } from "@tanstack/react-query"
import { useSessionQuery } from "@/features/session/use-session-query"
import { exactCommercePrefix, useExactCommerceMutation } from "@/features/shared/exact-commerce-queries"
export type ExactInvoiceAction =
  | { kind: "createInvoice"; input: ExactInvoiceCreate }
  | { kind: "updateInvoice"; input: ExactInvoiceUpdate }
  | { kind: "receiveInvoice" | "deleteDraft" | "deleteUnallocatedPayment"; input: ExactInvoiceCommand }
  | { kind: "voidInvoice" | "voidPayment"; input: ExactInvoiceVoid }
  | { kind: "createPayment"; input: ExactPaymentCreate }
  | { kind: "allocatePayment"; input: ExactPaymentAllocate }
export function useExactInvoices(client: ExactInvoicesClient) {
  const session = useSessionQuery()
  return useInfiniteQuery({
    queryKey: [...exactCommercePrefix(client), session.data?.user?.id ?? null, "invoices"],
    enabled: Boolean(session.data?.user), initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) => client.listInvoices({ limit: 100, cursor: pageParam }),
    getNextPageParam: page => page.hasMore ? page.nextCursor ?? undefined : undefined,
  })
}
export function useExactPayments(client: ExactInvoicesClient) {
  const session = useSessionQuery()
  return useInfiniteQuery({
    queryKey: [...exactCommercePrefix(client), session.data?.user?.id ?? null, "payments"],
    enabled: Boolean(session.data?.user), initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) => client.listPayments({ limit: 100, cursor: pageParam }),
    getNextPageParam: page => page.hasMore ? page.nextCursor ?? undefined : undefined,
  })
}
export function useExactInvoiceAction(client: ExactInvoicesClient) {
  return useExactCommerceMutation<ExactInvoiceAction, unknown>(client, (command: ExactInvoiceAction) => {
    switch (command.kind) {
      case "createInvoice": return client.createInvoice(command.input)
      case "updateInvoice": return client.updateInvoice(command.input)
      case "receiveInvoice": return client.receiveInvoice(command.input)
      case "deleteDraft": return client.deleteDraft(command.input)
      case "voidInvoice": return client.voidInvoice(command.input)
      case "createPayment": return client.createPayment(command.input)
      case "allocatePayment": return client.allocatePayment(command.input)
      case "voidPayment": return client.voidPayment(command.input)
      case "deleteUnallocatedPayment": return client.deleteUnallocatedPayment(command.input)
    }
  })
}
