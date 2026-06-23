import { describe, it, expect } from "vitest";
import {
  additiveStatements,
  createSchemaDefinitions,
  debtAccountBalanceRenameMigrationKey,
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
  it("generates seed entries for all default roles", () => {
    const seeds = rolePermissionSeeds();
    const roleKeys = [...new Set(seeds.map((s) => s.roleId))];
    expect(roleKeys).toContain("admin");
    expect(roleKeys).toContain("viewer");
    expect(roleKeys).toContain("worker");
    expect(roleKeys).toContain("project_manager");
    expect(roleKeys).toContain("warehouse_manager");
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

  it("viewer has only employees.read", () => {
    const seeds = rolePermissionSeeds();
    const viewerPerms = seeds
      .filter((s) => s.roleId === "viewer")
      .map((s) => s.permission);
    expect(viewerPerms).toEqual(["employees.read"]);
  });

  it("each seed has roleId and permission", () => {
    const seeds = rolePermissionSeeds();
    for (const seed of seeds) {
      expect(typeof seed.roleId).toBe("string");
      expect(seed.roleId.length).toBeGreaterThan(0);
      expect(typeof seed.permission).toBe("string");
      expect(seed.permission).toMatch(/^\w+\.\w+$/);
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
