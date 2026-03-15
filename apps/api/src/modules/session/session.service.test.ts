import { beforeEach, describe, expect, it, vi } from "vitest";
import { SessionService } from "./session.service";

describe("SessionService", () => {
  const getSession = vi.fn();
  const headers = new Headers({ cookie: "session=token" });
  const service = new SessionService({
    api: {
      getSession,
    },
  });

  beforeEach(() => {
    getSession.mockReset();
  });

  it("returns null when the auth gateway has no active session", async () => {
    getSession.mockResolvedValue(null);

    await expect(service.getCurrentUser(headers)).resolves.toBeNull();
    expect(getSession).toHaveBeenCalledWith({ headers });
  });

  it("returns null when the current session has no phone identity yet", async () => {
    getSession.mockResolvedValue({
      user: {
        id: "user-1",
        name: "Taylor",
        phoneNumber: null,
      },
    });

    await expect(service.getCurrentUser(headers)).resolves.toBeNull();
  });

  it("maps the authenticated user into the session contract", async () => {
    getSession.mockResolvedValue({
      user: {
        id: "user-1",
        name: "Taylor",
        phoneNumber: "0612345678",
      },
    });

    await expect(service.getCurrentUser(headers)).resolves.toEqual({
      id: "user-1",
      name: "Taylor",
      phone: "0612345678",
    });
  });
});
