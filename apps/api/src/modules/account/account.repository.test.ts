import { afterEach, beforeEach, describe, expect, it } from "vitest";
import Database from "better-sqlite3";

import { schemaStatements } from "../../infrastructure/database/schema-definitions";
import { createDrizzleFromSqlite } from "../../infrastructure/database/drizzle";
import { createFifoLock } from "../../infrastructure/database/fifo-lock";
import { DrizzleAccountRepository } from "./account.repository";

/**
 * Drizzle-backed account repository tests against a real in-memory SQLite
 * database with the full app schema (mirrors sqlite-bootstrap.port.test.ts).
 */
function createTestEnv() {
  const rawDb = new Database(":memory:");
  rawDb.pragma("foreign_keys = ON");
  for (const stmt of schemaStatements) {
    rawDb.exec(stmt);
  }
  const db = createDrizzleFromSqlite(rawDb);
  const repository = new DrizzleAccountRepository(db, createFifoLock());
  return { rawDb, repository };
}

function insertUser(
  rawDb: Database.Database,
  row: {
    id: string;
    name: string | null;
    phoneNumber: string;
    phoneNumberVerified?: number;
    createdAt?: string;
  },
): void {
  const now = row.createdAt ?? "2026-01-01T00:00:00.000Z";
  rawDb
    .prepare(
      `INSERT INTO "user" ("id", "name", "phoneNumber", "phoneNumberVerified", "created_at", "updated_at")
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .run(
      row.id,
      row.name ?? `User ${row.id}`,
      row.phoneNumber,
      row.phoneNumberVerified ?? 1,
      now,
      now,
    );
}

function insertCredentialAccount(
  rawDb: Database.Database,
  row: { id: string; userId: string; password: string | null; providerId?: string },
): void {
  const now = "2026-01-01T00:00:00.000Z";
  rawDb
    .prepare(
      `INSERT INTO "account" ("id", "accountId", "providerId", "userId", "password", "createdAt", "updatedAt")
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(row.id, row.id, row.providerId ?? "credential", row.userId, row.password, now, now);
}

function readProfileHistory(rawDb: Database.Database) {
  return rawDb
    .prepare(`SELECT * FROM "user_profile_history" ORDER BY "created_at" ASC`)
    .all() as Array<Record<string, unknown>>;
}

describe("DrizzleAccountRepository", () => {
  let env: ReturnType<typeof createTestEnv>;
  let rawDb: Database.Database;
  let repository: DrizzleAccountRepository;

  beforeEach(() => {
    env = createTestEnv();
    rawDb = env.rawDb;
    repository = env.repository;
  });

  afterEach(() => {
    rawDb.close();
  });

  describe("createProfileHistory", () => {
    it("persists a profile-change row with passwordChanged set", async () => {
      insertUser(rawDb, { id: "user-1", name: "عمارة", phoneNumber: "0612345678" });

      await repository.withTransaction((tx) =>
        tx.createProfileHistory({
          id: "hist-1",
          userId: "user-1",
          name: "بلال",
          phone: "0612345678",
          previousName: "عمارة",
          previousPhone: null,
          passwordChanged: 1,
          actorUserId: "user-1",
          actorLabel: "عمارة",
          transactionId: "tx-1",
          createdAt: new Date("2026-06-01T00:00:00.000Z"),
          updatedAt: new Date("2026-06-01T00:00:00.000Z"),
        }),
      );

      const rows = readProfileHistory(rawDb);
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        id: "hist-1",
        user_id: "user-1",
        name: "بلال",
        phone: "0612345678",
        previous_name: "عمارة",
        previous_phone: null,
        password_changed: 1,
        actor_user_id: "user-1",
        actor_label: "عمارة",
        transaction_id: "tx-1",
        created_at: "2026-06-01T00:00:00.000Z",
        updated_at: "2026-06-01T00:00:00.000Z",
      });
    });

    it("defaults passwordChanged to 0 when omitted", async () => {
      insertUser(rawDb, { id: "user-1", name: "عمارة", phoneNumber: "0612345678" });

      await repository.withTransaction((tx) =>
        tx.createProfileHistory({
          id: "hist-2",
          userId: "user-1",
          name: null,
          phone: null,
          previousName: null,
          previousPhone: null,
          actorUserId: "user-1",
          actorLabel: "عمارة",
          transactionId: "tx-2",
          createdAt: new Date("2026-06-02T00:00:00.000Z"),
          updatedAt: new Date("2026-06-02T00:00:00.000Z"),
        }),
      );

      const rows = readProfileHistory(rawDb);
      expect(rows).toHaveLength(1);
      expect(rows[0]!.password_changed).toBe(0);
    });
  });

  describe("findCredentialPasswordByUserId", () => {
    it("returns the hashed password for a credential account", async () => {
      insertUser(rawDb, { id: "user-1", name: "عمارة", phoneNumber: "0612345678" });
      insertCredentialAccount(rawDb, {
        id: "acct-1",
        userId: "user-1",
        password: "hashed-password",
      });

      const password = await repository.withTransaction((tx) =>
        tx.findCredentialPasswordByUserId("user-1"),
      );
      expect(password).toBe("hashed-password");
    });

    it("returns null when the account belongs to a non-credential provider", async () => {
      insertUser(rawDb, { id: "user-1", name: "عمارة", phoneNumber: "0612345678" });
      insertCredentialAccount(rawDb, {
        id: "acct-1",
        userId: "user-1",
        password: "oauth-token",
        providerId: "github",
      });

      const password = await repository.withTransaction((tx) =>
        tx.findCredentialPasswordByUserId("user-1"),
      );
      expect(password).toBeNull();
    });

    it("returns null when the user has no account row", async () => {
      const password = await repository.withTransaction((tx) =>
        tx.findCredentialPasswordByUserId("user-ghost"),
      );
      expect(password).toBeNull();
    });
  });

  describe("findUserIdByPhoneNumber", () => {
    it("returns the user id for an existing phone number", async () => {
      insertUser(rawDb, { id: "user-1", name: "عمارة", phoneNumber: "0612345678" });

      const userId = await repository.withTransaction((tx) =>
        tx.findUserIdByPhoneNumber("0612345678"),
      );
      expect(userId).toBe("user-1");
    });

    it("returns null when the phone number is unknown", async () => {
      const userId = await repository.withTransaction((tx) =>
        tx.findUserIdByPhoneNumber("0000000000"),
      );
      expect(userId).toBeNull();
    });
  });

  describe("updateUserProfile", () => {
    it("updates only the name when phone is omitted", async () => {
      insertUser(rawDb, { id: "user-1", name: "عمارة", phoneNumber: "0612345678" });

      const updated = await repository.withTransaction((tx) =>
        tx.updateUserProfile({
          id: "user-1",
          name: "بلال",
          updatedAt: new Date("2026-06-03T00:00:00.000Z"),
        }),
      );

      expect(updated).toEqual({
        id: "user-1",
        name: "بلال",
        phone: "0612345678",
      });

      const row = rawDb
        .prepare(`SELECT "name", "phoneNumber", "phoneNumberVerified", "updated_at" FROM "user" WHERE "id" = ?`)
        .get("user-1") as Record<string, unknown>;
      expect(row.name).toBe("بلال");
      expect(row.phoneNumber).toBe("0612345678");
      expect(row.phoneNumberVerified).toBe(1); // unchanged
      expect(row.updated_at).toBe("2026-06-03T00:00:00.000Z");
    });

    it("updates the phone and marks it verified when phone is provided", async () => {
      insertUser(rawDb, { id: "user-1", name: "عمارة", phoneNumber: "0612345678", phoneNumberVerified: 0 });

      const updated = await repository.withTransaction((tx) =>
        tx.updateUserProfile({
          id: "user-1",
          phone: "0612345670",
          updatedAt: new Date("2026-06-04T00:00:00.000Z"),
        }),
      );

      expect(updated).toEqual({
        id: "user-1",
        name: "عمارة",
        phone: "0612345670",
      });

      const row = rawDb
        .prepare(`SELECT "name", "phoneNumber", "phoneNumberVerified" FROM "user" WHERE "id" = ?`)
        .get("user-1") as Record<string, unknown>;
      expect(row.name).toBe("عمارة");
      expect(row.phoneNumber).toBe("0612345670");
      expect(row.phoneNumberVerified).toBe(1);
    });

    it("updates both name and phone in one call", async () => {
      insertUser(rawDb, { id: "user-1", name: "عمارة", phoneNumber: "0612345678" });

      const updated = await repository.withTransaction((tx) =>
        tx.updateUserProfile({
          id: "user-1",
          name: "بلال",
          phone: "0612345670",
          updatedAt: new Date("2026-06-05T00:00:00.000Z"),
        }),
      );

      expect(updated).toEqual({
        id: "user-1",
        name: "بلال",
        phone: "0612345670",
      });
    });

    it("updates only the timestamp when neither name nor phone is provided", async () => {
      insertUser(rawDb, { id: "user-1", name: "عمارة", phoneNumber: "0612345678" });

      const updated = await repository.withTransaction((tx) =>
        tx.updateUserProfile({
          id: "user-1",
          updatedAt: new Date("2026-06-06T12:00:00.000Z"),
        }),
      );

      expect(updated).toEqual({
        id: "user-1",
        name: "عمارة",
        phone: "0612345678",
      });

      const row = rawDb
        .prepare(`SELECT "name", "phoneNumber", "updated_at" FROM "user" WHERE "id" = ?`)
        .get("user-1") as Record<string, unknown>;
      expect(row.name).toBe("عمارة");
      expect(row.phoneNumber).toBe("0612345678");
      expect(row.updated_at).toBe("2026-06-06T12:00:00.000Z");
    });

    it("throws when the target user does not exist", async () => {
      await expect(
        repository.withTransaction((tx) =>
          tx.updateUserProfile({
            id: "user-ghost",
            name: "بلال",
            updatedAt: new Date("2026-06-06T00:00:00.000Z"),
          }),
        ),
      ).rejects.toThrow("User not found: user-ghost");
    });
  });

  describe("withTransaction", () => {
    it("commits writes performed inside the transaction", async () => {
      insertUser(rawDb, { id: "user-1", name: "عمارة", phoneNumber: "0612345678" });

      await repository.withTransaction(async (tx) => {
        await tx.updateUserProfile({
          id: "user-1",
          name: "بلال",
          updatedAt: new Date("2026-06-07T00:00:00.000Z"),
        });
        await tx.createProfileHistory({
          id: "hist-3",
          userId: "user-1",
          name: "بلال",
          phone: null,
          previousName: "عمارة",
          previousPhone: null,
          actorUserId: "user-1",
          actorLabel: "عمارة",
          transactionId: "tx-3",
          createdAt: new Date("2026-06-07T00:00:00.000Z"),
          updatedAt: new Date("2026-06-07T00:00:00.000Z"),
        });
      });

      const name = rawDb
        .prepare(`SELECT "name" FROM "user" WHERE "id" = ?`)
        .get("user-1") as { name: string };
      expect(name.name).toBe("بلال");
      expect(readProfileHistory(rawDb)).toHaveLength(1);
    });

    it("joins an already-open outer transaction instead of BEGINning a second one", async () => {
      insertUser(rawDb, { id: "user-1", name: "عمارة", phoneNumber: "0612345678" });

      // Simulate an external flow (e.g. bootstrap) that opened the transaction.
      rawDb.exec("BEGIN IMMEDIATE");
      await repository.withTransaction((tx) =>
        tx.updateUserProfile({
          id: "user-1",
          name: "بلال",
          updatedAt: new Date("2026-06-08T00:00:00.000Z"),
        }),
      );
      // The repository must NOT have committed — the outer flow owns COMMIT.
      rawDb.exec("COMMIT");

      const name = rawDb
        .prepare(`SELECT "name" FROM "user" WHERE "id" = ?`)
        .get("user-1") as { name: string };
      expect(name.name).toBe("بلال");
    });

    it("lets the outer transaction own the rollback when a nested run fails", async () => {
      insertUser(rawDb, { id: "user-1", name: "عمارة", phoneNumber: "0612345678" });

      rawDb.exec("BEGIN IMMEDIATE");
      await expect(
        repository.withTransaction(async (tx) => {
          await tx.updateUserProfile({
            id: "user-1",
            name: "بلال",
            updatedAt: new Date("2026-06-09T00:00:00.000Z"),
          });
          throw new Error("outer flow aborts");
        }),
      ).rejects.toThrow("outer flow aborts");

      // The outer flow rolls back, undoing the nested write too.
      rawDb.exec("ROLLBACK");
      const name = rawDb
        .prepare(`SELECT "name" FROM "user" WHERE "id" = ?`)
        .get("user-1") as { name: string };
      expect(name.name).toBe("عمارة");
    });

    it("rolls back when the transaction callback throws", async () => {
      insertUser(rawDb, { id: "user-1", name: "عمارة", phoneNumber: "0612345678" });

      await expect(
        repository.withTransaction(async (tx) => {
          await tx.updateUserProfile({
            id: "user-1",
            name: "بلال",
            updatedAt: new Date("2026-06-10T00:00:00.000Z"),
          });
          throw new Error("abort");
        }),
      ).rejects.toThrow("abort");

      const name = rawDb
        .prepare(`SELECT "name" FROM "user" WHERE "id" = ?`)
        .get("user-1") as { name: string };
      expect(name.name).toBe("عمارة");
    });

    it("releases the FIFO lock after a failing transaction", async () => {
      insertUser(rawDb, { id: "user-1", name: "عمارة", phoneNumber: "0612345678" });

      // First call fails mid-transaction...
      await expect(
        repository.withTransaction(async (tx) => {
          await tx.updateUserProfile({
            id: "user-1",
            name: "بلال",
            updatedAt: new Date("2026-06-13T00:00:00.000Z"),
          });
          throw new Error("boom");
        }),
      ).rejects.toThrow("boom");

      // ...the lock must be released so a later call does not deadlock.
      const updated = await repository.withTransaction((tx) =>
        tx.updateUserProfile({
          id: "user-1",
          name: "خالد",
          updatedAt: new Date("2026-06-14T00:00:00.000Z"),
        }),
      );
      expect(updated.name).toBe("خالد");
    });

    it("serializes overlapping transactions through the FIFO lock", async () => {
      insertUser(rawDb, { id: "user-1", name: "عمارة", phoneNumber: "0612345678" });

      let releaseFirst!: () => void;
      const firstGate = new Promise<void>((resolve) => {
        releaseFirst = resolve;
      });

      // First call opens a transaction and holds it open at the gate.
      const first = repository.withTransaction(async (tx) => {
        await tx.updateUserProfile({
          id: "user-1",
          name: "بلال",
          updatedAt: new Date("2026-06-11T00:00:00.000Z"),
        });
        await firstGate;
      });

      // Second call must queue behind the first (its BEGIN must not run yet).
      let secondRan = false;
      const second = repository.withTransaction(async (tx) => {
        secondRan = true;
        await tx.updateUserProfile({
          id: "user-1",
          name: "خالد",
          updatedAt: new Date("2026-06-12T00:00:00.000Z"),
        });
      });

      // Give the microtask queue time to process; the lock blocks the second.
      await new Promise((resolve) => setTimeout(resolve, 10));
      expect(secondRan).toBe(false);

      releaseFirst();
      await Promise.all([first, second]);
      expect(secondRan).toBe(true);

      // The second write landed after the first committed — no interleaving.
      const row = rawDb
        .prepare(`SELECT "name" FROM "user" WHERE "id" = ?`)
        .get("user-1") as { name: string };
      expect(row.name).toBe("خالد");
    });
  });
});
