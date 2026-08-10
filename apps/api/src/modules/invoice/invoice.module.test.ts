import { afterEach, beforeEach, describe, expect, it } from "vitest";
import Database from "better-sqlite3";

import { createInMemoryInvoiceDebtPort } from "./adapters/invoice-debt.port";
import { createInMemoryInvoiceRepository } from "./adapters/in-memory-invoice.repository";
import { InvoiceRepository } from "./adapters/invoice.repository";
import { createFifoLock } from "../../infrastructure/database/fifo-lock";
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

    it("defaults direction to PURCHASE when not specified", async () => {
      const result = await module.create(makeInput({ id: "inv-1" }));
      expect(result.direction).toBe("PURCHASE");
    });

    it("accepts explicit SALE direction on create", async () => {
      const result = await module.create(makeInput({ id: "inv-1", direction: "SALE" }));
      expect(result.direction).toBe("SALE");
    });

    it("accepts explicit PURCHASE direction on create", async () => {
      const result = await module.create(makeInput({ id: "inv-1", direction: "PURCHASE" }));
      expect(result.direction).toBe("PURCHASE");
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

    it("updates direction on a DRAFT invoice", async () => {
      await module.create(makeInput({ id: "inv-1" }));
      const updated = await module.update({
        id: "inv-1",
        direction: "SALE",
      } satisfies UpdateInvoiceInput);
      expect(updated.direction).toBe("SALE");
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

    it("re-opens a settled counterparty account when a new invoice arrives", async () => {
      // First invoice: receive + full payment -> account settles to 0.
      await module.create(makeInput({ id: "inv-1" }));
      await module.receive("inv-1", ACTOR);
      await module.markPaid("inv-1", 6000, ACTOR);

      const account = Array.from(debtPort.state.debtAccounts.values())[0]!;
      expect(account.balance).toBe(0);
      expect(account.settled).toBe(true);

      // Second invoice from the same supplier. The account must move
      // back to OPEN with the new OPENING's balanceAfter, NOT stay in
      // SETTLED with balance=0 (the bug from Greptile 3/5 review).
      await module.create(
        makeInput({ id: "inv-2", supplierName: "Acme Corp" }),
      );
      await module.receive("inv-2", ACTOR);

      expect(account.balance).toBe(6000);
      expect(account.settled).toBe(false);

      // First partial payment should now settle against the running
      // balance, not against the stale zero.
      const partial = await module.markPaid("inv-2", 2000, ACTOR);
      expect(partial.status).toBe("RECEIVED");
      expect(account.balance).toBe(4000);
      expect(account.settled).toBe(false);
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

    it("creates RECEIVABLE debt account when direction is SALE", async () => {
      await module.create(makeInput({ id: "inv-1", direction: "SALE" }));
      await module.receive("inv-1", ACTOR);

      // In-memory debt port stores direction alongside the account
      const accounts = Array.from(debtPort.state.debtAccounts.entries());
      const accountKey = accounts.find(([, acct]) =>
        acct.direction === "RECEIVABLE",
      );
      expect(accountKey).toBeDefined();

      // A SALE invoice should NOT create a PAYABLE account
      const payableKey = accounts.find(([, acct]) =>
        acct.direction === "PAYABLE",
      );
      expect(payableKey).toBeUndefined();
    });

    it("creates PAYABLE debt account when direction is PURCHASE (default)", async () => {
      await module.create(makeInput({ id: "inv-2" }));
      await module.receive("inv-2", ACTOR);

      const accounts = Array.from(debtPort.state.debtAccounts.entries());
      const payableKey = accounts.find(([, acct]) =>
        acct.direction === "PAYABLE",
      );
      expect(payableKey).toBeDefined();

      // A PURCHASE invoice should NOT create a RECEIVABLE account
      const receivableKey = accounts.find(([, acct]) =>
        acct.direction === "RECEIVABLE",
      );
      expect(receivableKey).toBeUndefined();
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

describe("InvoiceRepository findPaged", () => {
  // Regression test for Greptile 3/5 P1: the SQLite findPaged previously
  // hard-coded lineItems: [] and never queried invoice_line_item. This
  // integration test exercises the real adapter to prove the list
  // endpoint now returns populated line-item arrays matching what the
  // get endpoint returns for the same record.
  let db: Database.Database;
  let repo: InvoiceRepository;
  let module: InvoiceModule;
  let debtPort: ReturnType<typeof createInMemoryInvoiceDebtPort>;

  beforeEach(() => {
    db = new Database(":memory:");
    db.pragma("foreign_keys = ON");
    db.exec(`
      CREATE TABLE "invoice" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "invoice_number" TEXT,
        "supplier_name" TEXT NOT NULL,
        "supplier_phone" TEXT,
        "warehouse_id" TEXT,
        "project_id" TEXT,
        "status" TEXT NOT NULL,
        "direction" TEXT NOT NULL DEFAULT 'PURCHASE',
        "invoice_date" DATETIME,
        "due_date" DATETIME,
        "currency" TEXT NOT NULL DEFAULT 'DZD',
        "total_amount" REAL NOT NULL DEFAULT 0,
        "paid_amount" REAL NOT NULL DEFAULT 0,
        "remaining_amount" REAL NOT NULL DEFAULT 0,
        "debt_account_id" TEXT,
        "notes" TEXT,
        "created_at" DATETIME NOT NULL,
        "updated_at" DATETIME NOT NULL
      );
      CREATE TABLE "invoice_line_item" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "invoice_id" TEXT NOT NULL,
        "description" TEXT NOT NULL,
        "quantity" REAL NOT NULL,
        "unit_price" REAL NOT NULL,
        "total" REAL NOT NULL,
        FOREIGN KEY ("invoice_id") REFERENCES "invoice" ("id") ON DELETE CASCADE
      );
    `);
    repo = new InvoiceRepository(db, createFifoLock());
    debtPort = createInMemoryInvoiceDebtPort();
    module = new InvoiceModule(repo, debtPort);
  });

  afterEach(() => {
    db.close();
  });

  it("returns populated lineItems for every invoice in listPaged", async () => {
    // Use unique line-item ids per invoice so the UNIQUE constraint on
    // invoice_line_item.id doesn't collide.
    const input1 = makeInput({ id: "inv-1", supplierName: "A" });
    const input2 = makeInput({ id: "inv-2", supplierName: "B" });
    input2.lineItems = input2.lineItems.map((li, idx) => ({
      ...li,
      id: `li-2-${idx + 1}`,
    }));
    await module.create(input1);
    await module.create(input2);

    const result = await module.listPaged({ limit: 10 });
    expect(result.items).toHaveLength(2);
    for (const item of result.items) {
      expect(item.lineItems.length).toBeGreaterThan(0);
      expect(item.lineItems[0]!.invoiceId).toBe(item.id);
      expect(item.lineItems[0]!.description).toBeDefined();
      expect(item.lineItems[0]!.unitPrice).toBeGreaterThan(0);
    }

    // Also confirm line items match what findById returns.
    const single = await module.findById("inv-1");
    expect(single!.lineItems).toEqual(
      result.items.find((i) => i.id === "inv-1")!.lineItems,
    );
  });

  it("markPaid rolls back the debt-port payment when updateStatus throws", async () => {
    // The previous code did debtPort.recordInvoicePayment() and then
    // repo.updateStatus() as two separate, non-atomic operations. A
    // transient failure between the two left the debt account showing
    // the payment while the invoice retained pre-payment amounts.
    // Fix: markPaid now wraps both calls in repo.runInTransaction, so
    // a failure inside the second call rolls back the first.
    //
    // This test directly verifies the rollback path: we stub
    // updateStatus to write a sentinel row to SQL BEFORE throwing.
    // If the BEGIN/COMMIT/ROLLBACK logic is correct, the sentinel row
    // must NOT be present after the throw.
    await module.create(makeInput({ id: "inv-1" }));
    await module.receive("inv-1", ACTOR);

    const originalUpdateStatus = repo.updateStatus.bind(repo);
    (repo as unknown as {
      updateStatus: (...args: unknown[]) => Promise<unknown>;
    }).updateStatus = async (...args: unknown[]) => {
      const id = args[0] as string;
      const status = args[1] as string;
      // Write a sentinel row, THEN throw. The transaction must roll
      // back this row.
      db.prepare(`INSERT INTO "_test_rollback" (id, label) VALUES (?, ?)`).run(
        id,
        `would-set-${status}`,
      );
      throw new Error("simulated DB failure on updateStatus");
    };
    db.exec(
      `CREATE TABLE IF NOT EXISTS "_test_rollback" (id TEXT NOT NULL, label TEXT NOT NULL)`,
    );

    try {
      await expect(module.markPaid("inv-1", 1000, ACTOR)).rejects.toThrow(
        /simulated DB failure/,
      );
    } finally {
      (repo as unknown as {
        updateStatus: typeof originalUpdateStatus;
      }).updateStatus = originalUpdateStatus;
    }

    // The sentinel row was written BEFORE the throw. If the BEGIN
    // /COMMIT/ROLLBACK logic is correct, ROLLBACK removed it.
    const sentinels = db
      .prepare(`SELECT COUNT(*) AS c FROM "_test_rollback"`)
      .get() as { c: number };
    expect(sentinels.c).toBe(0);

    // The invoice's paid_amount must NOT have changed either.
    const inv = (db
      .prepare(`SELECT paid_amount, status FROM "invoice" WHERE id = ?`)
      .get("inv-1") as { paid_amount: number; status: string } | undefined);
    expect(inv).toBeDefined();
    expect(inv!.paid_amount).toBe(0);
    expect(inv!.status).toBe("RECEIVED");
  });

  it("runInTransaction serializes concurrent callers", async () => {
    // Fire two transactions in parallel. Without serialization, the
    // second BEGIN fires while the first transaction is still open
    // and SQLite throws "cannot start a transaction within a
    // transaction". The mutex promise chain queues them.
    const results = await Promise.all([
      repo.runInTransaction(async () => {
        await new Promise((r) => setTimeout(r, 10));
        return "a";
      }),
      repo.runInTransaction(async () => {
        await new Promise((r) => setTimeout(r, 5));
        return "b";
      }),
    ]);
    expect(results).toEqual(["a", "b"]);
  });
});