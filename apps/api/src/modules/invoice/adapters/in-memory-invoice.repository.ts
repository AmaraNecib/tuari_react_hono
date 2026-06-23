import type { InvoiceRepository } from "../invoice.repository";
import type {
  Invoice,
  InvoiceCurrency,
  InvoiceDirection,
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
                ? i.invoiceDate ?? null
                : i.totalAmount;
          const av = after.sortValue;
          // nullBoundaryPassed=true: cursor is anchored at the bottom of
          // the null group; include remaining null rows (id >
          // cursor.id) and all non-null rows. Sorting invoiceDate ASC
          // puts nulls first, then non-null.
          if (after.nullBoundaryPassed) {
            if (field === "invoiceDate") {
              if (i.invoiceDate === null || i.invoiceDate === undefined) {
                return i.id > after.id;
              }
              return true;
            }
            return true;
          }
          if (av === null) {
            return (
              (field === "invoiceDate"
                ? i.invoiceDate === null || i.invoiceDate === undefined
                : false) && (dir === "desc" ? i.id < after.id : i.id > after.id)
            );
          }
          const cmpAv = typeof av === "number" ? av : String(av);
          const cmpIv = typeof iv === "number" ? iv : String(iv);
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
        const lastSort =
          field === "createdAt"
            ? last.createdAt
            : field === "invoiceDate"
              ? (last.invoiceDate ?? null)
              : last.totalAmount;
        // ASC + last row has null sortValue: emit nullBoundaryPassed
        // when there are more rows beyond the current page (the
        // boundary cursor pulls remaining null rows + all non-null
        // rows in one go, regardless of id ordering).
        let firstNonNullIdx = -1;
        for (let i = pageItems.length; i < page.length; i++) {
          const r = page[i]!;
          if (
            field === "invoiceDate" &&
            r.invoiceDate !== null &&
            r.invoiceDate !== undefined
          ) {
            firstNonNullIdx = i;
            break;
          }
        }
        const moreRowsBeyond =
          totalCount > pageItems.length + (page.length - pageItems.length);
        const isAscNullBoundary =
          dir === "asc" &&
          field === "invoiceDate" &&
          (lastSort === null || lastSort === undefined) &&
          (firstNonNullIdx !== -1 || moreRowsBeyond);
        nextCursor = Buffer.from(
          JSON.stringify({
            sortValue: isAscNullBoundary ? null : lastSort,
            id: last.id,
            ...(isAscNullBoundary ? { nullBoundaryPassed: true } : {}),
          }),
        ).toString("base64url");
      }

      return { items: pageItems, nextCursor, totalCount };
    },

    async create(data) {
      const invoice: Invoice & { lineItems: InvoiceLineItem[] } = {
        ...data,
        direction: data.direction ?? "PURCHASE",
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

    async runInTransaction<T>(fn: () => Promise<T>): Promise<T> {
      // The in-memory adapter has no real transaction semantics; the
      // callback runs sequentially. Errors propagate normally. This
      // matches the SQLite contract surface and lets tests verify the
      // atomic composition without relying on rollback behavior.
      return await fn();
    },
  };
}