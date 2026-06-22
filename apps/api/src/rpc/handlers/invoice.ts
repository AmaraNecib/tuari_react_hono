import { implement, ORPCError } from "@orpc/server";

import type { InvoiceModule } from "../../modules/invoice/invoice.module";
import {
  EmptyLineItemsError,
  InvalidInvoiceCursorError,
  InvalidInvoiceStatusError,
  InvoiceDebtPortError,
  InvoiceNotFoundError,
} from "../../modules/invoice/invoice.types";
import type { RpcContext } from "../context";
import type { RpcMiddleware } from "../rpc-middleware";

export function createInvoiceHandlers(
  os: ReturnType<typeof implement>,
  m: RpcMiddleware,
  invoiceModule: InvoiceModule,
): Record<string, unknown> {
  return {
    invoicesList: os.invoicesList.handler(
      m.withPermission(
        "invoices.read",
        m.withAuth(async ({ input }: { context: RpcContext; input: unknown }) => {
          const opts = (input ?? {}) as {
            filters?: unknown;
            cursor?: string;
            limit?: number;
            sort?: { field: string; direction: "asc" | "desc" };
          };
          try {
            const result = await invoiceModule.listPaged({
              filters: opts.filters as never,
              cursor: opts.cursor,
              limit: opts.limit ?? 50,
              sort: opts.sort as never,
            });
            return { ...result, hasMore: result.nextCursor !== null };
          } catch (error) {
            if (error instanceof InvalidInvoiceCursorError) {
              throw new ORPCError("BAD_REQUEST", { message: error.message });
            }
            throw error;
          }
        }),
      ),
    ),

    invoicesGet: os.invoicesGet.handler(
      m.withPermission(
        "invoices.read",
        m.withAuth(async ({ input }: { context: RpcContext; input: unknown }) => {
          const invoice = await invoiceModule.findById((input as { id: string }).id);
          if (!invoice) {
            throw new ORPCError("NOT_FOUND", { message: "Invoice not found" });
          }
          return invoice;
        }),
      ),
    ),

    invoicesCreate: os.invoicesCreate.handler(
      m.withPermission(
        "invoices.create",
        m.withAudit(
          async ({ input }: { context: RpcContext; input: unknown; auditContext: unknown }) => {
            const raw = input as { lineItems: Array<{ id?: string }> };
            const id = crypto.randomUUID();
            const lineItemsWithIds = raw.lineItems.map((li) => ({
              ...li,
              id: crypto.randomUUID(),
            }));
            const invoice = await invoiceModule.create({
              ...(raw as object),
              id,
              lineItems: lineItemsWithIds,
            } as never);
            return invoice;
          },
          (error: unknown) => {
            if (error instanceof EmptyLineItemsError) {
              return new ORPCError("BAD_REQUEST", { message: error.message });
            }
            throw error;
          },
        ),
      ),
    ),

    invoicesUpdate: os.invoicesUpdate.handler(
      m.withPermission(
        "invoices.update",
        m.withAudit(
          async ({ input }: { context: RpcContext; input: unknown; auditContext: unknown }) => {
            const raw = input as { lineItems?: Array<{ id?: string }> };
            const lineItemsWithIds = raw.lineItems?.map((li) => ({
              ...li,
              id: crypto.randomUUID(),
            }));
            return invoiceModule.update({
              ...(raw as object),
              ...(lineItemsWithIds ? { lineItems: lineItemsWithIds } : {}),
            } as never);
          },
          (error: unknown) => {
            if (error instanceof InvoiceNotFoundError) {
              return new ORPCError("NOT_FOUND", { message: error.message });
            }
            if (error instanceof InvalidInvoiceStatusError) {
              return new ORPCError("BAD_REQUEST", { message: error.message });
            }
            if (error instanceof EmptyLineItemsError) {
              return new ORPCError("BAD_REQUEST", { message: error.message });
            }
            throw error;
          },
        ),
      ),
    ),

    invoicesDelete: os.invoicesDelete.handler(
      m.withPermission(
        "invoices.delete",
        m.withAudit(
          async ({ input }: { context: RpcContext; input: unknown; auditContext: unknown }) => {
            await invoiceModule.delete((input as { id: string }).id);
            return { success: true };
          },
          (error: unknown) => {
            if (error instanceof InvoiceNotFoundError) {
              return new ORPCError("NOT_FOUND", { message: error.message });
            }
            if (error instanceof InvalidInvoiceStatusError) {
              return new ORPCError("BAD_REQUEST", { message: error.message });
            }
            throw error;
          },
        ),
      ),
    ),

    invoicesReceive: os.invoicesReceive.handler(
      m.withPermission(
        "invoices.update",
        m.withAudit(
          async ({
            input,
            auditContext,
          }: {
            context: RpcContext;
            input: unknown;
            auditContext: { actorUserId: string; actorLabel: string; transactionId: string };
          }) => {
            const id = (input as { id: string }).id;
            return invoiceModule.receive(id, {
              actorUserId: auditContext.actorUserId,
              actorLabel: auditContext.actorLabel,
              transactionId: auditContext.transactionId,
            });
          },
          (error: unknown) => {
            if (error instanceof InvoiceNotFoundError) {
              return new ORPCError("NOT_FOUND", { message: error.message });
            }
            if (error instanceof InvalidInvoiceStatusError) {
              return new ORPCError("BAD_REQUEST", { message: error.message });
            }
            if (error instanceof InvoiceDebtPortError) {
              return new ORPCError("INTERNAL_SERVER_ERROR", { message: error.message });
            }
            throw error;
          },
        ),
      ),
    ),

    invoicesMarkPaid: os.invoicesMarkPaid.handler(
      m.withPermission(
        "invoices.update",
        m.withAudit(
          async ({
            input,
            auditContext,
          }: {
            context: RpcContext;
            input: unknown;
            auditContext: { actorUserId: string; actorLabel: string; transactionId: string };
          }) => {
            const { id, amountDzd } = input as { id: string; amountDzd: number };
            return invoiceModule.markPaid(id, amountDzd, {
              actorUserId: auditContext.actorUserId,
              actorLabel: auditContext.actorLabel,
              transactionId: auditContext.transactionId,
            });
          },
          (error: unknown) => {
            if (error instanceof InvoiceNotFoundError) {
              return new ORPCError("NOT_FOUND", { message: error.message });
            }
            if (error instanceof InvalidInvoiceStatusError) {
              return new ORPCError("BAD_REQUEST", { message: error.message });
            }
            if (error instanceof InvoiceDebtPortError) {
              return new ORPCError("BAD_REQUEST", { message: error.message });
            }
            throw error;
          },
        ),
      ),
    ),
  };
}