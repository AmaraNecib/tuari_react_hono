import { ORPCError } from "@orpc/server";
import type { RpcContext } from "../context";
import type { InvoiceModule } from "../../modules/invoice/invoice.module";
import type { InvoiceStatus } from "../../modules/invoice/invoice.types";
import type { createRpcMiddleware } from "../rpc-middleware";

type Middleware = ReturnType<typeof createRpcMiddleware>;

export default function createInvoiceHandlers(
  os: any,
  m: Middleware,
  invoiceModule: InvoiceModule,
) {
  return {
    invoicesList: os.invoicesList.handler(
      m.withPermission(
        "invoices.read",
        m.withAuth(async ({ context, input }: any) => {
          const opts = input ?? {};
          try {
            const result = await invoiceModule.listPaged({
              filters: opts.filters,
              cursor: opts.cursor,
              limit: opts.limit ?? 50,
            });
            return { ...result, hasMore: result.nextCursor !== null };
          } catch (error) {
            if (error instanceof Error && error.message === "Invalid cursor") {
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
        m.withAuth(async ({ context, input }: any) => {
          const invoice = await invoiceModule.findById((input as any).id);
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
          async ({ input, auditContext }: any) => {
            const id = crypto.randomUUID();
            // Generate IDs for line items (client doesn't supply them)
            const lineItemsWithIds = input.lineItems.map((li: any) => ({
              ...li,
              id: crypto.randomUUID(),
            }));
            const invoice = await invoiceModule.create({
              id,
              ...input,
              lineItems: lineItemsWithIds,
            });
            return invoice;
          },
          (error) => {
            if (error instanceof Error && error.message.includes("at least one line item")) {
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
          async ({ input }: any) => {
            const invoice = await invoiceModule.update(input as any);
            return invoice;
          },
          (error) => {
            if (error instanceof Error) {
              if (error.name === "InvoiceNotFoundError") {
                return new ORPCError("NOT_FOUND", { message: error.message });
              }
              if (error.name === "InvalidInvoiceStatusError") {
                return new ORPCError("BAD_REQUEST", { message: error.message });
              }
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
          async ({ input }: any) => {
            await invoiceModule.delete((input as any).id);
            return { success: true };
          },
          (error) => {
            if (error instanceof Error) {
              if (error.name === "InvoiceNotFoundError") {
                return new ORPCError("NOT_FOUND", { message: error.message });
              }
              if (error.name === "InvalidInvoiceStatusError") {
                return new ORPCError("BAD_REQUEST", { message: error.message });
              }
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
          async ({ input }: any) => {
            const result = await invoiceModule.receive((input as any).id);
            return result;
          },
          (error) => {
            if (error instanceof Error) {
              if (error.name === "InvoiceNotFoundError") {
                return new ORPCError("NOT_FOUND", { message: error.message });
              }
              if (error.name === "InvalidInvoiceStatusError") {
                return new ORPCError("BAD_REQUEST", { message: error.message });
              }
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
          async ({ input }: any) => {
            const invoice = await invoiceModule.markPaid(input.id, input.amountDzd);
            return invoice;
          },
          (error) => {
            if (error instanceof Error) {
              if (error.name === "InvoiceNotFoundError") {
                return new ORPCError("NOT_FOUND", { message: error.message });
              }
              if (error.name === "InvalidInvoiceStatusError") {
                return new ORPCError("BAD_REQUEST", { message: error.message });
              }
            }
            throw error;
          },
        ),
      ),
    ),
  };
}
