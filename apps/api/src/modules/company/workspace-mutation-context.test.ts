import { describe, it, expect, beforeEach } from "vitest";
import { WorkspaceMutationContext } from "./workspace-mutation-context";
import { CompanyError } from "./company.errors";
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

    let thrown: unknown;
    try {
      context.withTransaction(() => {
        throw expected;
      });
    } catch (error) {
      thrown = error;
    }

    // Pin identity, not just message equality: a wrapper that wrapped the
    // error in a new Error would also pass `toThrowError(expected)`.
    expect(thrown).toBe(expected);
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

describe("WorkspaceMutationContext.createMutationAuditContext", () => {
  const repository: TransactionalRepository = {
    withTransaction<T>(callback: () => T): T {
      return callback();
    },
  };

  it("normalizes an absent audit context, filling a transaction id", () => {
    const context = new WorkspaceMutationContext(repository);

    const audit = context.createMutationAuditContext();

    expect(audit.actorUserId).toBeNull();
    expect(audit.actorLabel).toBeNull();
    expect(audit.transactionId).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("preserves provided fields and reuses the supplied transaction id", () => {
    const context = new WorkspaceMutationContext(repository);

    const audit = context.createMutationAuditContext({
      actorUserId: "user-1",
      actorLabel: "Admin",
      transactionId: "tx-123",
    });

    expect(audit).toEqual({
      actorUserId: "user-1",
      actorLabel: "Admin",
      transactionId: "tx-123",
    });
  });

  it("rejects a non-bootstrap-owner when an authorizer is configured", () => {
    const context = new WorkspaceMutationContext(repository, {
      isBootstrapOwner: () => false,
    });

    let thrown: unknown;
    try {
      context.createMutationAuditContext({ actorUserId: "intruder" });
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(CompanyError);
    expect((thrown as CompanyError).appError.code).toBe("UNAUTHORIZED");
  });

  it("allows the bootstrap owner when an authorizer is configured", () => {
    const context = new WorkspaceMutationContext(repository, {
      isBootstrapOwner: (userId) => userId === "owner",
    });

    const audit = context.createMutationAuditContext({ actorUserId: "owner" });

    expect(audit.actorUserId).toBe("owner");
  });

  it("rejects an anonymous actor when an authorizer is configured", () => {
    const context = new WorkspaceMutationContext(repository, {
      isBootstrapOwner: () => true,
    });

    expect(() => context.createMutationAuditContext()).toThrowError(CompanyError);
  });
});
