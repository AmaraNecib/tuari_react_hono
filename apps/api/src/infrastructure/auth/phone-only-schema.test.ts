import { describe, expect, it } from "vitest";
import { createDatabaseConnection } from "../database/factory";
import { ensureDatabaseSchema } from "../database/schema";
import { BetterSqlite3Executor } from "../database/sqlite-executor";

describe("phone-only auth compatibility fields", () => {
  it("assigns distinct non-deliverable unverified addresses without collecting email", async () => {
    const raw = createDatabaseConnection(":memory:");
    try {
      await ensureDatabaseSchema(new BetterSqlite3Executor(raw));
      const insert = raw.prepare('INSERT INTO "user" (id, name, phoneNumber, created_at, updated_at) VALUES (?, ?, ?, ?, ?)');
      insert.run("one", "One", "0555000001", "2026-01-01", "2026-01-01");
      insert.run("two", "Two", "0666000001", "2026-01-01", "2026-01-01");
      const rows = raw.prepare('SELECT email, emailVerified FROM "user" ORDER BY id').all() as Array<{email: string; emailVerified: number}>;
      expect(rows).toHaveLength(2);
      for (const row of rows) {
        expect(row.email).toMatch(/^[a-f0-9]{32}@users\.invalid$/);
        expect(row.emailVerified).toBe(0);
        expect(row.email).not.toContain("0555000001");
        expect(row.email).not.toContain("0666000001");
      }
      expect(rows[0]!.email).not.toBe(rows[1]!.email);
    } finally { raw.close(); }
  });

  it("upgrades an email-free database idempotently without changing phone identity", async () => {
    const raw = createDatabaseConnection(":memory:");
    try {
      raw.exec(`CREATE TABLE "user" (id TEXT PRIMARY KEY, name TEXT NOT NULL, image TEXT, phoneNumber TEXT NOT NULL UNIQUE, phoneNumberVerified INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
        INSERT INTO "user" VALUES ('legacy', 'Legacy', NULL, '0777000001', 1, '2026-01-01', '2026-01-01');`);
      const executor = new BetterSqlite3Executor(raw);
      await ensureDatabaseSchema(executor);
      const before = raw.prepare('SELECT * FROM "user" WHERE id = ?').get("legacy");
      await ensureDatabaseSchema(executor);
      const after = raw.prepare('SELECT * FROM "user" WHERE id = ?').get("legacy") as Record<string, unknown>;
      expect(after).toEqual(before);
      expect(after).toMatchObject({ id: "legacy", phoneNumber: "0777000001", phoneNumberVerified: 1, emailVerified: 0 });
      expect(after.email).toMatch(/^[a-f0-9]{32}@users\.invalid$/);
      raw.prepare('INSERT INTO "user" (id, name, phoneNumber, created_at, updated_at) VALUES (?, ?, ?, ?, ?)')
        .run("new", "New", "0555000002", "2026-01-01", "2026-01-01");
      expect(raw.prepare('SELECT email FROM "user" WHERE id = ?').get("new")).toMatchObject({ email: expect.stringMatching(/@users\.invalid$/) });
    } finally { raw.close(); }
  });
});
