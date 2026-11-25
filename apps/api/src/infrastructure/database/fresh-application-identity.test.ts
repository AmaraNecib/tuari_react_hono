import { afterEach, describe, expect, it } from "vitest";
import { createDatabaseConnection } from "./factory";
import { schemaStatements } from "./schema-definitions";
import { ensureFreshApplicationIdentity } from "./schema";
import { BetterSqlite3Executor } from "./sqlite-executor";
import type { BetterSqliteDatabase } from "../../types/sqlite";

const databases: BetterSqliteDatabase[] = [];
afterEach(() => { for (const db of databases.splice(0)) db.close(); });
function fixture() {
  const db = createDatabaseConnection(":memory:", "");
  databases.push(db);
  for (const name of ["user", "role", "role_permission", "employee"]) {
    const statement = schemaStatements.find(sql => sql.startsWith(`CREATE TABLE IF NOT EXISTS "${name}" (`));
    if (!statement) throw new Error(`Missing identity table ${name}`);
    db.exec(statement);
  }
  return db;
}

describe("fresh application identity finalization", () => {
  it("seeds current roles and phone-only auth without creating monetary tables", async () => {
    const db = fixture();
    await ensureFreshApplicationIdentity(new BetterSqlite3Executor(db));
    const roles = db.prepare("SELECT id,key FROM role ORDER BY key").all();
    expect(roles).toMatchObject([{ key: "admin" }, { key: "project_manager" }, { key: "warehouse_manager" }, { key: "worker" }]);
    const permissions = db.prepare("SELECT id,role_id,permission FROM role_permission ORDER BY id").all();
    expect(permissions.length).toBeGreaterThan(0);
    expect(db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name IN ('debt_account','debt_entry','invoice','employee_salary_payment')").all()).toEqual([]);
    const columns = db.pragma("table_info(user)") as Array<{ name: string }>;
    expect(columns.map(column => column.name)).toEqual(expect.arrayContaining(["email", "emailVerified"]));
    await ensureFreshApplicationIdentity(new BetterSqlite3Executor(db));
    expect(db.prepare("SELECT id,key FROM role ORDER BY key").all()).toEqual(roles);
    expect(db.prepare("SELECT id,role_id,permission FROM role_permission ORDER BY id").all()).toEqual(permissions);
  });

  it("rolls back identity finalization when permission seeding fails", async () => {
    const db = fixture();
    const before = db.prepare("SELECT name,sql FROM sqlite_master ORDER BY name").all();
    db.exec("CREATE TRIGGER reject_permission BEFORE INSERT ON role_permission BEGIN SELECT RAISE(ABORT,'permission proof failure'); END");
    await expect(ensureFreshApplicationIdentity(new BetterSqlite3Executor(db))).rejects.toThrow("permission proof failure");
    expect(db.prepare("SELECT id FROM role").all()).toEqual([]);
    expect(db.prepare("SELECT name,sql FROM sqlite_master WHERE name!='reject_permission' ORDER BY name").all()).toEqual(before);
  });
});
