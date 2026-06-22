import type { InvoiceRepository } from "../invoice.repository";
import type {
  Invoice,
  InvoiceCurrency,
  InvoiceLineItem,
  InvoiceListFilters,
  InvoiceListSortField,
  SortDirection,
} from "../invoice.types";

/**
 * In-memory adapter for tests. Mirrors the SQLite adapter's behaviour
 * without a database so tests run in milliseconds.
 *
 * Lives alongside the production adapter so test wiring matches the
 * workforce module's `in-memory-employee.repository.ts` pattern.
 */
export function createInMemoryInvoiceRepository(): InvoiceRepository & {
  _invoices: Map<string, Invoice & { lineItems: InvoiceLineItem[] }>;
} {
  const invoices = new Map<string, Invoice & { lineItems: InvoiceLineItem[] }>();

  return {
    _invoices: invoices,

    async findById(id) {
      const found = invoices.get(id);
      return found ? { ...found, lineItems: [...found.lineItems] } : null;
    },

    async findPaged({ filters, sort, after, limit }) {
      let items = Array.from(invoices.values());

      if (filters?.status) {
        items = items.filter((i) => i.status === filters.status);
      }
      if (filters?.supplierName) {
        items = items.filter((i) =>
          i.supplierName.toLowerCase().includes(filters.supplierName!.toLowerCase()),
        );
      }
      if (filters?.warehouseId) {
        items = items.filter((i) => i.warehouseId === filters.warehouseId);
      }
      if (filters?.projectId) {
        items = items.filter((i) => i.projectId === filters.projectId);
      }

      const field: InvoiceListSortField = sort?.field ?? "createdAt";
      const dir: SortDirection = sort?.direction ?? "desc";
      const dirMul = dir === "asc" ? 1 : -1;

      items.sort((a, b) => {
        const av =
          field === "createdAt"
            ? a.createdAt
            : field === "invoiceDate"
              ? a.invoiceDate ?? ""
              : a.totalAmount;
        const bv =
          field === "createdAt"
            ? b.createdAt
            : field === "invoiceDate"
              ? b.invoiceDate ?? ""
              : b.totalAmount;
        const cmp = av < bv ? -1 : av > bv ? 1 : 0;
        return cmp !== 0
          ? cmp * dirMul
          : a.id < b.id
            ? -1 * dirMul
            : a.id > b.id
              ? 1 * dirMul
              : 0;
      });

      const totalCount = items.length;

      if (after) {
        items = items.filter((i) => {
          const iv =
            field === "createdAt"
              ? i.createdAt
              : field === "invoiceDate"
                ? i.invoiceDate ?? ""
                : i.totalAmount;
          const av = after.sortValue;
          // When the cursor's sortValue is null, the next page is the
          // remainder of the null group, ordered by id. When both are
          // non-null, apply the standard keyset (sortCol < av OR
          // (sortCol = av AND id < after.id)). DESC: smaller keyset; ASC: larger.
          if (av === null) {
            return (
              (field === "invoiceDate" ? i.invoiceDate === null || i.invoiceDate === undefined : false) &&
              (dir === "desc" ? i.id < after.id : i.id > after.id)
            );
          }
          const cmpAv =
            typeof av === "number" ? av : String(av);
          const cmpIv =
            typeof iv === "number" ? iv : String(iv);
          return (
            dir === "desc"
              ? cmpIv < cmpAv || (cmpIv === cmpAv && i.id < after.id)
              : cmpIv > cmpAv || (cmpIv === cmpAv && i.id > after.id)
          );
        });
      }

      const page = items.slice(0, limit + 1);
      const hasMore = page.length > limit;
      const pageItems = hasMore ? page.slice(0, limit) : page;

      let nextCursor: string | null = null;
      if (hasMore && pageItems.length > 0) {
        const last = pageItems[pageItems.length - 1]!;
        // Encode null sort values as null (so the next page knows it
        // must continue the null group), not the empty string fallback.
        const lastSort =
          field === "createdAt"
            ? last.createdAt
            : field === "invoiceDate"
              ? last.invoiceDate ?? null
              : last.totalAmount;
        nextCursor = Buffer.from(
          JSON.stringify({ sortValue: lastSort, id: last.id }),
        ).toString("base64url");
      }

      return { items: pageItems, nextCursor, totalCount };
    },

    async create(data) {
      const invoice: Invoice & { lineItems: InvoiceLineItem[] } = {
        ...data,
        debtAccountId: data.debtAccountId ?? null,
        lineItems: data.lineItems.map((li) => ({
          ...li,
          invoiceId: data.id,
        })),
      };
      invoices.set(data.id, invoice);
      return { ...invoice, lineItems: [...invoice.lineItems] };
    },

    async update(id, data) {
      const existing = invoices.get(id);
      if (!existing) throw new Error(`Invoice ${id} not found`);

      let updatedLineItems = existing.lineItems;
      if (data.lineItems) {
        updatedLineItems = data.lineItems.map((li) => ({
          ...li,
          invoiceId: id,
        }));
      }

      const updated = { ...existing, ...data, lineItems: updatedLineItems };
      invoices.set(id, updated);
      return { ...updated, lineItems: [...updated.lineItems] };
    },

    async updateStatus(id, status, additionalUpdates) {
      const existing = invoices.get(id);
      if (!existing) throw new Error(`Invoice ${id} not found`);

      const updated = {
        ...existing,
        status,
        ...additionalUpdates,
        updatedAt: new Date().toISOString(),
      };
      invoices.set(id, updated);
      return { ...updated, lineItems: [...updated.lineItems] };
    },

    async markReceivedWithDebtAccount(id, debtAccountId) {
      const existing = invoices.get(id);
      if (!existing) throw new Error(`Invoice ${id} not found`);

      const updated = {
        ...existing,
        status: "RECEIVED" as const,
        debtAccountId,
        updatedAt: new Date().toISOString(),
      };
      invoices.set(id, updated);
      return { ...updated, lineItems: [...updated.lineItems] };
    },

    async delete(id) {
      invoices.delete(id);
    },

    async count(filters?: InvoiceListFilters) {
      let items = Array.from(invoices.values());
      if (filters?.status) {
        items = items.filter((i) => i.status === filters.status);
      }
      if (filters?.supplierName) {
        items = items.filter((i) =>
          i.supplierName.toLowerCase().includes(filters.supplierName!.toLowerCase()),
        );
      }
      if (filters?.warehouseId) {
        items = items.filter((i) => i.warehouseId === filters.warehouseId);
      }
      if (filters?.projectId) {
        items = items.filter((i) => i.projectId === filters.projectId);
      }
      return items.length;
    },
  };
}