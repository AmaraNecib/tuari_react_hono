import { describe, it, expect, beforeEach } from "vitest";
import { WorkspaceMutationContext } from "./workspace-mutation-context";
import type { TransactionalRepository } from "./company.repository.contracts";

describe("WorkspaceMutationContext.withTransaction", () => {
  let calls: string[];
  let context: WorkspaceMutationContext;

  beforeEach(() => {
    calls = [];

    const repository: TransactionalRepository = {
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
    };

    context = new WorkspaceMutationContext(repository);
  });

  it("runs the operation inside the repository transaction", () => {
    const result = context.withTransaction(() => "success");

    expect(result).toBe("success");
    expect(calls).toEqual(["BEGIN", "COMMIT"]);
  });

  it.each([undefined, null, false, 0])(
    "commits and propagates the falsy result %s",
    (falsyResult) => {
      expect(context.withTransaction(() => falsyResult)).toBe(falsyResult);
      expect(calls).toEqual(["BEGIN", "COMMIT"]);
    },
  );

  it("rolls back and rethrows the original error instance", () => {
    const expected = new Error("Operation failed");

    expect(() => {
      context.withTransaction(() => {
        throw expected;
      });
    }).toThrowError(expected);

    expect(calls).toEqual(["BEGIN", "ROLLBACK"]);
  });

  it("rolls back and rethrows when the operation throws a non-Error value", () => {
    expect(() => {
      context.withTransaction(() => {
        throw "Operation failed";
      });
    }).toThrow("Operation failed");

    expect(calls).toEqual(["BEGIN", "ROLLBACK"]);
  });
});
