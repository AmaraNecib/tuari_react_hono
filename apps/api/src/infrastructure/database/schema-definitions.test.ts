import { describe, it, expect } from "vitest";
import {
  additiveStatements,
  createSchemaDefinitions,
  debtAccountBalanceRenameMigrationKey,
  invoiceDirectionMigrationKey,
  paymentAllocationRestrictMigrationKey,
  rolePermissionSeeds,
} from "./schema-definitions";
import { DEFAULT_ROLE_PERMISSIONS } from "../../modules/rbac/role-seeds";

describe("role_permission schema", () => {
  const definitions = createSchemaDefinitions();

  it("includes role_permission table creation", () => {
    const rolePermissionDef = definitions.find((d) =>
      d.includes('"role_permission"'),
    );
    expect(rolePermissionDef).toBeDefined();
    expect(rolePermissionDef).toContain("role_id");
    expect(rolePermissionDef).toContain("permission");
  });

  it("has foreign key to role table", () => {
    const rolePermissionDef = definitions.find((d) =>
      d.includes('"role_permission"'),
    );
    expect(rolePermissionDef).toContain('FOREIGN KEY ("role_id") REFERENCES "role" ("id")');
  });

  it("has unique constraint on role_id + permission", () => {
    const rolePermissionDef = definitions.find((d) =>
      d.includes('"role_permission"'),
    );
    expect(rolePermissionDef).toContain("UNIQUE");
  });
});

describe("employee authentication link", () => {
  const definitions = createSchemaDefinitions();

  it("allows an employee to exist without an authentication user", () => {
    const employeeDef = definitions.find((d) => d.includes('CREATE TABLE IF NOT EXISTS "employee"'));

    expect(employeeDef).toBeDefined();
    expect(employeeDef).toContain('"user_id" TEXT');
    expect(employeeDef).toContain('FOREIGN KEY ("user_id") REFERENCES "user" ("id")');
  });

  it("keeps the employee authentication link optional while enforcing one employee per user", () => {
    const employeeDef = definitions.find((d) => d.includes('CREATE TABLE IF NOT EXISTS "employee"'))!;
    const userIdLine = employeeDef.split("\n").find((line) => line.includes('"user_id" TEXT'))!;

    expect(userIdLine).not.toContain("NOT NULL");
    expect(employeeDef).toContain('UNIQUE ("user_id")');
  });

});

describe("debt_account schema (#21 rename migration)", () => {
  const definitions = createSchemaDefinitions();

  function getDebtAccountDefinition() {
    const def = definitions.find((d) => d.includes('"debt_account"'));
    if (!def) {
      throw new Error("debt_account CREATE TABLE statement not found in schemaStatements");
    }
    return def;
  }

  it("uses the new column name `current_balance` (no DZD suffix)", () => {
    // The previous column name was `current_balance_dzd`. The rename
    // migration (#21) drops the `_dzd` suffix to match the rest of the
    // schema (invoice.*_amount, debt_entry.signed_amount, etc).
    const def = getDebtAccountDefinition();
    expect(def).toContain('"current_balance"');
    expect(def).not.toContain('"current_balance_dzd"');
  });

  it("declares a unique migration key for the rename", () => {
    // The migration registers itself in `app_schema_state` under this
    // key. A constant makes the key discoverable from tests and from
    // the migration function itself.
    expect(debtAccountBalanceRenameMigrationKey).toBe("rename_debt_account_balance_drop_dzd_v1");
  });
});

describe("debt_account schema (#22 direction column)", () => {
  const definitions = createSchemaDefinitions();

  function getDebtAccountDefinition() {
    const def = definitions.find((d) => d.includes('"debt_account"'));
    if (!def) {
      throw new Error("debt_account CREATE TABLE statement not found in schemaStatements");
    }
    return def;
  }

  it("includes a `direction` column with PAYABLE/RECEIVABLE check constraint", () => {
    // Issue #22 splits each counterparty's debt into a payable and a
    // receivable ledger. Direction is set at account-creation time and
    // never changes; the CHECK constraint enforces the two-value enum
    // at the database boundary so a stray application bug can't land
    // an invalid value.
    const def = getDebtAccountDefinition();
    expect(def).toContain('"direction"');
    expect(def).toMatch(/"direction"\s+TEXT\s+NOT\s+NULL\s+CHECK\s*\(\s*"direction"\s+IN\s*\(\s*'PAYABLE'\s*,\s*'RECEIVABLE'\s*\)\s*\)/);
  });

  it("defaults `direction` to PAYABLE so legacy rows backfill correctly", () => {
    // Existing debt_account rows are all payable (pre-issue-#22). The
    // default of 'PAYABLE' makes the additive migration backfill
    // every existing row with the right value without an explicit
    // UPDATE.
    const def = getDebtAccountDefinition();
    expect(def).toMatch(/"direction"\s+TEXT\s+NOT\s+NULL\s+CHECK[\s\S]*?DEFAULT\s+'PAYABLE'/);
  });
});

describe("rolePermissionSeeds", () => {
  it("generates role_permission seed rows only for admin (the only role with permissions)", () => {
    const seeds = rolePermissionSeeds();
    const roleKeys = [...new Set(seeds.map((s) => s.roleId))];
    // Only admin has permissions, so only admin emits a seed row. The
    // workforce labels carry no permissions → no rows; manager/viewer removed.
    expect(roleKeys).toEqual(["admin"]);
    for (const key of ["manager", "viewer", "project_manager", "warehouse_manager", "worker"]) {
      expect(seeds.some((s) => s.roleId === key)).toBe(false);
    }
  });

  it("admin has all permissions", () => {
    const seeds = rolePermissionSeeds();
    const adminPerms = seeds
      .filter((s) => s.roleId === "admin")
      .map((s) => s.permission)
      .sort();
    const expected = [...DEFAULT_ROLE_PERMISSIONS.find((r) => r.role.key === "admin")!.permissions].sort();
    expect(adminPerms).toEqual(expected);
  });

  it("workforce labels carry no permissions (manager/viewer removed)", () => {
    const seeds = rolePermissionSeeds();
    for (const key of ["project_manager", "warehouse_manager", "worker"]) {
      expect(seeds.filter((s) => s.roleId === key).map((s) => s.permission)).toEqual([]);
    }
    // No seed rows exist for the removed manager/viewer roles at all.
    expect(seeds.some((s) => s.roleId === "manager")).toBe(false);
    expect(seeds.some((s) => s.roleId === "viewer")).toBe(false);
  });

  it("each seed has roleId and permission in the colon-separated form", () => {
    const seeds = rolePermissionSeeds();
    for (const seed of seeds) {
      expect(typeof seed.roleId).toBe("string");
      expect(seed.roleId.length).toBeGreaterThan(0);
      expect(typeof seed.permission).toBe("string");
      expect(seed.permission).toMatch(/^\w+:\w+$/);
    }
  });
});

describe("debt_entry schema (#25 reason category, void, payment method)", () => {
  const definitions = createSchemaDefinitions();

  function getDebtEntryDefinition() {
    const def = definitions.find((d) => d.includes('"debt_entry"'));
    if (!def) {
      throw new Error("debt_entry CREATE TABLE statement not found in schemaStatements");
    }
    return def;
  }

  it("includes `reason_category` column with default INVOICE_DRIVEN", () => {
    const def = getDebtEntryDefinition();
    expect(def).toContain('"reason_category"');
    expect(def).toMatch(/"reason_category"\s+TEXT\s+NOT\s+NULL\s+DEFAULT\s+'INVOICE_DRIVEN'/);
  });

  it("includes `reason_detail` column (nullable)", () => {
    const def = getDebtEntryDefinition();
    expect(def).toContain('"reason_detail"');
  });

  it("includes `payment_method` column (nullable)", () => {
    const def = getDebtEntryDefinition();
    expect(def).toContain('"payment_method"');
  });

  it("includes `status` column with default LIVE", () => {
    const def = getDebtEntryDefinition();
    expect(def).toContain('"status"');
    expect(def).toMatch(/"status"\s+TEXT\s+NOT\s+NULL\s+DEFAULT\s+'LIVE'/);
  });

  it("includes void metadata columns (voided_at, voided_by, void_reason)", () => {
    const def = getDebtEntryDefinition();
    expect(def).toContain('"voided_at"');
    expect(def).toContain('"voided_by"');
    expect(def).toContain('"void_reason"');
  });

  it("includes ADVANCE in entry_type CHECK constraint", () => {
    const def = getDebtEntryDefinition();
    expect(def).toContain("ADVANCE");
  });

  it("includes CHECK constraint on reason_category", () => {
    const def = getDebtEntryDefinition();
    expect(def).toMatch(/CHECK\s*\("reason_category"\s*IN/);
  });

  it("includes CHECK constraint on payment_method", () => {
    const def = getDebtEntryDefinition();
    expect(def).toMatch(/CHECK\s*\("payment_method"\s*IN/);
  });

  it("includes CHECK constraint on status", () => {
    const def = getDebtEntryDefinition();
    expect(def).toMatch(/CHECK\s*\("status"\s*IN/);
  });

  it("additive statements include all new columns", () => {
    expect(additiveStatements).toEqual(
      expect.arrayContaining([
        expect.stringContaining('ALTER TABLE "debt_entry" ADD COLUMN "reason_category"'),
        expect.stringContaining('ALTER TABLE "debt_entry" ADD COLUMN "reason_detail"'),
        expect.stringContaining('ALTER TABLE "debt_entry" ADD COLUMN "payment_method"'),
        expect.stringContaining('ALTER TABLE "debt_entry" ADD COLUMN "status"'),
        expect.stringContaining('ALTER TABLE "debt_entry" ADD COLUMN "voided_at"'),
        expect.stringContaining('ALTER TABLE "debt_entry" ADD COLUMN "voided_by"'),
        expect.stringContaining('ALTER TABLE "debt_entry" ADD COLUMN "void_reason"'),
      ]),
    );
  });
});

describe("invoice schema (#26 direction column)", () => {
  const definitions = createSchemaDefinitions();

  function getInvoiceDefinition() {
    const def = definitions.find((d) =>
      d.includes('CREATE TABLE IF NOT EXISTS "invoice"'),
    );
    expect(def).toBeDefined();
    return def!;
  }

  it("includes a `direction` column with PURCHASE/SALE check constraint", () => {
    const def = getInvoiceDefinition();
    expect(def).toMatch(/CHECK\s*\("direction"\s*IN/);
  });

  it("defaults `direction` to PURCHASE so legacy rows backfill correctly", () => {
    const def = getInvoiceDefinition();
    expect(def).toMatch(/DEFAULT\s+'PURCHASE'/);
  });

  it("declares a unique migration key for the direction column", () => {
    expect(invoiceDirectionMigrationKey).toBeDefined();
    expect(typeof invoiceDirectionMigrationKey).toBe("string");
    expect(invoiceDirectionMigrationKey.length).toBeGreaterThan(0);
  });

  it("additive statements include the direction column", () => {
    expect(additiveStatements).toEqual(
      expect.arrayContaining([
        expect.stringContaining('ALTER TABLE "invoice" ADD COLUMN "direction"'),
      ]),
    );
  });
});

describe("payment_allocation schema (#335 restrict FK)", () => {
  const definitions = createSchemaDefinitions();

  it("declares the payment_id FK with ON DELETE RESTRICT (no silent cascade)", () => {
    const allocDef = definitions.find((d) =>
      d.includes('CREATE TABLE IF NOT EXISTS "payment_allocation"'),
    );
    expect(allocDef).toBeDefined();
    expect(allocDef).toContain('"payment_id" TEXT NOT NULL');

    const fkLine = allocDef!
      .split("\n")
      .find((line) =>
        line.includes('FOREIGN KEY ("payment_id") REFERENCES "payment"'),
      );
    expect(fkLine).toContain("ON DELETE RESTRICT");
    expect(fkLine).not.toContain("ON DELETE CASCADE");
  });

  it("declares a unique migration key for the restrict rebuild", () => {
    expect(paymentAllocationRestrictMigrationKey).toBe(
      "payment_allocation_restrict_fk_v1",
    );
  });
});

describe("expense schema (#411)", () => {
  const definitions = createSchemaDefinitions();

  it("creates the expense table with the money, date and audit columns", () => {
    const expenseDef = definitions.find((d) =>
      d.includes('CREATE TABLE IF NOT EXISTS "expense"'),
    );
    expect(expenseDef).toBeDefined();
    expect(expenseDef).toContain('"amount_dzd" REAL NOT NULL CHECK ("amount_dzd" > 0)');
    expect(expenseDef).toContain('"expense_date" DATETIME NOT NULL');
    expect(expenseDef).toContain('"actor_user_id" TEXT');
    expect(expenseDef).toContain('"transaction_id" TEXT');
    expect(expenseDef).toContain(
      'CHECK ("status" IN (\'LIVE\', \'VOIDED\'))',
    );
  });

  it("keeps every optional reference nullable and free of foreign keys", () => {
    const expenseDef = definitions.find((d) =>
      d.includes('CREATE TABLE IF NOT EXISTS "expense"'),
    )!;
    for (const column of [
      '"responsible_worker_id" TEXT',
      '"seller_id" TEXT',
      '"project_id" TEXT',
      '"stock_item_id" TEXT',
    ]) {
      const line = expenseDef.split("\n").find((entry) => entry.includes(column));
      expect(line).toBeDefined();
      expect(line).not.toContain("NOT NULL");
      expect(line).not.toContain("REFERENCES");
    }
  });

  it("creates the expense_revision table linked to expense with a restrict FK", () => {
    const revisionDef = definitions.find((d) =>
      d.includes('CREATE TABLE IF NOT EXISTS "expense_revision"'),
    );
    expect(revisionDef).toBeDefined();
    expect(revisionDef).toContain('"previous_amount_dzd" REAL');
    expect(revisionDef).toContain('"new_amount_dzd" REAL NOT NULL');
    expect(revisionDef).toContain('"reason" TEXT');
    expect(revisionDef).toContain(
      'FOREIGN KEY ("expense_id") REFERENCES "expense" ("id") ON DELETE RESTRICT',
    );
  });

  it("indexes the list filters the expenses screen uses", () => {
    expect(definitions).toEqual(
      expect.arrayContaining([
        expect.stringContaining('CREATE INDEX IF NOT EXISTS "expense_expense_date_idx"'),
        expect.stringContaining('CREATE INDEX IF NOT EXISTS "expense_project_id_idx"'),
        expect.stringContaining('CREATE INDEX IF NOT EXISTS "expense_responsible_worker_id_idx"'),
        expect.stringContaining('CREATE INDEX IF NOT EXISTS "expense_revision_expense_id_idx"'),
      ]),
    );
  });
});

describe("inventory_asset_charge schema (#413 stock charge)", () => {
  const definitions = createSchemaDefinitions();

  function getChargeDefinition() {
    const def = definitions.find((d) =>
      d.includes('CREATE TABLE IF NOT EXISTS "inventory_asset_charge"'),
    );
    expect(def).toBeDefined();
    return def!;
  }

  it("creates the charge table with unit, project, movement and amount columns", () => {
    const def = getChargeDefinition();
    expect(def).toContain('"asset_unit_id" TEXT NOT NULL');
    expect(def).toContain('"project_id" TEXT NOT NULL');
    expect(def).toContain('"movement_id" TEXT');
    expect(def).toContain('"amount_dzd" REAL NOT NULL');
  });

  it("allows a zero amount (a free placement) with a LIVE/VOID status", () => {
    const def = getChargeDefinition();
    expect(def).toMatch(/CHECK\s*\("amount_dzd"\s*>=\s*0\)/);
    expect(def).toMatch(/"status"\s+TEXT\s+NOT\s+NULL\s+DEFAULT\s+'LIVE'/);
    expect(def).toMatch(/CHECK\s*\("status"\s*IN\s*\(\s*'LIVE'\s*,\s*'VOID'\s*\)\)/);
  });

  it("annotates a void with actor + reason and keeps the movement reference nullable", () => {
    const def = getChargeDefinition();
    expect(def).toContain('"voided_at"');
    expect(def).toContain('"voided_by"');
    expect(def).toContain('"void_reason"');
    expect(def).toContain('FOREIGN KEY ("movement_id") REFERENCES "inventory_movement"');
    expect(def).toContain("ON DELETE SET NULL");
  });

  it("cascades a charge with its unit and its project", () => {
    const def = getChargeDefinition();
    expect(def).toContain(
      'FOREIGN KEY ("asset_unit_id") REFERENCES "inventory_asset_unit" ("id") ON DELETE CASCADE',
    );
    expect(def).toContain(
      'FOREIGN KEY ("project_id") REFERENCES "project" ("id") ON DELETE CASCADE',
    );
  });

  it("creates the revision table that records from → to + reason", () => {
    const def = definitions.find((d) =>
      d.includes('CREATE TABLE IF NOT EXISTS "inventory_asset_charge_revision"'),
    );
    expect(def).toBeDefined();
    expect(def).toContain('"charge_id" TEXT NOT NULL');
    expect(def).toContain('"previous_amount_dzd" REAL NOT NULL');
    expect(def).toContain('"new_amount_dzd" REAL');
    expect(def).toContain('"reason" TEXT');
    expect(def).toContain(
      'FOREIGN KEY ("charge_id") REFERENCES "inventory_asset_charge" ("id") ON DELETE CASCADE',
    );
  });

  it("indexes charges by unit and by project", () => {
    expect(definitions).toEqual(
      expect.arrayContaining([
        expect.stringContaining(
          'ON "inventory_asset_charge" ("asset_unit_id", "created_at")',
        ),
        expect.stringContaining('ON "inventory_asset_charge" ("project_id", "status")'),
      ]),
    );
  });
});
