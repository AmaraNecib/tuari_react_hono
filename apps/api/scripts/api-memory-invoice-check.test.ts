import assert from "node:assert/strict";
import { test } from "vitest";
import { assertDistinctFixtureInvoices } from "./api-memory-invoice-check";

const rows = Array.from({ length: 10 }, (_, i) => ({ id: `invoice-${i}`, warehouseId: `warehouse-${i}`, grossTotalDzd: "24.68" }));
test("accepts ten separate fixture invoices and warehouse links", () => {
  assert.doesNotThrow(() => assertDistinctFixtureInvoices(rows, 10));
});
test("rejects duplicated invoice identity despite correct count and totals", () => {
  assert.throws(() => assertDistinctFixtureInvoices(rows.map((row, i) => i === 9 ? rows[0] : row), 10), /Duplicate/);
});
test("rejects substituted warehouse link despite distinct invoice identities", () => {
  assert.throws(() => assertDistinctFixtureInvoices(rows.map(row => ({ ...row, warehouseId: rows[0].warehouseId })), 10), /Duplicate/);
});
test("rejects missing identities, wrong gross and missing rows", () => {
  assert.throws(() => assertDistinctFixtureInvoices(rows.map(row => ({ ...row, id: "" })), 10), /Missing/);
  assert.throws(() => assertDistinctFixtureInvoices(rows.map(row => ({ ...row, grossTotalDzd: "0.00" })), 10), /gross/);
  assert.throws(() => assertDistinctFixtureInvoices(rows.slice(1), 10), /count/);
});
