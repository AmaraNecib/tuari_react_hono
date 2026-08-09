import { describe, expect, it } from "vitest";

import {
  BETTER_AUTH_SECRET_MIN_LENGTH,
  BOOTSTRAP_SETUP_KEY_MIN_LENGTH,
  estimateSecretEntropyBits,
  isStrongSecret,
  safeSecretEquals,
} from "./secret-strength";

describe("estimateSecretEntropyBits", () => {
  it("returns 0 for an empty string", () => {
    expect(estimateSecretEntropyBits("")).toBe(0);
  });

  it("returns 0 for a single repeated character", () => {
    expect(estimateSecretEntropyBits("a".repeat(40))).toBe(0);
  });

  it("returns exactly 4 bits per character for uniform hex", () => {
    // 16 uniform symbols → log2(16) = 4.0 bits/char exactly.
    const hex = "0123456789abcdef".repeat(2);
    expect(estimateSecretEntropyBits(hex)).toBeCloseTo(4.0, 10);
  });

  it("returns more bits per character for a wider alphabet", () => {
    const mixed = "kV8xQ2mR9fT3zLpW6nY4aB7cD0eF1gH2jK5sA8dN3uM";
    expect(estimateSecretEntropyBits(mixed)).toBeGreaterThan(5);
  });

  it("returns fewer than 4 bits per character for English phrases", () => {
    expect(estimateSecretEntropyBits("tuari-dev-secret-at-least-32-characters")).toBeLessThan(4);
    expect(estimateSecretEntropyBits("replace-with-a-32-plus-char-secret")).toBeLessThan(4);
  });
});

describe("isStrongSecret", () => {
  it("accepts a uniform-hex secret at the minimum length", () => {
    const hex = "0123456789abcdef".repeat(BETTER_AUTH_SECRET_MIN_LENGTH / 16);
    expect(hex.length).toBe(BETTER_AUTH_SECRET_MIN_LENGTH);
    expect(isStrongSecret(hex, BETTER_AUTH_SECRET_MIN_LENGTH)).toBe(true);
  });

  it("accepts a mixed-case secret comfortably above the gate", () => {
    expect(
      isStrongSecret("kV8xQ2mR9fT3zLpW6nY4aB7cD0eF1gH2jK5sA8dN3uM", BETTER_AUTH_SECRET_MIN_LENGTH),
    ).toBe(true);
  });

  it("rejects a secret shorter than the minimum length", () => {
    expect(isStrongSecret("kV8xQ2mR9fT3zLpW6nY4aB7c", BETTER_AUTH_SECRET_MIN_LENGTH)).toBe(false);
  });

  it("rejects a 32-character secret with too few distinct characters", () => {
    // 4 distinct chars (a/b/c/d) — below the 8-character diversity floor.
    expect(isStrongSecret("aaaaaaaabbbbbbbbccccccccdddddddd", BETTER_AUTH_SECRET_MIN_LENGTH)).toBe(
      false,
    );
  });

  it("rejects a 32-character single-symbol secret", () => {
    expect(isStrongSecret("a".repeat(32), BETTER_AUTH_SECRET_MIN_LENGTH)).toBe(false);
  });

  it("accepts a digit-only 32-character secret (≈106 real bits)", () => {
    // The gate is a degeneracy filter, not a character-class filter: 10
    // distinct uniform symbols clear the diversity + entropy floors.
    expect(
      isStrongSecret("01234567890123456789012345678901", BETTER_AUTH_SECRET_MIN_LENGTH),
    ).toBe(true);
  });

  it("accepts realistic random-hex output below the 4.0 bpc theoretical max", () => {
    // Regression for the Greptile finding on the first revision: the empirical
    // Shannon entropy of a FINITE random hex sample is < 4.0 bits/char, so a
    // gate near the theoretical maximum rejects `openssl rand -hex 32` and the
    // desktop's OsRng hex secrets at startup. This 66-char hex sample sits at
    // 3.975 bpc — rejected by the old 4.0 gate, accepted by the new one.
    expect(
      isStrongSecret(
        "3fa8c1e2b97d4a6c5e8f0b1d2a3c4e5f60718293a4b5c6d7e8f9a0b1c2d3e4f5a6",
        BETTER_AUTH_SECRET_MIN_LENGTH,
      ),
    ).toBe(true);
  });

  it("rejects the shipped dev placeholders exactly", () => {
    expect(isStrongSecret("tuari-dev-secret-at-least-32-characters", BETTER_AUTH_SECRET_MIN_LENGTH)).toBe(
      false,
    );
    expect(isStrongSecret("replace-with-a-32-plus-char-secret", BETTER_AUTH_SECRET_MIN_LENGTH)).toBe(
      false,
    );
  });

  it("enforces the 20-character floor for bootstrap setup keys", () => {
    const shortKey = "kV8xQ2mR9fT3zLpW6nY";
    expect(shortKey.length).toBe(BOOTSTRAP_SETUP_KEY_MIN_LENGTH - 1);
    expect(isStrongSecret(shortKey, BOOTSTRAP_SETUP_KEY_MIN_LENGTH)).toBe(false);
  });

  it("accepts a 20+ character mixed-case setup key", () => {
    expect(
      isStrongSecret("kV8xQ2mR9fT3zLpW6nY4aB7c", BOOTSTRAP_SETUP_KEY_MIN_LENGTH),
    ).toBe(true);
  });

  it("rejects a 20-character low-entropy setup key", () => {
    expect(isStrongSecret("aaaaaaaaaaaaaaaaaaaa", BOOTSTRAP_SETUP_KEY_MIN_LENGTH)).toBe(false);
  });
});

describe("safeSecretEquals", () => {
  it("returns true for equal strings", () => {
    expect(safeSecretEquals("setup-key-with-entropy-9f2c1a7d", "setup-key-with-entropy-9f2c1a7d")).toBe(
      true,
    );
  });

  it("returns false for different strings of the same length", () => {
    expect(
      safeSecretEquals("setup-key-with-entropy-9f2c1a7d", "setup-key-with-entropy-9f2c1a7e"),
    ).toBe(false);
  });

  it("returns false for strings of different lengths", () => {
    expect(safeSecretEquals("short", "a-much-longer-secret-value-here")).toBe(false);
  });

  it("returns false when only one side is empty", () => {
    expect(safeSecretEquals("", "setup-key-with-entropy-9f2c1a7d")).toBe(false);
    expect(safeSecretEquals("setup-key-with-entropy-9f2c1a7d", "")).toBe(false);
  });

  it("returns false for a near-miss prefix", () => {
    expect(
      safeSecretEquals("setup-key-with-entropy-9f2c1a7d", "setup-key-with-entropy-9f2c1a7"),
    ).toBe(false);
  });
});
