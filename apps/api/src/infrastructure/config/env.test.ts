import { describe, expect, it } from "vitest";

import { createEnv } from "./env";

describe("createEnv", () => {
  it("rejects invalid API_PORT values", () => {
    expect(() =>
      createEnv({
        API_PORT: "abc",
      }),
    ).toThrow('API_PORT must be a positive integer');
  });
});
