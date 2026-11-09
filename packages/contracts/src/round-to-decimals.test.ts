import { describe, expect, it } from "vitest";

import { roundToDecimals } from "./round-to-decimals";

describe("roundToDecimals", () => {
  it.each([
    [1.005, 2, 1.01], [-1.005, 2, -1.01],
    [8.575, 2, 8.58], [-8.575, 2, -8.58],
    [0.145, 2, 0.15], [-0.145, 2, -0.15],
    [1.0049999999999997, 2, 1], [-1.0049999999999997, 2, -1],
    [1.2345675, 6, 1.234568], [-1.2345675, 6, -1.234568],
    [1.2345674999999998, 6, 1.234567], [-1.2345674999999998, 6, -1.234567],
    [0.7 + 0.1, 6, 0.8], [0.3 - 0.1, 6, 0.2],
    [5e-7, 6, 0.000001], [-5e-7, 6, -0.000001],
    [4.999999999999999e-7, 6, 0], [-4.999999999999999e-7, 6, -0],
    [Number.MIN_VALUE, 2, 0], [-Number.MIN_VALUE, 6, -0],
    [Number.MAX_VALUE, 2, Number.MAX_VALUE], [-Number.MAX_VALUE, 6, -Number.MAX_VALUE],
    [Infinity, 2, Infinity], [-Infinity, 6, -Infinity],
    [Number.NaN, 2, Number.NaN], [Number.NaN, 6, Number.NaN],
  ] as const)("rounds %s to %s decimals as %s", (value, decimals, expected) => {
    expect(roundToDecimals(value, decimals)).toBe(expected);
  });
});
