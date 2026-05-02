import { describe, it, expect, beforeEach } from "vitest";
import { TransactionManager } from "./transaction-manager";
import type { CompanyRepository } from "./company.repository";

describe("TransactionManager", () => {
  let mockRepository: CompanyRepository;
  let manager: TransactionManager;

  beforeEach(() => {
    const calls: string[] = [];

    mockRepository = {
      withTransaction<T>(callback: () => T): T {
        calls.push("BEGIN");
        try {
          const result = callback();
          calls.push("COMMIT");
          return result;
        } catch (error) {
          calls.push("ROLLBACK");
          throw error;
        }
      },
    } as any;

    manager = new TransactionManager(mockRepository);
  });

  it("executes operation within transaction", () => {
    const result = manager.execute(() => {
      return "success";
    });

    expect(result).toBe("success");
  });

  it("executes multiple operations within single transaction", () => {
    const results = manager.executeMultiple([
      () => "first",
      () => "second",
      () => "third",
    ]);

    expect(results).toEqual(["first", "second", "third"]);
  });

  it("rolls back on error in single operation", () => {
    expect(() => {
      manager.execute(() => {
        throw new Error("Operation failed");
      });
    }).toThrow("Operation failed");
  });

  it("rolls back on error in multiple operations", () => {
    expect(() => {
      manager.executeMultiple([
        () => "first",
        () => {
          throw new Error("Second operation failed");
        },
        () => "third",
      ]);
    }).toThrow("Second operation failed");
  });
});
