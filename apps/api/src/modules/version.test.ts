import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { readAppVersion } from "./version";

const OLD_ENV = process.env;

beforeEach(() => {
  process.env = { ...OLD_ENV };
});

afterEach(() => {
  process.env = OLD_ENV;
});

describe("readAppVersion", () => {
  it("returns the value of TUARI_APP_VERSION when set", () => {
    process.env.TUARI_APP_VERSION = "1.2.3";
    expect(readAppVersion()).toBe("1.2.3");
  });

  it("returns fallback version when TUARI_APP_VERSION is empty string", () => {
    process.env.TUARI_APP_VERSION = "";
    const result = readAppVersion();
    expect(result).toBeTruthy();
    expect(typeof result).toBe("string");
  });

  it("returns a non-empty string when env var is not set", () => {
    delete process.env.TUARI_APP_VERSION;
    const result = readAppVersion();
    expect(result).toBeTruthy();
    expect(typeof result).toBe("string");
    expect(result.length).toBeGreaterThan(0);
  });

  it("prefers the env var over the cached fallback", () => {
    process.env.TUARI_APP_VERSION = "99.99.99";
    expect(readAppVersion()).toBe("99.99.99");

    // The cached fallback should be different from "99.99.99"
    delete process.env.TUARI_APP_VERSION;
    expect(readAppVersion()).not.toBe("99.99.99");
  });

  it("returns a valid semver-like string from the fallback", () => {
    delete process.env.TUARI_APP_VERSION;
    const result = readAppVersion();
    // Must match MAJOR.MINOR.PATCH pattern (allow pre-release suffixes)
    expect(result).toMatch(/^\d+\.\d+\.\d+/);
  });
});
