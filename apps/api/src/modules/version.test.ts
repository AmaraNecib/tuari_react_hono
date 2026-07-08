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
  it("returns TUARI_APP_VERSION when set", () => {
    process.env.TUARI_APP_VERSION = "2.0.0";
    expect(readAppVersion()).toBe("2.0.0");
  });

  it("returns TUARI_APP_VERSION even when called repeatedly", () => {
    process.env.TUARI_APP_VERSION = "3.0.0";
    expect(readAppVersion()).toBe("3.0.0");
    expect(readAppVersion()).toBe("3.0.0");
    expect(readAppVersion()).toBe("3.0.0");
  });

  it("falls back to cached package.json version when env var is not set", () => {
    delete process.env.TUARI_APP_VERSION;
    // The API's package.json has version "0.0.0"
    expect(readAppVersion()).toBe("0.0.0");
  });

  it("treats empty string env var as unset and falls back", () => {
    process.env.TUARI_APP_VERSION = "";
    // Empty string is falsy, so readAppVersion should fall back
    expect(readAppVersion()).toBe("0.0.0");
  });
});
