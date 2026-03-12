import { describe, expect, it } from "vitest";
import { sessionUserSchema, todoSchema } from "./index";

describe("contracts", () => {
  it("accepts a valid todo payload", () => {
    expect(
      todoSchema.parse({
        id: "todo-1",
        title: "Review the roadmap",
        completed: false,
        createdAt: "2026-03-12T10:00:00.000Z",
      }),
    ).toEqual({
      id: "todo-1",
      title: "Review the roadmap",
      completed: false,
      createdAt: "2026-03-12T10:00:00.000Z",
    });
  });

  it("rejects todo payloads with the wrong createdAt type", () => {
    expect(() =>
      todoSchema.parse({
        id: "todo-1",
        title: "Review the roadmap",
        completed: false,
        createdAt: new Date(),
      }),
    ).toThrowError();
  });

  it("accepts a nullable session user name and validates email", () => {
    expect(
      sessionUserSchema.parse({
        id: "user-1",
        name: null,
        email: "user@example.com",
      }),
    ).toEqual({
      id: "user-1",
      name: null,
      email: "user@example.com",
    });

    expect(() =>
      sessionUserSchema.parse({
        id: "user-1",
        name: "User",
        email: "not-an-email",
      }),
    ).toThrowError();
  });
});
