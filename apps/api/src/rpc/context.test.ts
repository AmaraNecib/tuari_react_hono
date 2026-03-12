import { describe, expect, it, vi } from "vitest";

import { createRpcContext, requireCurrentUser } from "./context";

describe("rpc context", () => {
  it("resolves the current user once when building request context", async () => {
    const headers = new Headers({ cookie: "session=token" });
    const currentUser = {
      id: "user-1",
      name: "Taylor",
      email: "taylor@example.com",
    };
    const sessionService = {
      getCurrentUser: vi.fn().mockResolvedValue(currentUser),
    };

    await expect(createRpcContext(headers, sessionService)).resolves.toEqual({
      headers,
      currentUser,
    });
    expect(sessionService.getCurrentUser).toHaveBeenCalledTimes(1);
    expect(sessionService.getCurrentUser).toHaveBeenCalledWith(headers);
  });

  it("throws an unauthorized error when a protected handler has no current user", () => {
    expect.assertions(1);

    try {
      requireCurrentUser({
        headers: new Headers(),
        currentUser: null,
      });
    }
    catch (error) {
      expect(error).toMatchObject({ code: "UNAUTHORIZED" });
    }
  });
});
