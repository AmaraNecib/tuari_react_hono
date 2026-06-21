import { describe, it, expect, beforeEach } from "vitest";
import { InvoiceModule } from "./invoice.module";
import type { InvoiceRepository } from "./invoice.repository";
import type {
  Invoice,
  InvoiceLineItem,
  InvoiceStatus,
  CreateInvoiceInput,
  UpdateInvoiceInput,
} from "./invoice.types";

// --- In-memory adapter for tests ---

function createInMemoryRepository(): InvoiceRepository & {
  _invoices: Map<string, Invoice & { lineItems: InvoiceLineItem[] }>;
} {
  const invoices = new Map<string, Invoice & { lineItems: InvoiceLineItem[] }>();

  return {
    _invoices: invoices,

    async findById(id) {
      return invoices.get(id) ?? null;
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

      // Sort by createdAt desc, id desc
      items.sort((a, b) => {
        const cmp = b.createdAt.localeCompare(a.createdAt);
        return cmp !== 0 ? cmp : b.id.localeCompare(a.id);
      });

      const totalCount = items.length;

      // Cursor filter
      if (after) {
        items = items.filter(
          (i) =>
            String(i.createdAt) < String(after.sortValue) ||
            (String(i.createdAt) === String(after.sortValue) && i.id < after.id),
        );
      }

      const page = items.slice(0, limit + 1);
      const hasMore = page.length > limit;
      const pageItems = hasMore ? page.slice(0, limit) : page;

      let nextCursor: string | null = null;
      if (hasMore && pageItems.length > 0) {
        const last = pageItems[pageItems.length - 1]!;
        nextCursor = Buffer.from(
          JSON.stringify({ sortValue: last.createdAt, id: last.id }),
        ).toString("base64url");
      }

      return { items: pageItems, nextCursor, totalCount };
    },

    async create(data) {
      const invoice: Invoice & { lineItems: InvoiceLineItem[] } = {
        ...data,
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

    async delete(id) {
      invoices.delete(id);
    },

    async count(filters) {
      let items = Array.from(invoices.values());
      if (filters?.status) {
        items = items.filter((i) => i.status === filters.status);
      }
      return items.length;
    },
  };
}

// --- Tests ---

describe("InvoiceModule", () => {
  let repo: ReturnType<typeof createInMemoryRepository>;
  let module: InvoiceModule;

  beforeEach(() => {
    repo = createInMemoryRepository();
    module = new InvoiceModule(repo);
  });

  function makeLineItems(
    items: { description: string; quantity: number; unitPriceDzd: number }[],
  ) {
    return items.map((item, idx) => ({
      id: `li-${idx + 1}`,
      description: item.description,
      quantity: item.quantity,
      unitPriceDzd: item.unitPriceDzd,
    }));
  }

  describe("create", () => {
    it("creates an invoice with line items in DRAFT status", async () => {
      const result = await module.create({
        id: "inv-1",
        supplierName: "Acme Corp",
        lineItems: makeLineItems([
          { description: "Cement", quantity: 10, unitPriceDzd: 500 },
          { description: "Sand", quantity: 5, unitPriceDzd: 200 },
        ]),
      });

      expect(result.status).toBe("DRAFT");
      expect(result.supplierName).toBe("Acme Corp");
      expect(result.totalAmountDzd).toBe(6000); // 10*500 + 5*200
      expect(result.remainingAmountDzd).toBe(6000);
      expect(result.paidAmountDzd).toBe(0);
      expect(result.lineItems).toHaveLength(2);
      expect(result.lineItems[0]!.description).toBe("Cement");
      expect(result.lineItems[0]!.totalDzd).toBe(5000);
    });

    it("calculates totals from line items automatically", async () => {
      const result = await module.create({
        id: "inv-2",
        supplierName: "Build Co",
        lineItems: makeLineItems([
          { description: "Bricks", quantity: 100, unitPriceDzd: 10 },
        ]),
      });

      expect(result.totalAmountDzd).toBe(1000);
      expect(result.remainingAmountDzd).toBe(1000);
    });

    it("throws when line items are empty", async () => {
      await expect(
        module.create({
          id: "inv-3",
          supplierName: "Empty Co",
          lineItems: [],
        }),
      ).rejects.toThrow("at least one line item");
    });
  });

  describe("update", () => {
    it("updates invoice fields", async () => {
      await module.create({
        id: "inv-1",
        supplierName: "Acme Corp",
        lineItems: makeLineItems([
          { description: "Cement", quantity: 10, unitPriceDzd: 500 },
        ]),
      });

      const updated = await module.update({
        id: "inv-1",
        supplierName: "Acme Industries",
        notes: "Updated supplier name",
      });

      expect(updated.supplierName).toBe("Acme Industries");
      expect(updated.notes).toBe("Updated supplier name");
    });

    it("recalculates totals when line items change", async () => {
      await module.create({
        id: "inv-1",
        supplierName: "Acme Corp",
        lineItems: makeLineItems([
          { description: "Cement", quantity: 10, unitPriceDzd: 500 },
        ]),
      });

      const updated = await module.update({
        id: "inv-1",
        lineItems: makeLineItems([
          { description: "Sand", quantity: 20, unitPriceDzd: 100 },
        ]),
      });

      expect(updated.totalAmountDzd).toBe(2000);
      expect(updated.remainingAmountDzd).toBe(2000);
      expect(updated.lineItems).toHaveLength(1);
      expect(updated.lineItems[0]!.description).toBe("Sand");
    });

    it("throws when invoice not found", async () => {
      await expect(
        module.update({ id: "nonexistent", supplierName: "X" }),
      ).rejects.toThrow("not found");
    });

    it("throws when trying to update a RECEIVED invoice", async () => {
      await module.create({
        id: "inv-1",
        supplierName: "Acme Corp",
        lineItems: makeLineItems([
          { description: "Cement", quantity: 10, unitPriceDzd: 500 },
        ]),
      });
      await module.receive("inv-1");

      await expect(
        module.update({ id: "inv-1", supplierName: "Changed" }),
      ).rejects.toThrow("DRAFT");
    });
  });

  describe("delete", () => {
    it("deletes a DRAFT invoice", async () => {
      await module.create({
        id: "inv-1",
        supplierName: "Acme Corp",
        lineItems: makeLineItems([
          { description: "Cement", quantity: 10, unitPriceDzd: 500 },
        ]),
      });

      await module.delete("inv-1");
      const found = await module.findById("inv-1");
      expect(found).toBeNull();
    });

    it("throws when trying to delete a RECEIVED invoice", async () => {
      await module.create({
        id: "inv-1",
        supplierName: "Acme Corp",
        lineItems: makeLineItems([
          { description: "Cement", quantity: 10, unitPriceDzd: 500 },
        ]),
      });
      await module.receive("inv-1");

      await expect(module.delete("inv-1")).rejects.toThrow("DRAFT");
    });

    it("throws when invoice not found", async () => {
      await expect(module.delete("nonexistent")).rejects.toThrow("not found");
    });
  });

  describe("receive", () => {
    it("transitions invoice from DRAFT to RECEIVED", async () => {
      await module.create({
        id: "inv-1",
        supplierName: "Acme Corp",
        lineItems: makeLineItems([
          { description: "Cement", quantity: 10, unitPriceDzd: 500 },
        ]),
      });

      const result = await module.receive("inv-1");
      expect(result.invoice.status).toBe("RECEIVED");
      expect(result.debtEntryId).toBeDefined();
      expect(result.debtEntryId).toContain("debt-");
    });

    it("throws when trying to receive a non-DRAFT invoice", async () => {
      await module.create({
        id: "inv-1",
        supplierName: "Acme Corp",
        lineItems: makeLineItems([
          { description: "Cement", quantity: 10, unitPriceDzd: 500 },
        ]),
      });
      await module.receive("inv-1");

      await expect(module.receive("inv-1")).rejects.toThrow("DRAFT");
    });

    it("throws when invoice not found", async () => {
      await expect(module.receive("nonexistent")).rejects.toThrow("not found");
    });
  });

  describe("findById", () => {
    it("returns invoice with line items", async () => {
      await module.create({
        id: "inv-1",
        supplierName: "Acme Corp",
        lineItems: makeLineItems([
          { description: "Cement", quantity: 10, unitPriceDzd: 500 },
        ]),
      });

      const found = await module.findById("inv-1");
      expect(found).not.toBeNull();
      expect(found!.supplierName).toBe("Acme Corp");
      expect(found!.lineItems).toHaveLength(1);
    });

    it("returns null for nonexistent invoice", async () => {
      const found = await module.findById("nonexistent");
      expect(found).toBeNull();
    });
  });

  describe("listPaged", () => {
    it("returns paginated invoices", async () => {
      // Create 3 invoices
      for (let i = 1; i <= 3; i++) {
        await module.create({
          id: `inv-${i}`,
          supplierName: `Supplier ${i}`,
          lineItems: makeLineItems([
            { description: `Item ${i}`, quantity: i, unitPriceDzd: 100 },
          ]),
        });
      }

      const result = await module.listPaged({ limit: 2 });
      expect(result.items).toHaveLength(2);
      expect(result.totalCount).toBe(3);
      expect(result.nextCursor).not.toBeNull();
    });

    it("filters by status", async () => {
      await module.create({
        id: "inv-1",
        supplierName: "Acme",
        lineItems: makeLineItems([{ description: "A", quantity: 1, unitPriceDzd: 100 }]),
      });
      await module.create({
        id: "inv-2",
        supplierName: "Build",
        lineItems: makeLineItems([{ description: "B", quantity: 1, unitPriceDzd: 200 }]),
      });
      await module.receive("inv-1");

      const result = await module.listPaged({
        filters: { status: "RECEIVED" },
        limit: 10,
      });
      expect(result.items).toHaveLength(1);
      expect(result.items[0]!.status).toBe("RECEIVED");
    });
  });

  describe("markPaid", () => {
    it("transitions invoice from RECEIVED to PAID", async () => {
      await module.create({
        id: "inv-1",
        supplierName: "Acme Corp",
        lineItems: makeLineItems([
          { description: "Cement", quantity: 10, unitPriceDzd: 500 },
        ]),
      });
      await module.receive("inv-1");

      const result = await module.markPaid("inv-1", 6000);
      expect(result.status).toBe("PAID");
      expect(result.paidAmountDzd).toBe(6000);
      expect(result.remainingAmountDzd).toBe(0);
    });

    it("throws when trying to mark a DRAFT invoice as paid", async () => {
      await module.create({
        id: "inv-1",
        supplierName: "Acme Corp",
        lineItems: makeLineItems([
          { description: "Cement", quantity: 10, unitPriceDzd: 500 },
        ]),
      });

      await expect(module.markPaid("inv-1", 5000)).rejects.toThrow("RECEIVED");
    });
  });
});
