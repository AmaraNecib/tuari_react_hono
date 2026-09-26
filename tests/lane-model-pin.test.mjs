import { describe, expect, it } from "vitest";

import { resolveLaneModel, reusedAgentPinNotice } from "../scripts/crew/lane-model.mjs";

describe("resolveLaneModel", () => {
  it("launches plain pi when PI_LANE_MODEL is unset", () => {
    // The launcher must stay zero-config: an unset variable must not force a
    // model onto a repo that never asked for one.
    expect(resolveLaneModel({})).toEqual({ pinned: null, command: "pi" });
  });

  it("treats a blank or whitespace-only pin as unset", () => {
    expect(resolveLaneModel({ PI_LANE_MODEL: "" })).toEqual({ pinned: null, command: "pi" });
    expect(resolveLaneModel({ PI_LANE_MODEL: "   " })).toEqual({ pinned: null, command: "pi" });
  });

  it("pins the model when PI_LANE_MODEL is set", () => {
    expect(resolveLaneModel({ PI_LANE_MODEL: "opencode-go/deepseek-v4.1-flash" })).toEqual({
      pinned: "opencode-go/deepseek-v4.1-flash",
      command: "pi --model opencode-go/deepseek-v4.1-flash",
    });
  });

  it("trims the pin so a stray newline cannot break the command", () => {
    expect(resolveLaneModel({ PI_LANE_MODEL: " opencode-go/x \n" }).command).toBe(
      "pi --model opencode-go/x",
    );
  });

  it("ignores a non-string value instead of interpolating it", () => {
    expect(resolveLaneModel({ PI_LANE_MODEL: undefined }).command).toBe("pi");
  });
});

describe("reusedAgentPinNotice", () => {
  it("warns that the pin was not applied when an agent is reused", () => {
    const notice = reusedAgentPinNotice("opencode-go/x");
    expect(notice).toContain("PI_LANE_MODEL=opencode-go/x");
    expect(notice).toContain("NOT applied");
    // The operator needs the way out, not just the problem.
    expect(notice).toContain("Close the workspace and relaunch");
  });

  it("stays silent when no pin was requested", () => {
    expect(reusedAgentPinNotice(null)).toBeNull();
  });
});
