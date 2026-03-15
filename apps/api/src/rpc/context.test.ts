import { describe, expect, it, vi } from "vitest";

import { createRpcContext, getCurrentUser, requireCurrentUser } from "./context";

describe("rpc context", () => {
  it("defers current user resolution until a handler requests it", async () => {
    const headers = new Headers({ cookie: "session=token" });
    const currentUser = {
      id: "user-1",
      name: "Taylor",
      phone: "0612345678",
    };
    const sessionService = {
      getCurrentUser: vi.fn().mockResolvedValue(currentUser),
    };
    const context = createRpcContext(headers, sessionService);

    expect(context.headers).toBe(headers);
    expect(sessionService.getCurrentUser).not.toHaveBeenCalled();
    await expect(getCurrentUser(context)).resolves.toEqual(currentUser);
    expect(sessionService.getCurrentUser).toHaveBeenCalledWith(headers);
  });

  it("memoizes the current user lookup for the request lifetime", async () => {
    const currentUser = {
      id: "user-1",
      name: "Taylor",
      phone: "0612345678",
    };
    const sessionService = {
      getCurrentUser: vi.fn().mockResolvedValue(currentUser),
    };
    const context = createRpcContext(new Headers(), sessionService);

    await expect(getCurrentUser(context)).resolves.toEqual(currentUser);
    await expect(requireCurrentUser(context)).resolves.toEqual(currentUser);

    expect(sessionService.getCurrentUser).toHaveBeenCalledTimes(1);
  });

  it("throws an unauthorized error when a protected handler has no current user", async () => {
    await expect(
      requireCurrentUser({
        headers: new Headers(),
        resolveCurrentUser: vi.fn().mockResolvedValue(null),
      }),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });
});
