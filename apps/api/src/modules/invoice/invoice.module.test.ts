import { beforeEach, describe, expect, it } from "vitest";

import { createInMemoryInvoiceDebtPort } from "./adapters/invoice-debt.port";
import { createInMemoryInvoiceRepository } from "./adapters/in-memory-invoice.repository";
import { InvoiceModule } from "./invoice.module";
import type {
  CreateInvoiceInput,
  InvoiceDebtPort,
  UpdateInvoiceInput,
} from "./invoice.types";
import {
  EmptyLineItemsError,
  InvalidInvoiceCursorError,
  InvalidInvoiceStatusError,
  InvoiceDebtPortError,
  InvoiceNotFoundError,
} from "./invoice.types";

const ACTOR = {
  actorUserId: "user-1",
  actorLabel: "Test User",
  transactionId: "tx-1",
};

function makeLineItems(
  items: Array<{ description: string; quantity: number; unitPrice: number }>,
) {
  return items.map((item, idx) => ({
    id: `li-${idx + 1}`,
    description: item.description,
    quantity: item.quantity,
    unitPrice: item.unitPrice,
  }));
}

function makeInput(overrides: Partial<CreateInvoiceInput> = {}): CreateInvoiceInput {
  return {
    id: "inv-1",
    supplierName: "Acme Corp",
    lineItems: makeLineItems([
      { description: "Cement", quantity: 10, unitPrice: 500 },
      { description: "Sand", quantity: 5, unitPrice: 200 },
    ]),
    ...overrides,
  };
}

describe("InvoiceModule", () => {
  let module: InvoiceModule;
  let repo: ReturnType<typeof createInMemoryInvoiceRepository>;
  let debtPort: ReturnType<typeof createInMemoryInvoiceDebtPort>;

  beforeEach(() => {
    repo = createInMemoryInvoiceRepository();
    debtPort = createInMemoryInvoiceDebtPort();
    module = new InvoiceModule(repo, debtPort);
  });

  describe("create", () => {
    it("creates an invoice with line items in DRAFT status", async () => {
      const result = await module.create(makeInput({ id: "inv-1" }));
      expect(result.status).toBe("DRAFT");
      expect(result.supplierName).toBe("Acme Corp");
      expect(result.totalAmount).toBe(6000);
      expect(result.remainingAmount).toBe(6000);
      expect(result.paidAmount).toBe(0);
      expect(result.lineItems).toHaveLength(2);
      expect(result.lineItems[0]!.description).toBe("Cement");
      expect(result.lineItems[0]!.total).toBe(5000);
      expect(result.currency).toBe("DZD");
    });

    it("respects explicit currency when provided", async () => {
      const result = await module.create(makeInput({ id: "inv-1", currency: "DZD" }));
      expect(result.currency).toBe("DZD");
    });

    it("throws EmptyLineItemsError when no line items", async () => {
      await expect(
        module.create(makeInput({ id: "inv-1", lineItems: [] })),
      ).rejects.toBeInstanceOf(EmptyLineItemsError);
    });
  });

  describe("update", () => {
    it("updates scalar invoice fields", async () => {
      await module.create(makeInput({ id: "inv-1" }));
      const updated = await module.update({
        id: "inv-1",
        supplierName: "Acme Industries",
        notes: "Updated",
      } satisfies UpdateInvoiceInput);
      expect(updated.supplierName).toBe("Acme Industries");
      expect(updated.notes).toBe("Updated");
    });

    it("recalculates totals when line items change", async () => {
      await module.create(makeInput({ id: "inv-1" }));
      const updated = await module.update({
        id: "inv-1",
        lineItems: makeLineItems([
          { description: "Sand", quantity: 20, unitPrice: 100 },
        ]),
      } satisfies UpdateInvoiceInput);
      expect(updated.totalAmount).toBe(2000);
      expect(updated.remainingAmount).toBe(2000);
      expect(updated.lineItems).toHaveLength(1);
    });

    it("updates currency", async () => {
      await module.create(makeInput({ id: "inv-1" }));
      const updated = await module.update({
        id: "inv-1",
        currency: "DZD",
      } satisfies UpdateInvoiceInput);
      expect(updated.currency).toBe("DZD");
    });

    it("throws InvoiceNotFoundError when invoice missing", async () => {
      await expect(
        module.update({ id: "missing" } satisfies UpdateInvoiceInput),
      ).rejects.toBeInstanceOf(InvoiceNotFoundError);
    });

    it("throws InvalidInvoiceStatusError when invoice is RECEIVED", async () => {
      await module.create(makeInput({ id: "inv-1" }));
      await module.receive("inv-1", ACTOR);
      await expect(
        module.update({ id: "inv-1", supplierName: "X" } satisfies UpdateInvoiceInput),
      ).rejects.toBeInstanceOf(InvalidInvoiceStatusError);
    });

    it("throws EmptyLineItemsError when line items become empty", async () => {
      await module.create(makeInput({ id: "inv-1" }));
      await expect(
        module.update({ id: "inv-1", lineItems: [] } satisfies UpdateInvoiceInput),
      ).rejects.toBeInstanceOf(EmptyLineItemsError);
    });
  });

  describe("delete", () => {
    it("deletes a DRAFT invoice", async () => {
      await module.create(makeInput({ id: "inv-1" }));
      await module.delete("inv-1");
      expect(await module.findById("inv-1")).toBeNull();
    });

    it("throws InvoiceNotFoundError when invoice missing", async () => {
      await expect(module.delete("missing")).rejects.toBeInstanceOf(
        InvoiceNotFoundError,
      );
    });

    it("throws InvalidInvoiceStatusError when invoice is RECEIVED", async () => {
      await module.create(makeInput({ id: "inv-1" }));
      await module.receive("inv-1", ACTOR);
      await expect(module.delete("inv-1")).rejects.toBeInstanceOf(
        InvalidInvoiceStatusError,
      );
    });
  });

  describe("receive", () => {
    it("transitions DRAFT to RECEIVED and creates a debt account", async () => {
      await module.create(makeInput({ id: "inv-1" }));
      const result = await module.receive("inv-1", ACTOR);

      expect(result.invoice.status).toBe("RECEIVED");
      expect(result.debtAccountId).toBeDefined();
      expect(result.invoice.debtAccountId).toBe(result.debtAccountId);

      // Debt port state: one OPENING entry recorded for this invoice
      const openingEntries = debtPort.state.entries.filter(
        (e) => e.invoiceId === "inv-1" && e.entryType === "OPENING",
      );
      expect(openingEntries).toHaveLength(1);
      expect(openingEntries[0]!.signedAmount).toBe(6000);
      expect(openingEntries[0]!.balanceAfter).toBe(6000);

      // One counterparty, one debt account
      expect(debtPort.state.counterparties.size).toBe(1);
      expect(debtPort.state.debtAccounts.size).toBe(1);
    });

    it("reuses an existing counterparty's debt account across invoices", async () => {
      await module.create(makeInput({ id: "inv-1" }));
      await module.create(
        makeInput({ id: "inv-2", supplierName: "Acme Corp" }),
      );

      await module.receive("inv-1", ACTOR);
      const second = await module.receive("inv-2", ACTOR);

      // Same counterparty → same debt account
      expect(second.debtAccountId).toBeDefined();
      const firstAccountId = (await module.findById("inv-1"))!.debtAccountId;
      expect(second.debtAccountId).toBe(firstAccountId);

      // Two OPENING entries on the same account
      const openings = debtPort.state.entries.filter(
        (e) => e.entryType === "OPENING",
      );
      expect(openings).toHaveLength(2);

      // Second OPENING's balanceAfter must layer on top of the first
      // one's running balance (not just reset to its own amount).
      const sorted = [...openings].sort((a, b) => a.invoiceId.localeCompare(b.invoiceId));
      expect(sorted[0]!.balanceAfter).toBe(6000);
      expect(sorted[1]!.balanceAfter).toBe(12000);
    });

    it("throws InvoiceNotFoundError when invoice missing", async () => {
      await expect(module.receive("missing", ACTOR)).rejects.toBeInstanceOf(
        InvoiceNotFoundError,
      );
    });

    it("throws InvalidInvoiceStatusError when invoice already RECEIVED", async () => {
      await module.create(makeInput({ id: "inv-1" }));
      await module.receive("inv-1", ACTOR);
      await expect(module.receive("inv-1", ACTOR)).rejects.toBeInstanceOf(
        InvalidInvoiceStatusError,
      );
    });

    it("throws InvoiceDebtPortError when debt port fails", async () => {
      await module.create(makeInput({ id: "inv-1" }));
      const failingPort: InvoiceDebtPort = {
        createInvoiceDebt: async () => {
          throw new Error("db down");
        },
        recordInvoicePayment: async () => {
          throw new Error("not used");
        },
      };
      const failingModule = new InvoiceModule(repo, failingPort);
      await expect(
        failingModule.receive("inv-1", ACTOR),
      ).rejects.toBeInstanceOf(InvoiceDebtPortError);
    });

  });

  describe("findById", () => {
    it("returns invoice with line items", async () => {
      await module.create(makeInput({ id: "inv-1" }));
      const found = await module.findById("inv-1");
      expect(found).not.toBeNull();
      expect(found!.supplierName).toBe("Acme Corp");
      expect(found!.lineItems).toHaveLength(2);
    });

    it("returns null when missing", async () => {
      expect(await module.findById("missing")).toBeNull();
    });
  });

  describe("listPaged", () => {
    it("returns paginated invoices with nextCursor", async () => {
      for (let i = 1; i <= 3; i++) {
        await module.create(
          makeInput({
            id: `inv-${i}`,
            supplierName: `Supplier ${i}`,
            lineItems: makeLineItems([
              { description: `Item ${i}`, quantity: i, unitPrice: 100 },
            ]),
          }),
        );
      }
      const result = await module.listPaged({ limit: 2 });
      expect(result.items).toHaveLength(2);
      expect(result.totalCount).toBe(3);
      expect(result.nextCursor).not.toBeNull();
    });

    it("filters by status", async () => {
      await module.create(makeInput({ id: "inv-1", supplierName: "Acme" }));
      await module.create(makeInput({ id: "inv-2", supplierName: "Build" }));
      await module.receive("inv-1", ACTOR);

      const result = await module.listPaged({
        filters: { status: "RECEIVED" },
        limit: 10,
      });
      expect(result.items).toHaveLength(1);
      expect(result.items[0]!.status).toBe("RECEIVED");
    });

    it("filters by supplierName (case-insensitive substring)", async () => {
      await module.create(makeInput({ id: "inv-1", supplierName: "Acme Corp" }));
      await module.create(makeInput({ id: "inv-2", supplierName: "Build Co" }));

      const result = await module.listPaged({
        filters: { supplierName: "acme" },
        limit: 10,
      });
      expect(result.items).toHaveLength(1);
      expect(result.items[0]!.supplierName).toBe("Acme Corp");
    });

    it("follows cursor to fetch next page", async () => {
      for (let i = 1; i <= 3; i++) {
        await module.create(
          makeInput({
            id: `inv-${i}`,
            supplierName: `Supplier ${i}`,
            lineItems: makeLineItems([
              { description: `Item ${i}`, quantity: i, unitPrice: 100 },
            ]),
          }),
        );
      }
      const first = await module.listPaged({ limit: 2 });
      const second = await module.listPaged({
        limit: 2,
        cursor: first.nextCursor ?? undefined,
      });
      expect(second.items.length + first.items.length).toBe(3);
    });

    it("throws InvalidInvoiceCursorError on garbage cursor", async () => {
      await expect(
        module.listPaged({ limit: 10, cursor: "not-a-real-cursor" }),
      ).rejects.toBeInstanceOf(InvalidInvoiceCursorError);
    });

    it("throws InvalidInvoiceCursorError on valid JSON but wrong shape", async () => {
      const bad = Buffer.from(JSON.stringify({ not: "right" })).toString(
        "base64url",
      );
      await expect(
        module.listPaged({ limit: 10, cursor: bad }),
      ).rejects.toBeInstanceOf(InvalidInvoiceCursorError);
    });

    it("throws InvalidInvoiceCursorError on JSON with wrong id type", async () => {
      const bad = Buffer.from(
        JSON.stringify({ sortValue: 1, id: 42 }),
      ).toString("base64url");
      await expect(
        module.listPaged({ limit: 10, cursor: bad }),
      ).rejects.toBeInstanceOf(InvalidInvoiceCursorError);
    });

    it("throws InvalidInvoiceCursorError on JSON with wrong sortValue type", async () => {
      const bad = Buffer.from(
        JSON.stringify({ sortValue: true, id: "x" }),
      ).toString("base64url");
      await expect(
        module.listPaged({ limit: 10, cursor: bad }),
      ).rejects.toBeInstanceOf(InvalidInvoiceCursorError);
    });

    it("throws InvalidInvoiceCursorError on JSON array", async () => {
      const bad = Buffer.from(JSON.stringify([])).toString("base64url");
      await expect(
        module.listPaged({ limit: 10, cursor: bad }),
      ).rejects.toBeInstanceOf(InvalidInvoiceCursorError);
    });

    it("accepts null sortValue in cursor (for nullable invoiceDate sort)", async () => {
      const cursor = Buffer.from(
        JSON.stringify({ sortValue: null, id: "inv-x" }),
      ).toString("base64url");
      const result = await module.listPaged({
        limit: 10,
        sort: { field: "invoiceDate", direction: "asc" },
        cursor,
      });
      // Should not throw and should return the existing invoices.
      expect(result.items).toBeDefined();
    });

    it("ASC sort: after null-group cursor, returns non-null rows (nullBoundaryPassed)", async () => {
      // Force at least one invoice with non-null invoiceDate.
      await module.create(
        makeInput({
          id: "inv-dated",
          supplierName: "Dated",
          invoiceDate: "2024-05-01T00:00:00.000Z",
        }),
      );
      // Force at least one invoice with null invoiceDate.
      await module.create(
        makeInput({
          id: "inv-undated",
          supplierName: "Undated",
          invoiceDate: null,
        }),
      );
      // Walk pagination with small limit. Eventually we should see BOTH
      // dated and undated invoices, not just one of them.
      const seen = new Set<string>();
      let cursor: string | undefined;
      for (let i = 0; i < 5; i++) {
        const result = await module.listPaged({
          limit: 1,
          sort: { field: "invoiceDate", direction: "asc" },
          ...(cursor ? { cursor } : {}),
        });
        for (const it of result.items) seen.add(it.id);
        cursor = result.nextCursor ?? undefined;
        if (!cursor) break;
      }
      expect(seen.has("inv-dated")).toBe(true);
      expect(seen.has("inv-undated")).toBe(true);
    });

    it("ASC sort: null group larger than limit does not skip null rows", async () => {
      // Three null-dated invoices + one dated invoice. With limit=2 and
      // ASC sort, page 1 = [null_a, null_b], page 2 = [null_c, dated].
      // The encoder must NOT emit nullBoundaryPassed after page 1
      // because the next row (null_c) is still null — emitting the
      // boundary cursor would silently drop null_c.
      await module.create(
        makeInput({ id: "null-a", supplierName: "Na", invoiceDate: null }),
      );
      await module.create(
        makeInput({ id: "null-b", supplierName: "Nb", invoiceDate: null }),
      );
      await module.create(
        makeInput({ id: "null-c", supplierName: "Nc", invoiceDate: null }),
      );
      await module.create(
        makeInput({
          id: "dated",
          supplierName: "D",
          invoiceDate: "2024-05-01T00:00:00.000Z",
        }),
      );

      const seen: string[] = [];
      let cursor: string | undefined;
      for (let i = 0; i < 10; i++) {
        const result = await module.listPaged({
          limit: 2,
          sort: { field: "invoiceDate", direction: "asc" },
          ...(cursor ? { cursor } : {}),
        });
        for (const it of result.items) seen.push(it.id);
        cursor = result.nextCursor ?? undefined;
        if (!cursor) break;
      }
      // All four invoices must appear exactly once.
      expect(new Set(seen).size).toBe(4);
      expect(seen.sort()).toEqual(["dated", "null-a", "null-b", "null-c"].sort());
    });

    it("ASC sort: null group exactly fits in last null-only page", async () => {
      // Two nulls + one dated, limit=2. Page 1 should yield
      // [null-a, null-b] with a boundary cursor (so dated is reachable
      // even though its id sorts before null-b lexically).
      await module.create(
        makeInput({ id: "null-a", supplierName: "Na", invoiceDate: null }),
      );
      await module.create(
        makeInput({ id: "null-b", supplierName: "Nb", invoiceDate: null }),
      );
      await module.create(
        makeInput({
          id: "dated",
          supplierName: "D",
          invoiceDate: "2024-05-01T00:00:00.000Z",
        }),
      );

      const seen: string[] = [];
      let cursor: string | undefined;
      for (let i = 0; i < 10; i++) {
        const result = await module.listPaged({
          limit: 2,
          sort: { field: "invoiceDate", direction: "asc" },
          ...(cursor ? { cursor } : {}),
        });
        for (const it of result.items) seen.push(it.id);
        cursor = result.nextCursor ?? undefined;
        if (!cursor) break;
      }
      expect(new Set(seen).size).toBe(3);
    });

    it("ASC sort: 12 null rows + 1 dated, limit=10 — all 13 reachable", async () => {
      // Stress test for the boundary-cursor flow: null group larger
      // than limit. Page 1 returns rows 1-10 (all null) with a
      // boundary cursor; page 2's decoder must include remaining null
      // rows 11-12 plus the dated row.
      for (let i = 1; i <= 12; i++) {
        await module.create(
          makeInput({
            id: `n${i.toString().padStart(2, "0")}`,
            supplierName: `N${i}`,
            invoiceDate: null,
          }),
        );
      }
      await module.create(
        makeInput({
          id: "dated",
          supplierName: "D",
          invoiceDate: "2024-05-01T00:00:00.000Z",
        }),
      );

      const seen: string[] = [];
      let cursor: string | undefined;
      for (let i = 0; i < 10; i++) {
        const result = await module.listPaged({
          limit: 10,
          sort: { field: "invoiceDate", direction: "asc" },
          ...(cursor ? { cursor } : {}),
        });
        for (const it of result.items) seen.push(it.id);
        cursor = result.nextCursor ?? undefined;
        if (!cursor) break;
      }
      expect(new Set(seen).size).toBe(13);
      expect(seen).toContain("dated");
      expect(seen).toContain("n01");
      expect(seen).toContain("n12");
    });
  });

  describe("markPaid", () => {
    it("transitions RECEIVED to PAID when payment covers full amount", async () => {
      await module.create(makeInput({ id: "inv-1" }));
      await module.receive("inv-1", ACTOR);

      const result = await module.markPaid("inv-1", 6000, ACTOR);
      expect(result.status).toBe("PAID");
      expect(result.paidAmount).toBe(6000);
      expect(result.remainingAmount).toBe(0);

      // Debt port: OPENING + PAYMENT entries
      const entries = debtPort.state.entries.filter((e) => e.invoiceId === "inv-1");
      expect(entries).toHaveLength(2);
      expect(entries[1]!.entryType).toBe("PAYMENT");
      expect(entries[1]!.signedAmount).toBe(-6000);

      // Counterparty debt settled
      const account = Array.from(debtPort.state.debtAccounts.values())[0]!;
      expect(account.balance).toBe(0);
      expect(account.settled).toBe(true);
    });

    it("keeps invoice RECEIVED with remaining when partially paid", async () => {
      await module.create(makeInput({ id: "inv-1" }));
      await module.receive("inv-1", ACTOR);

      const result = await module.markPaid("inv-1", 2000, ACTOR);
      expect(result.status).toBe("RECEIVED");
      expect(result.paidAmount).toBe(2000);
      expect(result.remainingAmount).toBe(4000);

      const account = Array.from(debtPort.state.debtAccounts.values())[0]!;
      expect(account.balance).toBe(4000);
      expect(account.settled).toBe(false);
    });

    it("clamps remaining to zero on overpayment and transitions to PAID", async () => {
      await module.create(makeInput({ id: "inv-1" }));
      await module.receive("inv-1", ACTOR);

      const result = await module.markPaid("inv-1", 10000, ACTOR);
      expect(result.status).toBe("PAID");
      expect(result.paidAmount).toBe(10000);
      expect(result.remainingAmount).toBe(0);
    });

    it("accumulates payments across multiple markPaid calls", async () => {
      await module.create(makeInput({ id: "inv-1" }));
      await module.receive("inv-1", ACTOR);

      const first = await module.markPaid("inv-1", 2000, ACTOR);
      expect(first.status).toBe("RECEIVED");

      const second = await module.markPaid("inv-1", 4000, ACTOR);
      expect(second.status).toBe("PAID");
      expect(second.paidAmount).toBe(6000);
      expect(second.remainingAmount).toBe(0);
    });

    it("throws InvoiceNotFoundError when invoice missing", async () => {
      await expect(
        module.markPaid("missing", 100, ACTOR),
      ).rejects.toBeInstanceOf(InvoiceNotFoundError);
    });

    it("throws InvalidInvoiceStatusError when invoice is DRAFT", async () => {
      await module.create(makeInput({ id: "inv-1" }));
      await expect(
        module.markPaid("inv-1", 5000, ACTOR),
      ).rejects.toBeInstanceOf(InvalidInvoiceStatusError);
    });

    it("throws InvoiceDebtPortError on non-positive amount", async () => {
      await module.create(makeInput({ id: "inv-1" }));
      await module.receive("inv-1", ACTOR);
      await expect(
        module.markPaid("inv-1", 0, ACTOR),
      ).rejects.toBeInstanceOf(InvoiceDebtPortError);
    });

    it("throws InvoiceDebtPortError when port fails", async () => {
      await module.create(makeInput({ id: "inv-1" }));
      await module.receive("inv-1", ACTOR);
      const failingPort: InvoiceDebtPort = {
        createInvoiceDebt: async () => ({ debtAccountId: "stub" }),
        recordInvoicePayment: async () => {
          throw new Error("db down");
        },
      };
      const failingModule = new InvoiceModule(repo, failingPort);
      await expect(
        failingModule.markPaid("inv-1", 1000, ACTOR),
      ).rejects.toBeInstanceOf(InvoiceDebtPortError);
    });

    it("throws InvoiceDebtPortError when invoice has no debt account", async () => {
      await module.create(makeInput({ id: "inv-1" }));
      // Move the invoice straight to RECEIVED with no debt account
      // by mutating the in-memory repo directly. Defensive branch.
      const stored = repo._invoices.get("inv-1")!;
      stored.status = "RECEIVED";
      stored.debtAccountId = null;
      await expect(
        module.markPaid("inv-1", 1000, ACTOR),
      ).rejects.toBeInstanceOf(InvoiceDebtPortError);
    });

    it("accepts dueDate on update", async () => {
      await module.create(makeInput({ id: "inv-1" }));
      const updated = await module.update({
        id: "inv-1",
        dueDate: "2026-08-01",
      } as UpdateInvoiceInput);
      expect(updated.dueDate).toBe("2026-08-01");
    });

    it("accepts invoiceDate on update", async () => {
      await module.create(makeInput({ id: "inv-1" }));
      const updated = await module.update({
        id: "inv-1",
        invoiceDate: "2026-07-15",
      } as UpdateInvoiceInput);
      expect(updated.invoiceDate).toBe("2026-07-15");
    });

    it("accepts projectId on update", async () => {
      await module.create(makeInput({ id: "inv-1" }));
      const updated = await module.update({
        id: "inv-1",
        projectId: "00000000-0000-0000-0000-000000000001",
      } as UpdateInvoiceInput);
      expect(updated.projectId).toBe("00000000-0000-0000-0000-000000000001");
    });

    it("updates all scalar fields at once", async () => {
      await module.create(makeInput({ id: "inv-1" }));
      const updated = await module.update({
        id: "inv-1",
        invoiceNumber: "INV-99",
        supplierName: "New Supplier",
        supplierPhone: "+213555",
        warehouseId: "00000000-0000-0000-0000-000000000002",
        projectId: "00000000-0000-0000-0000-000000000003",
        invoiceDate: "2026-07-15",
        dueDate: "2026-08-01",
        notes: "paid",
      } as UpdateInvoiceInput);
      expect(updated.invoiceNumber).toBe("INV-99");
      expect(updated.supplierName).toBe("New Supplier");
      expect(updated.supplierPhone).toBe("+213555");
      expect(updated.warehouseId).toBe("00000000-0000-0000-0000-000000000002");
      expect(updated.projectId).toBe("00000000-0000-0000-0000-000000000003");
      expect(updated.invoiceDate).toBe("2026-07-15");
      expect(updated.dueDate).toBe("2026-08-01");
      expect(updated.notes).toBe("paid");
    });
  });
});