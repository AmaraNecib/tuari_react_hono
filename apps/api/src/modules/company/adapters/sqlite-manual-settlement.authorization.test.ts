import { expect, it } from "vitest";
import { createDatabaseConnection } from "../../../infrastructure/database/factory";
import { createFifoLock } from "../../../infrastructure/database/fifo-lock";
import { ensureFreshManualSettlementApplicationSchema } from "../../../infrastructure/database/fresh-manual-settlement-schema";
import { SqliteManualSettlementAuthorization } from "./sqlite-manual-settlement.authorization";

it("binds current grants and actor to a server-selected user inside the reserved transaction", async () => {
  const db = createDatabaseConnection(":memory:", "");
  const lock = createFifoLock();
  try {
    await ensureFreshManualSettlementApplicationSchema(db);
    const now = "2026-11-10T00:00:00.000Z";
    const user = db.prepare('INSERT INTO user(id,name,"phoneNumber",created_at,updated_at) VALUES (?,?,?,?,?)');
    user.run("owner", "Owner", "+213555000001", "2026-01-01", now);
    user.run("operator", "Operator", "+213555000002", "2026-02-01", now);
    const role = db.prepare("SELECT id FROM role WHERE key='worker'").get() as { id: string };
    db.prepare("INSERT INTO employee(id,first_name,last_name,phone,role_id,status,created_at,updated_at) VALUES ('employee','Op','Erator',?,?, 'ACTIVE',?,?)").run("+213555000002", role.id, now, now);
    db.prepare("DELETE FROM role_permission WHERE role_id=?").run(role.id);
    const auth = new SqliteManualSettlementAuthorization(db, lock, "operator");
    const owner = new SqliteManualSettlementAuthorization(db, lock, "owner");
    const missing = new SqliteManualSettlementAuthorization(db, lock, "missing");
    const run = <T>(work: () => T) => lock.runSync(() => db.transaction(work).immediate());
    expect(auth.transactionIdentity).toEqual({ connection: db, lock });
    expect(() => auth.authorize(["debts:read"])).toThrow(/transaction/);
    expect(() => auth.canReadInvoiceSources()).toThrow(/transaction/);
    run(() => {
      expect(owner.canReadInvoiceSources()).toBe(true);
      expect(auth.canReadInvoiceSources()).toBe(false);
      expect(owner.authorize(["debts:read", "debts:settle", "debts:update"])).toEqual({ actorUserId: "owner", actorLabel: "Owner" });
      expect(() => missing.authorize(["debts:read"])).toThrow(/permission/i);
      expect(() => auth.authorize(["debts:read"])).toThrow(/permission/i);
    });
    const grant = db.prepare("INSERT INTO role_permission(id,role_id,permission,created_at,updated_at) VALUES (?,?,?,?,?)");
    grant.run("read", role.id, "debts:read", now, now);
    run(() => {
      expect(auth.authorize(["debts:read"])).toEqual({ actorUserId: "operator", actorLabel: "Operator" });
      expect(() => auth.authorize(["debts:read", "debts:settle"])).toThrow(/permission/i);
    });
    grant.run("settle", role.id, "debts:settle", now, now);
    grant.run("invoice-read", role.id, "invoices:read", now, now);
    run(() => {
      expect(auth.authorize(["debts:read", "debts:settle"])).toEqual({ actorUserId: "operator", actorLabel: "Operator" });
      expect(auth.canReadInvoiceSources()).toBe(false);
    });
    db.prepare("DELETE FROM role_permission WHERE id='read'").run();
    run(() => expect(() => auth.authorize(["debts:read", "debts:settle"])).toThrow(/permission/i));
    db.prepare("INSERT INTO app_bootstrap_state(singleton,created_at,user_id) VALUES (1,?,?)").run(now, "operator");
    run(() => {
      expect(auth.authorize(["debts:read", "debts:settle", "debts:update"])).toEqual({ actorUserId: "operator", actorLabel: "Operator" });
      expect(auth.canReadInvoiceSources()).toBe(true);
      expect(owner.canReadInvoiceSources()).toBe(false);
      expect(() => owner.authorize(["debts:read"])).toThrow(/permission/i);
    });
    db.prepare("UPDATE app_bootstrap_state SET user_id=NULL WHERE singleton=1").run();
    run(() => {
      expect(owner.authorize(["debts:read", "debts:settle", "debts:update"])).toEqual({ actorUserId: "owner", actorLabel: "Owner" });
      expect(owner.canReadInvoiceSources()).toBe(true);
      expect(auth.canReadInvoiceSources()).toBe(false);
      expect(() => auth.authorize(["debts:read"])).toThrow(/permission/i);
    });
  } finally { db.close(); }
});
