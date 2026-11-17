import { describe, expect, it } from "vitest";
import { getTableConfig, SQLiteSyncDialect } from "drizzle-orm/sqlite-core";
import { employeeSalaryPaymentSplit } from "./company";

describe("salary split schema parity", () => {
  it("declares the existing positive-day SQL check without imposing payment/project uniqueness", () => {
    const config = getTableConfig(employeeSalaryPaymentSplit);
    const dialect = new SQLiteSyncDialect();
    expect(config.checks.map(check => dialect.sqlToQuery(check.value).sql)).toContain('"employee_salary_payment_split"."days" > 0');
    expect(config.uniqueConstraints).toEqual([]);
    expect(config.indexes.filter(index => index.config.unique)).toEqual([]);
  });
});
