import { describe, expect, it } from "vitest";

import { ProjectCostError, toFailureResult } from "./project-cost.errors";

/**
 * The project-cost error seam (#414): a typed domain error becomes the shared
 * failure envelope, and anything else is rethrown for the global mapper.
 */
describe("toFailureResult (#414)", () => {
  it("maps a ProjectCostError to the shared failure envelope", () => {
    const error = new ProjectCostError("NOT_FOUND", "تعذر العثور على المشروع المطلوب.");

    expect(toFailureResult(error)).toEqual({ success: false, error: error.appError });
  });

  it("rethrows a non-domain error instead of swallowing it", () => {
    const error = new Error("boom");

    expect(() => toFailureResult(error)).toThrow(error);
  });
});
