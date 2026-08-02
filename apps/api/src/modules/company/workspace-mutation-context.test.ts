import { describe, it, expect, beforeEach } from "vitest";
import { WorkspaceMutationContext } from "./workspace-mutation-context";
import type { CompanyRepository } from "./company.repository.contracts";

describe("WorkspaceMutationContext.withTransaction", () => {
  let calls: string[];
  let context: WorkspaceMutationContext;

  beforeEach(() => {
    calls = [];

    const mockRepository = {
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
    } as unknown as CompanyRepository;

    context = new WorkspaceMutationContext(mockRepository);
  });

  it("runs the operation inside the repository transaction", () => {
    const result = context.withTransaction(() => "success");

    expect(result).toBe("success");
    expect(calls).toEqual(["BEGIN", "COMMIT"]);
  });

  it("rolls back and rethrows when the operation fails", () => {
    expect(() => {
      context.withTransaction(() => {
        throw new Error("Operation failed");
      });
    }).toThrow("Operation failed");

    expect(calls).toEqual(["BEGIN", "ROLLBACK"]);
  });
});
