import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";

import {
  assertBindingEncrypts,
  assertDatabaseFileMatchesKey,
  createDatabaseConnection,
  resolveDatabaseConstructor,
} from "./factory";

/** A binding that claims to be SQLCipher: it reports a cipher version. */
const createEncryptingFake = () => {
  const queried: string[] = [];
  let closed = false;

  const fake = {
    pragma(source: string) {
      queried.push(source);
      if (source === "cipher_version") return "4.5.5 community";
      return [];
    },
    prepare() {
      return {} as never;
    },
    close() {
      closed = true;
    },
  };

  return {
    constructor: function FakeEncryptingDatabase() {
      return fake;
    } as unknown as typeof Database,
    queried,
    isClosed: () => closed,
  };
};

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

const tempDbPath = () => {
  const dir = mkdtempSync(join(tmpdir(), "tuari-factory-"));
  tempDirs.push(dir);
  return join(dir, "tuari.sqlite");
};

describe("resolveDatabaseConstructor", () => {
  it("uses plain better-sqlite3 when no key is configured", () => {
    expect(resolveDatabaseConstructor(null)).toBe(Database);
    expect(resolveDatabaseConstructor("")).toBe(Database);
  });

  it("uses the SQLCipher constructor when a key is configured", () => {
    const encrypting = createEncryptingFake();
    expect(resolveDatabaseConstructor("secret", () => encrypting.constructor)).toBe(
      encrypting.constructor,
    );
  });

  it("fails closed when the SQLCipher binding cannot be loaded", () => {
    expect(() =>
      resolveDatabaseConstructor("secret", () => {
        throw new Error("Cannot find module 'better-sqlite3-sqlcipher'");
      }),
    ).toThrowError(/better-sqlite3-sqlcipher.*not installed or cannot be loaded/s);
  });
});

describe("assertBindingEncrypts", () => {
  it("refuses a keyed connection whose binding does not encrypt", () => {
    // Plain better-sqlite3 accepts `PRAGMA key` as a no-op; the capability
    // probe is what refuses it instead of writing a plaintext database (#402).
    const plain = new Database(":memory:");
    plain.pragma("key = 'secret'");
    plain.pragma("cipher_compatibility = 4");

    expect(() => assertBindingEncrypts(plain)).toThrowError(/cannot encrypt/);
    expect(plain.open).toBe(false);
  });

  it("accepts a binding that reports a cipher version", () => {
    const encrypting = createEncryptingFake();
    const db = new encrypting.constructor(":memory:");

    expect(() => assertBindingEncrypts(db)).not.toThrow();
    expect(encrypting.isClosed()).toBe(false);
  });

  it("closes the connection and reports the cause when the probe throws", () => {
    let closed = false;
    const sqlite = {
      pragma() {
        throw new Error("no such pragma");
      },
      close() {
        closed = true;
      },
    };

    expect(() => assertBindingEncrypts(sqlite)).toThrowError(/no such pragma/);
    expect(closed).toBe(true);
  });
});

describe("assertDatabaseFileMatchesKey (no key configured)", () => {
  const plaintextHeader = "SQLite format 3\0";

  it("refuses a non-SQLite file with a message that does not assert encryption", () => {
    const dbPath = tempDbPath();
    writeFileSync(dbPath, Buffer.from("not a plaintext sqlite database at all"));

    expect(() => assertDatabaseFileMatchesKey(dbPath, null)).toThrowError(
      /SQLCipher-encrypted.*encrypted_db.*#402/s,
    );
    // A truncated or corrupt plaintext database takes the same path, so the
    // message must keep encryption as a possibility WITHOUT asserting it, offer
    // damage as the alternative, and say what to check (#409).
    const message = () => {
      try {
        assertDatabaseFileMatchesKey(dbPath, null);
      } catch (error) {
        return error instanceof Error ? error.message : String(error);
      }
      return "";
    };

    expect(message()).not.toMatch(/almost certainly/);
    expect(message()).toMatch(/cannot tell those apart/);
    expect(message()).toMatch(/damaged/);
    expect(message()).toMatch(/truncated or corrupt/);
    expect(message()).toMatch(/inspect or restore it/);
  });

  it("accepts a plaintext SQLite header", () => {
    const dbPath = tempDbPath();
    writeFileSync(dbPath, Buffer.from(plaintextHeader + "rest"));

    expect(() => assertDatabaseFileMatchesKey(dbPath, null)).not.toThrow();
  });

  it("accepts a missing or empty file (a fresh workspace)", () => {
    const missing = tempDbPath();
    expect(() => assertDatabaseFileMatchesKey(missing, null)).not.toThrow();

    const empty = tempDbPath();
    writeFileSync(empty, "");
    expect(() => assertDatabaseFileMatchesKey(empty, null)).not.toThrow();
  });

  it("refuses a truncated (1-15 byte) file with the damaged-or-encrypted message", () => {
    // A 5-byte file has a non-SQLite header but is too short to be an
    // encrypted database either. It must take the same conservative path as
    // any non-header file: refused, with damage named as a possibility.
    const dbPath = tempDbPath();
    writeFileSync(dbPath, Buffer.from("short"));

    expect(() => assertDatabaseFileMatchesKey(dbPath, null)).toThrowError(
      /cannot tell those apart/,
    );
  });

  it("does not pre-judge the file when a key is configured", () => {
    const dbPath = tempDbPath();
    writeFileSync(dbPath, Buffer.from("encrypted-looking bytes"));

    expect(() => assertDatabaseFileMatchesKey(dbPath, "secret")).not.toThrow();
  });
});

describe("assertDatabaseFileMatchesKey", () => {
  it("refuses a plaintext database when a key is configured (#402)", () => {
    // The other direction of the same rule: the header says the file is a
    // plain SQLite database while APP_DB_KEY is set.
    const dbPath = tempDbPath();
    writeFileSync(dbPath, Buffer.from("SQLite format 3\0and more"));

    expect(() => assertDatabaseFileMatchesKey(dbPath, "secret")).toThrowError(
      /APP_DB_KEY set.*plaintext SQLite header.*#402/s,
    );
  });

  it("accepts an encrypted-looking file with a key and refuses it without one", () => {
    const dbPath = tempDbPath();
    writeFileSync(dbPath, Buffer.from("random salt bytes that are not the magic"));

    expect(() => assertDatabaseFileMatchesKey(dbPath, "secret")).not.toThrow();
    expect(() => assertDatabaseFileMatchesKey(dbPath, null)).toThrowError(
      /SQLCipher-encrypted/,
    );
  });

  it("refuses a truncated SQLite-header prefix when a key is configured", () => {
    // A 13-byte file is neither a plaintext database nor a valid encrypted one,
    // so with a key set it must be named as damage rather than accepted as
    // "encrypted-looking" and failing later with an opaque first-query error.
    const dbPath = tempDbPath();
    writeFileSync(dbPath, Buffer.from("SQLite format"));

    expect(() => assertDatabaseFileMatchesKey(dbPath, "secret")).toThrowError(
      /shorter than any SQLite or SQLCipher header/,
    );
  });

  it("accepts a missing or empty file for either key configuration", () => {
    const missing = tempDbPath();
    expect(() => assertDatabaseFileMatchesKey(missing, "secret")).not.toThrow();
    expect(() => assertDatabaseFileMatchesKey(missing, null)).not.toThrow();

    const empty = tempDbPath();
    writeFileSync(empty, "");
    expect(() => assertDatabaseFileMatchesKey(empty, "secret")).not.toThrow();
    expect(() => assertDatabaseFileMatchesKey(empty, null)).not.toThrow();
  });
});

describe("createDatabaseConnection", () => {
  it("refuses to open a keyed workspace on a non-encrypting binding", () => {
    expect(() =>
      createDatabaseConnection(":memory:", "secret", () => Database),
    ).toThrowError(/cannot encrypt/);
  });

  it("opens a keyed workspace on a binding that encrypts and applies the key", () => {
    const encrypting = createEncryptingFake();
    const db = createDatabaseConnection(":memory:", "secret", () => encrypting.constructor);

    expect(encrypting.queried).toContain("key = 'secret'");
    expect(encrypting.queried).toContain("cipher_compatibility = 4");
    expect(encrypting.queried).toContain("cipher_version");
    expect(db).toBeDefined();
  });

  it("refuses a plaintext file on the wired keyed path before constructing a connection (#402)", () => {
    // The header rule is only load-bearing if createDatabaseConnection actually
    // calls it: delete the call and this test — unlike the helper-level ones —
    // fails. The constructor must never be reached.
    const dbPath = tempDbPath();
    writeFileSync(dbPath, Buffer.from("SQLite format 3\0and more"));
    let constructed = false;
    const constructor = function TrackedDatabase() {
      constructed = true;
      return createEncryptingFake().constructor();
    } as unknown as typeof Database;

    expect(() => createDatabaseConnection(dbPath, "secret", () => constructor)).toThrowError(
      /plaintext SQLite header/,
    );
    expect(constructed).toBe(false);
  });

  it("refuses a non-SQLite file on the wired keyless path (#402)", () => {
    const dbPath = tempDbPath();
    writeFileSync(dbPath, Buffer.from("not a sqlite database at all"));

    expect(() => createDatabaseConnection(dbPath, null)).toThrowError(
      /cannot tell those apart/,
    );
  });
});
